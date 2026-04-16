import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { getMediaAuthToken } from './mediaAuth';

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
  media: {
    id: string;
    fileKey: string;
    type: MediaType;
    ownerId: string;
    createdAt: string;
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

function getBackendUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required for media endpoints');
  }

  return backendUrl;
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

async function setCachedFile(fileKey: string, localPath: string): Promise<void> {
  const cacheMap = await readCacheMap();
  cacheMap[fileKey] = {
    localPath,
    updatedAt: Date.now(),
  };
  await writeCacheMap(cacheMap);
}

export async function getCachedFile(fileKey: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const cacheMap = await readCacheMap();
  const entry = cacheMap[fileKey];
  if (!entry?.localPath) return null;

  const info = await FileSystem.getInfoAsync(entry.localPath);
  if (!info.exists) {
    delete cacheMap[fileKey];
    await writeCacheMap(cacheMap);
    return null;
  }

  return entry.localPath;
}

export async function requestUploadUrl(payload: GenerateUploadUrlPayload): Promise<GenerateUploadUrlResponse> {
  const backendUrl = getBackendUrl();
  const token = await getMediaAuthToken(payload.coupleCode, payload.userId);
  const response = await fetch(`${backendUrl}/generate-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`generate-upload-url failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<GenerateUploadUrlResponse>;
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

  const putResponse = await fetch(uploadIntent.upload.url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: blob,
  });

  if (!putResponse.ok) {
    throw new Error(`S3 upload failed (${putResponse.status})`);
  }

  return {
    mediaId: uploadIntent.media.id,
    fileKey: uploadIntent.media.fileKey,
    type: uploadIntent.media.type,
    ownerId: uploadIntent.media.ownerId,
    createdAt: uploadIntent.media.createdAt,
  };
}

export async function fetchMediaAccess(mediaId: string, coupleCode: string, userId: string): Promise<MediaAccessResponse> {
  const backendUrl = getBackendUrl();
  const token = await getMediaAuthToken(coupleCode, userId);
  const response = await fetch(`${backendUrl}/media/${encodeURIComponent(mediaId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`media access failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<MediaAccessResponse>;
}

export async function streamAndCacheMedia(
  mediaId: string,
  coupleCode: string,
  userId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ localPath: string; fileKey: string; type: MediaType }> {
  const access = await fetchMediaAccess(mediaId, coupleCode, userId);
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

  const downloader = FileSystem.createDownloadResumable(
    access.access.url,
    targetPath,
    {},
    onProgress
  );

  const downloadResult = await downloader.downloadAsync();
  if (!downloadResult?.uri) {
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
    throw new Error(`Failed to delete media (${response.status}): ${text}`);
  }
}

export async function saveCachedMediaToDevice(fileKey: string, mediaType: MediaType): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Save to device is not supported in web mode');
  }

  const cachedPath = await getCachedFile(fileKey);
  if (!cachedPath) {
    throw new Error('No cached media found for this fileKey');
  }

  const ext = mediaType === 'image' ? 'jpg' : 'm4a';
  const fileName = `${djb2Hash(fileKey)}.${ext}`;
  const destination = `${FileSystem.documentDirectory || ''}${fileName}`;

  await FileSystem.moveAsync({
    from: cachedPath,
    to: destination,
  });

  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.granted) {
    await MediaLibrary.saveToLibraryAsync(destination);
  }

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
