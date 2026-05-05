import { useEffect, useState } from 'react';

interface Props {
  apiName: string;
  onClose: () => void;
}

interface CriteriaFilter {
  subject?: { fieldApiName?: string; objectApiName?: string };
  operator?: string;
  value?: unknown;
  values?: unknown[];
  type?: string;
  filters?: CriteriaFilter[];
}

interface Criteria {
  filter?: CriteriaFilter;
  containerObjectApiName?: string;
}

interface SegmentDetail {
  apiName:                  string;
  displayName:              string;
  description?:             string;
  segmentStatus?:           string;
  publishStatus?:           string;
  segmentType?:             string;
  dataSpace?:               string;
  segmentOnApiName?:        string;
  lookbackPeriod?:          string;
  publishInterval?:         string;
  nextPublishDateTime?:     string;
  parsedCriteria?:          Criteria | null;
}

interface MemberSample {
  id:           string;
  deltaType?:   string;
  snapshotType?: string;
  timestamp?:   string;
}

interface Response {
  segment:       SegmentDetail;
  memberSample:  MemberSample[];
  memberCount:   number | null;
}

function flattenFilters(filter: CriteriaFilter | undefined, out: CriteriaFilter[] = []): CriteriaFilter[] {
  if (!filter) return out;
  if (filter.type === 'LogicalComparison' && Array.isArray(filter.filters)) {
    filter.filters.forEach((f) => flattenFilters(f, out));
  } else if (filter.subject) {
    out.push(filter);
  }
  return out;
}

function prettyOp(op?: string) {
  if (!op) return '';
  return op.replace(/ /g, ' ');
}

function prettyValue(f: CriteriaFilter): string {
  if (Array.isArray(f.values) && f.values.length) return f.values.map((v) => JSON.stringify(v)).join(', ');
  if (f.value != null) return JSON.stringify(f.value);
  return '—';
}

export function SegmentPreviewPanel({ apiName, onClose }: Props) {
  const [data,    setData]    = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/segments/${encodeURIComponent(apiName)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(e.error || r.statusText);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiName]);

  const filters = data?.segment?.parsedCriteria?.filter
    ? flattenFilters(data.segment.parsedCriteria.filter)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="flex-1" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full overflow-y-auto glass-chat"
        style={{ background: 'rgba(10,20,25,0.95)', borderLeft: '1px solid rgba(6,165,154,0.25)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between border-b border-white/10"
          style={{ background: 'rgba(10,20,25,0.95)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: 'rgba(6,165,154,0.15)', border: '1px solid rgba(6,165,154,0.3)' }}>
              👥
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {data?.segment?.displayName || apiName}
              </div>
              <code className="text-xs text-white/40 truncate block">{apiName}</code>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/5 transition-all shrink-0">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {loading && (
            <div className="text-center py-12">
              <div className="w-10 h-10 mx-auto mb-3 rounded-xl border-2 border-transparent border-t-[#06a59a]"
                style={{ animation: 'spin 1s linear infinite' }} />
              <p className="text-white/40 text-sm">Loading segment detail…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(220,60,60,0.08)', color: '#f8a29a', border: '1px solid rgba(220,60,60,0.25)' }}>
              ⚠ {error}
            </div>
          )}

          {data && (
            <>
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                {data.segment.segmentStatus && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: 'rgba(46,132,74,0.15)', color: '#7eca96', border: '1px solid rgba(46,132,74,0.3)' }}>
                    {data.segment.segmentStatus}
                  </span>
                )}
                {data.segment.publishStatus && (
                  <span className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(6,165,154,0.12)', color: '#06a59a', border: '1px solid rgba(6,165,154,0.25)' }}>
                    {data.segment.publishStatus}
                  </span>
                )}
                {data.segment.segmentType && (
                  <span className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {data.segment.segmentType}
                  </span>
                )}
              </div>

              {/* Description */}
              {data.segment.description && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-1.5">Description</div>
                  <p className="text-sm text-white/75 leading-relaxed"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: data.segment.description }} />
                </div>
              )}

              {/* Target object */}
              {data.segment.segmentOnApiName && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-1.5">Target Object</div>
                  <code className="text-xs bg-white/5 px-2 py-1 rounded text-[#06a59a]">{data.segment.segmentOnApiName}</code>
                </div>
              )}

              {/* Criteria */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2">
                  Include Criteria {filters.length > 0 && <span className="text-white/25 normal-case ml-1">({filters.length})</span>}
                </div>
                {filters.length === 0 ? (
                  <p className="text-xs text-white/40 italic">No criteria parsed or segment accepts all members</p>
                ) : (
                  <div className="space-y-1.5">
                    {filters.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono bg-white/5 px-2.5 py-1.5 rounded">
                        <code className="text-[#06a59a]">{f.subject?.fieldApiName || '?'}</code>
                        <span className="text-white/40">{prettyOp(f.operator)}</span>
                        <code className="text-white/80 truncate">{prettyValue(f)}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Publish schedule */}
              {(data.segment.publishInterval || data.segment.nextPublishDateTime || data.segment.lookbackPeriod) && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-1.5">Schedule</div>
                  <div className="space-y-1 text-sm">
                    {data.segment.publishInterval && (
                      <div className="text-white/60">
                        <span className="text-white/40">Interval:</span> {data.segment.publishInterval}
                      </div>
                    )}
                    {data.segment.lookbackPeriod && (
                      <div className="text-white/60">
                        <span className="text-white/40">Lookback:</span> {data.segment.lookbackPeriod}
                      </div>
                    )}
                    {data.segment.nextPublishDateTime && (
                      <div className="text-white/60">
                        <span className="text-white/40">Next publish:</span>{' '}
                        {new Date(data.segment.nextPublishDateTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Members */}
              {data.memberSample.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2">
                    Sample Members {data.memberCount != null && <span className="text-white/25 normal-case ml-1">(showing {data.memberSample.length}{data.memberCount ? ` of ${data.memberCount.toLocaleString()}` : ''})</span>}
                  </div>
                  <div className="space-y-1.5">
                    {data.memberSample.map((m) => (
                      <div key={m.id} className="text-xs font-mono bg-white/5 px-2.5 py-1.5 rounded flex items-center justify-between">
                        <code className="text-white/70 truncate">{m.id}</code>
                        {m.snapshotType && (
                          <span className="text-white/35 shrink-0 ml-2">{m.snapshotType === 'F' ? 'Full' : m.snapshotType}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.memberSample.length === 0 && data.memberCount == null && (
                <div className="text-xs text-white/40 italic">
                  Member records aren't available — segment may not be published yet.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
