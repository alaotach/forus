import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { db } from '@/services/firebase';
import { getCachedFile, streamAndCacheMedia } from '@/services/media';
import { SharedCanvasHomeWidget } from '@/widgets/SharedCanvasHomeWidget';
import { SharedWidgetSlot, WidgetStroke } from '@/types/app';

export const FORUS_WIDGET_NAMES = ['ForusSharedCanvas', 'ForusSharedCanvas4x4', 'ForusSharedCanvas3x3'];
const FORUS_WIDGET_CACHE_PREFIX = 'forus_widget_slot_v1:';
const EMPTY_WIDGET_CARDS = [
  {
    title: 'Drop something for them',
    subtitle: 'Open Forus and share a photo + doodle',
  },
  {
    title: 'Connection Prompt',
    subtitle: 'Send one kind line and keep the streak alive.',
  },
  {
    title: 'Quick Relationship Tip',
    subtitle: 'Small daily check-ins build stronger bonds.',
  },
];

export interface ForusWidgetCache {
  imageUri: string | null;
  caption: string;
  postedBy: string;
  updatedAtMs: number;
  doodleStrokes: WidgetStroke[];
  backgroundColor: string;
}

interface CoupleIdentity {
  coupleCode: string;
  nickname: string;
}

function getCacheKey(coupleCode: string): string {
  return `${FORUS_WIDGET_CACHE_PREFIX}${coupleCode}`;
}

export async function readCoupleIdentityFromStorage(): Promise<CoupleIdentity | null> {
  const raw = await AsyncStorage.getItem('coupleData');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.coupleCode || !parsed?.nickname) return null;
    return {
      coupleCode: String(parsed.coupleCode),
      nickname: String(parsed.nickname),
    };
  } catch {
    return null;
  }
}

export async function readWidgetCache(coupleCode: string): Promise<ForusWidgetCache | null> {
  const raw = await AsyncStorage.getItem(getCacheKey(coupleCode));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      imageUri: parsed?.imageUri ? String(parsed.imageUri) : null,
      caption: parsed?.caption ? String(parsed.caption) : '',
      postedBy: parsed?.postedBy ? String(parsed.postedBy) : '',
      updatedAtMs: typeof parsed?.updatedAtMs === 'number' ? parsed.updatedAtMs : Date.now(),
      doodleStrokes: Array.isArray(parsed?.doodleStrokes) ? parsed.doodleStrokes : [],
      backgroundColor: parsed?.backgroundColor ? String(parsed.backgroundColor) : '#000000',
    };
  } catch {
    return null;
  }
}

export async function writeWidgetCache(coupleCode: string, value: ForusWidgetCache): Promise<void> {
  await AsyncStorage.setItem(getCacheKey(coupleCode), JSON.stringify(value));
}

function buildDoodleSvg(strokes: WidgetStroke[], width: number, height: number): string | undefined {
  if (!strokes.length) return undefined;

  const paths = strokes
    .filter((stroke) => Array.isArray(stroke.points) && stroke.points.length > 0)
    .map((stroke) => {
      const d = stroke.points
        .map((point, index) => {
          const px = Math.max(0, Math.min(1, Number(point.x || 0))) * width;
          const py = Math.max(0, Math.min(1, Number(point.y || 0))) * height;
          return `${index === 0 ? 'M' : 'L'} ${px} ${py}`;
        })
        .join(' ');
      const color = stroke.color || '#ff6b9d';
      const strokeWidth = Math.max(1, Number(stroke.width || 3));
      return `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
    })
    .join('');

  if (!paths) return undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">${paths}</svg>`;
}

function pickEmptyWidgetCard(widgetName: string) {
  const day = Math.floor(Date.now() / 86400000);
  const seed = Array.from(widgetName).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const index = Math.abs(day + seed) % EMPTY_WIDGET_CARDS.length;
  return EMPTY_WIDGET_CARDS[index];
}

function toCacheFromDoc(docData: SharedWidgetSlot, imageUri: string | null): ForusWidgetCache {
  const updatedAtMs = docData.updatedAt?.toDate
    ? docData.updatedAt.toDate().getTime()
    : Date.now();

  return {
    imageUri,
    caption: (docData.caption || '').slice(0, 80),
    postedBy: docData.postedBy || '',
    updatedAtMs,
    doodleStrokes: Array.isArray(docData.doodleStrokes) ? docData.doodleStrokes : [],
    backgroundColor: typeof docData.backgroundColor === 'string' ? docData.backgroundColor : '#000000',
  };
}

function formatUpdatedLabel(updatedAtMs: number): string {
  const deltaMs = Date.now() - updatedAtMs;
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function syncWidgetCacheFromFirestore(identity: CoupleIdentity): Promise<ForusWidgetCache | null> {
  const widgetRef = doc(db, 'couples', identity.coupleCode, 'widget', 'shared');
  const widgetSnap = await getDoc(widgetRef);
  if (!widgetSnap.exists()) {
    const emptyValue: ForusWidgetCache = {
      imageUri: null,
      caption: '',
      postedBy: '',
      updatedAtMs: Date.now(),
      doodleStrokes: [],
      backgroundColor: '#000000',
    };
    await writeWidgetCache(identity.coupleCode, emptyValue);
    return emptyValue;
  }

  const data = widgetSnap.data() as SharedWidgetSlot;
  let imageUri: string | null = null;

  if (data?.media?.mediaId) {
    if (data.media.fileKey) {
      imageUri = await getCachedFile(data.media.fileKey);
    }

    if (!imageUri) {
      const streamed = await streamAndCacheMedia(
        data.media.mediaId,
        identity.coupleCode,
        identity.nickname
      );
      imageUri = streamed.localPath;
    }
  }

  const cacheValue = toCacheFromDoc(data, imageUri);
  await writeWidgetCache(identity.coupleCode, cacheValue);
  return cacheValue;
}

export async function requestForusWidgetUpdate(coupleCode?: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  const identity = coupleCode
    ? ({
        coupleCode,
        nickname: (await readCoupleIdentityFromStorage())?.nickname || 'unknown',
      } as CoupleIdentity)
    : await readCoupleIdentityFromStorage();

  if (!identity?.coupleCode) return;

  for (const widgetName of FORUS_WIDGET_NAMES) {
    await requestWidgetUpdate({
      widgetName,
      renderWidget: async () => {
        const cached = await readWidgetCache(identity.coupleCode);
        if (!cached) {
          const card = pickEmptyWidgetCard(widgetName);
          return (
            <SharedCanvasHomeWidget
              hasData={false}
              fallbackTitle={card.title}
              fallbackSubtitle={card.subtitle}
            />
          );
        }

        const doodleSvg = buildDoodleSvg(cached.doodleStrokes || [], 360, 360);
        return (
          <SharedCanvasHomeWidget
            hasData
            imageUri={cached.imageUri}
            caption={cached.caption}
            postedBy={cached.postedBy}
            updatedLabel={formatUpdatedLabel(cached.updatedAtMs)}
            doodleSvg={doodleSvg}
            backgroundColor={cached.backgroundColor}
          />
        );
      },
    });
  }
}
