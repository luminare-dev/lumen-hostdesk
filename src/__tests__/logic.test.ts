import { DEFAULT_THRESHOLDS, evaluateAlerts, newAlerts } from '../alerts/evaluate';
import { parseByteShorthand } from '../api/bytes';
import { KeyHelpError } from '../api/errors';
import { normalizeServerUrl } from '../api/url';
import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { formatBytes, pickLanguage, translator } from '../i18n';
import { createFixtures } from '../mock/fixtures';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../state/settings';
import { contrastReport } from '../theme/lumen/core';
import { importTokens, mix, PRESETS, PRESET_NAMES, themeFor } from '../theme/tokens';

const NOW = new Date('2026-11-20T10:00:00Z');

describe('normalizeServerUrl', () => {
  it.each([
    ['panel.example.org', 'https://panel.example.org'],
    ['https://Panel.Example.org/', 'https://panel.example.org'],
    ['https://panel.example.org/api/v2/', 'https://panel.example.org'],
    ['panel.example.org:8443', 'https://panel.example.org:8443'],
    ['https://panel.example.org:443', 'https://panel.example.org'],
    ['192.0.2.10', 'https://192.0.2.10'],
    ['  panel.example.org  ', 'https://panel.example.org'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });

  it.each([
    ['http://panel.example.org', 'insecure'],
    ['ftp://panel.example.org', 'insecure'],
    ['', 'invalidUrl'],
    ['panel', 'invalidUrl'],
    ['https://user:pw@panel.example.org', 'invalidUrl'],
    ['https://panel.example.org/keyhelp', 'invalidUrl'],
    ['https://panel.example.org:99999', 'invalidUrl'],
    ['pan el.example.org', 'invalidUrl'],
  ])('refuses %s (%s)', (input, kind) => {
    let error: unknown;
    try {
      normalizeServerUrl(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(KeyHelpError);
    expect((error as KeyHelpError).kind).toBe(kind);
  });
});

describe('parseByteShorthand', () => {
  it('reads KeyHelp shorthand', () => {
    expect(parseByteShorthand('1G')).toBe(1024 ** 3);
    expect(parseByteShorthand('500m')).toBe(500 * 1024 ** 2);
    expect(parseByteShorthand('2 GB')).toBe(2 * 1024 ** 3);
    expect(parseByteShorthand('1024')).toBe(1024);
    expect(parseByteShorthand('')).toBe(0);
    expect(parseByteShorthand('1.5G')).toBeNull();
    expect(parseByteShorthand('lots')).toBeNull();
  });
});

describe('evaluateAlerts', () => {
  const data = createFixtures(NOW);
  const snapshot = { server: data.server, certificates: data.certificates, emails: data.emails, backups: data.backups };

  it('finds the problems in the fixtures', () => {
    const alerts = evaluateAlerts(snapshot, DEFAULT_THRESHOLDS, NOW);
    const kinds = alerts.map((a) => a.kind).sort();
    expect(kinds).toEqual(['backup', 'certificateExpired', 'certificateExpiring', 'quota', 'service']);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts.find((a) => a.kind === 'certificateExpiring')?.params).toEqual({ domain: 'bakery.example', days: 9 });
    expect(alerts.find((a) => a.kind === 'quota')?.params.address).toBe('board@club.example');
  });

  it('follows the thresholds', () => {
    const strict = { ...DEFAULT_THRESHOLDS, diskPercent: 60, memoryPercent: 50, certDays: 60, services: false, backups: false };
    const kinds = evaluateAlerts(snapshot, strict, NOW).map((a) => a.kind);
    expect(kinds).toContain('disk');
    expect(kinds).toContain('memory');
    expect(kinds.filter((k) => k === 'certificateExpiring').length).toBe(2);
    expect(kinds).not.toContain('service');
    expect(kinds).not.toContain('backup');
  });

  it('lets a later successful backup clear a failure', () => {
    const backups = [
      { id_user: 3, id_repository: 1, type: 'backup', state: 'failed', started_at: '2026-11-18T00:00:00Z' },
      { id_user: 3, id_repository: 1, type: 'backup', state: 'finished', started_at: '2026-11-19T00:00:00Z' },
    ];
    expect(evaluateAlerts({ backups }, DEFAULT_THRESHOLDS, NOW)).toEqual([]);
  });

  it('notifies only new alerts', () => {
    const alerts = evaluateAlerts(snapshot, DEFAULT_THRESHOLDS, NOW);
    expect(newAlerts([], alerts)).toHaveLength(alerts.length);
    expect(newAlerts(alerts.map((a) => a.id), alerts)).toHaveLength(0);
    expect(newAlerts(alerts.slice(1).map((a) => a.id), alerts)).toEqual([alerts[0]]);
  });
});

describe('i18n', () => {
  it('has every English key in German', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps the placeholders of every message', () => {
    const names = (text: string) => (text.match(/\{[a-z]+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([key, names(de[key])]).toEqual([key, names(en[key])]);
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    const t = translator('de');
    expect(t('dashboard.uptime', { days: 3, hours: 4 })).toBe('Läuft seit 3 T 4 h');
    expect(translator('en')('common.of', { used: 'a' })).toBe('a of {total}');
  });

  it('picks the device language', () => {
    expect(pickLanguage(['de-AT', 'en'])).toBe('de');
    expect(pickLanguage(['fr', 'en-US'])).toBe('en');
    expect(pickLanguage([null, 'it'])).toBe('en');
  });

  it('formats bytes in binary units', () => {
    expect(formatBytes(1024 ** 3 * 1.5, 'en')).toBe('1.5 GB');
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(undefined, 'en')).toBe('—');
  });
});

describe('settings', () => {
  it('fills defaults and drops invalid values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ language: 'fr', theme: 'light', preset: 'aurora', thresholds: { certDays: 500, diskPercent: 70 } });
    expect(s.language).toBe('system');
    expect(s.theme).toBe('light');
    expect(s.preset).toBe('aurora');
    expect(s.thresholds.certDays).toBe(DEFAULT_SETTINGS.thresholds.certDays);
    expect(s.thresholds.diskPercent).toBe(70);
  });
});

describe('tokens', () => {
  it('loads every preset with contrast in both modes', () => {
    for (const name of PRESET_NAMES) {
      const failing = contrastReport(PRESETS[name]).filter((r) => !r.ok);
      expect([name, failing.map((r) => `${r.mode} ${r.label}`)]).toEqual([name, []]);
    }
  });

  it('imports a partial token file and reports invalid values', () => {
    const result = importTokens({ color: { dark: { accent: '#FF00AA', text: 'red' } }, radius: { base: 99 } }, 'luminare');
    expect(result.tokens.color.dark.accent).toBe('#FF00AA');
    expect(result.tokens.color.dark.text).toBe(PRESETS.luminare.color.dark.text);
    expect(result.replaced).toEqual(expect.arrayContaining(['color.dark.text', 'radius.base']));
  });

  it('turns tokens into a theme', () => {
    const theme = themeFor(PRESETS.luminare, 'light');
    expect(theme.color.canvas).toBe('#F3F6FB');
    expect(theme.space(4)).toBe(16);
    expect(theme.radius).toBe(14);
  });

  it('mixes colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.3)).toBe('#102030');
  });
});
