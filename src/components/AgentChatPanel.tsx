import { useRef, useEffect, useState } from 'react';
import type { Agent } from '../types';
import { useAgentChat } from '../hooks/useAgentChat';

interface Props {
  agent: Agent;
  onClose: () => void;
  /** Optional prompt to auto-send as the first message when the panel mounts. */
  seedPrompt?: string | null;
}

const CATEGORY_COLORS: Record<string, { accent: string; bg: string; glow: string }> = {
  Marketing:   { accent: '#1b96ff', bg: 'rgba(1,118,211,0.12)',   glow: 'rgba(27,150,255,0.2)' },
  Service:     { accent: '#06a59a', bg: 'rgba(6,165,154,0.12)',   glow: 'rgba(6,165,154,0.2)' },
  Commerce:    { accent: '#9050e9', bg: 'rgba(144,80,233,0.12)',  glow: 'rgba(144,80,233,0.2)' },
  Productivity:{ accent: '#dd7a01', bg: 'rgba(221,122,1,0.12)',   glow: 'rgba(221,122,1,0.2)' },
};

export function AgentChatPanel({ agent, onClose, seedPrompt }: Props) {
  const [input, setInput] = useState('');
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const seededRef    = useRef(false);
  const colors = CATEGORY_COLORS[agent.category] ?? CATEGORY_COLORS.Marketing;

  const {
    messages, sendMessage, clearChat,
    isLoading, isStreaming, streamingText, error,
  } = useAgentChat({ agentApiName: agent.id }); // agent.id = 18-char BotDefinition record ID

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Focus textarea when panel opens
  useEffect(() => {
    textareaRef.current?.focus();
  }, [agent.id]);

  // Auto-send seed prompt exactly once (when chat is empty and not already busy)
  useEffect(() => {
    if (!seedPrompt || seededRef.current) return;
    if (isLoading || isStreaming) return;
    if (messages.length > 0) return;
    seededRef.current = true;
    sendMessage(seedPrompt);
  }, [seedPrompt, isLoading, isStreaming, messages.length, sendMessage]);

  function handleSubmit() {
    if (!input.trim() || isLoading || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex-1 flex flex-col h-full glass-chat slide-in-right overflow-hidden relative">
      {/* Ambient glow from agent color */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
          transform: 'translate(30%, -30%)',
        }}
      />

      {/* ── Header ──────────────────────────────── */}
      <div className="relative shrink-0 px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}
          >
            {agent.icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white leading-tight">{agent.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isStreaming ? (
                <>
                  <span className="spinner spinner-sm" />
                  <span className="text-xs" style={{ color: colors.accent }}>Responding…</span>
                </>
              ) : isLoading ? (
                <>
                  <span className="spinner spinner-sm" />
                  <span className="text-xs text-white/40">Connecting…</span>
                </>
              ) : (
                <>
                  <span className="live-dot" />
                  <span className="text-xs text-white/30">Ready</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="text-xs text-white/30 hover:text-white/60 px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/15 transition-all"
          >
            New chat
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Messages ────────────────────────────── */}
      <div className="relative flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {isEmpty && (
          <EmptyState agent={agent} colors={colors} onPrompt={(p) => {
            setInput(p);
            textareaRef.current?.focus();
          }} />
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} colors={colors} />
        ))}

        {isStreaming && streamingText && (
          <MessageBubble role="agent" content={streamingText} colors={colors} streaming />
        )}

        {(isLoading && !isStreaming) && <ThinkingBubble />}

        {error && (
          <div className="glass rounded-xl px-4 py-3 text-sm border"
            style={{ background: 'rgba(220,90,20,0.08)', borderColor: 'rgba(220,90,20,0.25)', color: 'rgba(255,200,160,0.95)' }}>
            <div className="flex items-start gap-2">
              <span className="text-lg shrink-0">⚠️</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white/90 mb-1">Agent unavailable</div>
                <div className="text-white/60 leading-relaxed">{error}</div>
                <button
                  onClick={() => clearChat()}
                  className="mt-2 text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────── */}
      <div className="relative shrink-0 px-4 py-4 border-t border-white/5">
        <div
          className="flex items-end gap-3 rounded-2xl px-4 py-3 transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid rgba(255,255,255,0.07)`,
          }}
          onFocus={() => {}} // style handled via CSS
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}…`}
            rows={1}
            disabled={isLoading || isStreaming}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none leading-relaxed disabled:opacity-40"
            style={{ minHeight: '24px', maxHeight: '160px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || isStreaming}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-25 disabled:cursor-not-allowed text-sm text-white"
            style={{
              background: input.trim() && !isLoading && !isStreaming
                ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}cc)`
                : 'rgba(255,255,255,0.08)',
            }}
          >
            ↑
          </button>
        </div>
        <p className="text-center text-xs text-white/15 mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────── */

function MessageBubble({
  role, content, colors, streaming,
}: {
  role: 'user' | 'agent';
  content: string;
  colors: { accent: string; bg: string };
  streaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 msg-animate ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5"
          style={{ background: colors.bg, border: `1px solid ${colors.accent}30` }}
        >
          🤖
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
          isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
        } ${streaming ? 'streaming-cursor' : ''}`}
        style={isUser ? {
          background: `linear-gradient(135deg, ${colors.accent}ee, ${colors.accent}99)`,
          color: '#fff',
        } : {
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3 msg-animate">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        🤖
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ animation: `pulse-dot 1.2s ${i * 0.2}s ease-in-out infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  agent, colors, onPrompt,
}: {
  agent: Agent;
  colors: { accent: string; bg: string; glow: string };
  onPrompt: (p: string) => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-12 panel-animate">
      {/* Agent icon with glow */}
      <div className="relative mb-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.accent}40`,
            boxShadow: `0 0 40px ${colors.glow}`,
          }}
        >
          {agent.icon}
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mb-2">{agent.name}</h2>
      <p className="text-sm text-white/35 max-w-xs leading-relaxed mb-8">{agent.description}</p>

      {agent.suggestedPrompts && (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/20 mb-3">
            Try asking…
          </p>
          {agent.suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPrompt(prompt)}
              className="w-full text-left text-sm px-4 py-3 rounded-xl transition-all text-white/50 hover:text-white/85"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accent + '50';
                (e.currentTarget as HTMLButtonElement).style.background = colors.bg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
              }}
            >
              "{prompt}"
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
