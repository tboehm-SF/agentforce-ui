import { useState, useEffect } from 'react';
import type { AuthState, Agent } from '../types';
import { fetchOrgAgents } from '../api/oauth';
import { AGENTS as KNOWN_AGENTS } from '../data/agents';
// AuthState is used for display only (username/displayName)

interface Props {
  auth: AuthState;
  onConfirm: (selected: Agent[]) => void;
  onLogout:  () => void;
  onBack?:   () => void;
}

const CATEGORY_COLORS: Record<string, { accent: string; bg: string; glow: string }> = {
  Marketing:   { accent: '#1b96ff', bg: 'rgba(1,118,211,0.12)',   glow: 'rgba(27,150,255,0.25)' },
  Service:     { accent: '#06a59a', bg: 'rgba(6,165,154,0.12)',   glow: 'rgba(6,165,154,0.25)' },
  Commerce:    { accent: '#9050e9', bg: 'rgba(144,80,233,0.12)',  glow: 'rgba(144,80,233,0.25)' },
  Productivity:{ accent: '#dd7a01', bg: 'rgba(221,122,1,0.12)',   glow: 'rgba(221,122,1,0.25)' },
};
const DEFAULT_COLORS = { accent: '#1b96ff', bg: 'rgba(1,118,211,0.12)', glow: 'rgba(27,150,255,0.25)' };

/** Merge a raw BotDefinition record with our rich metadata (if available) */
function enrichAgent(raw: { Id: string; DeveloperName: string; MasterLabel: string }): Agent {
  const known = KNOWN_AGENTS.find((a) => a.developerName === raw.DeveloperName);
  if (known) return known;
  return {
    id:          raw.Id,
    name:        raw.MasterLabel,
    developerName: raw.DeveloperName,
    description: `Agentforce agent: ${raw.MasterLabel}`,
    icon:        '🤖',
    color:       '#1b96ff',
    category:    'Other',
  };
}

