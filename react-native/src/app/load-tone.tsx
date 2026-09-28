import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ModelList } from '@/components/ModelList';
import { Button, CenteredProgress, colors, ErrorBanner, InfoBanner, Muted, SectionHeader, ToneRow, styles as ui } from '@/components/ui';
import { loadPresets, presetFromTone, savePresets, type Preset } from '@/presets';
import { flowErrorMessage, useAuthFlow, type AuthResult } from '@/t3k/auth';
import { t3kClient, userMessage } from '@/t3k/client';
import { loadToneParams, selectToneParams } from '@/t3k/tone3000-client';
import { DEMO_ARCHITECTURE, fetchToneWithModels, type ToneWithModels } from '@/t3k/tones';

/**
 * Beacon Inc — Load Tone flow. Presets store TONE3000 tone IDs: add one by
 * picking a tone in the Select flow, then load it later. When connected, the
 * app loads straight from the API; otherwise (or when a tone has gone private
 * or been deleted) `prompt=load_tone` lets TONE3000 check access and offer a
 * replacement, which the preset then points to.
 */
export default function LoadToneDemo() {
  const startFlow = useAuthFlow();
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [loaded, setLoaded] = useState<ToneWithModels | null>(null);
  const [replacedToneId, setReplacedToneId] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const updatePresets = (update: (current: Preset[]) => Preset[]) => {
    setPresets((current) => {
      const next = update(current);
      savePresets(next);
      return next;
    });
  };

  const reset = () => {
    setError(null);
    setInfo(null);
    setReplacedToneId(null);
  };

  /** Returns the tone ID a flow resolved to, or null after showing why there isn't one. */
  const toneIdFrom = (result: AuthResult, closed: string): string | null => {
    if (result.status === 'error') {
      setError(flowErrorMessage(result.error));
      return null;
    }
    if (result.status === 'canceled' || result.canceled || !result.toneId) {
      setInfo(closed);
      return null;
    }
    return result.toneId;
  };

  /** Pick a tone in TONE3000 and save it as a new preset. */
  const add = async () => {
    reset();
    const result = await startFlow(
      selectToneParams({ architecture: DEMO_ARCHITECTURE, preview: true, menubar: true }),
      'Add a preset',
    );
    const toneId = toneIdFrom(result, 'You closed TONE3000 without choosing a tone.');
    if (!toneId) return;

    setLoading(true);
    try {
      const tone = await fetchToneWithModels(toneId);
      const preset = presetFromTone(tone);
      updatePresets((current) => [...current, preset]);
      setActivePreset(preset.id);
      setLoaded(tone);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /** Show a loaded tone and refresh the preset's cached details (or repoint it at a replacement). */
  const apply = (preset: Preset, tone: ToneWithModels) => {
    setLoaded(tone);
    setReplacedToneId(tone.id !== preset.toneId ? preset.toneId : null);
    updatePresets((current) => current.map((p) => (p.id === preset.id ? presetFromTone(tone, p.id) : p)));
  };

  const load = async (preset: Preset) => {
    reset();
    setActivePreset(preset.id);

    // Already connected? Try the API directly and only fall back to the
    // Load Tone flow when TONE3000 needs to verify access.
    if (t3kClient.isConnected()) {
      setLoading(true);
      try {
        apply(preset, await fetchToneWithModels(preset.toneId));
        return;
      } catch {
        // Private, deleted or session expired: let the flow sort it out.
      } finally {
        setLoading(false);
      }
    }

    const result = await startFlow(
      loadToneParams(preset.toneId, { architecture: DEMO_ARCHITECTURE, menubar: true }),
      'Load tone',
    );
    const toneId = toneIdFrom(result, 'You closed TONE3000 without loading a tone.');
    if (!toneId) return;

    setLoading(true);
    try {
      apply(preset, await fetchToneWithModels(toneId));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const remove = (preset: Preset) => {
    updatePresets((current) => current.filter((p) => p.id !== preset.id));
    if (activePreset === preset.id) {
      setActivePreset(null);
      setLoaded(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {info && <InfoBanner message={info} />}
      <SectionHeader>Loaded tone</SectionHeader>
      {loading ? (
        <CenteredProgress />
      ) : loaded ? (
        <>
          {replacedToneId !== null && (
            <InfoBanner
              message={`Tone #${replacedToneId} wasn't available, so TONE3000 offered a replacement. The preset now points to it.`}
            />
          )}
          <ToneRow tone={loaded} />
          <ModelList models={loaded.models} tone={loaded} />
        </>
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <Muted>{presets.length ? 'No tone loaded yet. Load one of your presets below.' : 'No tone loaded yet.'}</Muted>
        </View>
      )}

      <SectionHeader>My presets</SectionHeader>
      {presets.length === 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Muted>
            Presets store a TONE3000 tone ID. Add one by picking a tone on TONE3000, then load it any time —
            TONE3000 checks access and offers a replacement if the tone becomes private or is deleted.
          </Muted>
        </View>
      )}
      {presets.map((preset) => (
        <View key={preset.id} style={ui.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontWeight: '600', color: activePreset === preset.id ? colors.primary : colors.text }}>
              {preset.title}
            </Text>
            <Muted small>{preset.creator}</Muted>
            <Text style={{ fontSize: 11, color: colors.faint }}>TONE3000 Tone #{preset.toneId}</Text>
          </View>
          <Button title="Remove" variant="link" disabled={loading} onPress={() => remove(preset)} />
          <Button title="Load" disabled={loading} onPress={() => load(preset)} style={{ marginHorizontal: 0 }} />
        </View>
      ))}
      <Button title="+ Add preset" variant="secondary" disabled={loading} onPress={add} />
    </ScrollView>
  );
}
