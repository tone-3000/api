// src/apps/LoadToneApp.tsx
import { useRef, useState } from 'react';
import { loadToneParams, selectToneParams, ApiError } from '../tone3000-client';
import { t3kClient } from '../client';
import { fetchToneWithModels, DEMO_ARCHITECTURE, type ToneWithModels } from '../tones';
import { loadPresets, savePresets, presetFromTone, type Preset } from '../presets';
import { useEmbeddedFlow, flowErrorMessage } from '../useEmbeddedFlow';
import { EmbeddedFlowSheet } from '../components/EmbeddedFlowSheet';
import { ToneCard } from '../components/ToneCard';
import { ModelList } from '../components/ModelList';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import t3kLogo from '../assets/t3k.svg';

/** Which flow is in flight: adding a new preset, or loading an existing one. */
type Pending = { kind: 'add' } | { kind: 'load'; presetId: string };

export function LoadToneApp({ onBack }: { onBack: () => void }) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [loadedTone, setLoadedTone] = useState<ToneWithModels | null>(null);
  const [replacedToneId, setReplacedToneId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  const updatePresets = (update: (current: Preset[]) => Preset[]) => {
    setPresets((current) => {
      const next = update(current);
      savePresets(next);
      return next;
    });
  };

  /** Load a tone into the player, then record it on the preset it belongs to. */
  const loadTone = (toneId: string | number, action: Pending) => {
    setLoading(true);
    return fetchToneWithModels(toneId)
      .then((tone) => {
        setLoadedTone(tone);
        if (action.kind === 'add') {
          const preset = presetFromTone(tone);
          updatePresets((current) => [...current, preset]);
          setActivePresetId(preset.id);
          return;
        }
        // Load Tone may hand back a replacement: repoint the preset at it.
        const previous = presets.find((p) => p.id === action.presetId);
        setReplacedToneId(previous && previous.toneId !== tone.id ? previous.toneId : null);
        updatePresets((current) => current.map((p) => (p.id === action.presetId ? presetFromTone(tone, p.id) : p)));
      })
      .finally(() => setLoading(false));
  };

  const flow = useEmbeddedFlow((result) => {
    const action = pending.current;
    pending.current = null;
    const closed =
      action?.kind === 'add' ? 'You closed TONE3000 without choosing a tone.' : 'You closed TONE3000 without loading a tone.';
    if (result.status === 'canceled') return setInfo(closed);
    if (result.status === 'error') return setError(flowErrorMessage(result.error));
    t3kClient.setTokens(result.tokens);
    if (result.canceled || !result.toneId || !action) return setInfo(closed);
    loadTone(result.toneId, action).catch(() => setError('Failed to load tone. Please try again.'));
  });

  const reset = () => {
    setError(null);
    setInfo(null);
    setReplacedToneId(null);
  };

  /** Pick a tone in TONE3000 and save it as a new preset. */
  const handleAdd = () => {
    reset();
    pending.current = { kind: 'add' };
    flow.start(selectToneParams({ menubar: true, preview: true, architecture: DEMO_ARCHITECTURE }));
  };

  const handleLoad = (preset: Preset) => {
    reset();
    setActivePresetId(preset.id);
    const action: Pending = { kind: 'load', presetId: preset.id };

    const openFlow = () => {
      setLoadedTone(null);
      pending.current = action;
      flow.start(loadToneParams(preset.toneId, { menubar: true, architecture: DEMO_ARCHITECTURE }));
    };

    // Already connected? Try the API directly and only fall back to the
    // Load Tone flow when TONE3000 needs to verify access or offer a replacement.
    if (t3kClient.isConnected()) {
      loadTone(preset.toneId, action).catch((err: unknown) => {
        if (!(err instanceof ApiError && err.isNotFound)) {
          // Auth failure or network error — clear stale tokens and re-auth in the flow
          t3kClient.clearTokens();
        }
        openFlow();
      });
    } else {
      openFlow();
    }
  };

  const handleRemove = (preset: Preset) => {
    updatePresets((current) => current.filter((p) => p.id !== preset.id));
    if (activePresetId === preset.id) {
      setActivePresetId(null);
      setLoadedTone(null);
    }
  };

  const activePreset = presets.find((p) => p.id === activePresetId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🔄</span>
            <span className="app-name">Beacon Inc</span>
          </div>
          <span className="app-tagline">Preset Management</span>
        </div>
      </header>

      <main className="app-main">
        {info && (
          <div className="info-banner">
            <span className="info-banner-icon">ℹ️</span>
            <p>{info}</p>
          </div>
        )}
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <div className="loading-state">
            <Spinner />
            <p>Syncing from TONE3000…</p>
          </div>
        ) : (
          <>
            <div className="loaded-section loaded-section--top">
              <div className="section-header">
                <h2 className="section-title">Loaded Tone</h2>
                {loadedTone && activePreset && (
                  <button className="btn btn-secondary" onClick={() => handleLoad(activePreset)}>
                    Sync Again
                  </button>
                )}
              </div>

              {replacedToneId && (
                <div className="info-banner">
                  <span className="info-banner-icon">ℹ️</span>
                  <p>
                    The original tone (ID #{replacedToneId}) wasn't available, so TONE3000 offered a
                    replacement. The preset now points to the replacement.
                  </p>
                </div>
              )}

              {loadedTone ? (
                <>
                  <ToneCard tone={loadedTone} />
                  <div className="model-section">
                    <h3 className="model-section-title">Models</h3>
                    <ModelList models={loadedTone.models} tone={loadedTone} />
                  </div>
                </>
              ) : (
                <div className="loaded-placeholder">
                  <p className="loaded-placeholder-text">
                    {presets.length ? 'No tone loaded yet. Load one of your presets below.' : 'No tone loaded yet.'}
                  </p>
                </div>
              )}
            </div>

            <div className="section-header">
              <h2 className="section-title">My Presets</h2>
              <button className="btn btn-secondary" onClick={handleAdd}>
                + Add preset
              </button>
            </div>

            <div className="preset-list">
              {presets.length === 0 && (
                <div className="loaded-placeholder">
                  <p className="loaded-placeholder-text">
                    Presets store a TONE3000 tone ID. Add one by picking a tone on TONE3000, then load it
                    any time — TONE3000 checks access and offers a replacement if the tone becomes
                    private or is deleted.
                  </p>
                </div>
              )}
              {presets.map((preset) => (
                <div key={preset.id} className={`preset-card ${activePresetId === preset.id ? 'preset-card--active' : ''}`}>
                  <div className="preset-info">
                    <h3 className="preset-name">{preset.title}</h3>
                    <p className="preset-desc">{preset.creator}</p>
                    <span className="preset-tone-ref">TONE3000 Tone #{preset.toneId}</span>
                  </div>
                  <div className="preset-actions">
                    <button className="btn btn-secondary" onClick={() => handleRemove(preset)}>
                      Remove
                    </button>
                    <button className="btn btn-primary btn-t3k" onClick={() => handleLoad(preset)}>
                      <img src={t3kLogo} alt="" className="btn-logo" />
                      Load from TONE3000
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <button className="back-link" onClick={onBack}>← All Demos</button>
      </footer>

      <EmbeddedFlowSheet flow={flow} title={pending.current?.kind === 'add' ? 'Add a preset' : 'Load from TONE3000'} />
    </div>
  );
}
