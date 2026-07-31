// labels.ts — display labels for API enum values, matching the TONE3000 UI.
// Keep in sync with the Format / Gear enums in types.ts.

export const FORMAT_LABELS: Record<string, string> = {
  'nam': 'NAM', 'ir': 'IR', 'aida-x': 'AIDA-X',
  'aa-snapshot': 'Snapshot', 'proteus': 'Proteus',
};

// `full-rig` is here because it's still a valid input value, even though
// responses always emit `amp-cab` in its place.
export const GEAR_LABELS: Record<string, string> = {
  'amp': 'Amp Head', 'amp-cab': 'Amp + Cab', 'full-rig': 'Amp + Cab',
  'pedal': 'Pedal', 'outboard': 'Outboard', 'cab': 'Cabinet',
  'space': 'Spaces', 'experimental': 'Experimental', 'ir': 'Impulse Response',
};

/** Falls back to the raw value so an unrecognized enum still renders something. */
export const formatLabel = (format?: string | null): string =>
  format ? (FORMAT_LABELS[format] ?? format) : '';

export const gearLabel = (gear?: string | null): string =>
  gear ? (GEAR_LABELS[gear] ?? gear) : '';

/**
 * Gear values offered in filter UI. Excludes both deprecated values: `full-rig`
 * (replaced by `amp-cab`) and `ir` (the API strips it from `gears` and infers
 * `format=ir` instead — filter with the format dropdown).
 */
export const GEAR_FILTER_VALUES = [
  'amp', 'amp-cab', 'pedal', 'outboard', 'cab', 'space', 'experimental',
] as const;

/** Format values offered in filter UI. */
export const FORMAT_FILTER_VALUES = [
  'nam', 'ir', 'aida-x', 'aa-snapshot', 'proteus',
] as const;