export function AgentPicker({ auth, onConfirm, onLogout, onBack }: Props) {
  const [agents,   setAgents]   = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');

  // Load agents from org on mount
  useEffect(() => {
    async function load() {
      try {
        const raw = await fetchOrgAgents();
        const enriched = raw.map(enrichAgent);
        setAgents(enriched);
        // Pre-select all agents
        setSelected(new Set(enriched.map((a) => a.id)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('401') || msg.includes('INVALID_JWT') || msg.includes('INVALID_AUTH')) {
          setError('SESSION_EXPIRED');
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auth]);

  const categories = ['All', ...Array.from(new Set(agents.map((a) => a.category)))];
  const filtered   = activeCategory === 'All' ? agents : agents.filter((a) => a.category === activeCategory);

  function toggleAgent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === agents.length ? new Set() : new Set(agents.map((a) => a.id)));
  }

  function handleConfirm() {
    const picked = agents.filter((a) => selected.has(a.id));
    if (picked.length === 0) return;
    // Persist selected agent IDs for session restore
    sessionStorage.setItem('sf_pinned_agents', JSON.stringify(picked.map((a) => a.id)));
    onConfirm(picked);
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Ambient glows */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(1,118,211,0.1) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col h-screen max-w-5xl mx-auto w-full px-6 py-8">

        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors hover:bg-white/5 shrink-0"
                title="Back to mode selector">
                ←
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1b96ff] to-[#9050e9] flex items-center justify-center text-base glow-blue">
              ⚡
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Agentforce</div>
              <div className="text-white/30 text-xs mt-0.5">{auth.username ?? auth.instanceUrl}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10"
          >
            Sign out
          </button>
        </div>

        {/* ── Title ──────────────────────────────── */}
        <div className="shrink-0 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Choose your <span className="gradient-text">agents</span>
          </h1>
          <p className="text-sm text-white/35">
            Select the agents you want in your workspace. You can change this later.
          </p>
        </div>

        {/* ── Loading ─────────────────────────────── */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="relative w-16 h-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1b96ff]/20 to-[#9050e9]/20 flex items-center justify-center text-2xl"
                style={{ border: '1px solid rgba(27,150,255,0.2)' }}>
                ⚡
              </div>
              <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-[#1b96ff]"
                style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div className="text-center">
              <p className="text-white/60 text-sm font-medium">Discovering agents…</p>
              <p className="text-white/25 text-xs mt-1">{auth.instanceUrl}</p>
            </div>
          </div>
        )}

        {/* ── Session Expired ────────────────────── */}
        {error === 'SESSION_EXPIRED' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(27,150,255,0.12)', border: '1px solid rgba(27,150,255,0.3)' }}>
              🔑
            </div>
            <div className="text-center">
              <p className="text-white/80 text-sm font-semibold mb-1">Session Expired</p>
              <p className="text-white/35 text-xs max-w-xs">Your Salesforce session has expired. Please sign in again.</p>
            </div>
            <button onClick={onLogout}
              className="text-sm px-6 py-2.5 rounded-xl font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #1b96ff, #0176d3)', boxShadow: '0 4px 16px rgba(27,150,255,0.3)' }}>
              Sign in again →
            </button>
          </div>
        )}

        {/* ── Error ───────────────────────────────── */}
        {error && error !== 'SESSION_EXPIRED' && (
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-2xl mb-3">⚠️</div>
            <p className="text-white/60 text-sm mb-1">Couldn't load agents</p>
            <p className="text-white/30 text-xs">{error}</p>
            <button onClick={onLogout}
              className="mt-4 text-xs text-[#1b96ff] hover:text-[#1b96ff]/70 transition-colors">
              Try signing in again →
            </button>
          </div>
        )}

        {/* ── Agents ──────────────────────────────── */}
        {!loading && !error && (
          <>
            {/* Controls bar */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              {/* Category pills */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {categories.map((cat) => {
                  const colors = CATEGORY_COLORS[cat];
                  const isActive = activeCategory === cat;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className="shrink-0 pill transition-all"
                      style={{
                        background: isActive ? (colors?.accent ?? '#1b96ff') : 'rgba(255,255,255,0.06)',
                        color:      isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                        border:     `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow:  isActive && colors ? `0 0 16px ${colors.glow}` : 'none',
                      }}>
                      {cat}
                    </button>
                  );
                })}
              </div>
              {/* Select all */}
              <button onClick={toggleAll}
                className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-4">
                {selected.size === agents.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                {filtered.map((agent) => (
                  <AgentPickerCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selected.has(agent.id)}
                    onToggle={() => toggleAgent(agent.id)}
                  />
                ))}
              </div>
            </div>

            {/* ── Confirm bar ─────────────────────── */}
            <div className="shrink-0 mt-4 flex items-center justify-between gap-4 pt-4 border-t border-white/5">
              <div className="text-sm text-white/35">
                <span className="text-white font-semibold">{selected.size}</span>
                <span> of {agents.length} agents selected</span>
              </div>
              <button
                onClick={handleConfirm}
                disabled={selected.size === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: selected.size > 0
                    ? 'linear-gradient(135deg, #1b96ff, #0176d3)'
                    : 'rgba(255,255,255,0.1)',
                  boxShadow: selected.size > 0 ? '0 4px 16px rgba(27,150,255,0.3)' : 'none',
                }}
              >
                Launch workspace
                <span>→</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Picker Card ─────────────────────────────────── */

function AgentPickerCard({
  agent, isSelected, onToggle,
}: {
  agent:      Agent;
  isSelected: boolean;
  onToggle:   () => void;
}) {
  const colors = CATEGORY_COLORS[agent.category] ?? DEFAULT_COLORS;

  return (
    <button
      onClick={onToggle}
      className="relative text-left rounded-2xl p-4 transition-all duration-200 overflow-hidden group"
      style={{
        background:  isSelected ? colors.bg : 'rgba(255,255,255,0.025)',
        border:      `1px solid ${isSelected ? colors.accent + '50' : 'rgba(255,255,255,0.06)'}`,
        boxShadow:   isSelected ? `0 0 20px ${colors.glow}` : 'none',
        transform:   isSelected ? 'none' : undefined,
      }}
    >
      {/* Checkmark */}
      <div
        className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center transition-all text-xs font-bold"
        style={{
          background:  isSelected ? colors.accent : 'rgba(255,255,255,0.06)',
          border:      `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
          color:       '#fff',
        }}
      >
        {isSelected ? '✓' : ''}
      </div>

      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 transition-transform group-hover:scale-110"
        style={{ background: colors.bg, border: `1px solid ${colors.accent}25` }}
      >
        {agent.icon}
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-white/85 leading-snug mb-1 pr-6">
        {agent.name}
      </p>

      {/* Category */}
      <p className="text-xs font-medium" style={{ color: colors.accent + 'aa' }}>
        {agent.category}
      </p>

      {/* Hover accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)` }}
      />
    </button>
  );
}
