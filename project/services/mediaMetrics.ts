import { getMediaAuthToken } from './mediaAuth';

type MediaFailureStage =
  | 'generate_upload_url'
  | 's3_put'
  | 'complete_upload'
  | 'media_access'
  | 'media_download'
  | 'delete_media'
  | 'unknown';

interface ReportPayload {
  stage: MediaFailureStage;
  coupleCode: string;
  userId: string;
  statusCode?: number;
  errorCode?: string;
  message?: string;
}

const METRICS_TIMEOUT_MS = 4000;

function getBackendUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required for media metrics endpoint');
  }
  return backendUrl;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs: number = METRICS_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function reportMediaFailureMetric(payload: ReportPayload): Promise<void> {
  try {
    const backendUrl = getBackendUrl();
    const token = await getMediaAuthToken(payload.coupleCode, payload.userId);

    await fetchWithTimeout(`${backendUrl}/media/metrics/failure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        stage: payload.stage,
        statusCode: payload.statusCode,
        errorCode: payload.errorCode,
        message: payload.message,
      }),
    });
  } catch {
    // Metrics must never block core media flow.
  }
}
