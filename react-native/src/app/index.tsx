import { useRouter, type Href } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, colors, Muted, SectionHeader, styles as ui } from '@/components/ui';
import { t3kClient, useConnected } from '@/t3k/client';

interface DemoInfo {
  href: Href;
  tag: string;
  name: string;
  product: string;
  description: string;
}

const lowCodeDemos: DemoInfo[] = [
  {
    href: '/select',
    tag: 'Select Flow',
    name: 'Acme Inc',
    product: 'Guitar Amp Simulation App',
    description: 'Users browse the TONE3000 catalog and pick a tone to load. TONE3000 hosts the browsing UI.',
  },
  {
    href: '/load-tone',
    tag: 'Load Tone Flow',
    name: 'Beacon Inc',
    product: 'Rig Preset Management App',
    description: 'Saved presets store tone IDs and sync them on demand. TONE3000 handles access checks and replacements.',
  },
];

const fullApiDemo: DemoInfo = {
  href: '/full-api',
  tag: 'Full API Integration',
  name: 'Chord Inc',
  product: 'Tone Discovery & Management App',
  description: 'A custom tone UI on the REST API: library, discover, search, makes & tags, creators, favorites and downloads.',
};

/** Entry screen: one card per integration pattern, matching the web example. */
export default function Landing() {
  const connected = useConnected();
  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Muted>Reference integrations showing how to build against the TONE3000 API.</Muted>
      </View>
      <Button
        title="View API documentation"
        variant="link"
        style={{ alignSelf: 'flex-start', marginLeft: 8 }}
        onPress={() => Linking.openURL('https://www.tone3000.com/api')}
      />
      <SectionHeader>Low-code (OAuth prompts)</SectionHeader>
      {lowCodeDemos.map((demo) => (
        <DemoCard key={demo.tag} demo={demo} />
      ))}
      <SectionHeader>Full API</SectionHeader>
      <DemoCard demo={fullApiDemo} />
      {connected && (
        <Button title="Disconnect TONE3000" variant="link" onPress={() => t3kClient.clearTokens()} style={{ marginTop: 12 }} />
      )}
    </ScrollView>
  );
}

function DemoCard({ demo }: { demo: DemoInfo }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(demo.href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <Text style={styles.tag}>{demo.tag.toUpperCase()}</Text>
      <Text style={styles.name}>{demo.name}</Text>
      <Text style={{ color: colors.muted }}>{demo.product}</Text>
      <Muted small>{demo.description}</Muted>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    gap: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tag: { fontSize: 11, fontWeight: '600', color: colors.primary, letterSpacing: 0.5 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
});
