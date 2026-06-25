import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { MouseEvent } from 'react';

type CardTheme = {
  readonly glyph: string;
  readonly accentColor: 'amber' | 'orange' | 'red' | 'zinc';
  readonly label: string;
  readonly description: string;
  readonly type: 'unit' | 'tactic';
  readonly cost: number;
};

export type CardProps =
  | {
      readonly kind: 'spark-adept' | 'ember-guard' | 'flare-strike' | string;
      readonly masked?: false;
      readonly testId?: string;
      /** Optional overrides for the displayed text (used by creator preview). */
      readonly name?: string | undefined;
      readonly type?: 'unit' | 'tactic' | undefined;
      readonly cost?: number | undefined;
    }
  | { readonly masked: true; readonly testId?: string };

export const cardThemes: Record<string, CardTheme> = {
  'spark-adept': {
    glyph: 'S',
    accentColor: 'amber',
    label: 'Spark Adept',
    description: 'Quick unit',
    type: 'unit',
    cost: 1,
  },
  'ember-guard': {
    glyph: 'E',
    accentColor: 'orange',
    label: 'Ember Guard',
    description: 'Sturdy unit',
    type: 'unit',
    cost: 2,
  },
  'flare-strike': {
    glyph: 'F',
    accentColor: 'red',
    label: 'Flare Strike',
    description: 'Direct damage',
    type: 'tactic',
    cost: 1,
  },
};

const palette = {
  amber: {
    frame: '#f59e0b',
    deep: '#451a03',
    mid: '#b45309',
    light: '#fde68a',
    glow: 'rgba(245, 158, 11, 0.42)',
  },
  orange: {
    frame: '#f97316',
    deep: '#431407',
    mid: '#c2410c',
    light: '#fed7aa',
    glow: 'rgba(249, 115, 22, 0.4)',
  },
  red: {
    frame: '#ef4444',
    deep: '#450a0a',
    mid: '#b91c1c',
    light: '#fecaca',
    glow: 'rgba(239, 68, 68, 0.38)',
  },
  zinc: {
    frame: '#a1a1aa',
    deep: '#18181b',
    mid: '#52525b',
    light: '#e4e4e7',
    glow: 'rgba(161, 161, 170, 0.28)',
  },
} as const;

export function Card(props: CardProps): JSX.Element {
  if (props.masked) {
    return (
      <div
        className="oc-card-shell cursor-default select-none"
        data-testid={props.testId}
        aria-label="Hidden card"
      >
        <CardBackSvg />
      </div>
    );
  }

  return (
    <CardFront
      kind={props.kind}
      testId={props.testId}
      nameOverride={props.name}
      typeOverride={props.type}
      costOverride={props.cost}
    />
  );
}

