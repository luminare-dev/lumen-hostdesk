// Small UI building blocks drawn from the Lumen theme. Every colour, radius, spacing step and font
// comes from useApp().theme, so an imported token file restyles the whole app.

import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { KeyHelpError } from '../api/errors';
import { useApp } from '../state/AppProvider';
import { mix, type Theme } from '../theme/tokens';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'success':
      return theme.color.success;
    case 'warning':
      return theme.color.warning;
    case 'danger':
      return theme.color.danger;
    case 'info':
      return theme.color.info;
    case 'accent':
      return theme.color.accentText;
    default:
      return theme.color.textMuted;
  }
}

// --- Text -----------------------------------------------------------------------------------

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'muted' | 'caption' | 'mono';

export function T({
  children,
  variant = 'body',
  tone,
  style,
  testID,
  selectable,
  numberOfLines,
  role,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  testID?: string;
  selectable?: boolean;
  numberOfLines?: number;
  role?: 'heading' | 'alert';
}) {
  const { theme } = useApp();
  const s = theme.scale;
  const base: Record<TextVariant, TextStyle> = {
    display: { fontFamily: theme.fontDisplay, fontSize: 28 * s, fontWeight: theme.headingWeight, lineHeight: 34 * s },
    title: { fontFamily: theme.fontDisplay, fontSize: 22 * s, fontWeight: theme.headingWeight, lineHeight: 28 * s },
    heading: { fontFamily: theme.fontDisplay, fontSize: 17 * s, fontWeight: theme.headingWeight, lineHeight: 22 * s },
    body: { fontFamily: theme.fontBody, fontSize: 15 * s, lineHeight: 21 * s },
    label: { fontFamily: theme.fontBody, fontSize: 14 * s, fontWeight: '600', lineHeight: 19 * s },
    muted: { fontFamily: theme.fontBody, fontSize: 14 * s, lineHeight: 19 * s },
    caption: { fontFamily: theme.fontBody, fontSize: 12.5 * s, lineHeight: 17 * s },
    mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, monospace' }), fontSize: 14 * s },
  };
  const color =
    tone !== undefined ? toneColor(theme, tone) : variant === 'muted' || variant === 'caption' ? theme.color.textMuted : theme.color.text;
  return (
    <Text
      style={[base[variant], { color }, style]}
      testID={testID}
      selectable={selectable}
      numberOfLines={numberOfLines}
      role={role}
      aria-level={role === 'heading' ? (variant === 'display' || variant === 'title' ? 1 : 2) : undefined}
    >
      {children}
    </Text>
  );
}

// --- Layout ---------------------------------------------------------------------------------

export function Screen({
  title,
  onBack,
  right,
  children,
  scroll = true,
  testID,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();
  const pad = theme.space(4);
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + theme.space(3), paddingHorizontal: pad, gap: theme.space(2) }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          role="button"
          aria-label={t('common.back')}
          testID="back"
          hitSlop={12}
          style={({ pressed }) => [styles.back, { borderRadius: theme.radius, opacity: pressed ? 0.6 : 1 }]}
        >
          <T variant="heading" tone="accent">
            ‹
          </T>
        </Pressable>
      ) : null}
      <View style={styles.headerTitle}>
        <T variant="title" role="heading" numberOfLines={1}>
          {title}
        </T>
      </View>
      {right}
    </View>
  );
  const body = <View style={{ paddingHorizontal: pad, paddingBottom: theme.space(6), gap: theme.space(3) }}>{children}</View>;
  return (
    <View style={[styles.fill, { backgroundColor: theme.color.canvas }]} testID={testID}>
      {header}
      {scroll ? (
        <ScrollView style={styles.fill} contentContainerStyle={{ paddingTop: theme.space(2) }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.fill, { paddingTop: theme.space(2) }]}>{body}</View>
      )}
    </View>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { theme } = useApp();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius,
          padding: theme.space(4),
          gap: theme.space(2),
          borderWidth: theme.borders ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: theme.color.border,
        },
        theme.shadow && theme.mode === 'light' ? styles.shadow : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const { theme } = useApp();
  return (
    <View style={{ gap: theme.space(2), marginTop: theme.space(2) }}>
      <View style={styles.rowBetween}>
        <T variant="label" tone="neutral" role="heading">
          {title}
        </T>
        {right}
      </View>
      {children}
    </View>
  );
}

