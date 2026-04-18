'use no memo';
import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  SvgWidget,
  TextWidget,
} from 'react-native-android-widget';

interface SharedCanvasHomeWidgetProps {
  imageUri?: string | null;
  caption?: string;
  postedBy?: string;
  updatedLabel?: string;
  doodleSvg?: string;
  hasData?: boolean;
  backgroundColor?: string;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
}

export function SharedCanvasHomeWidget({
  imageUri,
  caption,
  postedBy,
  updatedLabel,
  doodleSvg,
  hasData,
  backgroundColor,
  fallbackTitle,
  fallbackSubtitle,
}: SharedCanvasHomeWidgetProps) {
  const drawTabUri = 'couples-connection:///live-widget?tab=draw';

  if (!hasData) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: drawTabUri }}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          borderRadius: 18,
          padding: 16,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundGradient: {
            from: '#fff4f8',
            to: '#ffecc9',
            orientation: 'LEFT_RIGHT',
          },
        }}
      >
        <TextWidget
          text={fallbackTitle || 'Drop something for them'}
          style={{
            fontSize: 16,
            fontFamily: 'Inter-Bold',
            color: '#c44569',
            textAlign: 'center',
          }}
        />
        <TextWidget
          text={fallbackSubtitle || 'Open Forus and share a photo + doodle'}
          style={{
            marginTop: 6,
            fontSize: 12,
            fontFamily: 'Inter-Regular',
            color: '#7f6a72',
            textAlign: 'center',
          }}
        />
      </FlexWidget>
    );
  }

  return (
    <OverlapWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: drawTabUri }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: backgroundColor || '#000000',
        }}
      />

      {imageUri ? (
        <ImageWidget
          image={imageUri as any}
          imageWidth={360}
          imageHeight={360}
          style={{
            height: 'match_parent',
            width: 'match_parent',
          }}
        />
      ) : null}

      {doodleSvg ? (
        <SvgWidget
          svg={doodleSvg}
          style={{
            width: 'match_parent',
            height: 'match_parent',
          }}
        />
      ) : null}

      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          justifyContent: 'flex-end',
          padding: 10,
          backgroundGradient: {
            from: 'rgba(0, 0, 0, 0.05)',
            to: 'rgba(0, 0, 0, 0.55)',
            orientation: 'TOP_BOTTOM',
          },
        }}
      >
        <TextWidget
          text={caption || 'No caption yet'}
          maxLines={2}
          style={{
            fontSize: 13,
            fontFamily: 'Inter-SemiBold',
            color: '#ffffff',
          }}
        />
        <TextWidget
          text={`by ${postedBy || 'Someone'} • ${updatedLabel || 'Just now'}`}
          maxLines={1}
          style={{
            marginTop: 2,
            fontSize: 11,
            fontFamily: 'Inter-Regular',
            color: '#ffe6ee',
          }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}
