import { useState, useEffect } from 'react';
import type { AuthState, Segment } from '../types';

interface Props {
  auth:      AuthState;
  onBack:    () => void;
  onLogout:  () => void;
}

const STATUS_COLORS: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  ACTIVE:    { label: 'Active',    bg: 'rgba(46,132,74,0.15)',   color: '#2e844a', dot: '#2e844a' },
  PUBLISHED: { label: 'Published', bg: 'rgba(46,132,74,0.15)',   color: '#2e844a', dot: '#2e844a' },
  INACTIVE:  { label: 'Inactive',  bg: 'rgba(112,110,107,0.15)', color: '#706e6b', dot: '#706e6b' },
  DRAFT:     { label: 'Draft',     bg: 'rgba(221,122,1,0.15)',   color: '#dd7a01', dot: '#dd7a01' },
};
const DEFAULT_STATUS = { label: 'Unknown', bg: 'rgba(112,110,107,0.1)', color: '#706e6b', dot: '#706e6b' };

export function SegmentsWorkspace({ onBack, onLogout }: Props) {
  const [segments,    setSegments]    = useState<Segment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [totalSize,   setTotalSize]   = useState(0);
  const [page,        setPage]        = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/segments?page=${page}&pageSize=${PAGE_SIZE}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(e.error || res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        setSegments(data.segments ?? []);
        setTotalSize(data.totalSize ?? 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  const filtered = search
    ? segments.filter(
        (s) =>
          s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
          s.apiName?.toLowerCase().includes(search.toLowerCase()) ||
          s.description?.toLowerCase().includes(search.toLowerCase())
      )
    : segments;

  const totalPages = Math.ceil(totalSize / PAGE_SIZE);

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(6,165,154,0.08) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col h-screen max-w-5xl mx-auto w-full px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors hover:bg-white/5"
              title="Back to mode selector">
              ←
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
              style={{ background: 'rgba(6,165,154,0.2)', border: '1px solid rgba(6,165,154,0.3)', boxShadow: '0 0 16px rgba(6,165,154,0.2)' }}>
              👥
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Segments</div>
              <div className="text-white/30 text-xs mt-0.5">Data Cloud audiences</div>
            </div>
          </div>
          <button onClick={onLogout}
            className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10">
            Sign out
          </button>
        </div>

        {/* Title + search */}
        <div className="flex items-end justify-between mb-6 shrink-0 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Audience <span style={{ background: 'linear-gradient(135deg,#06a59a,#1b96ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Segments</span>
            </h1>
            <p className="text-sm text-white/35">
              {totalSize > 0 ? `${totalSize} segments in your Data Cloud org` : 'Browse your Data Cloud audiences'}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0 w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search segments…"
              className="w-full glass rounded-xl pl-9 pr-4 py-2 text-sm text-white/70 placeholder-white/20 focus:outline-none focus:border-[#06a59a]/40 transition-colors"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: 'rgba(6,165,154,0.15)', border: '1px solid rgba(6,165,154,0.2)' }}>
                  👥
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-[#06a59a]"
                  style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <p className="text-white/50 text-sm">Loading segments…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="glass rounded-2xl p-8 text-center max-w-md">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-white/70 font-medium mb-1">Couldn't load segments</p>
              <p className="text-white/35 text-sm mb-4">{error}</p>
              <button onClick={() => setPage(0)}
                className="text-sm px-4 py-2 rounded-xl transition-colors"
                style={{ background: 'rgba(6,165,154,0.15)', color: '#06a59a', border: '1px solid rgba(6,165,154,0.2)' }}>
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Segments table */}
        {!loading && !error && (
          <>
            <div className="flex-1 overflow-y-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="text-3xl opacity-30">👥</div>
                  <p className="text-white/30 text-sm">
                    {search ? 'No segments match your search' : 'No segments found in this org'}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <th className="text-left text-xs text-white/30 font-medium px-4 py-3">Name</th>
                      <th className="text-left text-xs text-white/30 font-medium px-4 py-3">API Name</th>
                      <th className="text-left text-xs text-white/30 font-medium px-4 py-3">Type</th>
                      <th className="text-left text-xs text-white/30 font-medium px-4 py-3">Status</th>
                      <th className="text-left text-xs text-white/30 font-medium px-4 py-3">Data Space</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((seg, i) => {
                      const statusKey = (seg.segmentStatus || seg.publishStatus || '').toUpperCase();
                      const status    = STATUS_COLORS[statusKey] ?? DEFAULT_STATUS;
                      return (
                        <tr key={seg.marketSegmentId ?? i}
                          className="group transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(6,165,154,0.05)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-white/85">{seg.displayName || '—'}</div>
                            {seg.description && (
                              <div className="text-xs text-white/30 mt-0.5 max-w-xs truncate">{seg.description}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs text-white/40 font-mono">{seg.apiName || '—'}</code>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-white/40">{seg.segmentType || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: status.bg, color: status.color }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-white/35">{seg.dataSpace || '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="shrink-0 mt-4 flex items-center justify-between text-sm text-white/40">
                <span>Page {page + 1} of {totalPages} · {totalSize} total</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    ← Prev
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
