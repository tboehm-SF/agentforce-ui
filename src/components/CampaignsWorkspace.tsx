import { useState, useEffect, useCallback } from 'react';
import type { AuthState, Agent } from '../types';
import { AgentChatPanel } from './AgentChatPanel';

interface Props {
  auth:     AuthState;
  onBack:   () => void;
  onLogout: () => void;
}

const CAMPAIGN_AGENT_META: Record<string, { icon: string; color: string; bg: string; glow: string; description: string; tags: string[] }> = {
  Campaign_Performance_Agent: {
    icon: '📊', color: '#9050e9', bg: 'rgba(144,80,233,0.12)', glow: 'rgba(144,80,233,0.25)',
    description: 'Query campaign performance metrics, ROI, and conversion data.',
    tags: ['CTR', 'Conversions', 'ROI'],
  },
  Marketing_NBA_Campaign_Agent: {
    icon: '🎯', color: '#1b96ff', bg: 'rgba(1,118,211,0.12)', glow: 'rgba(27,150,255,0.25)',
    description: 'Get AI-powered next-best-action recommendations for your campaigns.',
    tags: ['NBA', 'AI Insights', 'Recommendations'],
  },
  Paid_Media_Optimization_Agent: {
    icon: '💰', color: '#2e844a', bg: 'rgba(46,132,74,0.12)', glow: 'rgba(46,132,74,0.25)',
    description: 'Optimize paid media spend across channels with AI recommendations.',
    tags: ['Paid Media', 'Budget', 'Channels'],
  },
  Marketing_Studio_Agent: {
    icon: '✉️', color: '#dd7a01', bg: 'rgba(221,122,1,0.12)', glow: 'rgba(221,122,1,0.25)',
    description: 'Create and optimize marketing email content with generative AI.',
    tags: ['Email', 'Content Gen', 'Personalization'],
  },
  Analytics_and_Visualization: {
    icon: '📈', color: '#06a59a', bg: 'rgba(6,165,154,0.12)', glow: 'rgba(6,165,154,0.25)',
    description: 'Analyze marketing data and generate charts and visualizations.',
    tags: ['Analytics', 'Charts', 'Data'],
  },
};

const DEFAULT_META = {
  icon: '🤖', color: '#706e6b', bg: 'rgba(112,110,107,0.12)', glow: 'rgba(112,110,107,0.2)',
  description: 'Marketing intelligence agent',
  tags: ['Agent'],
};

