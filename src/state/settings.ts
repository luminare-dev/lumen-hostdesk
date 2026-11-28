// App settings: language, appearance, the Lumen tokens, the alert thresholds and the read-only
// default. Stored as one
// JSON document; anything unreadable falls back to the default, value by value.

import { DEFAULT_THRESHOLDS, type Thresholds } from '../alerts/evaluate';
import type { Language } from '../i18n';
import { PRESET_NAMES, type PresetName } from '../theme/tokens';
import type { KeyValueStore } from './servers';

export type LanguageSetting = Language | 'system';
export type ThemeSetting = 'system' | 'dark' | 'light';

export interface Settings {
  language: LanguageSetting;
  theme: ThemeSetting;
  preset: PresetName;
  /** An imported token document (normalised); null means the preset. */
  customTokens: unknown;
  thresholds: Thresholds;
  backgroundChecks: boolean;
  /** Read-only mode for servers that have no setting of their own. */
  readOnlyDefault: boolean;
}

export const SETTINGS_KEY = 'hostdesk.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'system',
  preset: 'luminare',
  customTokens: null,
  thresholds: DEFAULT_THRESHOLDS,
  backgroundChecks: true,
  readOnlyDefault: false,
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const numberIn = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : fallback;

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Completes and checks a stored settings document. */
export function sanitizeSettings(input: unknown): Settings {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const th = typeof src.thresholds === 'object' && src.thresholds !== null ? (src.thresholds as Record<string, unknown>) : {};
  const d = DEFAULT_THRESHOLDS;
  return {
    language: oneOf(src.language, ['system', 'en', 'de'] as const, DEFAULT_SETTINGS.language),
    theme: oneOf(src.theme, ['system', 'dark', 'light'] as const, DEFAULT_SETTINGS.theme),
    preset: oneOf(src.preset, PRESET_NAMES, DEFAULT_SETTINGS.preset),
    customTokens: typeof src.customTokens === 'object' && src.customTokens !== null ? src.customTokens : null,
    thresholds: {
      certDays: numberIn(th.certDays, 1, 90, d.certDays),
      diskPercent: numberIn(th.diskPercent, 50, 99, d.diskPercent),
      memoryPercent: numberIn(th.memoryPercent, 50, 99, d.memoryPercent),
      quotaPercent: numberIn(th.quotaPercent, 50, 100, d.quotaPercent),
      services: bool(th.services, d.services),
      backups: bool(th.backups, d.backups),
    },
    backgroundChecks: bool(src.backgroundChecks, DEFAULT_SETTINGS.backgroundChecks),
    readOnlyDefault: bool(src.readOnlyDefault, DEFAULT_SETTINGS.readOnlyDefault),
  };
}

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  const raw = await store.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
