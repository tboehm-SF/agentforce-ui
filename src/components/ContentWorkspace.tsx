import { useState, useEffect, useMemo } from 'react';
import type { AuthState } from '../types';
import { AiAssistBar } from './AiAssistBar';
import { useAssistAgent } from '../hooks/useAssistAgent';

interface Props {
  auth:     AuthState;
  onBack:   () => void;
  onLogout: () => void;
}

interface ContentItem {
  contentKey:          string;
  title:               string;
  managedContentType:  string;
  publishedDate?:      string;
  contentNodes?:       Record<string, { value: string; nodeType: string }>;
}

const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  email:    { label: 'Email',    icon: '✉️', color: '#dd7a01', bg: 'rgba(221,122,1,0.12)' },
  image:    { label: 'Image',    icon: '🖼️', color: '#06a59a', bg: 'rgba(6,165,154,0.12)' },
  document: { label: 'Document', icon: '📄', color: '#9050e9', bg: 'rgba(144,80,233,0.12)' },
  news:     { label: 'News',     icon: '📰', color: '#1b96ff', bg: 'rgba(1,118,211,0.12)' },
  brand:    { label: 'Brand',    icon: '🎨', color: '#2e844a', bg: 'rgba(46,132,74,0.12)' },
};
const DEFAULT_TYPE = { label: 'Content', icon: '🧩', color: '#dd7a01', bg: 'rgba(221,122,1,0.12)' };

const FILTER_TYPES = ['all', 'email', 'image', 'document', 'news', 'brand'];

