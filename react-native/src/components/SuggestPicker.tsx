import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, SearchField, styles as ui } from './ui';

export interface Suggestion {
  name: string;
  /** Secondary text, e.g. a tone count or display name. */
  hint?: string;
}

const SUGGEST_DEBOUNCE_MS = 250;

/**
 * Pick exact names (tags, makes, creators) for a search filter. Typing looks
 * up matches through the API, so the filter only ever holds names that exist.
 */
export function SuggestPicker({
  label,
  placeholder,
  values,
  onChange,
  suggest,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggest: (query: string) => Promise<Suggestion[]>;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      suggest(q)
        .then((results) => current && setSuggestions(results))
        .catch(() => current && setSuggestions([]))
        .finally(() => current && setLoading(false));
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, suggest]);

  const options = suggestions.filter((s) => !values.includes(s.name));

  const add = (name: string) => {
    onChange([...values, name]);
    setQuery('');
  };

  return (
    <View style={{ marginVertical: 4 }}>
      <Text style={styles.label}>{label}</Text>
      {values.length > 0 && (
        <View style={[ui.chips, styles.selected]}>
          {values.map((v) => (
            <Pressable key={v} onPress={() => onChange(values.filter((x) => x !== v))} style={styles.chip} hitSlop={4}>
              <Text style={styles.chipText}>{v}  ×</Text>
            </Pressable>
          ))}
        </View>
      )}
      <SearchField value={query} placeholder={placeholder} onChange={setQuery} />
      {query.trim() !== '' && (
        <View style={styles.menu}>
          {loading && options.length === 0 && <ActivityIndicator style={{ padding: 10 }} />}
          {!loading && options.length === 0 && <Text style={styles.empty}>No matches.</Text>}
          {options.map((s) => (
            <Pressable key={s.name} onPress={() => add(s.name)} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                {s.name}
              </Text>
              {s.hint && <Text style={styles.hint}>{s.hint}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: colors.muted, paddingHorizontal: 16 },
  selected: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#fff', fontSize: 13 },
  menu: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  hint: { fontSize: 12, color: colors.faint },
  empty: { padding: 10, color: colors.faint },
});
