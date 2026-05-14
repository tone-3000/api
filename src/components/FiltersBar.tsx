// FiltersBar — QA controls for architecture / platform / gear (preview branch only).
// Lives in the demo headers so testers can flip values and immediately see the
// effect on the next OAuth launch or API call.

import { Gear, Platform } from '../types';
import { useFilterPrefs, type ArchitectureFilter } from '../filterPrefs';

const ARCHITECTURES: { label: string; value: ArchitectureFilter | undefined }[] = [
  { label: 'Any', value: undefined },
  { label: 'NAM a1', value: 1 },
  { label: 'NAM a2', value: 2 },
  { label: 'Custom', value: 'custom' },
];

function parseArchitecture(raw: string): ArchitectureFilter | undefined {
  if (raw === '') return undefined;
  if (raw === 'custom') return 'custom';
  // The only remaining options are the numeric ones in ARCHITECTURES.
  return Number(raw) as 1 | 2;
}

const PLATFORMS: { label: string; value: Platform | undefined }[] = [
  { label: 'Any platform', value: undefined },
  { label: 'NAM', value: Platform.Nam },
  { label: 'AIDA-X', value: Platform.AidaX },
  { label: 'AA Snapshot', value: Platform.AaSnapshot },
  { label: 'Proteus', value: Platform.Proteus },
  { label: 'IR', value: Platform.Ir },
];

const GEARS: { label: string; value: Gear | undefined }[] = [
  { label: 'Any gear', value: undefined },
  { label: 'Amp', value: Gear.Amp },
  { label: 'Full Rig', value: Gear.FullRig },
  { label: 'Pedal', value: Gear.Pedal },
  { label: 'Outboard', value: Gear.Outboard },
  { label: 'IR', value: Gear.Ir },
];

export function FiltersBar() {
  const [prefs, setPrefs] = useFilterPrefs();

  return (
    <div className="filters-bar">
      <span className="filters-bar-label">QA filters</span>
      <select
        className="select-filter"
        value={prefs.architecture ?? ''}
        onChange={(e) =>
          setPrefs({ ...prefs, architecture: parseArchitecture(e.target.value) })
        }
      >
        {ARCHITECTURES.map((a) => (
          <option key={String(a.value)} value={a.value ?? ''}>{a.label}</option>
        ))}
      </select>
      <select
        className="select-filter"
        value={prefs.platform ?? ''}
        onChange={(e) =>
          setPrefs({
            ...prefs,
            platform: e.target.value === '' ? undefined : (e.target.value as Platform),
          })
        }
      >
        {PLATFORMS.map((p) => (
          <option key={String(p.value)} value={p.value ?? ''}>{p.label}</option>
        ))}
      </select>
      <select
        className="select-filter"
        value={prefs.gear ?? ''}
        onChange={(e) =>
          setPrefs({
            ...prefs,
            gear: e.target.value === '' ? undefined : (e.target.value as Gear),
          })
        }
      >
        {GEARS.map((g) => (
          <option key={String(g.value)} value={g.value ?? ''}>{g.label}</option>
        ))}
      </select>
    </div>
  );
}
