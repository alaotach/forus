import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { getMediaAuthToken } from './mediaAuth';
import { reportMediaFailureMetric } from './mediaMetrics';

type MediaType = 'image' | 'audio';

interface GenerateUploadUrlPayload {
  type: MediaType;
  userId: string;
  coupleCode: string;
  mimeType: string;
  fileSize: number;
  fileExtension?: string;
}

export interface MediaReference {
  mediaId: string;
  fileKey: string;
  type: MediaType;
  ownerId: string;
  createdAt: string;
}

interface GenerateUploadUrlResponse {
  success: boolean;
  mediaDraft: {
    fileKey: string;
    type: MediaType;
    ownerId: string;
  };
  upload: {
    method: 'PUT';
    url: string;
    expiresIn: number;
    maxFileSizeBytes: number;
    requiredHeaders: {
      'Content-Type': string;
    };
  };
  finalize: {
    uploadTicket: string;
    expiresIn: number;
  };
}

interface CompleteUploadResponse {
  success: boolean;
  media: {
    id: string;
    fileKey: string;
    type: MediaType;
    ownerId: string;
    createdAt: string;
  };
}

interface MediaAccessResponse {
  success: boolean;
  media: {
    id: string;
    fileKey: string;
    type: MediaType;
    ownerId: string;
    createdAt: string;
  };
  access: {
    url: string;
    expiresIn: number;
  };
}

interface CacheEntry {
  localPath: string;
  updatedAt: number;
}

type CacheMap = Record<string, CacheEntry>;

type DownloadProgress = {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
};

const CACHE_MAP_KEY = 'media_cache_map_v1';
const CACHE_DIR = `${FileSystem.cacheDirectory || ''}media-cache/`;
const CACHE_MAX_BYTES = 100 * 1024 * 1024;
const CACHE_ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 15000;

function getBackendUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required for media endpoints');
  }

  return backendUrl;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs: number = NETWORK_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function fileExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
  };

  return map[mimeType] || 'bin';
}

function getCacheFilePath(fileKey: string, mediaType: MediaType): string {
  const hashed = djb2Hash(fileKey);
  const ext = mediaType === 'image' ? 'img' : 'aud';
  return `${CACHE_DIR}${hashed}.${ext}`;
}

