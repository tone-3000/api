// ModelList.tsx — a tone's models, each with a preview player and download
import type { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { previewPlayer, usePreviewPlayer, type PreviewChain } from 't3k-preview';

import { t3kClient, userMessage } from '@/t3k/client';
import { previewChain } from '@/t3k/tones';
import type { Model, Tone } from '@/t3k/types';

import { colors, ErrorBanner, Muted, styles as ui } from './ui';

export function ModelList({ models, tone }: { models: Model[]; tone: Tone }) {
  const [error, setError] = useState<string | null>(null);

  // Stop the shared player when the user leaves the screen.
  useEffect(() => () => previewPlayer.stop(), []);

  return (
    <View>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {models.length === 0 && (
        <View style={{ padding: 16 }}>
          <Muted>No models available.</Muted>
        </View>
      )}
      {models.map((model) => (
        <ModelRow key={model.id} model={model} tone={tone} onError={setError} />
      ))}
    </View>
  );
}

function ModelRow({ model, tone, onError }: { model: Model; tone: Tone; onError: (message: string) => void }) {
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const resolve = previewChain(model, tone);

  const download = async () => {
    setDownloading(true);
    try {
      setFile(await t3kClient.downloadModelFile(model.model_url, model.name));
    } catch (err) {
      onError(userMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const share = () => {
    if (file) void Sharing.shareAsync(file.uri, { dialogTitle: model.name });
  };

  return (
    <View style={ui.row}>
      {resolve ? (
        <PreviewButton id={`model-${model.id}`} resolve={resolve} onError={onError} />
      ) : (
        <Text style={styles.unavailable}>{'Preview\nunavailable'}</Text>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.text }}>
          {model.name}
        </Text>
      </View>
      <Pressable onPress={file ? share : download} disabled={downloading} hitSlop={8} style={styles.action}>
        {downloading ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: colors.primary }}>{file ? 'Share' : 'Download'}</Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Play/pause for one preview: spinner while the model downloads, a progress
 * bar while playing. Every button shares one engine, so starting one stops
 * the other.
 */
export function PreviewButton({
  id,
  resolve,
  onError,
}: {
  id: string;
  resolve: () => Promise<PreviewChain>;
  onError: (message: string) => void;
}) {
  const state = usePreviewPlayer();
  const active = state.activeId === id;
  const playing = active && state.playing;
  const loading = state.loadingId === id;

  const toggle = () => {
    previewPlayer.toggle(id, resolve).catch((err) => onError(userMessage(err)));
  };

  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={toggle}
        disabled={loading}
        accessibilityLabel={playing ? 'Pause preview' : 'Play preview'}
        style={styles.play}
      >
        {loading ? <ActivityIndicator /> : <Text style={styles.playIcon}>{playing ? '❚❚' : '▶'}</Text>}
      </Pressable>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(active ? state.progress : 0) * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unavailable: { fontSize: 10, color: colors.muted, width: 44, textAlign: 'center' },
  action: { minWidth: 64, alignItems: 'flex-end' },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: colors.primary, fontSize: 14 },
  progressTrack: { width: 44, height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.primary },
});