// --- Controls -------------------------------------------------------------------------------

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  testID,
  compact,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  compact?: boolean;
}) {
  const { theme } = useApp();
  const c = theme.color;
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.danger : kind === 'secondary' ? c.surfaceRaised : 'transparent';
  const fg =
    kind === 'primary' ? c.accentContrast : kind === 'danger' ? (theme.mode === 'dark' ? c.canvas : '#FFFFFF') : c.accentText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      role="button"
      aria-disabled={disabled || busy}
      aria-busy={busy}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderRadius: Math.max(6, theme.radius * 0.7),
          paddingVertical: theme.space(compact ? 2 : 3),
          paddingHorizontal: theme.space(compact ? 3 : 4),
          borderWidth: kind === 'secondary' ? 1 : 0,
          borderColor: c.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : null}
      <T variant="label" style={{ color: fg }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  hint,
  placeholder,
  secure,
  testID,
  keyboard,
  autoCapitalize = 'none',
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hint?: string;
  placeholder?: string;
  secure?: boolean;
  testID?: string;
  keyboard?: 'default' | 'email-address' | 'url' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
}) {
  const { theme } = useApp();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: theme.space(1) }}>
      <T variant="label">{label}</T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={mix(theme.color.textMuted, theme.color.surface, 0.35)}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete="off"
        keyboardType={keyboard}
        multiline={multiline}
        aria-label={label}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            color: theme.color.text,
            backgroundColor: theme.color.surfaceSunken,
            borderColor: focused ? theme.color.focus : theme.color.border,
            borderWidth: focused ? 2 : 1,
            borderRadius: Math.max(6, theme.radius * 0.6),
            paddingHorizontal: theme.space(3),
            paddingVertical: theme.space(2.5),
            fontFamily: multiline ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, monospace' }) : theme.fontBody,
            fontSize: 15 * theme.scale,
            minHeight: multiline ? 160 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {hint ? <T variant="caption">{hint}</T> : null}
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) {
  const { theme } = useApp();
  return (
    <View style={[styles.rowBetween, { gap: theme.space(3) }]}>
      <View style={styles.fill}>
        <T>{label}</T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        aria-label={label}
        testID={testID}
        trackColor={{ false: theme.color.border, true: theme.color.accentSecondary }}
        thumbColor={value ? theme.color.accent : theme.color.surfaceRaised}
      />
    </View>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  testID?: string;
}) {
  const { theme } = useApp();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      testID={testID}
      style={[styles.row, { backgroundColor: theme.color.surfaceSunken, borderRadius: theme.radius * 0.7, padding: 3, flexWrap: 'wrap' }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={{
              flexGrow: 1,
              alignItems: 'center',
              paddingVertical: theme.space(2),
              paddingHorizontal: theme.space(2),
              borderRadius: theme.radius * 0.55,
              backgroundColor: selected ? theme.color.surfaceRaised : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: theme.color.border,
            }}
          >
            <T variant="label" style={{ color: selected ? theme.color.text : theme.color.textMuted }}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  const { theme } = useApp();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.color.textMuted}
      aria-label={placeholder}
      role="searchbox"
      testID="search"
      autoCapitalize="none"
      autoCorrect={false}
      style={{
        color: theme.color.text,
        backgroundColor: theme.color.surface,
        borderColor: theme.color.border,
        borderWidth: 1,
        borderRadius: theme.radius,
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(3),
        fontFamily: theme.fontBody,
        fontSize: 15 * theme.scale,
      }}
    />
  );
}

// --- Display --------------------------------------------------------------------------------

export function Badge({ label, tone = 'neutral', testID }: { label: string; tone?: Tone; testID?: string }) {
  const { theme } = useApp();
  const color = toneColor(theme, tone);
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: theme.space(2.5),
        paddingVertical: 3,
        backgroundColor: mix(theme.color.surface, color, theme.mode === 'dark' ? 0.16 : 0.1),
        borderWidth: 1,
        borderColor: mix(theme.color.surface, color, 0.45),
      }}
    >
      <T variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </T>
    </View>
  );
}

export function Meter({ label, percent, detail, warnAt = 85, testID }: { label: string; percent: number; detail?: string; warnAt?: number; testID?: string }) {
  const { theme } = useApp();
  const clamped = Math.max(0, Math.min(100, percent));
  const tone: Tone = clamped >= Math.max(warnAt, 95) ? 'danger' : clamped >= warnAt ? 'warning' : 'accent';
  const fill = tone === 'accent' ? theme.color.accent : toneColor(theme, tone);
  return (
    <View style={{ gap: theme.space(1.5) }} testID={testID}>
      <View style={styles.rowBetween}>
        <T variant="label">{label}</T>
        <T variant="label" tone={tone === 'accent' ? undefined : tone}>
          {`${Math.round(clamped)} %`}
        </T>
      </View>
      <View
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        style={{ height: 8, borderRadius: 4, backgroundColor: theme.color.surfaceSunken, overflow: 'hidden' }}
      >
        <View style={{ width: `${clamped}%`, height: '100%', borderRadius: 4, backgroundColor: fill }} />
      </View>
      {detail ? <T variant="caption">{detail}</T> : null}
    </View>
  );
}

