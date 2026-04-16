import * as FileSystem from 'expo-file-system';
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
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info.exists || typeof info.size !== 'number') {
    throw new Error('Unable to read file size for upload');
  }

  return info.size;
}

export const uploadToCloudinary = async (
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
  try {
    const mimeType = file.type || 'application/octet-stream';
    const mediaType = resolveMediaType(mimeType, folder);
    const fileSize = await getLocalFileSize(file.uri);
    const fileExtension = inferExtension(file.name, mimeType);
    const media = await uploadLocalFileToS3(
      file.uri,
      mediaType,
      identity.userId,
      identity.coupleCode,
      mimeType,
      fileSize,
      fileExtension
    );

    return media;
  } catch (error) {
    console.error('Upload API error:', error);
    throw error;
  }
};

export const uploadPhotoToCloudinary = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'image/jpeg',
      name: `photo_${Date.now()}.jpg`,
    },
    identity,
    'photos'
  );
};

export const uploadAudioToCloudinary = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'audio/m4a',
      name: `audio_${Date.now()}.m4a`,
    },
    identity,
    'audio'
  );
};

export const uploadImageToCloudinary = async (
  uri: string,
  identity: { userId: string; coupleCode: string }
): Promise<UploadedMediaReference> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'image/jpeg',
      name: `image_${Date.now()}.jpg`,
    },
    identity,
    'images'
  );
};
