import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CENTER_X = SCREEN_W / 2;
const CENTER_Y = SCREEN_H / 2;

type AnimatedSplashScreenProps = {
  onDone: () => void;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

// ─────────────────────────────────────────────
// Particle — individual floating mote
// ─────────────────────────────────────────────
type ParticleConfig = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  driftX: number;
  driftY: number;
  delay: number;
  duration: number;
};

const PARTICLE_COLORS = [
  'rgba(255,107,157,0.55)',
  'rgba(255,159,122,0.45)',
  'rgba(255,204,112,0.50)',
  'rgba(255,130,170,0.40)',
  'rgba(255,180,140,0.35)',
  'rgba(255,90,140,0.30)',
  'rgba(252,180,212,0.60)',
  'rgba(255,220,190,0.50)',
];

function buildParticles(count: number): ParticleConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand(0, SCREEN_W),
    y: rand(0, SCREEN_H),
    size: rand(4, 18),
    color: PARTICLE_COLORS[Math.floor(rand(0, PARTICLE_COLORS.length))],
    driftX: rand(-40, 40),
    driftY: rand(-60, -20),
    delay: rand(0, 1800),
    duration: rand(2800, 5200),
  }));
}

function Particle({ cfg }: { cfg: ParticleConfig }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(rand(0.4, 0.7))).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(cfg.delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: cfg.duration * 0.3,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: cfg.driftY,
            duration: cfg.duration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: cfg.driftX,
            duration: cfg.duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: rand(0.9, 1.3),
            duration: cfg.duration * 0.6,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 0,
          duration: cfg.duration * 0.4,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.x,
        top: cfg.y,
        width: cfg.size,
        height: cfg.size,
        borderRadius: cfg.size / 2,
        backgroundColor: cfg.color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// RingPulse — concentric expanding rings
// ─────────────────────────────────────────────
function RingPulse({
  delay,
  color,
  maxSize,
}: {
  delay: number;
  color: string;
  maxSize: number;
}) {
  const scale = useRef(new Animated.Value(0.1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: maxSize,
        height: maxSize,
        borderRadius: maxSize / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// OrbitingDot
// ─────────────────────────────────────────────
function OrbitingDot({
  orbit,
  radius,
  offsetDeg,
  color,
  size,
  trailLength = 0,
}: {
  orbit: Animated.Value;
  radius: number;
  offsetDeg: number;
  color: string;
  size: number;
  trailLength?: number;
}) {
  const offsetRad = (offsetDeg * Math.PI) / 180;

  const translateX = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: [
      Math.cos(offsetRad) * radius,
      Math.cos(offsetRad + Math.PI * 2) * radius,
    ],
  });
  const translateY = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: [
      Math.sin(offsetRad) * radius,
      Math.sin(offsetRad + Math.PI * 2) * radius,
    ],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        shadowColor: color,
        shadowOpacity: 0.9,
        shadowRadius: size * 1.2,
        shadowOffset: { width: 0, height: 0 },
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// HeartBeat — SVG-style heart with scale pump
// ─────────────────────────────────────────────
function HeartBeat({ scale }: { scale: Animated.Value }) {
  return (
    <Animated.Text
      style={{
        fontSize: 40,
        color: '#ff5f8f',
        textShadowColor: 'rgba(255,95,143,0.55)',
        textShadowRadius: 18,
        textShadowOffset: { width: 0, height: 0 },
        transform: [{ scale }],
      }}
    >
      ♥
    </Animated.Text>
  );
}

// ─────────────────────────────────────────────
// ShimmerBar — animated shimmer underline
// ─────────────────────────────────────────────
function ShimmerBar({ width, visible }: { width: number; visible: Animated.Value }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <Animated.View
      style={{
        width,
        height: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(255,107,157,0.25)',
        overflow: 'hidden',
        marginTop: 8,
        opacity: visible,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: width * 0.5,
          borderRadius: 1,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,107,157,0.9)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// FloatingPetal — organic soft shapes
// ─────────────────────────────────────────────
type PetalConfig = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  delay: number;
  duration: number;
  rotate: string;
};

function buildPetals(count: number): PetalConfig[] {
  const petalColors = [
    'rgba(255,107,157,0.10)',
    'rgba(255,159,122,0.10)',
    'rgba(255,204,112,0.08)',
    'rgba(255,160,200,0.12)',
    'rgba(255,130,160,0.09)',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand(-60, SCREEN_W + 60),
    y: rand(-60, SCREEN_H + 60),
    w: rand(60, 160),
    h: rand(40, 120),
    color: petalColors[Math.floor(rand(0, petalColors.length))],
    delay: rand(0, 2000),
    duration: rand(6000, 12000),
    rotate: `${rand(0, 360)}deg`,
  }));
}

function FloatingPetal({ cfg }: { cfg: PetalConfig }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(cfg.delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: cfg.duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -rand(80, 200),
          duration: cfg.duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 1,
          duration: cfg.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
  }, []);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${rand(30, 90)}deg`],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.x,
        top: cfg.y,
        width: cfg.w,
        height: cfg.h,
        borderRadius: cfg.w / 2,
        backgroundColor: cfg.color,
        opacity,
        transform: [{ translateY }, { rotate: rotateInterp }, { scale }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// TypewriterText — reveals characters one by one
// ─────────────────────────────────────────────
function TypewriterText({
  text,
  style,
  delay = 0,
  speed = 60,
}: {
  text: string;
  style?: any;
  delay?: number;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay, speed]);

  return <Text style={style}>{displayed}</Text>;
}

// ─────────────────────────────────────────────
// LoadingDots — three bouncing dots
// ─────────────────────────────────────────────
function LoadingDots({ visible }: { visible: boolean }) {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    if (!visible) return;
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, {
            toValue: -8,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(360 - i * 180),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 28 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(255,95,143,0.55)',
            transform: [{ translateY: dot }],
          }}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
// GlowRing — persistent blurred halo
// ─────────────────────────────────────────────
function GlowRing({
  size,
  color,
  pulse,
}: {
  size: number;
  color: string;
  pulse: Animated.Value;
}) {
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale: pulse }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// Background mesh gradient blobs
// ─────────────────────────────────────────────
type BlobConfig = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  dX: number;
  dY: number;
};

function buildBlobs(): BlobConfig[] {
  const blobColors = [
    'rgba(255,107,157,0.12)',
    'rgba(255,159,122,0.10)',
    'rgba(255,204,112,0.08)',
    'rgba(255,130,200,0.09)',
    'rgba(255,200,160,0.07)',
  ];
  return Array.from({ length: 5 }, (_, i) => ({
    id: i,
    x: rand(0, SCREEN_W),
    y: rand(0, SCREEN_H),
    size: rand(200, 360),
    color: blobColors[i % blobColors.length],
    duration: rand(4000, 8000),
    dX: rand(-50, 50),
    dY: rand(-50, 50),
  }));
}

function Blob({ cfg }: { cfg: BlobConfig }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: cfg.dX,
            duration: cfg.duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: cfg.dY,
            duration: cfg.duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: 0,
            duration: cfg.duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: cfg.duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.x - cfg.size / 2,
        top: cfg.y - cfg.size / 2,
        width: cfg.size,
        height: cfg.size,
        borderRadius: cfg.size / 2,
        backgroundColor: cfg.color,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
}

// ─────────────────────────────────────────────
// StarField — tiny twinkling stars
// ─────────────────────────────────────────────
type StarConfig = { id: number; x: number; y: number; size: number; delay: number };

function buildStars(count: number): StarConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand(0, SCREEN_W),
    y: rand(0, SCREEN_H),
    size: rand(2, 5),
    delay: rand(0, 3000),
  }));
}

function Star({ cfg }: { cfg: StarConfig }) {
  const opacity = useRef(new Animated.Value(rand(0.1, 0.3))).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(cfg.delay),
        Animated.timing(opacity, {
          toValue: rand(0.6, 1),
          duration: rand(800, 1800),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: rand(0.05, 0.2),
          duration: rand(800, 1800),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.x,
        top: cfg.y,
        width: cfg.size,
        height: cfg.size,
        borderRadius: cfg.size / 2,
        backgroundColor: 'rgba(255,107,157,0.9)',
        opacity,
      }}
    />
  );
}

// ─────────────────────────────────────────────
// Main AnimatedSplashScreen
// ─────────────────────────────────────────────
const PARTICLES = buildParticles(38);
const PETALS = buildPetals(10);
const BLOBS = buildBlobs();
const STARS = buildStars(22);

export function AnimatedSplashScreen({ onDone }: AnimatedSplashScreenProps) {
  // ── master container
  const containerOpacity = useRef(new Animated.Value(1)).current;

  // ── background layer
  const bgScale = useRef(new Animated.Value(1.08)).current;

  // ── logo entrance
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoTranslateY = useRef(new Animated.Value(30)).current;

  // ── heart
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartRotate = useRef(new Animated.Value(0)).current;

  // ── title
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateX = useRef(new Animated.Value(-24)).current;

  // ── subtitle
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(12)).current;

  // ── shimmer underline
  const shimmerVisible = useRef(new Animated.Value(0)).current;

  // ── glow/pulse system
  const glowPulse1 = useRef(new Animated.Value(0.85)).current;
  const glowPulse2 = useRef(new Animated.Value(0.75)).current;
  const glowPulse3 = useRef(new Animated.Value(0.65)).current;

  // ── orbit rings
  const orbit1 = useRef(new Animated.Value(0)).current;
  const orbit2 = useRef(new Animated.Value(0)).current;
  const orbit3 = useRef(new Animated.Value(0)).current;

  // ── loading dots appear
  const [showDots, setShowDots] = useState(false);

  // ── "for" counter tag
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagScale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    // ── background zoom in
    Animated.timing(bgScale, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // ── glow pulses
    const makePulse = (val: Animated.Value, min: number, max: number, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: max,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: min,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

    const pulse1 = makePulse(glowPulse1, 0.85, 1.08, 1100);
    const pulse2 = makePulse(glowPulse2, 0.75, 1.0, 1400);
    const pulse3 = makePulse(glowPulse3, 0.65, 0.95, 1700);
    pulse1.start();
    pulse2.start();
    pulse3.start();

    // ── orbits
    const makeOrbit = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.timing(val, {
          toValue: 1,
          duration: dur,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

    const orb1 = makeOrbit(orbit1, 3200);
    const orb2 = makeOrbit(orbit2, 5100);
    const orb3 = makeOrbit(orbit3, 7600);
    orb1.start();
    orb2.start();
    orb3.start();

    // ── logo group entrance (staggered)
    Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // ── heart pump
    Animated.sequence([
      Animated.delay(600),
      Animated.loop(
        Animated.sequence([
          Animated.timing(heartScale, {
            toValue: 1.22,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 0.95,
            duration: 220,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 1.08,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.delay(1200),
        ])
      ),
    ]).start();

    // ── heart wobble
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartRotate, {
          toValue: 0.05,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(heartRotate, {
          toValue: -0.05,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(heartRotate, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
      ])
    ).start();

    // ── title slide in
    Animated.sequence([
      Animated.delay(520),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateX, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // ── shimmer underline
    Animated.sequence([
      Animated.delay(900),
      Animated.timing(shimmerVisible, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // ── subtitle
    Animated.sequence([
      Animated.delay(820),
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // ── tag badge
    Animated.sequence([
      Animated.delay(1100),
      Animated.parallel([
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(tagScale, {
          toValue: 1,
          friction: 5,
          tension: 70,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // ── show loading dots after 1s
    const dotsTimer = setTimeout(() => setShowDots(true), 1050);

    // ── exit
    const exitTimer = setTimeout(() => {
      setShowDots(false);
      Animated.parallel([
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.12,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        pulse1.stop();
        pulse2.stop();
        pulse3.stop();
        orb1.stop();
        orb2.stop();
        orb3.stop();
        onDone();
      });
    }, 3400);

    return () => {
      clearTimeout(dotsTimer);
      clearTimeout(exitTimer);
      pulse1.stop();
      pulse2.stop();
      pulse3.stop();
      orb1.stop();
      orb2.stop();
      orb3.stop();
    };
  }, []);

  const heartRotateInterp = heartRotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });

  return (
    <Animated.View style={[styles.root, { opacity: containerOpacity }]}>
      {/* ── Base gradient */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ scale: bgScale }] }]}>
        <LinearGradient
          colors={['#fff2ea', '#ffe4d4', '#ffd4d4', '#ffe8f0']}
          locations={[0, 0.35, 0.65, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* ── Mesh blobs */}
      {BLOBS.map((b) => (
        <Blob key={b.id} cfg={b} />
      ))}

      {/* ── Star field */}
      {STARS.map((s) => (
        <Star key={s.id} cfg={s} />
      ))}

      {/* ── Floating petals */}
      {PETALS.map((p) => (
        <FloatingPetal key={p.id} cfg={p} />
      ))}

      {/* ── Particles */}
      {PARTICLES.map((p) => (
        <Particle key={p.id} cfg={p} />
      ))}

      {/* ── Ring pulses (centered) */}
      <View style={styles.absoluteCenter} pointerEvents="none">
        <RingPulse delay={0} color="rgba(255,107,157,0.30)" maxSize={320} />
        <RingPulse delay={860} color="rgba(255,159,122,0.25)" maxSize={320} />
        <RingPulse delay={1720} color="rgba(255,204,112,0.20)" maxSize={320} />
      </View>

      {/* ── Glow rings layered */}
      <View style={styles.absoluteCenter} pointerEvents="none">
        <GlowRing size={320} color="rgba(255,107,157,0.09)" pulse={glowPulse1} />
        <GlowRing size={240} color="rgba(255,130,157,0.12)" pulse={glowPulse2} />
        <GlowRing size={170} color="rgba(255,107,157,0.16)" pulse={glowPulse3} />
      </View>

      {/* ── Orbiting constellation — ring 1 (inner, 3 dots) */}
      <View style={styles.absoluteCenter} pointerEvents="none">
        <OrbitingDot orbit={orbit1} radius={80} offsetDeg={0} color="#ff6b9d" size={9} />
        <OrbitingDot orbit={orbit1} radius={80} offsetDeg={120} color="#ffcc70" size={7} />
        <OrbitingDot orbit={orbit1} radius={80} offsetDeg={240} color="#ff9f7a" size={8} />
      </View>

      {/* ── Orbiting constellation — ring 2 (mid, 4 dots, reverse) */}
      <View style={styles.absoluteCenter} pointerEvents="none">
        <OrbitingDot orbit={orbit2} radius={130} offsetDeg={60} color="#ffb3d4" size={6} />
        <OrbitingDot orbit={orbit2} radius={130} offsetDeg={150} color="#ffd8a8" size={5} />
        <OrbitingDot orbit={orbit2} radius={130} offsetDeg={240} color="#ff9fb0" size={7} />
        <OrbitingDot orbit={orbit2} radius={130} offsetDeg={330} color="#ffcc70" size={5} />
      </View>

      {/* ── Orbiting constellation — ring 3 (outer, 2 dots) */}
      <View style={styles.absoluteCenter} pointerEvents="none">
        <OrbitingDot orbit={orbit3} radius={175} offsetDeg={30} color="rgba(255,107,157,0.55)" size={5} />
        <OrbitingDot orbit={orbit3} radius={175} offsetDeg={210} color="rgba(255,204,112,0.55)" size={4} />
      </View>

      {/* ── Logo cluster */}
      <Animated.View
        style={[
          styles.logoCluster,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }, { translateY: logoTranslateY }],
          },
        ]}
      >
        {/* Heart */}
        <Animated.Text
          style={[
            styles.heart,
            {
              transform: [{ scale: heartScale }, { rotate: heartRotateInterp }],
            },
          ]}
        >
          ♥
        </Animated.Text>

        {/* Title */}
        <Animated.View
          style={{
            opacity: titleOpacity,
            transform: [{ translateX: titleTranslateX }],
            alignItems: 'center',
          }}
        >
          <Text style={styles.title}>ForUs</Text>
          <ShimmerBar width={112} visible={shimmerVisible} />
        </Animated.View>

        {/* Subtitle */}
        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: subtitleOpacity,
              transform: [{ translateY: subtitleTranslateY }],
            },
          ]}
        >
          Quiet moments, shared beautifully
        </Animated.Text>

        {/* Tag pill */}
        <Animated.View
          style={[
            styles.tagPill,
            {
              opacity: tagOpacity,
              transform: [{ scale: tagScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,107,157,0.18)', 'rgba(255,159,122,0.18)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tagGradient}
          >
            <Text style={styles.tagText}>✦ just for the two of you ✦</Text>
          </LinearGradient>
        </Animated.View>

        {/* Loading dots */}
        <LoadingDots visible={showDots} />
      </Animated.View>

      {/* ── Corner decorative accents */}
      <View style={styles.accentTL} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,107,157,0.22)', 'transparent']}
          style={{ width: 120, height: 120, borderRadius: 60 }}
        />
      </View>
      <View style={styles.accentBR} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,204,112,0.18)', 'transparent']}
          style={{ width: 160, height: 160, borderRadius: 80 }}
        />
      </View>
      <View style={styles.accentBL} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,159,122,0.15)', 'transparent']}
          style={{ width: 100, height: 100, borderRadius: 50 }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    overflow: 'hidden',
  },
  absoluteCenter: {
    position: 'absolute',
    top: CENTER_Y,
    left: CENTER_X,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -0 }, { translateY: -0 }],
  },
  logoCluster: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heart: {
    fontSize: 40,
    color: '#ff5f8f',
    marginBottom: 8,
    textShadowColor: 'rgba(255,95,143,0.50)',
    textShadowRadius: 20,
    textShadowOffset: { width: 0, height: 0 },
  },
  title: {
    fontFamily: 'Playfair-Bold',
    fontSize: 52,
    color: '#3c2f40',
    letterSpacing: 1,
    textShadowColor: 'rgba(60,47,64,0.10)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 3 },
  },
  subtitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
    color: '#7a5a70',
    letterSpacing: 0.5,
    marginTop: 14,
  },
  tagPill: {
    marginTop: 18,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,107,157,0.20)',
  },
  tagGradient: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(180,60,100,0.80)',
    letterSpacing: 0.8,
  },
  accentTL: {
    position: 'absolute',
    top: -40,
    left: -40,
    opacity: 0.7,
  },
  accentBR: {
    position: 'absolute',
    bottom: -50,
    right: -50,
    opacity: 0.6,
  },
  accentBL: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    opacity: 0.5,
  },
});