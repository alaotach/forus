function getUploadBaseUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required in production');
  }

  return backendUrl;
}

function getUploadHeaders(): Record<string, string> {
  const token = process.env.EXPO_PUBLIC_UPLOAD_API_TOKEN;
  return token ? { 'x-upload-token': token } : {};
}

export const uploadToCloudinary = async (
  file: {
    uri: string;
    name?: string;
    type?: string;
  },
  folder: string = 'couples'
): Promise<string> => {
  try {
    const uploadBaseUrl = getUploadBaseUrl();
    const formData = new FormData();
    
    // Add file
    formData.append('file', {
      uri: file.uri,
      type: file.type || 'application/octet-stream',
      name: file.name || `upload_${Date.now()}`,
    } as any);

    // Folder controls where the file is stored on backend disk
    formData.append('folder', `${folder}`);

    const response = await fetch(`${uploadBaseUrl}/api/upload`, {
      method: 'POST',
      headers: getUploadHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.secure_url) {
      return data.secure_url;
    } else {
      throw new Error('No URL returned from upload API');
    }
  } catch (error) {
    console.error('Upload API error:', error);
    throw error;
  }
};

export const uploadPhotoToCloudinary = async (uri: string): Promise<string> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'image/jpeg',
      name: `photo_${Date.now()}.jpg`,
    },
    'photos'
  );
};

export const uploadAudioToCloudinary = async (uri: string): Promise<string> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'audio/m4a',
      name: `audio_${Date.now()}.m4a`,
    },
    'audio'
  );
};

export const uploadImageToCloudinary = async (uri: string): Promise<string> => {
  return uploadToCloudinary(
    {
      uri,
      type: 'image/jpeg',
      name: `image_${Date.now()}.jpg`,
    },
    'images'
  );
};