export function ContentWorkspace({ onBack, onLogout }: Props) {
  const [items,       setItems]       = useState<ContentItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const PAGE_SIZE = 20;

  // Marketing Studio Agent — purpose-built for content creation & CMS queries
  const assistAgentFallback = useMemo(() => ({
    name: 'Marketing Studio Agent',
    developerName: 'Marketing_Studio_Agent',
    description: 'Generate branded marketing content and search CMS assets.',
    icon: '✉️',
    color: '#dd7a01',
    category: 'Marketing',
  }), []);
  const assistAgent = useAssistAgent('Marketing_Studio_Agent', assistAgentFallback);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const typeParam = typeFilter !== 'all' ? `&type=${encodeURIComponent(typeFilter)}` : '';
    fetch(`/api/content?page=${page}&pageSize=${PAGE_SIZE}${typeParam}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(e.error || res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        // CMS Connect API response shape: { items: [...], currentPageUrl, nextPageUrl }
        const raw: ContentItem[] = data.items ?? data.contents ?? [];
        setItems(raw);
        setHasMore(!!data.nextPageUrl);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [typeFilter, page]);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [typeFilter]);

  const filtered = search
    ? items.filter((item) =>
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.managedContentType?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-0 left-1/3 w-[600px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(221,122,1,0.07) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col h-screen max-w-6xl mx-auto w-full px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors hover:bg-white/5"
              title="Back to mode selector">
              ←
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
              style={{ background: 'rgba(221,122,1,0.2)', border: '1px solid rgba(221,122,1,0.3)', boxShadow: '0 0 16px rgba(221,122,1,0.15)' }}>
              🧩
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Content</div>
              <div className="text-white/30 text-xs mt-0.5">Default Content Workspace</div>
            </div>
          </div>
          <button onClick={onLogout}
            className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10">
            Sign out
          </button>
        </div>

        {/* Title + controls */}
        <div className="flex items-end justify-between mb-6 shrink-0 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              CMS <span style={{ background: 'linear-gradient(135deg,#dd7a01,#e8a201)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Content</span>
            </h1>
            <p className="text-sm text-white/35">Browse assets from your <code className="text-white/50 text-xs">Default_Content_Workspace</code> — emails, images, and branded templates</p>
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0 w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search content…"
              className="w-full glass rounded-xl pl-9 pr-4 py-2 text-sm text-white/70 placeholder-white/20 focus:outline-none transition-colors" />
          </div>
        </div>

        {/* AI assist bar */}
        {assistAgent && (
          <AiAssistBar
            agent={assistAgent}
            accent="#dd7a01"
            bg="rgba(221,122,1,0.08)"
            glow="rgba(221,122,1,0.15)"
            placeholder="Search content by meaning — e.g. find banners about sustainability for Q3…"
            contextPrefix="I'm in the Content workspace browsing Salesforce CMS assets. Help me with this content task:"
            suggestions={[
              'Suggest content for a healthcare webinar campaign',
              'Which CMS assets should I reuse for re-engagement emails?',
              'Draft 3 subject lines matching my banner content',
            ]}
          />
        )}

        {/* Type filter pills */}
        <div className="flex gap-2 mb-5 shrink-0 overflow-x-auto pb-1">
          {FILTER_TYPES.map((t) => {
            const meta    = t === 'all' ? { label: 'All', icon: '🧩', color: '#dd7a01', bg: 'rgba(221,122,1,0.12)' } : (TYPE_META[t] ?? DEFAULT_TYPE);
            const isActive = typeFilter === t;
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: isActive ? meta.bg : 'rgba(255,255,255,0.05)',
                  color:      isActive ? meta.color : 'rgba(255,255,255,0.4)',
                  border:     `1px solid ${isActive ? meta.color + '40' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow:  isActive ? `0 0 12px ${meta.bg}` : 'none',
                }}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: 'rgba(221,122,1,0.15)', border: '1px solid rgba(221,122,1,0.2)' }}>
                  🧩
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-[#dd7a01]"
                  style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <p className="text-white/50 text-sm">Loading content…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="glass rounded-2xl p-8 text-center max-w-md">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-white/70 font-medium mb-2">Couldn't load content</p>
              <p className="text-white/35 text-sm mb-1">{error}</p>
              <p className="text-white/20 text-xs mb-4">
                CMS Connect requires a content workspace and published CMS content in your org.
              </p>
              <button onClick={() => setPage(0)}
                className="text-sm px-4 py-2 rounded-xl transition-colors"
                style={{ background: 'rgba(221,122,1,0.15)', color: '#dd7a01', border: '1px solid rgba(221,122,1,0.2)' }}>
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Content grid */}
        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl opacity-20">🧩</div>
                <p className="text-white/30 text-sm">
                  {search ? 'No content matches your search' : 'No CMS content found in this org'}
                </p>
                {!search && (
                  <p className="text-white/20 text-xs">
                    Publish content in Salesforce CMS to see it here.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                  {filtered.map((item) => {
                    const meta = TYPE_META[item.managedContentType] ?? DEFAULT_TYPE;
                    // Try to extract a thumbnail or body excerpt
                    const bodyText = item.contentNodes?.body?.value || item.contentNodes?.excerpt?.value || '';
                    const imageUrl = item.contentNodes?.source?.value || '';
                    return (
                      <div key={item.contentKey}
                        className="glass rounded-2xl p-4 group hover:border-white/15 transition-all overflow-hidden relative"
                        style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        {/* Type badge */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}25` }}>
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </span>
                        </div>

                        {/* Thumbnail if image */}
                        {imageUrl && (
                          <div className="w-full h-24 rounded-xl mb-3 overflow-hidden"
                            style={{ background: meta.bg }}>
                            <img src={imageUrl} alt={item.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                          </div>
                        )}

                        {/* Icon placeholder if no image */}
                        {!imageUrl && (
                          <div className="w-full h-16 rounded-xl mb-3 flex items-center justify-center text-3xl"
                            style={{ background: meta.bg }}>
                            {meta.icon}
                          </div>
                        )}

                        {/* Title */}
                        <p className="text-sm font-semibold text-white/85 leading-snug mb-1 line-clamp-2">
                          {item.title || item.contentKey}
                        </p>

                        {/* Body excerpt */}
                        {bodyText && (
                          <p className="text-xs text-white/30 leading-relaxed line-clamp-2">{bodyText}</p>
                        )}

                        {/* Published date */}
                        {item.publishedDate && (
                          <p className="text-xs text-white/20 mt-2">
                            {new Date(item.publishedDate).toLocaleDateString()}
                          </p>
                        )}

                        {/* Hover accent bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: `linear-gradient(90deg,transparent,${meta.color},transparent)` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pagination */}
            <div className="shrink-0 mt-3 flex items-center justify-between text-sm text-white/35">
              <span>{filtered.length} items shown</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  ← Prev
                </button>
                <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
