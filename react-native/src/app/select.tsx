import { useState } from 'react';
import { ScrollView } from 'react-native';

import { ModelList } from '@/components/ModelList';
import { Button, ChipSelect, ErrorBanner, InfoBanner, SectionHeader, ToggleRow, ToneRow, styles as ui } from '@/components/ui';
import { flowErrorMessage, useAuthFlow } from '@/t3k/auth';
import { userMessage } from '@/t3k/client';
import { selectToneParams, type CatalogOptions } from '@/t3k/tone3000-client';
import { DEMO_ARCHITECTURE, fetchToneWithModels, type ToneWithModels } from '@/t3k/tones';
import { Format } from '@/t3k/types';

const scopes = {
  'amp-cab': { label: 'Amp + Cab', catalog: { gears: 'amp-cab', format: Format.Nam } },
  'amp-pedal': { label: 'Amps and pedals', catalog: { gears: 'amp_pedal', format: Format.Nam } },
  cab: { label: 'Cabinet IRs', catalog: { gears: 'cab', format: Format.Ir } },
  nam: { label: 'All NAM captures', catalog: { format: Format.Nam } },
} satisfies Record<string, { label: string; catalog: CatalogOptions }>;

type Scope = keyof typeof scopes;

const CLOSED = 'You closed TONE3000 without selecting a tone.';

/**
 * Acme Inc — Select flow. TONE3000 hosts catalog browsing; the app gets a
 * `tone_id` back and loads its models into the preview player.
 */
export default function SelectDemo() {
  const startFlow = useAuthFlow();
  const [scope, setScope] = useState<Scope>('amp-cab');
  const [preview, setPreview] = useState(true);
  const [chinese, setChinese] = useState(false);
  const [selected, setSelected] = useState<ToneWithModels | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const select = async () => {
    setError(null);
    setInfo(null);
    const result = await startFlow(
      selectToneParams({
        ...scopes[scope].catalog,
        architecture: DEMO_ARCHITECTURE,
        preview,
        menubar: true,
        locale: chinese ? 'zh-CN' : undefined,
      }),
      'Select a tone',
    );
    if (result.status === 'error') return setError(flowErrorMessage(result.error));
    if (result.status === 'canceled' || result.canceled || !result.toneId) return setInfo(CLOSED);

    setLoading(true);
    try {
      setSelected(await fetchToneWithModels(result.toneId));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <SectionHeader>Select flow options</SectionHeader>
      <ChipSelect
        label="Catalog"
        value={scope}
        options={Object.entries(scopes).map(([k, v]) => [k as Scope, v.label] as const)}
        onChange={setScope}
      />
      <ToggleRow label="Preview players" value={preview} onChange={setPreview} />
      <ToggleRow label="简体中文 (zh-CN)" value={chinese} onChange={setChinese} />
      <Button title={selected ? 'Choose another tone' : 'Browse TONE3000'} busy={loading} onPress={select} />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {info && <InfoBanner message={info} />}
      {selected && (
        <>
          <SectionHeader>Selected tone</SectionHeader>
          <ToneRow tone={selected} />
          <SectionHeader>Models</SectionHeader>
          <ModelList models={selected.models} tone={selected} />
        </>
      )}
    </ScrollView>
  );
}
