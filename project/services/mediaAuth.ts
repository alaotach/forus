import AsyncStorage from '@react-native-async-storage/async-storage';

interface MediaAuthTokenResponse {
  success: boolean;
  token: string;
  expiresIn: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

function getBackendUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required for media auth');
  }

  return backendUrl;
}

function getTokenStorageKey(coupleCode: string, userId: string) {
  return `media_auth_token:${coupleCode}:${userId}`;
}

async function readCachedToken(coupleCode: string, userId: string): Promise<CachedToken | null> {
  const key = getTokenStorageKey(coupleCode, userId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedToken;
    if (!parsed.token || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedToken(coupleCode: string, userId: string, token: string, expiresIn: number): Promise<void> {
  const key = getTokenStorageKey(coupleCode, userId);
  const expiresAt = Date.now() + Math.max(1, expiresIn - 60) * 1000;
  await AsyncStorage.setItem(key, JSON.stringify({ token, expiresAt }));
}

export async function getMediaAuthToken(coupleCode: string, userId: string): Promise<string> {
  const cached = await readCachedToken(coupleCode, userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/media/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coupleCode, userId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to obtain media auth token (${response.status}): ${text}`);
  }

  const data = (await response.json()) as MediaAuthTokenResponse;
  if (!data?.token || !data?.expiresIn) {
    throw new Error('Invalid media auth token response');
  }

  await writeCachedToken(coupleCode, userId, data.token, data.expiresIn);
  return data.token;
}

export async function clearMediaAuthToken(coupleCode: string, userId: string): Promise<void> {
  await AsyncStorage.removeItem(getTokenStorageKey(coupleCode, userId));
}
