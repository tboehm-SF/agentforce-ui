import { useState } from 'react';

interface SegmentFilter {
  field: string;
  operator: string;
  value: string;
}

interface SegmentPlan {
  name: string;
  displayName: string;
  description: string;
  filters: SegmentFilter[];
}

interface Props {
  onCreated: () => void; // called when a new segment has been created so the parent can refresh
}

const SAMPLE_PROMPTS = [
  'Individuals with first name Thomas',
  'People created in 2026',
  'Individuals with gender identity Female',
  'Anyone whose last name contains "Smith"',
];

export function SegmentBuilderBar({ onCreated }: Props) {
  const [input,    setInput]    = useState('');
  const [plan,     setPlan]     = useState<SegmentPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [created,  setCreated]  = useState<string | null>(null);

  async function handlePlan(text?: string) {
    const description = (text ?? input).trim();
    if (!description) return;
    setError(null);
    setCreated(null);
    setPlan(null);
    setPlanning(true);
    try {
      const res = await fetch('/api/segments/plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Plan failed');
      setPlan(body.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  async function handleCreate() {
    if (!plan) return;
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/segments/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Create failed');
      setCreated(body.segment?.apiName || plan.name);
      setPlan(null);
      setInput('');
      onCreated(); // refresh the list
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-4 mb-6 shrink-0"
      style={{
        background: 'rgba(6,165,154,0.08)',
        border: '1px solid rgba(6,165,154,0.3)',
        boxShadow: '0 0 24px rgba(6,165,154,0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">✨</span>
        <span className="text-sm font-semibold text-white">Build a segment with AI</span>
        <span className="text-xs text-white/40 hidden sm:inline">
          — describe it in plain English, review, then create
        </span>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && input.trim() && handlePlan()}
          placeholder="e.g. Individuals created in 2026 with first name Thomas"
          disabled={planning || creating}
          className="flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder-white/30 focus:outline-none disabled:opacity-50"
          style={{ border: '1px solid rgba(6,165,154,0.25)' }}
        />
        <button
          onClick={() => handlePlan()}
          disabled={!input.trim() || planning || creating}
          className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          style={{
            background: input.trim() && !planning
              ? 'linear-gradient(135deg,#06a59a,#06a59acc)'
              : 'rgba(255,255,255,0.08)',
            boxShadow: input.trim() && !planning ? '0 4px 16px rgba(6,165,154,0.3)' : 'none',
          }}
        >
          {planning ? (<><span className="spinner spinner-sm" />Planning…</>) : (<>Preview <span>→</span></>)}
        </button>
      </div>

      {/* Sample prompts */}
      {!plan && !created && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => { setInput(p); handlePlan(p); }}
              disabled={planning}
              className="text-xs px-2.5 py-1 rounded-full transition-all hover:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#06a59a',
                border: '1px solid rgba(6,165,154,0.25)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-xl px-3 py-2 text-sm"
          style={{ background: 'rgba(220,60,60,0.08)', color: '#f8a29a', border: '1px solid rgba(220,60,60,0.25)' }}>
          <span className="font-medium">⚠ </span>{error}
        </div>
      )}

      {/* Success */}
      {created && !plan && (
        <div className="mt-3 rounded-xl px-3 py-2 text-sm"
          style={{ background: 'rgba(46,132,74,0.12)', color: '#7eca96', border: '1px solid rgba(46,132,74,0.3)' }}>
          ✅ Created segment <code className="bg-black/20 px-1.5 py-0.5 rounded">{created}</code> — it should appear in the table below once the list refreshes.
        </div>
      )}

      {/* Preview panel */}
      {plan && (
        <div className="mt-4 rounded-xl p-4"
          style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(6,165,154,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-white/90">Preview</div>
              <div className="text-xs text-white/40">Review before creating</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(221,122,1,0.15)', color: '#dd7a01', border: '1px solid rgba(221,122,1,0.25)' }}>
              Draft
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-white/40">Display name:</span>{' '}
              <span className="text-white/90 font-medium">{plan.displayName}</span>
            </div>
            <div>
              <span className="text-white/40">API name:</span>{' '}
              <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-[#06a59a]">{plan.name}</code>
            </div>
            {plan.description && (
              <div>
                <span className="text-white/40">Description:</span>{' '}
                <span className="text-white/70">{plan.description}</span>
              </div>
            )}
            <div>
              <span className="text-white/40">Criteria:</span>
              <div className="mt-1.5 space-y-1.5">
                {plan.filters.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono bg-white/5 px-2.5 py-1.5 rounded">
                    <code className="text-[#06a59a]">{f.field}</code>
                    <span className="text-white/40">{f.operator}</span>
                    <code className="text-white/80">{JSON.stringify(f.value)}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={() => { setPlan(null); setInput(''); }}
              className="text-xs text-white/50 hover:text-white/80 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
              style={{
                background: 'linear-gradient(135deg,#06a59a,#06a59acc)',
                boxShadow: '0 4px 16px rgba(6,165,154,0.3)',
              }}
            >
              {creating ? (<><span className="spinner spinner-sm" />Creating…</>) : <>Create segment ✓</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
