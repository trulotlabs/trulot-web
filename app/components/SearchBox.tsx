'use client';

import { useState, useCallback, useRef } from 'react';

type Result = {
  apn_norm: string;
  address: string;
  city: string;
  state: string;
  zone_name: string;
  slug: string;
  momentum: string | null;
  has_building_project: boolean;
};

function MomentumBadge({ momentum }: { momentum: string | null }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    Active:           { label: 'Active',           bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Completed:        { label: 'Completed',        bg: 'bg-blue-50',    text: 'text-blue-700' },
    'Awaiting Issuance': { label: 'In Review',     bg: 'bg-amber-50',   text: 'text-amber-700' },
    'Status unclear': { label: 'Status unclear',   bg: 'bg-slate-100',  text: 'text-slate-600' },
    'No recent activity': { label: 'No activity',  bg: 'bg-slate-100',  text: 'text-slate-500' },
  };
  const m = momentum ? (map[momentum] ?? { label: momentum, bg: 'bg-slate-100', text: 'text-slate-500' }) : null;
  if (!m) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  );
}

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    search(query);
  };

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Enter an address or APN…"
          autoComplete="off"
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm"
        />
        <button
          type="submit"
          className="px-5 py-3 bg-emerald-700 text-white font-semibold text-sm rounded-xl hover:bg-emerald-800 transition-colors shadow-sm"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="mt-3 text-sm text-slate-400 text-center">Searching…</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="mt-3 text-sm text-slate-400 text-center">No parcels found. Try a street name or partial address.</div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-3 bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100 overflow-hidden">
          {results.map((r) => (
            <a
              key={r.apn_norm}
              href={`/parcel/${r.apn_norm}/${r.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{r.address}</p>
                <p className="text-xs text-slate-400 mt-0.5">{r.city}, {r.state} · {r.zone_name} · APN {r.apn_norm.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1-$2-$3-$4')}</p>
              </div>
              <MomentumBadge momentum={r.momentum} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
