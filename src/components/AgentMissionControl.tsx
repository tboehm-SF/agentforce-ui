import { useState } from 'react';
import type { Agent, AuthState } from '../types';

interface Props {
  activeAgent:   Agent | null;
  onSelectAgent: (agent: Agent) => void;
  agents:        Agent[];
  auth:          AuthState | null;
  onLogout:      () => void;
}

const CATEGORY_COLORS: Record<string, { accent: string; bg: string; glow: string }> = {
  Marketing:   { accent: '#1b96ff', bg: 'rgba(1,118,211,0.12)',   glow: 'rgba(27,150,255,0.25)' },
  Service:     { accent: '#06a59a', bg: 'rgba(6,165,154,0.12)',   glow: 'rgba(6,165,154,0.25)' },
  Commerce:    { accent: '#9050e9', bg: 'rgba(144,80,233,0.12)',  glow: 'rgba(144,80,233,0.25)' },
  Productivity:{ accent: '#dd7a01', bg: 'rgba(221,122,1,0.12)',   glow: 'rgba(221,122,1,0.25)' },
  Other:       { accent: '#706e6b', bg: 'rgba(112,110,107,0.12)', glow: 'rgba(112,110,107,0.2)' },
};

export function AgentMissionControl({ activeAgent, onSelectAgent, agents, auth, onLogout }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  const categories = ['All', ...Array.from(new Set(agents.map((a) => a.category)))];

  const filtered = agents.filter((a) => {
    const matchCat    = activeCategory === 'All' || a.category === activeCategory;
    const matchSearch = !search
      || a.name.toLowerCase().includes(search.toLowerCase())
      || a.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const displayName = auth?.displayName || auth?.username || 'tboehm@hls.ch';
  const initials    = displayName.charAt(0).toUpperCase();

  return (
    <div
      className="flex flex-col h-full overflow-hidden transition-all duration-500"
      style={{ width: activeAgent ? '400px' : '100%', minWidth: activeAgent ? '340px' : undefined }}
    >
      {/* ── Header ─────────────────────────────────── */}
      <header className="relative px-6 pt-7 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1b96ff] to-[#9050e9] flex items-center justify-center text-base glow-blue">
                ⚡
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#2e844a] border-2 border-[#05080f]" />
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-none">Agentforce</div>
              <div className="text-xs text-white/30 mt-0.5 flex items-center gap-1">
                <span className="live-dot inline-block w-1.5 h-1.5" />
                {auth?.instanceUrl?.replace('https://', '').replace('.my.salesforce.com', '') ?? 'salesforce.com'}
              </div>
            </div>
          </div>

          {!activeAgent && (
            <div className="text-right">
              <div className="text-xl font-bold gradient-text">{agents.length}</div>
              <div className="text-xs text-white/25">agents</div>
            </div>
          )}
        </div>

        {!activeAgent && (
          <>
            <h1 className="text-2xl font-bold text-white leading-tight mb-1">
              Agent <span className="gradient-text">Mission Control</span>
            </h1>
            <p className="text-xs text-white/30 mb-4">
              Select an AI agent to start a conversation
            </p>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full glass rounded-xl pl-9 pr-4 py-2 text-sm text-white/70 placeholder-white/20 focus:outline-none focus:border-[#1b96ff]/40 transition-colors"
              />
            </div>
          </>
        )}
      </header>

      {/* ── Category filter ─────────────────────────── */}
      <div className="px-6 pb-3 flex gap-1.5 shrink-0 overflow-x-auto">
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat];
          const isActive = activeCategory === cat;
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="shrink-0 pill transition-all"
              style={{
                background: isActive ? (colors?.accent ?? '#1b96ff') : 'rgba(255,255,255,0.05)',
                color:      isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                border:     `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.07)'}`,
                boxShadow:  isActive && colors ? `0 0 14px ${colors.glow}` : 'none',
              }}>
              {cat}
            </button>
          );
        })}
      </div>

      {/* ── Agent grid / list ───────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {!activeAgent ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-1">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent}
                isActive={false} onClick={() => onSelectAgent(agent)} compact={false} />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 mt-1">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent}
                isActive={activeAgent?.id === agent.id}
                onClick={() => onSelectAgent(agent)} compact />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="shrink-0 px-5 py-3 glass border-t border-white/5 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-full bg-[#1b96ff]/20 flex items-center justify-center text-xs text-[#1b96ff] font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/40 truncate">{displayName}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-[#2e844a]">
            <span className="live-dot" />
            <span>Connected</span>
          </div>
          <button onClick={onLogout}
            className="text-xs text-white/20 hover:text-white/50 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Agent Card ──────────────────────────────────── */

function AgentCard({ agent, isActive, onClick, compact }: {
  agent: Agent; isActive: boolean; onClick: () => void; compact: boolean;
}) {
  const colors = CATEGORY_COLORS[agent.category] ?? CATEGORY_COLORS.Other;

  if (compact) {
    return (
      <button onClick={onClick}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background:  isActive ? colors.bg : 'rgba(255,255,255,0.03)',
          borderWidth: 1, borderStyle: 'solid',
          borderColor: isActive ? colors.accent + '60' : 'rgba(255,255,255,0.05)',
          boxShadow:   isActive ? `0 0 16px ${colors.glow}` : 'none',
        }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}>
          {agent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white/80 font-medium truncate">{agent.name}</div>
          <div className="text-xs text-white/25 truncate">{agent.category}</div>
        </div>
        {isActive && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.accent }} />}
      </button>
    );
  }

  return (
    <button onClick={onClick}
      className="glass-card w-full text-left rounded-2xl p-4 group relative overflow-hidden">
      {/* Top accent line on hover */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)` }} />

      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110"
          style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}>
          {agent.icon}
        </div>
        <span className="pill" style={{ background: colors.bg, color: colors.accent, border: `1px solid ${colors.accent}25` }}>
          {agent.category}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-white/85 mb-1 group-hover:text-white transition-colors leading-snug">
        {agent.name}
      </h3>
      <p className="text-xs text-white/30 leading-relaxed line-clamp-2">{agent.description}</p>

      <div className="mt-3 flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-all"
        style={{ color: colors.accent }}>
        <span>Chat now</span>
        <span>→</span>
      </div>
    </button>
  );
}
