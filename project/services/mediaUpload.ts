import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { uploadLocalFileToS3 } from './media';

type MediaType = 'image' | 'audio';

export interface UploadedMediaReference {
  mediaId: string;
  fileKey: string;
  type: MediaType;
  ownerId: string;
  createdAt: string;
}

function resolveMediaType(mimeType: string | undefined, folder: string): MediaType {
  if (mimeType?.startsWith('audio/') || folder.toLowerCase().includes('audio')) {
    return 'audio';
  }
  return 'image';
}

function inferExtension(fileName: string | undefined, mimeType: string): string {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop() || 'bin';
  }

  const fallbackMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  };

  return fallbackMap[mimeType] || 'bin';
}

async function getLocalFileSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (typeof blob.size !== 'number' || blob.size <= 0) {
      throw new Error('Unable to read file size for upload on web');
    }
    return blob.size;
  }

  const info = await FileSystem.getInfoAsync(uri);
  const fileSize = (info as any).size;
  if (!info.exists || typeof fileSize !== 'number') {
    throw new Error('Unable to read file size for upload');
  }

  return fileSize;
}

export const uploadMediaFile = async (
  file: {
    uri: string;
    name?: string;
    type?: string;
  },
  identity: {
    userId: string;
    coupleCode: string;
  },
  folder: string = 'couples'
): Promise<UploadedMediaReference> => {
  const mimeType = file.type || 'application/octet-stream';
  const mediaType = resolveMediaType(mimeType, folder);
  const fileSize = await getLocalFileSize(file.uri);
  const fileExtension = inferExtension(file.name, mimeType);

  return uploadLocalFileToS3(
    file.uri,
    mediaType,
    identity.userId,
    identity.coupleCode,
    mimeType,
    fileSize,
    fileExtension
  );
};

export const uploadPhotoMedia = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  return uploadMediaFile(
    {
      uri,
      type: 'image/jpeg',
      name: `photo_${Date.now()}.jpg`,
    },
    identity,
    'photos'
  );
};

export const uploadAudioMedia = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  const isWeb = Platform.OS === 'web';
  return uploadMediaFile(
    {
      uri,
      // Backend currently allows m4a-style audio mimetypes for uploads.
      // On web we still capture browser audio blobs, but request an accepted mime for upload intent.
      type: isWeb ? 'audio/m4a' : 'audio/m4a',
      name: `audio_${Date.now()}.m4a`,
    },
    identity,
    'audio'
  );
};

export const uploadImageMedia = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  return uploadMediaFile(
    {
      uri,
      type: 'image/jpeg',
      name: `image_${Date.now()}.jpg`,
    },
    identity,
    'images'
  );
};
