// The Lumen token presets and the step from a token document to what the app draws with. The
// schema, validation and contrast checks are the shared Lumen core (lumen/core.ts, a locked copy
// of lumen-hydrodactyl-theme's), so a token file from any Lumen theme imports here unchanged.

import { Platform } from 'react-native';

import { contrastReport, fontStack, normalize, type ModeColors, type ThemeMode, type Tokens } from './lumen/core';
import aurora from './lumen/presets/aurora.json';
import contrast from './lumen/presets/contrast.json';
import graphite from './lumen/presets/graphite.json';
import luminare from './lumen/presets/luminare.json';

export const PRESET_NAMES = ['luminare', 'graphite', 'aurora', 'contrast'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

// The preset files are complete, valid token documents (the source repository's tests check
// that), so the Luminare file itself is the fallback for normalising the others.
const LUMINARE = luminare as unknown as Tokens;

export const PRESETS: Record<PresetName, Tokens> = {
  luminare: LUMINARE,
  graphite: normalize(graphite, LUMINARE).tokens,
  aurora: normalize(aurora, LUMINARE).tokens,
  contrast: normalize(contrast, LUMINARE).tokens,
};

export interface TokenImport {
  tokens: Tokens;
  /** Paths of values that were invalid and replaced from the preset. */
  replaced: string[];
  /** Colour pairs below their WCAG minimum, in either mode. */
  lowContrast: number;
}

/** Checks an imported token document against the schema; the preset fills every gap. */
export function importTokens(input: unknown, preset: PresetName): TokenImport {
  const { tokens, errors } = normalize(input, PRESETS[preset]);
  const lowContrast = contrastReport(tokens).filter((result) => !result.ok).length;
  return { tokens, replaced: errors, lowContrast };
}

export function resolveTokens(preset: PresetName, custom: unknown): Tokens {
  return custom ? normalize(custom, PRESETS[preset]).tokens : PRESETS[preset];
}

export interface Theme {
  mode: ThemeMode;
  color: ModeColors;
  /** Corner radius for cards; controls use about two thirds of it. */
  radius: number;
  /** The spacing unit (3 to 6 px); layouts use multiples of it. */
  space: (steps: number) => number;
  /** Font size multiplier from the token scale. */
  scale: number;
  fontBody: string | undefined;
  fontDisplay: string | undefined;
  headingWeight: '400' | '500' | '600' | '700' | '800';
  shadow: boolean;
  borders: boolean;
}

// The bundled typeface (assets/fonts/Sora-Variable.ttf, loaded by expo-font).
export const BUNDLED_FONT = 'Sora';

function family(value: string, fallback: string): string | undefined {
  if (Platform.OS === 'web') return fontStack(value, fallback);
  // Native apps can only use the bundled font or the system font.
  return value.split(',').some((name) => name.trim().replace(/["']/g, '') === BUNDLED_FONT) ? BUNDLED_FONT : undefined;
}

const DENSITY = { compact: 0.85, comfortable: 1, spacious: 1.2 } as const;

export function themeFor(tokens: Tokens, mode: ThemeMode): Theme {
  const unit = tokens.spacing.base * DENSITY[tokens.density];
  const weight = Math.round(tokens.typography.headingWeight / 100) * 100;
  return {
    mode,
    color: tokens.color[mode],
    radius: tokens.radius.base,
    space: (steps) => Math.round(unit * steps),
    scale: tokens.typography.scale,
    fontBody: family(tokens.typography.body, 'system-ui, sans-serif'),
    fontDisplay: family(tokens.typography.display, 'system-ui, sans-serif'),
    headingWeight: String(Math.min(800, Math.max(400, weight))) as Theme['headingWeight'],
    shadow: tokens.elevation.shadow !== 'none',
    borders: tokens.elevation.borders,
  };
}

/** Mixes two #RRGGBB colours; `amount` 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, amount: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * amount);
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
