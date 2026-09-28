import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { ModelList } from '@/components/ModelList';
import { Button, CenteredProgress, ErrorBanner, Muted, SectionHeader, ToneRow, styles as ui } from '@/components/ui';
import { t3kClient, userMessage } from '@/t3k/client';
import { ApiError } from '@/t3k/tone3000-client';
import { fetchToneWithModels, type ToneWithModels } from '@/t3k/tones';
import { Format } from '@/t3k/types';

/** Full tone detail: attribution, favorite, zip download, stats, and models. */
export default function ToneDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tone, setTone] = useState<ToneWithModels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);

  useEffect(() => {
    fetchToneWithModels(id).then(setTone, (err) => setError(userMessage(err)));
  }, [id]);

  if (!tone) {
    return error ? <ErrorBanner message={error} /> : <CenteredProgress />;
  }

  const toggleFavorite = async () => {
    setFavoriteBusy(true);
    try {
      if (tone.is_favorite) await t3kClient.unfavoriteTone(tone.id);
      else await t3kClient.favoriteTone(tone.id);
      setTone({
        ...tone,
        is_favorite: !tone.is_favorite,
        favorites_count: tone.favorites_count + (tone.is_favorite ? -1 : 1),
      });
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setFavoriteBusy(false);
    }
  };

  const downloadZip = async () => {
    setZipBusy(true);
    setZipNote(null);
    try {
      // The zip URL is temporary and unauthenticated, so the system browser can fetch it.
      await Linking.openURL((await t3kClient.getToneDownload(tone.id)).url);
    } catch (err) {
      setZipNote(
        err instanceof ApiError && err.isForbidden
          ? 'Zip downloads are limited to approved partners — download models individually below.'
          : userMessage(err),
      );
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <Stack.Screen options={{ title: tone.title }} />
      <ToneRow tone={tone} />
      {tone.description ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Muted>{tone.description}</Muted>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }}>
        <Button variant="link" busy={favoriteBusy} title={tone.is_favorite ? '★ Favorited' : '☆ Favorite'} onPress={toggleFavorite} />
        <Button variant="link" busy={zipBusy} title="Download all (.zip)" onPress={downloadZip} />
        <Button variant="link" title="TONE3000 ↗" onPress={() => Linking.openURL(tone.url)} />
      </View>
      {zipNote && (
        <View style={{ paddingHorizontal: 16 }}>
          <Muted small>{zipNote}</Muted>
        </View>
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <SectionHeader>Stats</SectionHeader>
      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Muted>
          ↓ {tone.downloads_count} downloads · ★ {tone.favorites_count} favorites
        </Muted>
        <Muted>
          {tone.format === Format.Ir ? `${tone.irs_count} IRs` : `${tone.models_count} models`}
        </Muted>
        <Muted>License: {tone.license}</Muted>
        {tone.makes.length > 0 && <Muted>Makes: {tone.makes.map((m) => m.name).join(', ')}</Muted>}
        {tone.tags.length > 0 && <Muted>Tags: {tone.tags.map((t) => `#${t.name}`).join(' ')}</Muted>}
      </View>

      <SectionHeader>Models ({tone.models.length})</SectionHeader>
      <ModelList models={tone.models} tone={tone} />
    </ScrollView>
  );
}
