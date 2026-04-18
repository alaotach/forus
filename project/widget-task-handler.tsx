import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { SharedCanvasHomeWidget } from '@/widgets/SharedCanvasHomeWidget';
import {
  readCoupleIdentityFromStorage,
  readWidgetCache,
  syncWidgetCacheFromFirestore,
} from '@/services/androidWidget';
import { WidgetStroke } from '@/types/app';

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

const GUEST_WIDGET_CARDS = [
  {
    title: 'Relationship Tip of the Day',
    subtitle: 'Ask one small question: What made you smile today?',
  },
  {
    title: 'Connection Prompt',
    subtitle: 'Share one tiny win from today with your partner.',
  },
  {
    title: 'Warm Reminder',
    subtitle: 'A thoughtful message now can brighten their whole day.',
  },
  {
    title: 'Forus Widget Ready',
    subtitle: 'Log in to sync photos, doodles, and captions live.',
  },
];

function pickGuestCard(widgetName: string) {
  const day = Math.floor(Date.now() / 86400000);
  const seed = Array.from(widgetName).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const index = Math.abs(day + seed) % GUEST_WIDGET_CARDS.length;
  return GUEST_WIDGET_CARDS[index];
}

function renderEmptyWidget(props: WidgetTaskHandlerProps) {
  const card = pickGuestCard(props.widgetInfo.widgetName);
  props.renderWidget(
    <SharedCanvasHomeWidget
      hasData={false}
      fallbackTitle={card.title}
      fallbackSubtitle={card.subtitle}
    />
  );
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (!['ForusSharedCanvas', 'ForusSharedCanvas4x4', 'ForusSharedCanvas3x3'].includes(props.widgetInfo.widgetName)) {
    return;
  }

  if (props.widgetAction === 'WIDGET_DELETED') {
    return;
  }

  const identity = await readCoupleIdentityFromStorage();
  if (!identity) {
    renderEmptyWidget(props);
    return;
  }

  let cache = await readWidgetCache(identity.coupleCode);

  if (
    !cache ||
    props.widgetAction === 'WIDGET_ADDED' ||
    props.widgetAction === 'WIDGET_UPDATE' ||
    props.widgetAction === 'WIDGET_RESIZED' ||
    props.widgetAction === 'WIDGET_CLICK'
  ) {
    try {
      cache = await syncWidgetCacheFromFirestore(identity);
    } catch (error) {
      console.error('Widget sync failed:', error);
    }
  }

  if (!cache) {
    renderEmptyWidget(props);
    return;
  }

  const doodleSvg = buildDoodleSvg(cache.doodleStrokes || [], 360, 360);
  props.renderWidget(
    <SharedCanvasHomeWidget
      hasData
      imageUri={cache.imageUri}
      caption={cache.caption}
      postedBy={cache.postedBy}
      updatedLabel={formatUpdatedLabel(cache.updatedAtMs)}
      doodleSvg={doodleSvg}
      backgroundColor={cache.backgroundColor}
    />
  );
}
