import type { Agent } from '../types';
import { AGENTS, CATEGORIES } from '../data/agents';

interface AgentSidebarProps {
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onLogout: () => void;
  orgUser: string;
  showcaseMode?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  Marketing: '📣',
  Sales: '💼',
  Service: '🛠️',
};

export function AgentSidebar({ activeAgent, onSelectAgent, onLogout, orgUser, showcaseMode }: AgentSidebarProps) {
  return (
    <aside className="w-64 bg-[#032d60] flex flex-col min-h-screen shrink-0">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0176d3] flex items-center justify-center text-base">
            ⚡
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">Agentforce</div>
            <div className="text-white/40 text-xs">Agent Console</div>
          </div>
        </div>
      </div>

      {/* Agent list */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-1">
            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/30 flex items-center gap-1.5">
              <span>{CATEGORY_ICONS[cat] ?? '•'}</span>
              <span>{cat}</span>
            </div>
            {AGENTS.filter((a) => a.category === cat).map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all rounded-none ${
                  activeAgent?.id === agent.id
                    ? 'bg-[#0176d3]/30 border-r-2 border-[#1b96ff] text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                }`}
              >
                <span className="text-base leading-none">{agent.icon}</span>
                <span className="text-sm leading-snug">{agent.name}</span>
                {activeAgent?.id === agent.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#1b96ff] agent-active shrink-0" />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-[#0176d3]/40 flex items-center justify-center text-xs text-white font-medium">
            {orgUser.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-white/80 text-xs font-medium truncate">{orgUser}</div>
            <div className="text-white/30 text-xs">HLS.ch</div>
          </div>
        </div>
        {!showcaseMode && (
          <button
            onClick={onLogout}
            className="w-full text-xs text-white/30 hover:text-white/60 py-1 transition-colors text-left"
          >
            Sign out →
          </button>
        )}
        {showcaseMode && (
          <div className="text-xs text-white/20 py-1">Showcase mode</div>
        )}
      </div>
    </aside>
  );
}