async function ensureCacheDirectory(): Promise<void> {
  if (Platform.OS === 'web') return;

  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function readCacheMap(): Promise<CacheMap> {
  const raw = await AsyncStorage.getItem(CACHE_MAP_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as CacheMap;
    return parsed || {};
  } catch {
    return {};
  }
}

async function writeCacheMap(cacheMap: CacheMap): Promise<void> {
  await AsyncStorage.setItem(CACHE_MAP_KEY, JSON.stringify(cacheMap));
}

async function deleteFileIfExists(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

async function enforceCachePolicy(cacheMap: CacheMap): Promise<CacheMap> {
  if (Platform.OS === 'web') return cacheMap;

  const now = Date.now();
  const validEntries: Array<{ fileKey: string; localPath: string; updatedAt: number; size: number }> = [];

  for (const [fileKey, entry] of Object.entries(cacheMap)) {
    if (!entry?.localPath || typeof entry.updatedAt !== 'number') {
      continue;
    }

    const isExpired = now - entry.updatedAt > CACHE_ENTRY_TTL_MS;
    if (isExpired) {
      await deleteFileIfExists(entry.localPath);
      continue;
    }

    const info = await FileSystem.getInfoAsync(entry.localPath, { size: true });
    if (!info.exists) {
      continue;
    }

    validEntries.push({
      fileKey,
      localPath: entry.localPath,
      updatedAt: entry.updatedAt,
      size: typeof info.size === 'number' ? info.size : 0,
    });
  }

  // Keep most recently used entries first (LRU eviction for overflow).
  validEntries.sort((a, b) => b.updatedAt - a.updatedAt);

  let totalBytes = 0;
  const prunedMap: CacheMap = {};
  for (const item of validEntries) {
    if (totalBytes + item.size <= CACHE_MAX_BYTES) {
      prunedMap[item.fileKey] = {
        localPath: item.localPath,
        updatedAt: item.updatedAt,
      };
      totalBytes += item.size;
    } else {
      await deleteFileIfExists(item.localPath);
    }
  }

  return prunedMap;
}

async function setCachedFile(fileKey: string, localPath: string): Promise<void> {
  const cacheMap = await readCacheMap();
  cacheMap[fileKey] = {
    localPath,
    updatedAt: Date.now(),
  };
  const pruned = await enforceCachePolicy(cacheMap);
  await writeCacheMap(pruned);
}

export async function getCachedFile(fileKey: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const cacheMap = await readCacheMap();
  const entry = cacheMap[fileKey];
  if (!entry?.localPath) return null;

  if (Date.now() - entry.updatedAt > CACHE_ENTRY_TTL_MS) {
    await deleteFileIfExists(entry.localPath);
    delete cacheMap[fileKey];
    await writeCacheMap(cacheMap);
    return null;
  }

  const info = await FileSystem.getInfoAsync(entry.localPath);
  if (!info.exists) {
    delete cacheMap[fileKey];
    await writeCacheMap(cacheMap);
    return null;
  }

  // Refresh access timestamp to support LRU eviction.
  cacheMap[fileKey] = {
    ...entry,
    updatedAt: Date.now(),
  };
  await writeCacheMap(cacheMap);

  return entry.localPath;
}

export async function requestUploadUrl(payload: GenerateUploadUrlPayload): Promise<GenerateUploadUrlResponse> {
  try {
    const backendUrl = getBackendUrl();
    const token = await getMediaAuthToken(payload.coupleCode, payload.userId);
    const response = await fetchWithTimeout(`${backendUrl}/generate-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      await reportMediaFailureMetric({
        stage: 'generate_upload_url',
        coupleCode: payload.coupleCode,
        userId: payload.userId,
        statusCode: response.status,
        message: text,
      });
      throw new Error(`generate-upload-url failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<GenerateUploadUrlResponse>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('generate-upload-url failed')) {
      await reportMediaFailureMetric({
        stage: 'generate_upload_url',
        coupleCode: payload.coupleCode,
        userId: payload.userId,
        message: errorMessage,
      });
    }
    throw error;
  }
}

export async function uploadLocalFileToS3(
  localUri: string,
  mediaType: MediaType,
  userId: string,
  coupleCode: string,
  mimeType: string,
  fileSize: number,
  fileExtension?: string
): Promise<MediaReference> {
  const uploadIntent = await requestUploadUrl({
    type: mediaType,
    userId,
    coupleCode,
    mimeType,
    fileSize,
    fileExtension: fileExtension || fileExtensionFromMimeType(mimeType),
  });

  const sourceResponse = await fetch(localUri);
  const blob = await sourceResponse.blob();

  const putResponse = await fetchWithTimeout(uploadIntent.upload.url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: blob,
  });

  if (!putResponse.ok) {
    const errorBody = await putResponse.text();
    let uploadHost = 'unknown';
    let uploadPath = 'unknown';
    try {
      const parsed = new URL(uploadIntent.upload.url);
      uploadHost = parsed.host;
      uploadPath = parsed.pathname;
    } catch {
      // keep unknown placeholders
    }

    await reportMediaFailureMetric({
      stage: 's3_put',
      coupleCode,
      userId,
      statusCode: putResponse.status,
      message: errorBody,
    });

    throw new Error(
      `S3 upload failed (${putResponse.status}) host=${uploadHost} path=${uploadPath} body=${errorBody}`
    );
  }

  const backendUrl = getBackendUrl();
  const token = await getMediaAuthToken(coupleCode, userId);
  const completeResponse = await fetchWithTimeout(`${backendUrl}/complete-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadTicket: uploadIntent.finalize.uploadTicket }),
  });

  if (!completeResponse.ok) {
    const text = await completeResponse.text();
    await reportMediaFailureMetric({
      stage: 'complete_upload',
      coupleCode,
      userId,
      statusCode: completeResponse.status,
      message: text,
    });
    throw new Error(`complete-upload failed (${completeResponse.status}): ${text}`);
  }

  const completed = (await completeResponse.json()) as CompleteUploadResponse;

  return {
    mediaId: completed.media.id,
    fileKey: completed.media.fileKey,
    type: completed.media.type,
    ownerId: completed.media.ownerId,
    createdAt: completed.media.createdAt,
  };
}

export async function fetchMediaAccess(mediaId: string, coupleCode: string, userId: string): Promise<MediaAccessResponse> {
  try {
    const backendUrl = getBackendUrl();
    const token = await getMediaAuthToken(coupleCode, userId);
    const response = await fetchWithTimeout(`${backendUrl}/media/${encodeURIComponent(mediaId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      await reportMediaFailureMetric({
        stage: 'media_access',
        coupleCode,
        userId,
        statusCode: response.status,
        message: text,
      });
      throw new Error(`media access failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<MediaAccessResponse>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('media access failed')) {
      await reportMediaFailureMetric({
        stage: 'media_access',
        coupleCode,
        userId,
        message: errorMessage,
      });
    }
    throw error;
  }
}

async function fetchMediaAccessWithRetry(
  mediaId: string,
  coupleCode: string,
  userId: string,
  attempts: number = 2
): Promise<MediaAccessResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchMediaAccess(mediaId, coupleCode, userId);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch media access after retries');
}

export async function streamAndCacheMedia(
  mediaId: string,
  coupleCode: string,
  userId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ localPath: string; fileKey: string; type: MediaType }> {
  const access = await fetchMediaAccessWithRetry(mediaId, coupleCode, userId);
  const { fileKey, type } = access.media;

  const cachedPath = await getCachedFile(fileKey);
  if (cachedPath) {
    return {
      localPath: cachedPath,
      fileKey,
      type,
    };
  }

  if (Platform.OS === 'web') {
    return {
      localPath: access.access.url,
      fileKey,
      type,
    };
  }

  await ensureCacheDirectory();
  const targetPath = getCacheFilePath(fileKey, type);

  let downloadResult: FileSystem.FileSystemDownloadResult | undefined;
  let lastDownloadError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const downloadUrl =
        attempt === 1
          ? access.access.url
          : (await fetchMediaAccessWithRetry(mediaId, coupleCode, userId)).access.url;

      const downloader = FileSystem.createDownloadResumable(
        downloadUrl,
        targetPath,
        {},
        onProgress
      );

      downloadResult = await downloader.downloadAsync();
      break;
    } catch (error) {
      lastDownloadError = error;
      await deleteFileIfExists(targetPath);
    }
  }

  if (!downloadResult?.uri) {
    if (lastDownloadError instanceof Error) {
      throw lastDownloadError;
    }
    throw new Error('Download failed: no local URI returned');
  }

  await setCachedFile(fileKey, downloadResult.uri);

  return {
    localPath: downloadResult.uri,
    fileKey,
    type,
  };
}

export async function getMediaSourceForPlayback(
  mediaId: string,
  coupleCode: string,
  userId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ previewUrl: string; cachedPathPromise: Promise<string> }> {
  const access = await fetchMediaAccess(mediaId, coupleCode, userId);
  const previewUrl = access.access.url;

  const cachedPathPromise = streamAndCacheMedia(mediaId, coupleCode, userId, onProgress).then((result) => result.localPath);

  return {
    previewUrl,
    cachedPathPromise,
  };
}

export async function getSignedMediaUrl(mediaId: string, coupleCode: string, userId: string): Promise<string> {
  const access = await fetchMediaAccess(mediaId, coupleCode, userId);
  return access.access.url;
}

export async function deleteMediaById(mediaId: string, coupleCode: string, userId: string): Promise<void> {
  const backendUrl = getBackendUrl();
  const token = await getMediaAuthToken(coupleCode, userId);
  const response = await fetch(`${backendUrl}/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    await reportMediaFailureMetric({
      stage: 'delete_media',
      coupleCode,
      userId,
      statusCode: response.status,
      message: text,
    });
    throw new Error(`Failed to delete media (${response.status}): ${text}`);
  }
}

export async function saveCachedMediaToDevice(fileKey: string, mediaType: MediaType): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Save to device is not supported in web mode');
  }

  // Expo Go on Android cannot grant full media-library permissions for this flow.
  if (Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient') {
    throw new Error('Save to device requires a development build on Android (Expo Go limitation).');
  }

  const cachedPath = await getCachedFile(fileKey);
  if (!cachedPath) {
    throw new Error('No cached media found for this fileKey');
  }

  const granularPermissions: Array<'photo' | 'video' | 'audio'> =
    mediaType === 'audio' ? ['audio'] : ['photo'];
  const permission = await MediaLibrary.requestPermissionsAsync(false, granularPermissions);
  if (!permission.granted) {
    throw new Error(`Media library permission denied for ${mediaType}`);
  }

  const ext = mediaType === 'image' ? 'jpg' : 'm4a';
  const fileName = `${djb2Hash(fileKey)}.${ext}`;
  const destination = `${FileSystem.documentDirectory || ''}${fileName}`;

  await FileSystem.moveAsync({
    from: cachedPath,
    to: destination,
  });

  await MediaLibrary.saveToLibraryAsync(destination);

  await deleteFromCache(fileKey);

  return destination;
}

export async function deleteFromCache(fileKey: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const cacheMap = await readCacheMap();
  const entry = cacheMap[fileKey];

  if (entry?.localPath) {
    const info = await FileSystem.getInfoAsync(entry.localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(entry.localPath, { idempotent: true });
    }
  }

  delete cacheMap[fileKey];
  await writeCacheMap(cacheMap);
}

export async function clearAllCachedMedia(): Promise<void> {
  if (Platform.OS === 'web') return;

  const cacheMap = await readCacheMap();
  const deletions = Object.values(cacheMap).map(async (entry) => {
    if (!entry?.localPath) return;
    const info = await FileSystem.getInfoAsync(entry.localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(entry.localPath, { idempotent: true });
    }
  });

  await Promise.all(deletions);
  await AsyncStorage.removeItem(CACHE_MAP_KEY);
}
