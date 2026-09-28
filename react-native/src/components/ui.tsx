// ui.tsx — small, dependency-free building blocks shared by every demo
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { formatLabel, gearLabel } from '@/t3k/labels';
import type { EmbeddedUser, PublicUser, Tone } from '@/t3k/types';

export const colors = {
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  surface: '#f8fafc',
  primary: '#2563eb',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  infoBg: '#eff6ff',
};

export function SectionHeader({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  return <Text style={[styles.muted, small && styles.small]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  busy,
  disabled,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'link' && styles.buttonLink,
        (pressed || inactive) && { opacity: 0.6 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={[styles.banner, { backgroundColor: colors.dangerBg }]}>
      <Text style={{ color: colors.danger, flex: 1 }}>{message}</Text>
      {onDismiss && <Text style={{ color: colors.danger }}>✕</Text>}
    </Pressable>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.infoBg }]}>
      <Text style={{ color: colors.text, flex: 1 }}>{message}</Text>
    </View>
  );
}

export function CenteredProgress() {
  return <ActivityIndicator style={{ padding: 32 }} />;
}

/** Horizontal single-choice chips — stands in for a dropdown. */
export function ChipSelect<T>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ marginVertical: 4 }}>
      {label && <Text style={[styles.small, styles.muted, { paddingHorizontal: 16 }]}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map(([v, text]) => (
          <Chip key={String(text)} text={text} selected={v === value} onPress={() => onChange(v)} />
        ))}
      </ScrollView>
    </View>
  );
}

export function Chip({ text, selected, onPress }: { text: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{text}</Text>
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={{ flex: 1, color: colors.text }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function SearchField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      style={styles.input}
    />
  );
}

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <View style={styles.pager}>
      <Button title="‹ Prev" variant="link" disabled={page <= 1} onPress={() => onChange(page - 1)} />
      <Muted>
        Page {page} of {totalPages}
      </Muted>
      <Button title="Next ›" variant="link" disabled={page >= totalPages} onPress={() => onChange(page + 1)} />
    </View>
  );
}

/** Verified creators show their display name; everyone else shows @username. */
export function CreatorBadge({ user, large }: { user: EmbeddedUser | PublicUser; large?: boolean }) {
  const size = large ? 40 : 20;
  const name = user.is_verified && user.display_name ? user.display_name : `@${user.username}`;
  return (
    <View style={styles.creator}>
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border }} />
      )}
      <Text style={[{ color: colors.muted }, large && { fontSize: 17, color: colors.text, fontWeight: '600' }]}>{name}</Text>
      {user.is_verified && <Text style={{ color: colors.primary }}>✓</Text>}
    </View>
  );
}

export function ToneRow({ tone, onPress }: { tone: Tone; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.toneRow, pressed && { opacity: 0.6 }]}>
      {tone.images?.[0] ? (
        <Image source={{ uri: tone.images[0] }} style={styles.toneImage} />
      ) : (
        <View style={[styles.toneImage, { backgroundColor: colors.border }]} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toneTitle} numberOfLines={1}>
          {tone.title}
        </Text>
        <CreatorBadge user={tone.user} />
        <Muted small>
          {[gearLabel(tone.gear), formatLabel(tone.format), `↓ ${tone.downloads_count}`, `★ ${tone.favorites_count}`].join(' · ')}
        </Muted>
      </View>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { paddingBottom: 32 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.muted,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  muted: { color: colors.muted },
  small: { fontSize: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  buttonSecondary: { backgroundColor: colors.infoBg },
  buttonLink: { backgroundColor: 'transparent', marginHorizontal: 0, paddingHorizontal: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  banner: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 10,
  },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 4,
    color: colors.text,
  },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toneRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  toneImage: { width: 56, height: 56, borderRadius: 8 },
  toneTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
});
