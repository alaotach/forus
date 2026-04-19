import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Animated,
  PanResponder,
  ActivityIndicator,
  LayoutChangeEvent,
  ScrollView,
  Dimensions,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Eraser, Image as ImageIcon, Redo2, Send, Undo2 } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import * as ImagePicker from 'expo-image-picker';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { uploadPhotoMedia } from '@/services/mediaUpload';
import { getCachedFile, streamAndCacheMedia } from '@/services/media';
import { MediaRef } from '@/types/app';
import { requestForusWidgetUpdate, writeWidgetCache } from '@/services/androidWidget';
import { sendWidgetUpdatePush } from '@/services/notifications';
import { promptAndroidBackgroundReliabilitySettings } from '@/services/push-notifications';
import { requestWidgetPin } from '../services/widgetPin';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type PreviewTab = 'widget' | 'draw' | 'small';

interface WidgetSizeOption {
  id: string;
  label: string;
  cols: number;
  rows: number;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface DoodleStroke {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

interface SharedWidgetDoc {
  media?: MediaRef;
  caption?: string;
  postedBy?: string;
  updatedAt?: any;
  doodleStrokes?: DoodleStroke[];
  backgroundColor?: string;
}

const WIDGET_DOC_ID = 'shared';
const WIDGET_CAPTION_LIMIT = 80;
const DRAW_COLORS = [
  '#FF2D55', '#FF6B9D', '#FF9ECD', '#A855F7',
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#FFFFFF',
];
const BG_COLOR_OPTIONS = ['#000000', '#1f2937', '#6d28d9', '#1d4ed8', '#047857', '#c2410c', '#be123c', '#ffffff'];
const WIDGET_SIZE_OPTIONS: WidgetSizeOption[] = [
  { id: '5x3', label: '5 x 3', cols: 5, rows: 3 },
  { id: '4x4', label: '4 x 4', cols: 4, rows: 4 },
  { id: '3x3', label: '3 x 3', cols: 3, rows: 3 },
];

const RAINBOW_STOPS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#00FFFF', '#0000FF', '#8B00FF', '#FF00FF', '#FF0000',
];

const BRUSH_MIN = 2;
const BRUSH_MAX = 24;
const MIN_POINT_DISTANCE_PX = 1.5;

const SkiaRuntime = Platform.OS === 'web' ? null : require('@shopify/react-native-skia');
const SkiaCanvas = SkiaRuntime?.Canvas;
const SkiaPath = SkiaRuntime?.Path;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPath(points: StrokePoint[], width: number, height: number): string {
  if (!points.length) return '';
  if (points.length === 1 || points.length === 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const x1 = first.x * width;
    const y1 = first.y * height;
    const x2 = last.x * width;
    const y2 = last.y * height;
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const toPx = (p: StrokePoint) => ({ x: p.x * width, y: p.y * height });
  const d: string[] = [];
  const start = toPx(points[0]);
  d.push(`M ${start.x} ${start.y}`);

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = toPx(points[i === 0 ? i : i - 1]);
    const p1 = toPx(points[i]);
    const p2 = toPx(points[i + 1]);
    const p3 = toPx(points[i + 2] || points[i + 1]);

    // Catmull-Rom to cubic Bezier conversion for smooth freehand strokes.
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`);
  }

  return d.join(' ');
}

function formatUpdatedAt(timestamp: any): string {
  if (!timestamp) return 'Just now';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const deltaMs = Date.now() - date.getTime();
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hsvToRgbString(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = v;
  let g = t;
  let b = p;

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

interface DrawCanvasProps {
  draftPhotoUri: string | null;
  draftBackgroundColor: string;
  draftStrokes: DoodleStroke[];
  activeColor: string;
  brushSize: number;
  isEraser: boolean;
  onStrokeStart: () => void;
  onStrokeCommit: (stroke: DoodleStroke) => void;
  onPickPhoto: () => void;
}

const DrawCanvas = React.memo(({
  draftPhotoUri,
  draftBackgroundColor,
  draftStrokes,
  activeColor,
  brushSize,
  isEraser,
  onStrokeStart,
  onStrokeCommit,
  onPickPhoto,
}: DrawCanvasProps) => {
  const [canvasWidth, setCanvasWidth] = useState(320);
  const [canvasHeight, setCanvasHeight] = useState(400);
  const activeStrokeIdRef = useRef<string | null>(null);
  const activeStrokeRef = useRef<DoodleStroke | null>(null);
  const activeStrokePathRef = useRef('');
  const [activeStrokePath, setActiveStrokePath] = useState('');
  const strokePathCacheRef = useRef<Record<string, { pointsLen: number; width: number; height: number; path: string }>>({});

  const toCanvasPoint = useCallback(
    (point: StrokePoint) => ({
      x: Math.max(0, Math.min(canvasWidth, point.x * canvasWidth)),
      y: Math.max(0, Math.min(canvasHeight, point.y * canvasHeight)),
    }),
    [canvasWidth, canvasHeight]
  );

  const commitPoint = useCallback((x: number, y: number) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    const last = stroke.points[stroke.points.length - 1];
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      const normalizedMinDistance = MIN_POINT_DISTANCE_PX / Math.max(1, Math.min(canvasWidth, canvasHeight));
      if ((dx * dx) + (dy * dy) < normalizedMinDistance * normalizedMinDistance) {
        return;
      }
    }

    stroke.points.push({ x, y });
    const px = toCanvasPoint({ x, y });
    activeStrokePathRef.current += ` L ${px.x} ${px.y}`;
    setActiveStrokePath(activeStrokePathRef.current);
  }, [canvasWidth, canvasHeight, toCanvasPoint]);

  const finalizeStroke = useCallback(() => {
    const finalizedStroke = activeStrokeRef.current;
    if (finalizedStroke && finalizedStroke.points.length) {
      onStrokeCommit(finalizedStroke);
    }
    activeStrokeRef.current = null;
    activeStrokePathRef.current = '';
    setActiveStrokePath('');
    activeStrokeIdRef.current = null;
  }, [onStrokeCommit]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          onStrokeStart();
          const id = `stroke_${Date.now()}`;
          activeStrokeIdRef.current = id;
          const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / canvasWidth));
          const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / canvasHeight));
          const stroke: DoodleStroke = {
            id,
            color: isEraser ? '#111111' : activeColor,
            width: isEraser ? brushSize * 2.5 : brushSize,
            points: [{ x, y }],
          };
          activeStrokeRef.current = stroke;
          const p0 = toCanvasPoint(stroke.points[0]);
          activeStrokePathRef.current = `M ${p0.x} ${p0.y}`;
          setActiveStrokePath(activeStrokePathRef.current);
        },
        onPanResponderMove: (event) => {
          if (!activeStrokeIdRef.current) return;
          const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / canvasWidth));
          const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / canvasHeight));
          commitPoint(x, y);
        },
        onPanResponderRelease: finalizeStroke,
        onPanResponderTerminate: finalizeStroke,
      }),
    [activeColor, brushSize, canvasWidth, canvasHeight, commitPoint, finalizeStroke, isEraser, onStrokeStart, toCanvasPoint]
  );

  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    setCanvasWidth(event.nativeEvent.layout.width);
    setCanvasHeight(event.nativeEvent.layout.height);
  }, []);

  const skiaStrokePaths = useMemo(() => {
    const cache = strokePathCacheRef.current;
    const activeIds = new Set(draftStrokes.map((s) => s.id));

    for (const id of Object.keys(cache)) {
      if (!activeIds.has(id)) {
        delete cache[id];
      }
    }

    return draftStrokes.map((stroke) => {
      const cached = cache[stroke.id];
      if (
        cached &&
        cached.pointsLen === stroke.points.length &&
        cached.width === canvasWidth &&
        cached.height === canvasHeight
      ) {
        return {
          id: stroke.id,
          color: stroke.color,
          width: stroke.width,
          path: cached.path,
        };
      }

      const path = buildPath(stroke.points, canvasWidth, canvasHeight);
      cache[stroke.id] = {
        pointsLen: stroke.points.length,
        width: canvasWidth,
        height: canvasHeight,
        path,
      };

      return {
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        path,
      };
    });
  }, [draftStrokes, canvasWidth, canvasHeight]);

  return (
    <View
      style={[
        styles.canvas,
        {
          aspectRatio: 1,
          backgroundColor: draftBackgroundColor,
        },
      ]}
      onLayout={onCanvasLayout}
      {...panResponder.panHandlers}
    >
      {draftPhotoUri ? <Image source={{ uri: draftPhotoUri }} style={styles.canvasImage} /> : null}
      {Platform.OS === 'web' && (
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          style={StyleSheet.absoluteFillObject}
        >
          {skiaStrokePaths.map((stroke) => {
            if (!stroke.path) return null;
            return (
              <Path
                key={stroke.id}
                d={stroke.path}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          })}
          {activeStrokePath ? (
            <Path
              key="active-stroke"
              d={activeStrokePath}
              stroke={activeStrokeRef.current?.color || activeColor}
              strokeWidth={activeStrokeRef.current?.width || brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
      )}
      {Platform.OS !== 'web' && SkiaCanvas && SkiaPath ? (
        <SkiaCanvas pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          {skiaStrokePaths.map((stroke) => {
            if (!stroke.path) return null;
            return (
              <SkiaPath
                key={stroke.id}
                path={stroke.path}
                color={stroke.color}
                style="stroke"
                strokeWidth={stroke.width}
                strokeCap="round"
                strokeJoin="round"
              />
            );
          })}
          {activeStrokePath ? (
            <SkiaPath
              key="active-stroke"
              path={activeStrokePath}
              color={activeStrokeRef.current?.color || activeColor}
              style="stroke"
              strokeWidth={activeStrokeRef.current?.width || brushSize}
              strokeCap="round"
              strokeJoin="round"
            />
          ) : null}
        </SkiaCanvas>
      ) : null}
      <TouchableOpacity
        style={styles.changeImageBtn}
        onPress={onPickPhoto}
      >
        <ImageIcon size={18} color="#7a4254" />
      </TouchableOpacity>
    </View>
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiveWidgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { coupleData, isConnected } = useCouple();

  const [activeTab, setActiveTab] = useState<PreviewTab>('widget');
  const [loadingWidget, setLoadingWidget] = useState(true);
  const [updatingWidget, setUpdatingWidget] = useState(false);
  const [posting, setPosting] = useState(false);

  const [widgetDoc, setWidgetDoc] = useState<SharedWidgetDoc | null>(null);
  const [widgetImageUri, setWidgetImageUri] = useState<string | null>(null);
  const [widgetBackgroundColor, setWidgetBackgroundColor] = useState<string>('#000000');

  const [draftPhotoUri, setDraftPhotoUri] = useState<string | null>(null);
  const [draftBackgroundColor, setDraftBackgroundColor] = useState<string>('#000000');
  const [draftCaption, setDraftCaption] = useState('');
  const [draftStrokes, setDraftStrokes] = useState<DoodleStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DoodleStroke[]>([]);
  const [activeColor, setActiveColor] = useState<string>(DRAW_COLORS[0]);
  const [brushSize, setBrushSize] = useState<number>(8);
  const [isEraser, setIsEraser] = useState(false);
  const [selectedWidgetSizeId, setSelectedWidgetSizeId] = useState<string>('5x3');
  const [hasSeededDrawDraft, setHasSeededDrawDraft] = useState(false);

  // Slider state (0-1)
  const [brushT, setBrushT] = useState(0.3);
  const [hueT, setHueT] = useState(0.95);
  const [satT, setSatT] = useState(0.82);
  const [brightT, setBrightT] = useState(1);

  // Slider refs for measuring pageX offset
  const brushSliderRef = useRef<View>(null);
  const hueSliderRef = useRef<View>(null);
  const satSliderRef = useRef<View>(null);
  const brightSliderRef = useRef<View>(null);
  const brushSliderPageX = useRef(0);
  const hueSliderPageX = useRef(0);
  const satSliderPageX = useRef(0);
  const brightSliderPageX = useRef(0);
  const brushSliderWidth = useRef(1);
  const hueSliderWidth = useRef(1);
  const satSliderWidth = useRef(1);
  const brightSliderWidth = useRef(1);

  const SLIDER_W_FALLBACK = Math.max(180, SCREEN_W - 220);

  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const routeTab = typeof params.tab === 'string' ? params.tab.toLowerCase() : '';
    if (routeTab === 'draw' || routeTab === 'widget' || routeTab === 'small') {
      setActiveTab(routeTab as PreviewTab);
    }
  }, [params.tab]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  // ── Firestore listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected || !coupleData) return;
    const widgetRef = doc(db, 'couples', coupleData.coupleCode, 'widget', WIDGET_DOC_ID);
    const unsubscribe = onSnapshot(
      widgetRef,
      async (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as SharedWidgetDoc) : null;
        setWidgetDoc(data);
        if (!data) {
          setWidgetImageUri(null);
          setWidgetBackgroundColor('#000000');
          await writeWidgetCache(coupleData.coupleCode, {
            imageUri: null,
            caption: '',
            postedBy: '',
            updatedAtMs: Date.now(),
            doodleStrokes: [],
            backgroundColor: '#000000',
          });
          await requestForusWidgetUpdate(coupleData.coupleCode);
          setLoadingWidget(false);
          setUpdatingWidget(false);
          return;
        }
        setUpdatingWidget(true);
        try {
          let localPath: string | null = null;
          if (data.media?.fileKey) localPath = await getCachedFile(data.media.fileKey);
          if (!localPath && data.media?.mediaId) {
            const streamed = await streamAndCacheMedia(
              data.media.mediaId, coupleData.coupleCode, coupleData.nickname
            );
            localPath = streamed.localPath;
          }
          const bgColor = typeof data.backgroundColor === 'string' ? data.backgroundColor : '#000000';
          setWidgetImageUri(localPath || null);
          setWidgetBackgroundColor(bgColor);
          await writeWidgetCache(coupleData.coupleCode, {
            imageUri: localPath || null,
            caption: (data.caption || '').slice(0, WIDGET_CAPTION_LIMIT),
            postedBy: data.postedBy || '',
            updatedAtMs: data.updatedAt?.toDate ? data.updatedAt.toDate().getTime() : Date.now(),
            doodleStrokes: Array.isArray(data.doodleStrokes) ? data.doodleStrokes : [],
            backgroundColor: bgColor,
          });
          await requestForusWidgetUpdate(coupleData.coupleCode);
        } catch (e) {
          console.error('Failed to hydrate widget media:', e);
          setWidgetImageUri(null);
        } finally {
          setLoadingWidget(false);
          setUpdatingWidget(false);
        }
      },
      (e) => { console.error('Widget listener error:', e); setLoadingWidget(false); setUpdatingWidget(false); }
    );
    return () => unsubscribe();
  }, [coupleData, isConnected]);

  useEffect(() => {
    if (activeTab !== 'draw' || hasSeededDrawDraft || (!widgetDoc && !widgetImageUri)) return;
    setDraftPhotoUri(widgetImageUri || null);
    setDraftBackgroundColor((widgetDoc?.backgroundColor || '#000000').toString());
    if (!draftCaption && widgetDoc?.caption) setDraftCaption(widgetDoc.caption.slice(0, WIDGET_CAPTION_LIMIT));
    if (!draftStrokes.length && Array.isArray(widgetDoc?.doodleStrokes)) setDraftStrokes(widgetDoc.doodleStrokes);
    setHasSeededDrawDraft(true);
  }, [activeTab, draftCaption, draftStrokes.length, hasSeededDrawDraft, widgetDoc, widgetImageUri]);

  useEffect(() => {
    setActiveColor(hsvToRgbString(hueT, satT, brightT));
  }, [hueT, satT, brightT]);

  const canPost = !posting;
  const selectedWidgetSize = WIDGET_SIZE_OPTIONS.find(i => i.id === selectedWidgetSizeId) || WIDGET_SIZE_OPTIONS[0];

  // ── Brush slider pan ──────────────────────────────────────────────────────

  const brushPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        brushSliderRef.current?.measure((_x, _y, w, _h, px) => {
          brushSliderPageX.current = px;
          brushSliderWidth.current = Math.max(1, w);
        });
        const width = brushSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - brushSliderPageX.current) / width));
        setBrushT(t);
        setBrushSize(Math.round(BRUSH_MIN + t * (BRUSH_MAX - BRUSH_MIN)));
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const width = brushSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - brushSliderPageX.current) / width));
        setBrushT(t);
        setBrushSize(Math.round(BRUSH_MIN + t * (BRUSH_MAX - BRUSH_MIN)));
      },
    })
  ).current;

  // ── HSB slider pan ────────────────────────────────────────────────────────

  const huePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        hueSliderRef.current?.measure((_x, _y, w, _h, px) => {
          hueSliderPageX.current = px;
          hueSliderWidth.current = Math.max(1, w);
        });
        const width = hueSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - hueSliderPageX.current) / width));
        setHueT(t);
        setIsEraser(false);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const width = hueSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - hueSliderPageX.current) / width));
        setHueT(t);
        setIsEraser(false);
      },
    })
  ).current;

  const satPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        satSliderRef.current?.measure((_x, _y, w, _h, px) => {
          satSliderPageX.current = px;
          satSliderWidth.current = Math.max(1, w);
        });
        const width = satSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - satSliderPageX.current) / width));
        setSatT(t);
        setIsEraser(false);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const width = satSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - satSliderPageX.current) / width));
        setSatT(t);
        setIsEraser(false);
      },
    })
  ).current;

  const brightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        brightSliderRef.current?.measure((_x, _y, w, _h, px) => {
          brightSliderPageX.current = px;
          brightSliderWidth.current = Math.max(1, w);
        });
        const width = brightSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - brightSliderPageX.current) / width));
        setBrightT(t);
        setIsEraser(false);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const width = brightSliderWidth.current || SLIDER_W_FALLBACK;
        const t = Math.max(0, Math.min(1, (e.nativeEvent.pageX - brightSliderPageX.current) / width));
        setBrightT(t);
        setIsEraser(false);
      },
    })
  ).current;

  // ── Actions ───────────────────────────────────────────────────────────────

  const applyPickedPhoto = (uri: string, onPhotoPicked?: (value: string) => void) => {
    setDraftPhotoUri(uri);
    setDraftStrokes([]);
    setRedoStack([]);
    onPhotoPicked?.(uri);
  };

  const launchPhotoPicker = async (
    source: 'camera' | 'gallery',
    onPhotoPicked?: (uri: string) => void
  ) => {
    let result;
    try {
      const pickerOptions = {
        mediaTypes: ['images'] as any,
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
      };

      result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    } catch (err: any) {
      if (String(err?.message || err).includes('ImagePickerOptions') || String(err?.message || err).includes('Built-in class kotlin.Any is not found')) {
        result = source === 'camera'
          ? await ImagePicker.launchCameraAsync()
          : await ImagePicker.launchImageLibraryAsync();
      } else {
        throw err;
      }
    }

    if (!result.canceled && result.assets?.[0]?.uri) {
      applyPickedPhoto(result.assets[0].uri, onPhotoPicked);
    }
  };

  const askPhotoSource = (
    _size: WidgetSizeOption = selectedWidgetSize,
    onPhotoPicked?: (uri: string) => void,
    onSolidColorOnly?: () => void
  ) => {
    Alert.alert('Select Photo', 'Choose where to get your widget photo.', [
      {
        text: 'Camera',
        onPress: () => launchPhotoPicker('camera', onPhotoPicked),
      },
      {
        text: 'Gallery',
        onPress: () => launchPhotoPicker('gallery', onPhotoPicked),
      },
      {
        text: 'Solid color only',
        onPress: () => {
          setDraftPhotoUri(null);
          onSolidColorOnly?.();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const publishWidgetContent = async (photoUri: string | null) => {
    if (!coupleData) return false;
    const media = photoUri
      ? await uploadPhotoMedia(photoUri, { userId: coupleData.nickname, coupleCode: coupleData.coupleCode })
      : null;
    const widgetRef = doc(db, 'couples', coupleData.coupleCode, 'widget', WIDGET_DOC_ID);
    await setDoc(widgetRef, {
      media: media || deleteField(),
      caption: draftCaption.trim().slice(0, WIDGET_CAPTION_LIMIT),
      postedBy: coupleData.nickname,
      doodleStrokes: draftStrokes,
      backgroundColor: draftBackgroundColor,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await writeWidgetCache(coupleData.coupleCode, {
      imageUri: photoUri,
      caption: draftCaption.trim().slice(0, WIDGET_CAPTION_LIMIT),
      postedBy: coupleData.nickname,
      updatedAtMs: Date.now(),
      doodleStrokes: draftStrokes,
      backgroundColor: draftBackgroundColor,
    });
    await requestForusWidgetUpdate(coupleData.coupleCode);
    await sendWidgetUpdatePush(coupleData.coupleCode, coupleData.nickname);
    await promptAndroidBackgroundReliabilitySettings();
    setWidgetImageUri(photoUri);
    setWidgetBackgroundColor(draftBackgroundColor);
    return true;
  };

  const openSizePickerForHomePin = () => {
    Alert.alert('Choose Widget Size', 'Pick a size preset, then resize on home screen if needed for your launcher.', [
      ...WIDGET_SIZE_OPTIONS.map(size => ({
        text: size.label,
        onPress: async () => {
          setSelectedWidgetSizeId(size.id);
          try {
            setPosting(true);
            await publishWidgetContent(draftPhotoUri);
            const pinResult = await requestWidgetPin(size.cols, size.rows);
            if (pinResult.ok) Alert.alert('Added', `Widget (${size.label}) request sent to launcher.`);
            else Alert.alert('Not supported', pinResult.message || 'Pinning not supported on this launcher.');
          } catch (e) {
            console.error('Pin and publish failed:', e);
            Alert.alert('Failed', 'Could not add widget to home screen right now.');
          } finally { setPosting(false); }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const publishWidget = async () => {
    if (!coupleData) return;
    try {
      setPosting(true);
      await publishWidgetContent(draftPhotoUri);
      setActiveTab('widget');
      Alert.alert('Shared', 'Your live widget was updated.');
    } catch (e) {
      console.error('Failed to publish widget:', e);
      Alert.alert('Failed', 'Could not update shared widget right now.');
    } finally { setPosting(false); }
  };

  const startFreshDraft = () => {
    setHasSeededDrawDraft(true);
    setDraftPhotoUri(null);
    setDraftStrokes([]); setRedoStack([]);
    setDraftCaption('');
    setDraftBackgroundColor('#000000');
  };

  const undoStroke = () => {
    setDraftStrokes(prev => {
      if (!prev.length) return prev;
      const next = [...prev];
      const removed = next.pop();
      if (removed) setRedoStack(s => [...s, removed]);
      return next;
    });
  };

  const redoStroke = () => {
    setRedoStack(prev => {
      if (!prev.length) return prev;
      const next = [...prev];
      const restored = next.pop();
      if (restored) setDraftStrokes(s => [...s, restored]);
      return next;
    });
  };

  const clearCanvasOnly = () => {
    setDraftStrokes([]);
    setRedoStack([]);
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderStrokes = (strokes: DoodleStroke[], width: number, height: number) => (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={StyleSheet.absoluteFillObject}
    >
      {strokes.map(stroke => (
        <Path
          key={stroke.id}
          d={buildPath(stroke.points, width, height)}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );

  const handleStrokeStart = useCallback(() => {
    setRedoStack([]);
  }, []);

  const handleStrokeCommit = useCallback((stroke: DoodleStroke) => {
    setDraftStrokes((prev) => [...prev, stroke]);
  }, []);

  const renderWidgetFrame = (ratio: number = 1) => {
    const virtualStrokeW = 1000;
    const virtualStrokeH = Math.max(1, Math.round(virtualStrokeW / ratio));
    const caption = widgetDoc?.caption?.trim() || '';
    const postedBy = widgetDoc?.postedBy || 'Someone';
    const updatedAt = formatUpdatedAt(widgetDoc?.updatedAt);
    const backgroundColor = widgetBackgroundColor || '#000000';

    return (
      <View style={[styles.widgetFrame, { aspectRatio: ratio }]}>
        <View style={[styles.widgetSolidBackground, { backgroundColor }]} />
        {widgetImageUri ? <Image source={{ uri: widgetImageUri as string }} style={styles.widgetImage} /> : null}
        {renderStrokes(widgetDoc?.doodleStrokes || [], virtualStrokeW, virtualStrokeH)}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.58)']} style={styles.widgetBottomFade} />
        <View style={styles.metaRow}>
          <View style={styles.avatarBubble}>
            <Text style={styles.avatarText}>{postedBy.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.metaTextWrap}>
            <Text style={styles.metaCaption} numberOfLines={2}>{caption || 'No caption yet'}</Text>
            <Text style={styles.metaSub}>by {postedBy} • {updatedAt}</Text>
          </View>
        </View>
        {(loadingWidget || updatingWidget) && (
          <View style={styles.updatingOverlay}>
            <Animated.View style={[styles.shimmer, {
              transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] }) }],
            }]} />
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        )}
      </View>
    );
  };

  if (!isConnected || !coupleData) return null;

  const renderDrawTab = () => (
    <View style={styles.drawRoot}>
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={clearCanvasOnly}>
          <Text style={styles.topText}>Clear</Text>
        </TouchableOpacity>

        <View style={styles.topActions}>
          <TouchableOpacity style={styles.shareBtn} onPress={openSizePickerForHomePin}>
            <Send size={16} color="#7a4254" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBtn, (!canPost || posting) && { opacity: 0.3 }]}
            onPress={publishWidget}
            disabled={!canPost || posting}
          >
            {posting ? (
              <ActivityIndicator color="#7a4254" />
            ) : (
              <Text style={styles.doneText}>Done</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* CANVAS */}
      <View style={styles.canvasWrap}>
        <DrawCanvas
          draftPhotoUri={draftPhotoUri}
          draftBackgroundColor={draftBackgroundColor}
          draftStrokes={draftStrokes}
          activeColor={activeColor}
          brushSize={brushSize}
          isEraser={isEraser}
          onStrokeStart={handleStrokeStart}
          onStrokeCommit={handleStrokeCommit}
          onPickPhoto={() => askPhotoSource(selectedWidgetSize, undefined, () => setDraftPhotoUri(null))}
        />

        <View style={styles.captionRow}>
          <TextInput
            value={draftCaption}
            onChangeText={(text) => setDraftCaption(text.slice(0, WIDGET_CAPTION_LIMIT))}
            placeholder="Write a caption..."
            placeholderTextColor="#b98293"
            style={styles.captionInput}
            maxLength={WIDGET_CAPTION_LIMIT}
            returnKeyType="done"
          />
          <Text style={styles.captionCount}>{draftCaption.length}/{WIDGET_CAPTION_LIMIT}</Text>
        </View>

        <View style={styles.backgroundPickerRow}>
          <Text style={styles.backgroundLabel}>Background</Text>
          <View style={styles.backgroundSwatches}>
            {BG_COLOR_OPTIONS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[
                  styles.backgroundSwatch,
                  { backgroundColor: bg },
                  draftBackgroundColor === bg && styles.backgroundSwatchActive,
                ]}
                onPress={() => {
                  setDraftBackgroundColor(bg);
                  setDraftPhotoUri(null);
                }}
              />
            ))}
          </View>
        </View>
      </View>

      {/* BOTTOM PANEL */}
      <View style={styles.bottomPanel}>
        <View style={styles.toolbar}>
          <TouchableOpacity
            onPress={undoStroke}
            style={[styles.toolBtn, !draftStrokes.length && { opacity: 0.25 }]}
            disabled={!draftStrokes.length}
          >
            <Undo2 size={18} color="#7a4254" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={redoStroke}
            style={[styles.toolBtn, !redoStack.length && { opacity: 0.25 }]}
            disabled={!redoStack.length}
          >
            <Redo2 size={18} color="#7a4254" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, isEraser && styles.toolActive]}
            onPress={() => setIsEraser(e => !e)}
          >
            <Eraser size={18} color="#7a4254" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, !isEraser && styles.toolActive]}
            onPress={() => setIsEraser(false)}
          >
            <View style={[styles.colorDot, { backgroundColor: activeColor }]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => {
              setDraftBackgroundColor(activeColor);
              setDraftPhotoUri(null);
            }}
          >
            <Text style={styles.toolText}>BG</Text>
          </TouchableOpacity>

          <View style={styles.toolbarSpacer} />

          <TouchableOpacity
            style={[styles.saveBtn, (!canPost || posting) && { opacity: 0.3 }]}
            onPress={publishWidget}
            disabled={!canPost || posting}
          >
            {posting ? <ActivityIndicator size="small" color="#7a4254" /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>W</Text>
          <View
            ref={brushSliderRef}
            style={styles.slider}
            onLayout={() => brushSliderRef.current?.measure((_x, _y, w, _h, px) => {
              brushSliderPageX.current = px;
              brushSliderWidth.current = Math.max(1, w);
            })}
            {...brushPan.panHandlers}
          >
            <View style={styles.sliderInner} />
            <View
              style={[
                styles.thumb,
                {
                  left: Math.max(
                    0,
                    Math.min((brushSliderWidth.current || SLIDER_W_FALLBACK) - 26, brushT * (brushSliderWidth.current || SLIDER_W_FALLBACK) - 13)
                  ),
                },
              ]}
            />
          </View>
          <Text style={styles.sliderValue}>{brushSize}</Text>
        </View>

        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>H</Text>
          <View
            ref={hueSliderRef}
            style={styles.slider}
            onLayout={() => hueSliderRef.current?.measure((_x, _y, w, _h, px) => {
              hueSliderPageX.current = px;
              hueSliderWidth.current = Math.max(1, w);
            })}
            {...huePan.panHandlers}
          >
            <Svg width="100%" height={16}>
              <Defs>
                <SvgLinearGradient id="rainbow" x1="0" y1="0" x2="1" y2="0">
                  {RAINBOW_STOPS.map((c, i) => (
                    <Stop key={i} offset={`${(i / (RAINBOW_STOPS.length - 1)) * 100}%`} stopColor={c} />
                  ))}
                </SvgLinearGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height={16} rx={8} fill="url(#rainbow)" />
            </Svg>

            <View
              style={[
                styles.thumb,
                styles.colorThumb,
                {
                  left: Math.max(
                    0,
                    Math.min((hueSliderWidth.current || SLIDER_W_FALLBACK) - 26, hueT * (hueSliderWidth.current || SLIDER_W_FALLBACK) - 13)
                  ),
                  borderColor: activeColor,
                },
              ]}
            />
          </View>
          <Text style={styles.sliderValue}>{Math.round(hueT * 360)}</Text>
        </View>

        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>S</Text>
          <View
            ref={satSliderRef}
            style={styles.slider}
            onLayout={() => satSliderRef.current?.measure((_x, _y, w, _h, px) => {
              satSliderPageX.current = px;
              satSliderWidth.current = Math.max(1, w);
            })}
            {...satPan.panHandlers}
          >
            <LinearGradient
              colors={[hsvToRgbString(hueT, 0, brightT), hsvToRgbString(hueT, 1, brightT)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.sliderGradient}
            />
            <View
              style={[
                styles.thumb,
                styles.colorThumb,
                {
                  left: Math.max(
                    0,
                    Math.min((satSliderWidth.current || SLIDER_W_FALLBACK) - 26, satT * (satSliderWidth.current || SLIDER_W_FALLBACK) - 13)
                  ),
                  borderColor: activeColor,
                },
              ]}
            />
          </View>
          <Text style={styles.sliderValue}>{Math.round(satT * 100)}%</Text>
        </View>

        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>B</Text>
          <View
            ref={brightSliderRef}
            style={styles.slider}
            onLayout={() => brightSliderRef.current?.measure((_x, _y, w, _h, px) => {
              brightSliderPageX.current = px;
              brightSliderWidth.current = Math.max(1, w);
            })}
            {...brightPan.panHandlers}
          >
            <LinearGradient
              colors={['#000000', hsvToRgbString(hueT, satT, 1)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.sliderGradient}
            />
            <View
              style={[
                styles.thumb,
                styles.colorThumb,
                {
                  left: Math.max(
                    0,
                    Math.min((brightSliderWidth.current || SLIDER_W_FALLBACK) - 26, brightT * (brightSliderWidth.current || SLIDER_W_FALLBACK) - 13)
                  ),
                  borderColor: activeColor,
                },
              ]}
            />
          </View>
          <Text style={styles.sliderValue}>{Math.round(brightT * 100)}%</Text>
        </View>
      </View>
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={['#ffb4c9', '#ffe1a8']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <ArrowLeft size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shared Live Widget</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {(['widget', 'draw', 'small'] as PreviewTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'widget' ? 'Widget' : tab === 'draw' ? 'Draw on it' : 'Small size'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === 'draw' ? (
          // Draw tab: full-screen dark canvas, NO scroll wrapper
          renderDrawTab()
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activeTab === 'widget' && (
              <View>
                {renderWidgetFrame(1)}
                <Text style={styles.sectionHint}>Latest post wins and syncs to both partners.</Text>
              </View>
            )}
            {activeTab === 'small' && (
              <View>
                {WIDGET_SIZE_OPTIONS.map((size) => (
                  <View key={size.id} style={styles.sizePreviewBlock}>
                    <Text style={styles.sizePreviewLabel}>{size.label} preview</Text>
                    {renderWidgetFrame(size.cols / size.rows)}
                  </View>
                ))}
                <Text style={styles.sectionHint}>Compare sizes and pick what looks square on your launcher.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backButton: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Playfair-Bold', color: '#ffffff' },
  headerSpacer: { width: 34 },

  // Tabs
  tabsRow: {
    flexDirection: 'row', marginHorizontal: 14, padding: 4,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.38)',
  },
  tabButton: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10,
  },
  tabButtonActive: { backgroundColor: '#ffffff' },
  tabText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#7c5a65' },
  tabTextActive: { color: '#c44569' },

  // Scroll
  scrollContent: { padding: 14, paddingBottom: 28 },

  // Widget frame
  widgetFrame: {
    width: '100%', borderRadius: 18, overflow: 'hidden',
    backgroundColor: '#fff0f5', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  widgetFrameLarge: {},
  widgetFrameCompact: {},
  widgetSolidBackground: { ...StyleSheet.absoluteFillObject },
  widgetImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, resizeMode: 'cover' },
  widgetBottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  metaRow: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.84)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontFamily: 'Inter-Bold', color: '#c44569' },
  metaTextWrap: { flex: 1 },
  metaCaption: { fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  metaSub: { marginTop: 2, fontSize: 11, fontFamily: 'Inter-Regular', color: '#ffe6ee' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Bold', color: '#c44569' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Inter-Regular', color: '#8f6f79', textAlign: 'center', lineHeight: 20 },
  updatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  shimmer: { position: 'absolute', width: 100, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.22)', transform: [{ skewX: '-12deg' }] },
  sectionHint: { marginTop: 10, fontSize: 12, fontFamily: 'Inter-Medium', color: '#7f666f', textAlign: 'center' },

  drawRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 4,
  },

  topBar: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 12,
  },

  topText: {
    color: '#7a4254',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  shareBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.2)',
  },

  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.24)',
  },

  doneText: {
    color: '#c44569',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },

  canvasWrap: {
    paddingHorizontal: 16,
    alignItems: 'stretch',
    gap: 10,
  },

  canvas: {
    width: '100%',
    maxHeight: SCREEN_H * 0.5,
    backgroundColor: '#fff4f8',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  canvasImage: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
  },

  changeImageBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.2)',
  },

  bottomPanel: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },

  captionRow: {
    width: '100%',
    gap: 6,
  },

  sizePreviewBlock: {
    marginBottom: 14,
    gap: 8,
  },

  sizePreviewLabel: {
    color: '#7a4254',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },

  backgroundPickerRow: {
    width: '100%',
    gap: 8,
  },

  backgroundLabel: {
    color: '#7a4254',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },

  backgroundSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  backgroundSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.3)',
  },

  backgroundSwatchActive: {
    borderWidth: 2,
    borderColor: '#c44569',
  },

  captionInput: {
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.22)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    color: '#6b3f4f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },

  captionCount: {
    textAlign: 'right',
    color: '#a86c7f',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  toolActive: {
    backgroundColor: '#ffdce7',
    borderColor: 'rgba(196,69,105,0.45)',
  },

  icon: {
    color: '#fff',
    fontSize: 18,
  },

  toolText: {
    color: '#7a4254',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },

  brushDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },

  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  toolbarSpacer: {
    flex: 1,
  },

  saveBtn: {
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.24)',
  },

  saveText: {
    color: '#c44569',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  sliderLabel: {
    width: 18,
    textAlign: 'center',
    color: '#7a4254',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },

  sliderValue: {
    width: 42,
    textAlign: 'right',
    color: '#7a4254',
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
  },

  slider: {
    flex: 1,
    minWidth: 0,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(196,69,105,0.16)',
    overflow: 'visible',
  },

  sliderGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },

  sliderInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    bottom: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(196,69,105,0.18)',
  },

  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    top: -5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },

  colorThumb: {
    backgroundColor: '#111',
    borderWidth: 3,
  },
});