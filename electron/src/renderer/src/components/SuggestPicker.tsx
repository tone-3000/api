// src/components/SuggestPicker.tsx
import { useEffect, useId, useState } from 'react';

export interface Suggestion {
  name: string;
  /** Secondary text, e.g. a tone count or display name. */
  hint?: string;
}

interface Props {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Look up names matching what the user typed. */
  suggest: (query: string) => Promise<Suggestion[]>;
}

const SUGGEST_DEBOUNCE_MS = 250;

/**
 * Pick exact names (tags, makes, creators) for a search filter. Typing looks
 * up matches through the API, so the filter only ever holds names that exist.
 */
export function SuggestPicker({ label, placeholder, values, onChange, suggest }: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setSuggestions([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(() => {
      suggest(q)
        .then((results) => { if (!cancelled) { setSuggestions(results); setHighlight(0); } })
        .catch(() => { if (!cancelled) setSuggestions([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, SUGGEST_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, suggest]);

  const options = suggestions.filter((s) => !values.includes(s.name));

  const add = (name: string) => {
    onChange([...values, name]);
    setQuery('');
    setSuggestions([]);
  };
  const remove = (name: string) => onChange(values.filter((v) => v !== name));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) add(options[highlight].name);
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !query && values.length) remove(values[values.length - 1]);
  };

  const showMenu = open && query.trim() !== '';

  return (
    <div className="filter-field">
      <span className="filter-label">{label}</span>
      <div className="suggest">
        <div className="suggest-box">
          {values.map((v) => (
            <span key={v} className="suggest-chip">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)}>×</button>
            </span>
          ))}
          <input
            className="suggest-input"
            placeholder={values.length ? '' : placeholder}
            value={query}
            role="combobox"
            aria-expanded={showMenu}
            aria-controls={listId}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {showMenu && (
          <ul className="suggest-menu" id={listId} role="listbox">
            {loading && options.length === 0 && <li className="suggest-empty">Searching…</li>}
            {!loading && options.length === 0 && <li className="suggest-empty">No matches.</li>}
            {options.map((s, i) => (
              <li
                key={s.name}
                role="option"
                aria-selected={i === highlight}
                className={`suggest-option ${i === highlight ? 'suggest-option--active' : ''}`}
                // mousedown, not click: fires before the input's blur closes the menu.
                onMouseDown={(e) => { e.preventDefault(); add(s.name); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span>{s.name}</span>
                {s.hint && <span className="suggest-hint">{s.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