export function CampaignsWorkspace({ onBack, onLogout }: Props) {
  const [agents,       setAgents]       = useState<Agent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeAgent,  setActiveAgent]  = useState<Agent | null>(null);
  const [hovered,      setHovered]      = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/campaigns/agents', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(e.error || res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        const enriched: Agent[] = (data.agents ?? []).map((raw: { Id: string; DeveloperName: string; MasterLabel: string }) => {
          const meta = CAMPAIGN_AGENT_META[raw.DeveloperName] ?? DEFAULT_META;
          return {
            id:            raw.Id,
            name:          raw.MasterLabel,
            developerName: raw.DeveloperName,
            description:   meta.description,
            icon:          meta.icon,
            color:         meta.color,
            category:      'Marketing',
            suggestedPrompts: [],
          };
        });
        setAgents(enriched);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(144,80,233,0.07) 0%, transparent 70%)' }} />

      <div className="relative flex h-screen">

        {/* Left panel — always visible */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-500"
          style={{ width: activeAgent ? '400px' : '100%', minWidth: activeAgent ? '340px' : undefined }}
        >
          <div className="flex flex-col h-full max-w-5xl mx-auto w-full px-6 py-8">

            {/* Header */}
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={onBack}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors hover:bg-white/5"
                  title="Back to mode selector">
                  ←
                </button>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                  style={{ background: 'rgba(144,80,233,0.2)', border: '1px solid rgba(144,80,233,0.3)', boxShadow: '0 0 16px rgba(144,80,233,0.2)' }}>
                  📣
                </div>
                <div>
                  <div className="text-white font-semibold text-sm leading-none">Campaigns</div>
                  <div className="text-white/30 text-xs mt-0.5">Marketing AI agents</div>
                </div>
              </div>
              <button onClick={onLogout}
                className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10">
                Sign out
              </button>
            </div>

            {/* Title */}
            {!activeAgent && (
              <div className="shrink-0 mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                  Campaign <span style={{ background: 'linear-gradient(135deg,#9050e9,#1b96ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Intelligence</span>
                </h1>
                <p className="text-sm text-white/35">
                  Select a marketing AI agent to explore campaign performance, optimize spend, or generate recommendations.
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="relative w-14 h-14 mx-auto mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: 'rgba(144,80,233,0.15)', border: '1px solid rgba(144,80,233,0.2)' }}>
                      📣
                    </div>
                    <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-[#9050e9]"
                      style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                  <p className="text-white/50 text-sm">Loading marketing agents…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex-1 flex items-center justify-center">
                <div className="glass rounded-2xl p-8 text-center max-w-md">
                  <div className="text-3xl mb-3">⚠️</div>
                  <p className="text-white/70 font-medium mb-1">Couldn't load agents</p>
                  <p className="text-white/35 text-sm mb-4">{error}</p>
                  <button onClick={load}
                    className="text-sm px-4 py-2 rounded-xl transition-colors"
                    style={{ background: 'rgba(144,80,233,0.15)', color: '#9050e9', border: '1px solid rgba(144,80,233,0.2)' }}>
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* Agent cards or compact list */}
            {!loading && !error && (
              <div className="flex-1 overflow-y-auto">
                {!activeAgent ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {agents.map((agent) => {
                      const meta = CAMPAIGN_AGENT_META[agent.developerName] ?? DEFAULT_META;
                      const isHovered = hovered === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setActiveAgent(agent)}
                          onMouseEnter={() => setHovered(agent.id)}
                          onMouseLeave={() => setHovered(null)}
                          className="relative text-left rounded-2xl p-5 transition-all duration-200 overflow-hidden group"
                          style={{
                            background:  isHovered ? meta.bg : 'rgba(255,255,255,0.03)',
                            border:      `1px solid ${isHovered ? meta.color + '40' : 'rgba(255,255,255,0.07)'}`,
                            boxShadow:   isHovered ? `0 0 32px ${meta.glow}` : 'none',
                            transform:   isHovered ? 'translateY(-2px)' : 'none',
                          }}>
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4 transition-transform group-hover:scale-110"
                            style={{ background: meta.bg, border: `1px solid ${meta.color}30` }}>
                            {agent.icon}
                          </div>
                          <div className="text-base font-bold text-white mb-1">{agent.name}</div>
                          <p className="text-sm text-white/40 leading-relaxed mb-3">{agent.description}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {meta.tags.map((tag) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}25` }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="absolute top-4 right-4 text-lg opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                            style={{ color: meta.color }}>
                            →
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: `linear-gradient(90deg,transparent,${meta.color},transparent)` }} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Compact list when chat panel is open
                  <div className="space-y-1.5">
                    {agents.map((agent) => {
                      const meta = CAMPAIGN_AGENT_META[agent.developerName] ?? DEFAULT_META;
                      const isActive = activeAgent?.id === agent.id;
                      return (
                        <button key={agent.id} onClick={() => setActiveAgent(agent)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                          style={{
                            background:  isActive ? meta.bg : 'rgba(255,255,255,0.03)',
                            border:      `1px solid ${isActive ? meta.color + '50' : 'rgba(255,255,255,0.05)'}`,
                            boxShadow:   isActive ? `0 0 16px ${meta.glow}` : 'none',
                          }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ background: meta.bg, border: `1px solid ${meta.color}30` }}>
                            {agent.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-white/80 font-medium truncate">{agent.name}</div>
                            <div className="text-xs text-white/25 truncate">Marketing</div>
                          </div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        {activeAgent && (
          <AgentChatPanel
            agent={activeAgent}
            onClose={() => setActiveAgent(null)}
          />
        )}
      </div>
    </div>
  );
}