export function KeyValue({ label, value, testID }: { label: string; value: ReactNode; testID?: string }) {
  const { theme } = useApp();
  return (
    <View style={[styles.rowBetween, { gap: theme.space(3), alignItems: 'flex-start' }]} testID={testID}>
      <T variant="muted">{label}</T>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{typeof value === 'string' || typeof value === 'number' ? <T style={{ textAlign: 'right' }}>{value}</T> : value}</View>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { theme } = useApp();
  const content = (
    <View style={[styles.rowBetween, { gap: theme.space(3) }]}>
      <View style={[styles.fill, { gap: 2 }]}>
        <T variant="label" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {onPress ? (
        <T variant="heading" tone="neutral">
          ›
        </T>
      ) : null}
    </View>
  );
  const box: ViewStyle = {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    borderWidth: theme.borders ? 1 : 0,
    borderColor: theme.color.border,
  };
  if (!onPress) {
    return (
      <View style={box} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} role="button" aria-label={title} testID={testID} style={({ pressed }) => [box, { opacity: pressed ? 0.75 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function Notice({ children, tone = 'info', testID }: { children: ReactNode; tone?: Tone; testID?: string }) {
  const { theme } = useApp();
  const color = toneColor(theme, tone);
  return (
    <View
      testID={testID}
      role={tone === 'danger' ? 'alert' : undefined}
      style={{
        borderRadius: theme.radius,
        padding: theme.space(3),
        gap: theme.space(1),
        backgroundColor: mix(theme.color.surface, color, theme.mode === 'dark' ? 0.12 : 0.08),
        borderLeftWidth: 4,
        borderLeftColor: color,
      }}
    >
      {typeof children === 'string' ? <T variant="muted" style={{ color: theme.color.text }}>{children}</T> : children}
    </View>
  );
}

export function Loading() {
  const { theme, t } = useApp();
  return (
    <View style={[styles.row, { gap: theme.space(2), padding: theme.space(4), justifyContent: 'center' }]} testID="loading">
      <ActivityIndicator color={theme.color.accent} />
      <T variant="muted">{t('common.loading')}</T>
    </View>
  );
}

/** Explains an API error in plain words, with the server's own message as detail. */
export function ErrorPanel({ error, onRetry }: { error: KeyHelpError; onRetry?: () => void }) {
  const { t, theme } = useApp();
  const text =
    error.kind === 'badRequest' ? t('error.badRequest', { message: error.apiMessage ?? error.message }) : t(`error.${error.kind}`);
  return (
    <Notice tone="danger" testID={`error-${error.kind}`}>
      <T variant="label" tone="danger">
        {t('error.title')}
      </T>
      <T style={{ color: theme.color.text }}>{text}</T>
      {error.kind !== 'badRequest' && error.message ? <T variant="caption">{t('error.details', { message: error.message })}</T> : null}
      {onRetry ? (
        <View style={{ marginTop: theme.space(2), alignSelf: 'flex-start' }}>
          <Button label={t('common.retry')} onPress={onRetry} kind="secondary" compact testID="retry" />
        </View>
      ) : null}
    </Notice>
  );
}

/** A confirmation sheet for destructive or disruptive actions. */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
  busy,
  children,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const { theme, t } = useApp();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { padding: theme.space(5) }]}>
        <View
          role="alertdialog"
          aria-modal
          aria-label={title}
          testID="confirm-dialog"
          style={{
            width: '100%',
            maxWidth: 440,
            backgroundColor: theme.color.surfaceRaised,
            borderRadius: theme.radius,
            padding: theme.space(5),
            gap: theme.space(3),
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <T variant="heading" role="heading">
            {title}
          </T>
          <T variant="muted" style={{ color: theme.color.text }}>
            {body}
          </T>
          {children}
          <View style={[styles.row, { gap: theme.space(2), justifyContent: 'flex-end', flexWrap: 'wrap' }]}>
            <Button label={t('common.cancel')} onPress={onCancel} kind="secondary" testID="confirm-cancel" />
            <Button label={confirmLabel} onPress={onConfirm} kind={danger ? 'danger' : 'primary'} busy={busy} testID="confirm-ok" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  headerTitle: { flex: 1 },
  back: { paddingHorizontal: 6, paddingVertical: 2 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 14, 0.6)', alignItems: 'center', justifyContent: 'center' },
  shadow: {
    shadowColor: '#0A1224',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
