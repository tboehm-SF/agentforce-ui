import { useState } from 'react';
import type { Agent } from '../types';
import { AGENTS, CATEGORIES } from '../data/agents';

interface Props {
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
}

const CATEGORY_COLORS: Record<string, { accent: string; bg: string; glow: string }> = {
  Marketing:   { accent: '#1b96ff', bg: 'rgba(1,118,211,0.12)',   glow: 'rgba(27,150,255,0.25)' },
  Service:     { accent: '#06a59a', bg: 'rgba(6,165,154,0.12)',   glow: 'rgba(6,165,154,0.25)' },
  Commerce:    { accent: '#9050e9', bg: 'rgba(144,80,233,0.12)',  glow: 'rgba(144,80,233,0.25)' },
  Productivity:{ accent: '#dd7a01', bg: 'rgba(221,122,1,0.12)',   glow: 'rgba(221,122,1,0.25)' },
};

export function AgentMissionControl({ activeAgent, onSelectAgent }: Props) {
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const filtered = AGENTS.filter((a) => {
    const matchCat = filter === 'All' || a.category === filter;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div
      className="flex flex-col h-full overflow-hidden transition-all duration-500"
      style={{ width: activeAgent ? '420px' : '100%', minWidth: activeAgent ? '360px' : undefined }}
    >
      {/* ── Header ─────────────────────────────────── */}
      <header className="relative px-8 pt-8 pb-5 shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Animated logo mark */}
            <div className="relative w-10 h-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1b96ff] to-[#9050e9] flex items-center justify-center text-lg glow-blue">
                ⚡
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#2e844a] border-2 border-[#05080f]">
                <div className="live-dot w-2 h-2 m-auto mt-0.5" />
              </div>
            </div>
            <div>
              <div className="text-white font-bold text-lg leading-none tracking-tight">
                Agentforce
              </div>
              <div className="text-xs text-white/40 mt-0.5">
                <span className="live-dot inline-block w-1.5 h-1.5 mr-1.5 relative top-px" />
                hls-ch.my.salesforce.com
              </div>
            </div>
          </div>

          {!activeAgent && (
            <div className="text-right">
              <div className="text-2xl font-bold gradient-text">{AGENTS.length}</div>
              <div className="text-xs text-white/30">active agents</div>
            </div>
          )}
        </div>

        {!activeAgent && (
          <>
            <h1 className="text-3xl font-bold text-white leading-tight mb-1">
              Agent <span className="gradient-text">Mission Control</span>
            </h1>
            <p className="text-sm text-white/40">
              Select an AI agent to start a conversation with your Salesforce org
            </p>

            {/* Search */}
            <div className="mt-5 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full glass rounded-xl pl-10 pr-4 py-2.5 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[#1b96ff]/50 transition-colors"
              />
            </div>
          </>
        )}
      </header>

      {/* ── Category filter ─────────────────────────── */}
      <div className="px-8 pb-3 flex gap-2 shrink-0 overflow-x-auto scrollbar-hide">
        {['All', ...CATEGORIES].map((cat) => {
          const colors = CATEGORY_COLORS[cat];
          const isActive = filter === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="shrink-0 pill transition-all"
              style={{
                background: isActive ? (colors?.accent ?? '#1b96ff') : 'rgba(255,255,255,0.06)',
                color:      isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                border:     `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                boxShadow:  isActive && colors ? `0 0 16px ${colors.glow}` : 'none',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* ── Agent grid / list ───────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!activeAgent ? (
          /* Full grid view */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-1">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isActive={activeAgent?.id === agent.id}
                onClick={() => onSelectAgent(agent)}
                compact={false}
              />
            ))}
          </div>
        ) : (
          /* Compact list view when chat is open */
          <div className="space-y-1.5 mt-1">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isActive={activeAgent?.id === agent.id}
                onClick={() => onSelectAgent(agent)}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 glass border-t border-white/5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#1b96ff]/20 flex items-center justify-center text-xs text-[#1b96ff] font-bold">
          T
        </div>
        <div className="text-xs text-white/30">tboehm@hls.ch</div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[#2e844a]">
          <span className="live-dot" />
          Connected
        </div>
      </div>
    </div>
  );
}

/* ── Agent Card ──────────────────────────────────── */

function AgentCard({
  agent, isActive, onClick, compact,
}: {
  agent: Agent;
  isActive: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const colors = CATEGORY_COLORS[agent.category] ?? CATEGORY_COLORS.Marketing;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background:  isActive ? colors.bg : 'rgba(255,255,255,0.03)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: isActive ? colors.accent + '60' : 'rgba(255,255,255,0.05)',
          boxShadow:   isActive ? `0 0 20px ${colors.glow}` : 'none',
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}
        >
          {agent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white/85 font-medium truncate leading-snug">{agent.name}</div>
          <div className="text-xs text-white/30 truncate">{agent.category}</div>
        </div>
        {isActive && (
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.accent }} />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="glass-card w-full text-left rounded-2xl p-4 group relative overflow-hidden"
      style={isActive ? {
        background:  colors.bg,
        borderColor: colors.accent + '50',
        boxShadow:   `0 0 32px ${colors.glow}`,
      } : undefined}
    >
      {/* Glow accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)` }}
      />

      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110"
          style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}
        >
          {agent.icon}
        </div>
        <span
          className="pill"
          style={{ background: colors.bg, color: colors.accent, border: `1px solid ${colors.accent}30` }}
        >
          {agent.category}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-white/90 mb-1 group-hover:text-white transition-colors leading-snug">
        {agent.name}
      </h3>
      <p className="text-xs text-white/35 leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Hover arrow */}
      <div className="mt-3 flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: colors.accent }}>
        <span>Chat now</span>
        <span className="text-base leading-none">→</span>
      </div>
    </button>
  );
}
