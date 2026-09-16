// src/apps/UploadApp.tsx
//
// Echo Inc — Capture Station
//
// A worked example of building TONE3000 capture into your own product. It
// mirrors the flow on tone3000.com/capture and tone3000.com/upload so the shape
// is recognisable to anyone who has used the site:
//
//   1. choose whether you are capturing gear or uploading a model you have
//   2. add the files, and name the model each one becomes
//   3. describe the tone they land on
//   4. watch the training run, or the model appear
//
// The part worth copying is runCapture below: mint an upload, PUT the recording
// straight to storage, and hand the returned handle to the trainings endpoint.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PUBLISHABLE_KEY_UPLOAD, REDIRECT_URI } from '../config';
import { startStandardFlow, T3KApiError, T3K_UPLOAD_LIMITS } from '../tone3000-client';
import { t3kClient } from '../App';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Gear, Format, UploadKind, TRAIN_TYPE_SWEEP_V3 } from '../types';
import type { Training, Model, Tone, UploadProgress } from '../types';
import t3kLogo from '../assets/t3k.svg';

// ── What the API will accept ─────────────────────────────────────────────────

/** The sweep every capture is a recording of. Play it through the rig. */
const SWEEP_URL = 'https://www.tone3000.com/T3K-sweep-v3.wav';
const SWEEP_GUIDE_URL = 'https://www.tone3000.com/guides/capture-your-gear-with-nam-sweep-method';

/**
 * The trainer's audio spec. A file that misses any of these is a 400 from
 * POST /api/v1/trainings naming the output, so it is worth checking before you
 * spend the upload.
 */
const SPEC = {
  channels: 1,
  sampleRate: 48_000,
  bitsPerSample: 24,
  /** The canonical sweep is 3:10. The trainer allows a second over and none under. */
  seconds: 190,
  overSeconds: 1,
  underSeconds: 0,
};

/**
 * A tone's format is decided by the file's extension, and this is the mapping
 * the API uses. Worth mirroring rather than guessing: the tone is created
 * before any model is attached to it, so a wrong format here does not surface
 * until POST /models answers 400, with the tone already made.
 */
const FORMAT_BY_EXTENSION: Record<string, Format> = {
  wav: Format.Ir,
  nam: Format.Nam,
  aidax: Format.AidaX,
  aasnapshot: Format.AaSnapshot,
  json: Format.Proteus,
};

const FORMAT_LABEL: Record<string, string> = {
  [Format.Nam]: 'NAM',
  [Format.Ir]: 'IR',
  [Format.AidaX]: 'AIDA-X',
  [Format.AaSnapshot]: 'AA Snapshot',
  [Format.Proteus]: 'Proteus',
};

const extensionOf = (filename: string) => filename.toLowerCase().split('.').pop() ?? '';
const formatOf = (filename: string): Format | null => FORMAT_BY_EXTENSION[extensionOf(filename)] ?? null;

/**
 * Gears that can hold a model, in the order the site lists them. Every modelled
 * format shares this set, so NAM, AIDA-X, AA Snapshot and Proteus all use it.
 */
const MODEL_GEARS: Gear[] = [Gear.AmpCab, Gear.Amp, Gear.Cab, Gear.Pedal, Gear.Outboard, Gear.Experimental];
/** Gears that can hold an impulse response. */
const IR_GEARS: Gear[] = [Gear.Cab, Gear.Space, Gear.Pedal, Gear.Outboard, Gear.Experimental];

const GEAR_LABEL: Record<string, string> = {
  [Gear.AmpCab]: 'Amp + Cab',
  [Gear.Amp]: 'Amp head',
  [Gear.Cab]: 'Cab',
  [Gear.Pedal]: 'Pedal',
  [Gear.Outboard]: 'Outboard',
  [Gear.Space]: 'Space',
  [Gear.Experimental]: 'Experimental',
};

type Path = 'capture' | 'upload';
type Step = 'choose' | 'files' | 'details' | 'working' | 'result';

interface Pick {
  file: File;
  /** Becomes the model's name. Defaults to the filename without its extension. */
  name: string;
  /** Filled in by the local header read, for capture files only. */
  spec?: { ok: true } | { ok: false; reason: string };
}

interface Job {
  name: string;
  phase: UploadProgress['phase'] | 'waiting' | 'failed';
  fraction: number;
  error?: string;
}

