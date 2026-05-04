import type { Agent } from '../types';
import { AGENTS } from '../data/agents';

interface AgentDashboardProps {
  onSelectAgent: (agent: Agent) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Marketing: { bg: 'bg-blue-50', text: 'text-blue-700' },
  Sales: { bg: 'bg-purple-50', text: 'text-purple-700' },
  Service: { bg: 'bg-teal-50', text: 'text-teal-700' },
};

export function AgentDashboard({ onSelectAgent }: AgentDashboardProps) {
  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Agent Console</h1>
          <p className="text-sm text-gray-500 mt-1">Select an agent to start a conversation</p>
        </div>

        {/* Featured: Email Marketing Studio */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Featured</p>
          <button
            onClick={() => onSelectAgent(AGENTS[0])}
            className="w-full text-left bg-gradient-to-br from-[#032d60] to-[#014486] rounded-2xl p-6 hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">
                  {AGENTS[0].icon}
                </div>
                <div>
                  <div className="text-white text-xl font-semibold mb-1">{AGENTS[0].name}</div>
                  <div className="text-white/60 text-sm">{AGENTS[0].description}</div>
                </div>
              </div>
              <div className="text-white/30 group-hover:text-white/60 transition-colors text-xl mt-1">
                →
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {AGENTS[0].suggestedPrompts?.slice(0, 2).map((p) => (
                <span key={p} className="text-xs bg-white/10 text-white/70 rounded-full px-3 py-1">
                  "{p.slice(0, 45)}{p.length > 45 ? '…' : ''}"
                </span>
              ))}
            </div>
          </button>
        </div>

        {/* Other agents */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">All Agents</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGENTS.slice(1).map((agent) => {
              const catStyle = CATEGORY_COLORS[agent.category] ?? { bg: 'bg-gray-50', text: 'text-gray-600' };
              return (
                <button
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-[#0176d3] hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: agent.color + '18' }}
                    >
                      {agent.icon}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catStyle.bg} ${catStyle.text}`}>
                      {agent.category}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-[#0176d3] transition-colors">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{agent.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
