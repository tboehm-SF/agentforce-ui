import { useState } from 'react';
import type { AuthState, WorkspaceMode } from '../types';

interface Props {
  auth: AuthState;
  onSelect: (mode: WorkspaceMode) => void;
  onLogout: () => void;
}

const MODES: {
  id: WorkspaceMode;
  icon: string;
  label: string;
  description: string;
  accent: string;
  bg: string;
  glow: string;
  tags: string[];
}[] = [
  {
    id: 'agents',
    icon: '⚡',
    label: 'Agents',
    description: 'Chat with Agentforce AI agents across Sales, Service, Marketing and more',
    accent: '#1b96ff',
    bg: 'rgba(1,118,211,0.12)',
    glow: 'rgba(27,150,255,0.25)',
    tags: ['External agents', 'Real-time chat', 'SSE streaming'],
  },
  {
    id: 'segments',
    icon: '👥',
    label: 'Segments',
    description: 'Browse and create Data Cloud audience segments with natural language',
    accent: '#06a59a',
    bg: 'rgba(6,165,154,0.12)',
    glow: 'rgba(6,165,154,0.25)',
    tags: ['Data Cloud', 'Live audiences', 'Build with AI'],
  },
  {
    id: 'campaigns',
    icon: '📣',
    label: 'Campaigns',
    description: 'Query campaign performance and get AI-powered marketing recommendations',
    accent: '#9050e9',
    bg: 'rgba(144,80,233,0.12)',
    glow: 'rgba(144,80,233,0.25)',
    tags: ['Performance data', 'NBA recommendations', 'Paid media'],
  },
  {
    id: 'content',
    icon: '🧩',
    label: 'Content',
    description: 'Search and explore your Salesforce CMS content assets by type and tag',
    accent: '#dd7a01',
    bg: 'rgba(221,122,1,0.12)',
    glow: 'rgba(221,122,1,0.25)',
    tags: ['CMS assets', 'Tag search', 'Images & docs'],
  },
  {
    id: 'brief-upload',
    icon: '📋',
    label: 'Brief Upload',
    description: 'Upload campaign briefs (PDF, Excel, images) and create Salesforce Brief records with AI',
    accent: '#2e844a',
    bg: 'rgba(46,132,74,0.12)',
    glow: 'rgba(46,132,74,0.25)',
    tags: ['File upload', 'AI extraction', 'Brief creation'],
  },
];

export function ModeSelector({ auth, onSelect, onLogout }: Props) {
  const [hovered, setHovered] = useState<WorkspaceMode | null>(null);

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Ambient glows */}
      <div className="absolute top-0 left-1/4 w-[700px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(1,118,211,0.08) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(144,80,233,0.06) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col h-screen max-w-5xl mx-auto w-full px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1b96ff] to-[#9050e9] flex items-center justify-center text-base glow-blue">
              ⚡
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Agentforce</div>
              <div className="text-white/30 text-xs mt-0.5">
                {auth.orgLabel ? `${auth.orgLabel} · ` : ''}{auth.username ?? auth.instanceUrl}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10"
          >
            Sign out
          </button>
        </div>

        {/* Title */}
        <div className="shrink-0 mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            What would you like to <span className="gradient-text">work with</span>?
          </h1>
          <p className="text-sm text-white/35">
            Choose a workspace to get started. You can switch at any time.
          </p>
        </div>

        {/* Mode grid — 5 items: 2+2+1 layout, last item spans full or uses col-span */}
        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          {MODES.map((mode) => {
            const isHovered = hovered === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onSelect(mode.id)}
                onMouseEnter={() => setHovered(mode.id)}
                onMouseLeave={() => setHovered(null)}
                className="relative text-left rounded-2xl p-6 transition-all duration-200 overflow-hidden group"
                style={{
                  background:  isHovered ? mode.bg : 'rgba(255,255,255,0.03)',
                  border:      `1px solid ${isHovered ? mode.accent + '40' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow:   isHovered ? `0 0 40px ${mode.glow}` : 'none',
                  transform:   isHovered ? 'translateY(-2px)' : 'none',
                }}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 transition-transform group-hover:scale-110"
                  style={{ background: mode.bg, border: `1px solid ${mode.accent}30` }}
                >
                  {mode.icon}
                </div>

                {/* Label */}
                <div className="text-lg font-bold text-white mb-1.5">{mode.label}</div>

                {/* Description */}
                <p className="text-sm text-white/45 leading-relaxed mb-4">
                  {mode.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {mode.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: mode.bg,
                        color: mode.accent,
                        border: `1px solid ${mode.accent}25`,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Arrow */}
                <div
                  className="absolute top-5 right-5 text-lg opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                  style={{ color: mode.accent }}
                >
                  →
                </div>

                {/* Bottom accent bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(90deg, transparent, ${mode.accent}, transparent)` }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