// ── Reading a WAV header in the browser ──────────────────────────────────────

/**
 * Check a recording against the trainer's spec without uploading it.
 *
 * Reads the RIFF header only, so a 27 MB sweep costs the same as a short clip.
 * The API runs these same rules server-side, so this is a courtesy that saves
 * the user a 27 MB upload, not a control.
 *
 * It reports only what the header says. It cannot tell whether the audio is
 * actually a recording of our sweep, so the wording stays narrow.
 */
async function checkSpec(file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 64 KB, because `data` can sit behind a large LIST or bext block.
  const head = new DataView(await file.slice(0, 65536).arrayBuffer());
  const tag = (off: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => head.getUint8(off + i)));
  if (head.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    return { ok: false, reason: 'not a WAV file' };
  }

  let fmt: { format: number; channels: number; sampleRate: number; byteRate: number; bits: number } | null = null;
  let dataSize: number | null = null;

  let off = 12;
  while (off + 8 <= head.byteLength) {
    const id = tag(off);
    const size = head.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 30 <= head.byteLength) {
      fmt = {
        format: head.getUint16(off + 8, true),
        channels: head.getUint16(off + 10, true),
        sampleRate: head.getUint32(off + 12, true),
        byteRate: head.getUint32(off + 16, true),
        bits: head.getUint16(off + 22, true),
      };
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }

  if (!fmt) return { ok: false, reason: 'no fmt chunk found' };

  const problems: string[] = [];
  // 1 is PCM; 0xfffe is WAVE_FORMAT_EXTENSIBLE, which the API accepts when its
  // subformat is PCM. Reading that far is more than this preview needs.
  if (fmt.format !== 1 && fmt.format !== 0xfffe) problems.push('not PCM');
  if (fmt.channels !== SPEC.channels) problems.push(`${fmt.channels} channels, needs mono`);
  if (fmt.sampleRate !== SPEC.sampleRate) problems.push(`${fmt.sampleRate} Hz, needs 48000`);
  if (fmt.bits !== SPEC.bitsPerSample) problems.push(`${fmt.bits}-bit, needs 24`);

  // Length is the rule most captures actually miss, and it was the one this
  // check used to skip while still reporting a pass.
  if (dataSize != null && fmt.byteRate > 0) {
    const seconds = dataSize / fmt.byteRate;
    if (seconds < SPEC.seconds - SPEC.underSeconds || seconds > SPEC.seconds + SPEC.overSeconds) {
      problems.push(`${seconds.toFixed(1)}s, needs 3:10 (${SPEC.seconds}s, up to ${SPEC.overSeconds}s over)`);
    }
  }

  if (problems.length) return { ok: false, reason: problems.join('; ') };
  if (dataSize == null) return { ok: false, reason: 'could not find the audio data chunk' };
  return { ok: true };
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '') || name;