function CardFront({
  kind,
  testId,
  nameOverride,
  typeOverride,
  costOverride,
}: {
  readonly kind: string;
  readonly testId?: string | undefined;
  readonly nameOverride?: string | undefined;
  readonly typeOverride?: 'unit' | 'tactic' | undefined;
  readonly costOverride?: number | undefined;
}): JSX.Element {
  const theme = resolveTheme(kind, nameOverride, typeOverride, costOverride);
  const isKnown = cardThemes[kind] !== undefined;
  const colors: CustomPalette = isKnown
    ? (palette[theme.accentColor] as CustomPalette)
    : resolveCustomPalette(kind);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const shadowY = useTransform(rotateX, [-6, 6], [18, 10]);
  const glowColor = colors.glow;
  const boxShadow = useTransform(
    shadowY,
    (value) => `0 ${value}px 32px ${glowColor}, 0 8px 18px rgba(0, 0, 0, 0.36)`,
  );

  function handleMouseMove(event: MouseEvent<HTMLDivElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    rotateY.set(x * 12);
    rotateX.set(y * -8);
  }

  function handleMouseLeave(): void {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      className="oc-card-shell select-none"
      data-testid={testId}
      style={{
        rotateX,
        rotateY,
        boxShadow,
        transformPerspective: 700,
      }}
      whileHover={{ y: -8, scale: 1.025 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <CardFrontSvg colors={colors} theme={theme} kind={kind} />
    </motion.div>
  );
}

/** Derive a stable hue (0–359) from a kind string by summing char codes. */
function kindToHue(kind: string): number {
  let sum = 0;
  for (const ch of kind) {
    sum += ch.charCodeAt(0);
  }
  return sum % 360;
}

/** Build a CSS hsl accent string for an unknown kind. */
export function kindToHsl(kind: string): string {
  return `hsl(${String(kindToHue(kind))}, 65%, 55%)`;
}

/**
 * Custom accent palette entry for arbitrary (unknown) card kinds.
 * Colors are inlined as literal strings derived from the kind hash.
 */
type CustomPalette = {
  readonly frame: string;
  readonly deep: string;
  readonly mid: string;
  readonly light: string;
  readonly glow: string;
};

function resolveCustomPalette(kind: string): CustomPalette {
  const hue = kindToHue(kind);
  return {
    frame: `hsl(${String(hue)}, 65%, 55%)`,
    deep: `hsl(${String(hue)}, 40%, 10%)`,
    mid: `hsl(${String(hue)}, 55%, 35%)`,
    light: `hsl(${String(hue)}, 80%, 85%)`,
    glow: `hsla(${String(hue)}, 65%, 55%, 0.38)`,
  };
}

function resolveTheme(
  kind: string,
  nameOverride?: string,
  typeOverride?: 'unit' | 'tactic',
  costOverride?: number,
): CardTheme {
  const base = cardThemes[kind];
  if (base) {
    // Known themed kind — apply overrides for display text only.
    return {
      ...base,
      label: nameOverride && nameOverride.trim() !== '' ? nameOverride : base.label,
      type: typeOverride ?? base.type,
      cost: costOverride ?? base.cost,
    };
  }

  // Unknown kind — derive stable accent from kind hash.
  const displayName = nameOverride && nameOverride.trim() !== '' ? nameOverride : kind;
  return {
    glyph: displayName.charAt(0).toUpperCase() || '?',
    accentColor: 'zinc',
    label: displayName,
    description: typeOverride ?? 'custom',
    type: typeOverride ?? 'tactic',
    cost: costOverride ?? stableCost(kind),
  };
}

function stableCost(kind: string): number {
  let hash = 0;
  for (const character of kind) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }

  return (hash % 3) + 1;
}

function CardFrontSvg({
  colors,
  theme,
  kind,
}: {
  readonly colors: CustomPalette;
  readonly theme: CardTheme;
  readonly kind: string;
}): JSX.Element {
  const gradientId = `front-${cardThemes[kind] === undefined ? `custom-${String(kindToHue(kind))}` : theme.accentColor}`;

  return (
    <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 120 180" role="img">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="45%" stopColor={colors.frame} />
          <stop offset="100%" stopColor={colors.mid} />
        </linearGradient>
        <radialGradient id={`${gradientId}-art`} cx="45%" cy="36%" r="72%">
          <stop offset="0%" stopColor={colors.mid} stopOpacity="0.85" />
          <stop offset="100%" stopColor={colors.deep} />
        </radialGradient>
      </defs>
      <rect width="118" height="178" x="1" y="1" rx="11" fill={`url(#${gradientId})`} />
      <rect width="110" height="170" x="5" y="5" rx="8" fill="#111113" />
      <rect width="102" height="162" x="9" y="9" rx="6" fill={colors.deep} opacity="0.94" />
      <circle cx="22" cy="23" r="13" fill="#18181b" stroke={colors.light} strokeWidth="2" />
      <text
        fill={colors.light}
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize="8"
        fontWeight="800"
        textAnchor="middle"
        x="22"
        y="20"
      >
        E
      </text>
      <text
        fill="#ffffff"
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize="11"
        fontWeight="900"
        textAnchor="middle"
        x="22"
        y="32"
      >
        {theme.cost}
      </text>
      <rect width="92" height="86" x="14" y="43" rx="6" fill={`url(#${gradientId}-art)`} />
      <Pattern theme={theme} colors={colors} />
      <text
        fill="#fff7ed"
        fontFamily="Georgia, ui-serif, serif"
        fontSize="50"
        fontWeight="800"
        opacity="0.92"
        textAnchor="middle"
        x="60"
        y="100"
      >
        {theme.glyph}
      </text>
      <rect width="92" height="39" x="14" y="132" rx="5" fill="#18181b" opacity="0.95" />
      <text
        fill="#fafafa"
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize="11"
        fontWeight="800"
        x="20"
        y="148"
      >
        {theme.label}
      </text>
      <text fill="#d4d4d8" fontFamily="Inter, ui-sans-serif, system-ui" fontSize="7" x="20" y="161">
        {theme.description}
      </text>
      <rect width="30" height="11" x="70" y="154" rx="5.5" fill={colors.mid} opacity="0.9" />
      <text
        fill="#fff7ed"
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize="6.5"
        fontWeight="800"
        textAnchor="middle"
        x="85"
        y="162"
      >
        {theme.type.toUpperCase()}
      </text>
    </svg>
  );
}

function Pattern({
  colors,
  theme,
}: {
  readonly colors: CustomPalette;
  readonly theme: CardTheme;
}): JSX.Element {
  if (theme.type === 'tactic') {
    return (
      <g fill="none" stroke={colors.light} strokeLinecap="round" strokeLinejoin="round">
        <path d="M63 49 42 87h16l-8 34 29-45H62z" opacity="0.22" strokeWidth="5" />
        <path d="M28 62 40 74M84 56 75 70M90 100l-14 7" opacity="0.35" strokeWidth="2" />
      </g>
    );
  }

  return (
    <g fill={colors.light} opacity="0.2">
      <circle cx="33" cy="68" r="13" />
      <circle cx="88" cy="71" r="10" />
      <path d="M30 113h60L60 57z" />
      <rect width="27" height="27" x="46.5" y="83" rx="4" transform="rotate(45 60 96.5)" />
    </g>
  );
}

function CardBackSvg(): JSX.Element {
  return (
    <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 120 180" role="img">
      <defs>
        <linearGradient id="back-frame" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#d4d4d8" />
          <stop offset="45%" stopColor="#71717a" />
          <stop offset="100%" stopColor="#27272a" />
        </linearGradient>
        <radialGradient id="back-core" cx="50%" cy="42%" r="68%">
          <stop offset="0%" stopColor="#3f3f46" />
          <stop offset="100%" stopColor="#18181b" />
        </radialGradient>
      </defs>
      <rect width="118" height="178" x="1" y="1" rx="11" fill="url(#back-frame)" />
      <rect width="110" height="170" x="5" y="5" rx="8" fill="#09090b" />
      <rect width="96" height="156" x="12" y="12" rx="7" fill="url(#back-core)" />
      <g fill="none" stroke="#a1a1aa" strokeOpacity="0.28">
        <path d="M25 28h70v124H25z" />
        <path d="M60 27v126M24 90h72M36 42l48 96M84 42l-48 96" />
      </g>
      <circle cx="60" cy="90" r="28" fill="#18181b" stroke="#d4d4d8" strokeOpacity="0.42" />
      <path
        d="M47 92c0-9 5-18 13-18s13 9 13 18-5 18-13 18-13-9-13-18Z"
        fill="none"
        stroke="#e4e4e7"
        strokeWidth="3"
      />
      <path d="M43 90h34M60 72v38" stroke="#e4e4e7" strokeLinecap="round" strokeWidth="3" />
      <text
        fill="#e4e4e7"
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize="9"
        fontWeight="800"
        letterSpacing="1"
        textAnchor="middle"
        x="60"
        y="142"
      >
        OPENCARDS
      </text>
    </svg>
  );
}
