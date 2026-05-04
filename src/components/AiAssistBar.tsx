import { useState, useEffect, useRef } from 'react';
import type { Agent } from '../types';
import { AgentChatPanel } from './AgentChatPanel';

interface Props {
  /** The agent to route NL queries to (usually a domain-specific marketing agent). */
  agent:       Agent;
  /** Placeholder text shown in the inline input — guides the user. */
  placeholder: string;
  /** Optional suggested prompt chips shown below the input. */
  suggestions?: string[];
  /** Accent color for the assist bar (matches the workspace color). */
  accent:      string;
  /** Background tint + glow for the assist bar. */
  bg:          string;
  glow:        string;
  /** Optional prefix to prepend to every user message (e.g. domain context). */
  contextPrefix?: string;
}

/**
 * Floating AI assist bar that sits below a workspace title, collapsed by
 * default. When the user types a message or clicks a suggestion, it expands
 * into a full AgentChatPanel drawer on the right.
 */
export function AiAssistBar({
  agent, placeholder, suggestions = [], accent, bg, glow, contextPrefix,
}: Props) {
  const [input,  setInput]  = useState('');
  const [open,   setOpen]   = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(text: string) {
    const finalText = contextPrefix ? `${contextPrefix}\n\n${text}` : text;
    setSeeded(finalText);
    setOpen(true);
    setInput('');
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && input.trim()) submit(input.trim());
  }

  return (
    <>
      {/* Inline AI prompt bar */}
      <div
        className="rounded-2xl p-4 mb-6 shrink-0 transition-all"
        style={{
          background: bg,
          border: `1px solid ${accent}30`,
          boxShadow: `0 0 24px ${glow}`,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold text-white">Ask AI</span>
          <span className="text-xs text-white/40 hidden sm:inline">
            — powered by {agent.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder-white/30 focus:outline-none transition-colors"
            style={{ border: `1px solid ${accent}25` }}
          />
          <button
            onClick={() => input.trim() && submit(input.trim())}
            disabled={!input.trim()}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={{
              background: input.trim() ? `linear-gradient(135deg,${accent},${accent}cc)` : 'rgba(255,255,255,0.08)',
              boxShadow: input.trim() ? `0 4px 16px ${glow}` : 'none',
            }}
          >
            Ask <span>→</span>
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="text-xs px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: accent,
                  border: `1px solid ${accent}25`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="flex-1" onClick={() => setOpen(false)} />
          <div className="w-full max-w-xl h-full">
            <SeededChat
              agent={agent}
              seedPrompt={seeded}
              onClose={() => { setOpen(false); setSeeded(null); }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Wraps AgentChatPanel to auto-submit a seed prompt when the panel opens.
 * We use a trick: render AgentChatPanel, then dispatch a DOM event-like
 * bootstrap by programmatically firing sendMessage via the textarea.
 *
 * Simpler approach: render AgentChatPanel normally and forward seedPrompt
 * through a global-event handshake. Cleanest = pass as a prop, but
 * AgentChatPanel doesn't accept one — so we use an effect that types into
 * its textarea and submits.
 */
function SeededChat({ agent, seedPrompt, onClose }: {
  agent: Agent; seedPrompt: string | null; onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!seedPrompt) return;
    // Wait for AgentChatPanel to mount its textarea
    const t = setTimeout(() => {
      const ta = rootRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
      const btn = rootRef.current?.querySelector('button[class*="rounded-xl"]') as HTMLButtonElement | null;
      if (ta) {
        // Use the native input-value setter so React's synthetic event fires
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, seedPrompt);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        // Then submit via Enter key
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        btn?.focus();
      }
    }, 120);
    return () => clearTimeout(t);
  }, [seedPrompt]);

  return (
    <div ref={rootRef} className="h-full">
      <AgentChatPanel agent={agent} onClose={onClose} />
    </div>
  );
}