// ── Styles ───────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  color: 'var(--text)',
  boxShadow: '0 1px 2px rgba(13, 15, 18, 0.04)',
};
const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720, margin: '0 auto', width: '100%' };
const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };
const label: CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-3)' };
const hint: CSSProperties = { fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 };
const bad: CSSProperties = { color: 'var(--error)' };
const good: CSSProperties = { color: 'var(--success)' };
const input: CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  padding: '9px 11px',
  fontSize: 14,
  width: '100%',
};
const bar: CSSProperties = { height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', flex: 1 };
const choice: CSSProperties = {
  ...card,
  textAlign: 'left',
  cursor: 'pointer',
  flex: 1,
  minWidth: 260,
  borderColor: 'var(--border2)',
};

export function UploadApp() {
  const [connected, setConnected] = useState(t3kClient.isConnected());
  const [user, setUser] = useState<{ username?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('choose');
  const [path, setPath] = useState<Path | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [title, setTitle] = useState('');
  const [gear, setGear] = useState<Gear | ''>('');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [tone, setTone] = useState<Tone | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [reconciled, setReconciled] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  // setTone is async, and the catch below runs before React has re-rendered.
  const toneRef = useRef<Tone | null>(null);

  // A capture always produces NAM models. An upload takes its format from the
  // file, and the site's rule is that a tone is single-format.
  const format: Format = useMemo(() => {
    if (path === 'capture') return Format.Nam;
    return formatOf(picks[0]?.file.name ?? '') ?? Format.Nam;
  }, [path, picks]);

  const gears = format === Format.Ir ? IR_GEARS : MODEL_GEARS;

  // Every progress row is keyed by its model name. The API is happy to hold two
  // models with the same name; this screen is what needs them apart.
  const duplicateName = useMemo(() => {
    const seen = new Set<string>();
    for (const pick of picks) {
      const key = pick.name.trim().toLowerCase();
      if (key && seen.has(key)) return pick.name.trim();
      seen.add(key);
    }
    return null;
  }, [picks]);
  const kind = path === 'capture' ? UploadKind.Audio : UploadKind.Model;
  const limit = T3K_UPLOAD_LIMITS[kind];

  useEffect(() => {
    if (!connected) return;
    t3kClient.getUser().then(setUser).catch(() => {});
  }, [connected]);

  // Stop polling when the component goes away or every training has finished.
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const handleConnect = useCallback(() => {
    startStandardFlow(PUBLISHABLE_KEY_UPLOAD, REDIRECT_URI);
  }, []);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    const next: Pick[] = [];
    for (const file of Array.from(list)) {
      const ext = extensionOf(file.name);
      if (!limit.extensions.includes(ext)) {
        setError(`${file.name}: .${ext} is not accepted here. Allowed: ${limit.extensions.map((e) => '.' + e).join(', ')}`);
        continue;
      }
      if (file.size > limit.maxBytes) {
        setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${(limit.maxBytes / 1024 / 1024) | 0} MB limit.`);
        continue;
      }
      // A tone holds one format, and it is created before the first model is
      // attached. Catching a mixed set here costs nothing; catching it at
      // POST /models means a half-filled tone already exists.
      const settled = picks[0] ?? next[0];
      const settledFormat = settled && formatOf(settled.file.name);
      const fileFormat = formatOf(file.name);
      if (path === 'upload' && settledFormat && fileFormat && fileFormat !== settledFormat) {
        setError(
          `${file.name} is ${FORMAT_LABEL[fileFormat]} and these are ${FORMAT_LABEL[settledFormat]}. ` +
            'A tone holds a single format, so send them as two tones.'
        );
        continue;
      }
      next.push({
        file,
        name: stripExt(file.name),
        spec: path === 'capture' ? await checkSpec(file) : undefined,
      });
    }
    if (next.length) setPicks((p) => [...p, ...next]);
  }, [limit, path, picks]);

  const setJob = (name: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.name === name ? { ...j, ...patch } : j)));

  /**
   * The capture flow, which is the one this feature exists for.
   *
   * Create the tone first, because a training has to belong to one. Then, per
   * recording: mint an audio upload, PUT the bytes straight to storage, and
   * collect the handle. Start every training in a single call so the whole set
   * is accepted or rejected together, then poll for status.
   */
  const runCapture = useCallback(async () => {
    const created = await t3kClient.createTone({ title, gear: gear as Gear, format: Format.Nam });
    setTone(created);
    toneRef.current = created;

    const outputs: { uploadId: string; name: string }[] = [];
    for (const pick of picks) {
      setJob(pick.name, { phase: 'minting' });
      const ticket = await t3kClient.createUpload({
        kind: UploadKind.Audio,
        filename: pick.file.name,
        size_bytes: pick.file.size,
      });
      setJob(pick.name, { phase: 'uploading' });
      await t3kClient.putUpload(ticket, pick.file, (p: UploadProgress) =>
        setJob(pick.name, { fraction: p.fraction })
      );
      outputs.push({ uploadId: ticket.upload_id, name: pick.name });
      setJob(pick.name, { phase: 'consuming', fraction: 1 });
    }

    const started = await t3kClient.startTrainings({ toneId: created.id, outputs });
    setJobs((js) => js.map((j) => ({ ...j, phase: 'done', fraction: 1 })));
    setTrainings(
      started.trainings.map((t) => ({
        id: t.id, tone_id: created.id, type: TRAIN_TYPE_SWEEP_V3, status: t.status,
        status_text: 'queued', error: null, epochs: null, max_epochs: null,
        duration: null, created_at: t.created_at, updated_at: t.created_at,
        logs: null, model: { id: t.model_id, name: t.model_name, model_url: null },
      }))
    );

    // Training takes minutes, so the UI polls. `status` leaves 'running' once
    // the trainer finishes, and `model.model_url` is populated on success.
    pollRef.current = window.setInterval(async () => {
      try {
        const page = await t3kClient.listTrainings(created.id);
        setTrainings(page.data);
        if (page.data.every((t) => t.status !== 'running') && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // A blip in polling is not worth failing the flow over.
      }
    }, 5000);
  }, [picks, title, gear]);

  /** The upload flow: same mint and PUT, but the handle becomes a model directly. */
  const runUpload = useCallback(async () => {
    const created = await t3kClient.createTone({ title, gear: gear as Gear, format });
    setTone(created);
    toneRef.current = created;

    const made: Model[] = [];
    for (const pick of picks) {
      setJob(pick.name, { phase: 'minting' });
      const ticket = await t3kClient.createUpload({
        kind: UploadKind.Model,
        filename: pick.file.name,
        size_bytes: pick.file.size,
      });
      setJob(pick.name, { phase: 'uploading' });
      await t3kClient.putUpload(ticket, pick.file, (p: UploadProgress) =>
        setJob(pick.name, { fraction: p.fraction })
      );
      setJob(pick.name, { phase: 'consuming', fraction: 1 });
      made.push(
        await t3kClient.createModelFromUpload({
          toneId: created.id,
          uploadId: ticket.upload_id,
          name: pick.name,
        })
      );
      setJob(pick.name, { phase: 'done' });
    }
    setModels(made);
  }, [picks, title, gear, format]);

  const submit = useCallback(async () => {
    setError(null);
    setStep('working');
    setJobs(picks.map((p) => ({ name: p.name, phase: 'waiting', fraction: 0 })));
    try {
      if (path === 'capture') await runCapture();
      else await runUpload();
      setStep('result');
    } catch (err) {
      const message =
        err instanceof T3KApiError
          ? `${err.message} (${err.status} at the ${err.stage} step)`
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      setJobs((js) => js.map((j) => (j.phase === 'done' ? j : { ...j, phase: 'failed', error: message })));
      setStep('result');

      // A spent handle after a failure is the case worth handling properly. The
      // request may have created the resource before it failed, and a blind
      // retry would either duplicate it or answer 409. Ask what actually landed
      // rather than telling the operator to go and check by hand. This is the
      // reconciliation every real integration needs.
      if (err instanceof T3KApiError && err.remint && toneRef.current) {
        try {
          const id = toneRef.current.id;
          const summary =
            path === 'capture'
              ? `${(await t3kClient.listTrainings(id)).total} training(s)`
              : `${(await t3kClient.listModels(id)).total} model(s)`;
          setReconciled(`Tone #${id} exists and now has ${summary}. Nothing needs re-sending for those.`);
        } catch {
          setReconciled('Could not reach the resource endpoint to check what was created.');
        }
      }
    }
  }, [path, picks, runCapture, runUpload]);

  const restart = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setStep('choose'); setPath(null); setPicks([]); setTitle(''); setGear('');
    setJobs([]); setTone(null); toneRef.current = null; setTrainings([]); setModels([]);
    setError(null); setReconciled(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-brand">
            <div className="app-logo-block">
              <span className="app-logo-icon">🎛️</span>
              <span className="app-name">Echo Inc</span>
            </div>
            <span className="app-tagline">Capture Station</span>
          </div>
        </header>
        <main className="app-main">
          <div className="connect-state">
            <div className="connect-state-icon">🔐</div>
            <h2 className="connect-state-title">Connect to TONE3000</h2>
            <p className="connect-state-desc">
              Echo Inc captures rigs and publishes them to TONE3000. Send a recording and get a
              trained model back, or publish a model you already have.
            </p>
            <button className="btn btn-primary btn-t3k btn-large" onClick={handleConnect}>
              <img src={t3kLogo} alt="" className="btn-logo" />
              Connect TONE3000
            </button>
          </div>
        </main>
        <footer className="app-footer">
          <a href="/" className="back-link">← All Demos</a>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🎛️</span>
            <span className="app-name">Echo Inc</span>
          </div>
          <span className="app-tagline">Capture Station</span>
        </div>
        <div className="header-actions">
          {user?.username && <span className="meta-text">{user.username}</span>}
          <button className="btn btn-ghost btn-small" onClick={() => { t3kClient.clearTokens(); setConnected(false); }}>
            Disconnect
          </button>
        </div>
      </header>

      <main className="app-main">
        <div style={stack}>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {reconciled && (
            <div style={{ ...card, borderColor: 'var(--border2)' }}>
              <span style={label}>What actually landed</span>
              <span style={hint}>{reconciled}</span>
              <span style={hint}>
                Checked by reading the resource back, which is what your integration should do
                after any failure that spends a handle.
              </span>
            </div>
          )}

          {/* Step 1. The same choice the site opens with. */}
          {step === 'choose' && (
            <>
              <div>
                <h2 className="section-title">What are you adding?</h2>
                <p style={hint}>Both routes end with a model on a tone. They differ in what you supply.</p>
              </div>
              <div style={row}>
                <button style={choice} onClick={() => { setPath('capture'); setStep('files'); }}>
                  <h3 className="section-title">Capture your gear</h3>
                  <p style={hint}>
                    Play our sweep file through the rig and upload the recording. TONE3000 trains
                    the model for you, which takes a few minutes per capture.
                  </p>
                  <span className="meta-text">Sweep recording, .wav</span>
                </button>
                <button style={choice} onClick={() => { setPath('upload'); setStep('files'); }}>
                  <h3 className="section-title">Upload a model</h3>
                  <p style={hint}>
                    You already have a trained model or an impulse response. It is attached to the
                    tone immediately, with no training step.
                  </p>
                  <span className="meta-text">.nam, .wav IR, .aidax, .aasnapshot</span>
                </button>
              </div>
            </>
          )}

          {/* Step 2. Files, and the name each becomes. */}
          {step === 'files' && (
            <>
              <div>
                <h2 className="section-title">{path === 'capture' ? 'Add your recordings' : 'Add your files'}</h2>
                {path === 'capture' ? (
                  <p style={hint}>
                    Play <a href={SWEEP_URL} className="profile-link">T3K-sweep-v3.wav</a> through the
                    rig and record the output. The file has to be mono, 48 kHz, 24-bit and 3:10 long.
                    The <a href={SWEEP_GUIDE_URL} className="profile-link">capture guide</a> walks
                    through levels and routing.
                  </p>
                ) : (
                  <p style={hint}>
                    Accepted: {limit.extensions.map((e) => '.' + e).join(', ')}, up to{' '}
                    {(limit.maxBytes / 1024 / 1024) | 0} MB each.
                  </p>
                )}
              </div>

              <div style={card}>
                <input
                  type="file"
                  multiple
                  accept={limit.extensions.map((e) => '.' + e).join(',')}
                  onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
                />
                {picks.length === 0 && <span style={hint}>No files yet.</span>}
                {picks.map((pick, i) => (
                  <div key={i} style={{ ...card, background: 'var(--surface2)', boxShadow: 'none', gap: 8 }}>
                    <div style={row}>
                      <strong>{pick.file.name}</strong>
                      <span className="meta-text">{(pick.file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button
                        className="btn btn-ghost btn-small"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => setPicks((p) => p.filter((_, n) => n !== i))}
                      >
                        Remove
                      </button>
                    </div>
                    {pick.spec && (
                      <span style={{ ...hint, ...(pick.spec.ok ? good : bad) }}>
                        {pick.spec.ok
                          ? 'Header checks out: mono, 48 kHz, 24-bit PCM, 3:10'
                          : `The API will reject this: ${pick.spec.reason}`}
                      </span>
                    )}
                    <span style={label}>Model name</span>
                    <input
                      style={input}
                      value={pick.name}
                      onChange={(e) =>
                        setPicks((p) => p.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                  </div>
                ))}
              </div>

              {duplicateName && (
                <span style={{ ...hint, ...bad }}>
                  Two files are both called &ldquo;{duplicateName}&rdquo;. Give each model its own name.
                </span>
              )}

              <div style={row}>
                <button className="btn btn-ghost" onClick={restart}>Back</button>
                <button
                  className="btn btn-primary"
                  disabled={picks.length === 0 || picks.some((p) => !p.name.trim()) || !!duplicateName}
                  onClick={() => setStep('details')}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 3. The tone the models land on. */}
          {step === 'details' && (
            <>
              <div>
                <h2 className="section-title">Describe the tone</h2>
                <p style={hint}>
                  A tone is the pack your models live in. It is single-format, so these{' '}
                  {picks.length} file{picks.length === 1 ? '' : 's'} will all be{' '}
                  <strong>{FORMAT_LABEL[format]}</strong>.
                </p>
              </div>
              <div style={card}>
                <span style={label}>Title</span>
                <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1969 Plexi, edge of breakup" />
                <span style={label}>Gear</span>
                <select style={input} value={gear} onChange={(e) => setGear(e.target.value as Gear)}>
                  <option value="">Choose gear</option>
                  {gears.map((g) => <option key={g} value={g}>{GEAR_LABEL[g] ?? g}</option>)}
                </select>
                <span style={hint}>
                  Only gear that can hold a {FORMAT_LABEL[format]} model is listed. The API rejects
                  an incompatible pair with a 400.
                </span>
              </div>
              <div style={row}>
                <button className="btn btn-ghost" onClick={() => setStep('files')}>Back</button>
                <button className="btn btn-primary" disabled={!title.trim() || !gear} onClick={submit}>
                  {path === 'capture' ? 'Upload and start training' : 'Upload'}
                </button>
              </div>
            </>
          )}

          {/* Step 4 and 5. The transfer, then what it produced. */}
          {(step === 'working' || step === 'result') && (
            <>
              <div>
                <h2 className="section-title">
                  {step === 'working' ? 'Uploading' : path === 'capture' ? 'Training' : 'Done'}
                </h2>
                {tone && (
                  <p style={hint}>
                    Tone #{tone.id} &ldquo;{tone.title}&rdquo; created.
                  </p>
                )}
              </div>

              <div style={card}>
                {jobs.map((job) => (
                  <div key={job.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={row}>
                      <strong>{job.name}</strong>
                      <span className="meta-text" style={job.phase === 'failed' ? bad : undefined}>
                        {job.phase === 'waiting' && 'waiting'}
                        {job.phase === 'minting' && 'requesting an upload URL'}
                        {job.phase === 'uploading' && `sending to storage ${Math.round(job.fraction * 100)}%`}
                        {job.phase === 'consuming' && 'handing the handle to the API'}
                        {job.phase === 'done' && 'uploaded'}
                        {job.phase === 'failed' && (job.error ?? 'failed')}
                      </span>
                    </div>
                    <div style={bar}>
                      <div style={{
                        width: `${Math.round((job.phase === 'done' ? 1 : job.fraction) * 100)}%`,
                        height: '100%',
                        background: job.phase === 'failed' ? 'var(--error)' : 'var(--accent)',
                        transition: 'width 120ms linear',
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Capture: the training is the interesting state, so show it properly. */}
              {path === 'capture' && trainings.length > 0 && (
                <div style={card}>
                  <span style={label}>Trainings</span>
                  {trainings.map((t) => (
                    <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={row}>
                        <strong>{t.model?.name ?? `training ${t.id}`}</strong>
                        <span
                          className="meta-text"
                          style={t.status === 'failed' ? bad : t.status === 'succeeded' ? good : undefined}
                        >
                          {t.status === 'running' && (t.status_text || 'queued')}
                          {t.status === 'succeeded' && 'succeeded'}
                          {t.status === 'failed' && (t.error || 'failed')}
                        </span>
                        {t.status === 'running' && <Spinner />}
                      </div>
                      {t.epochs != null && t.max_epochs != null && (
                        <>
                          <div style={bar}>
                            <div style={{
                              width: `${Math.round((t.epochs / t.max_epochs) * 100)}%`,
                              height: '100%',
                              background: 'var(--accent)',
                            }} />
                          </div>
                          <span className="meta-text">epoch {t.epochs} of {t.max_epochs}</span>
                        </>
                      )}
                      {t.status === 'succeeded' && t.model?.model_url && (
                        <a className="profile-link" href={t.model.model_url}>Download the trained model</a>
                      )}
                    </div>
                  ))}
                  <span style={hint}>
                    Polled from <code>GET /api/v1/trainings?tone_id={tone?.id}</code> every five
                    seconds. Training runs on our side, so your integration can close this screen
                    and check back later.
                  </span>
                </div>
              )}

              {/* Upload: the models exist already. */}
              {path === 'upload' && models.length > 0 && (
                <div style={card}>
                  <span style={label}>Models created</span>
                  {models.map((m) => (
                    <div key={m.id} style={row}>
                      <strong>{m.name}</strong>
                      <span className="meta-text">#{m.id}</span>
                      {m.model_url && <a className="profile-link" href={m.model_url}>Download</a>}
                    </div>
                  ))}
                </div>
              )}

              {step === 'result' && (
                <div style={row}>
                  <button className="btn btn-primary" onClick={restart}>Add another</button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
