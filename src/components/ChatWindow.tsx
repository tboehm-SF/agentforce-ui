import { useRef, useEffect, useState } from 'react';
import type { Agent } from '../types';
import type { SalesforceConfig } from '../types';
import { useAgentChat } from '../hooks/useAgentChat';

interface ChatWindowProps {
  agent: Agent;
  config?: SalesforceConfig;
}

function MessageBubble({ role, content, isStreaming }: { role: 'user' | 'agent'; content: string; isStreaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 msg-animate ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#f3f2f2] border border-gray-200 flex items-center justify-center text-base shrink-0 mt-0.5">
          🤖
        </div>
      )}
      <div
        className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-gradient-to-br from-[#0176d3] to-[#014486] text-white rounded-2xl rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
        } ${isStreaming ? 'streaming-cursor' : ''}`}
      >
        {content}
      </div>
    </div>
  );
}

export function ChatWindow({ agent, config }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, clearChat, isLoading, isStreaming, streamingText, error } =
    useAgentChat({ agentApiName: agent.developerName });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  function handleSubmit() {
    if (!input.trim() || isLoading || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
  }

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full bg-[#f8f7f6]">
      {/* Chat header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: agent.color + '18' }}
          >
            {agent.icon}
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">{agent.name}</h1>
            <p className="text-xs text-gray-400">{agent.description.slice(0, 60)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(isLoading || isStreaming) && (
            <div className="flex items-center gap-1.5 text-xs text-[#0176d3]">
              <span className="spinner" />
              <span>{isLoading ? 'Connecting…' : 'Responding…'}</span>
            </div>
          )}
          <button
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {isEmpty && (
          <div className="h-full flex flex-col items-center justify-center text-center py-16">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
              style={{ background: agent.color + '15' }}
            >
              {agent.icon}
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">{agent.name}</h2>
            <p className="text-sm text-gray-400 max-w-xs mb-8">{agent.description}</p>

            {/* Suggested prompts */}
            {agent.suggestedPrompts && (
              <div className="w-full max-w-lg grid grid-cols-1 gap-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Suggested prompts</p>
                {agent.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                    className="text-left text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-[#0176d3] hover:text-[#0176d3] hover:bg-blue-50/30 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {isStreaming && streamingText && (
          <MessageBubble role="agent" content={streamingText} isStreaming />
        )}

        {isLoading && !isStreaming && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#f3f2f2] border border-gray-200 flex items-center justify-center text-base shrink-0">
              🤖
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400"
                    style={{ animation: `stream-cursor 1s ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <span className="font-medium">Error: </span>{error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="flex items-end gap-3 bg-[#f8f7f6] border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-[#0176d3] focus-within:ring-1 focus-within:ring-[#0176d3]/30 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}…`}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none leading-relaxed"
            style={{ minHeight: '24px', maxHeight: '180px' }}
            disabled={isLoading || isStreaming}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || isStreaming}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[#0176d3] hover:bg-[#014486] text-white text-sm"
          >
            ↑
          </button>
        </div>
        <p className="text-xs text-gray-300 text-center mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
