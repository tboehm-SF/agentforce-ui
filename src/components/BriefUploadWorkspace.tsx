import { useState, useEffect, useCallback, useRef } from 'react';
import type { AuthState, Agent, FileContext, Brief } from '../types';
import { useAgentChat } from '../hooks/useAgentChat';
import { extractFiles, fetchBriefs } from '../api/briefApi';
import { fetchOrgAgents } from '../api/oauth';

interface Props {
  auth: AuthState;
  onBack: () => void;
  onLogout: () => void;
}

// Default agent info — the ID will be resolved dynamically from the connected org
const BRIEF_AGENT_DEV_NAME = 'Campaign_Brief_Upload_Agent';
const BRIEF_AGENT_DEFAULTS: Omit<Agent, 'id'> = {
  name: 'Campaign Brief Agent',
  developerName: BRIEF_AGENT_DEV_NAME,
  description: 'Create campaign briefs conversationally. Upload PDFs, spreadsheets, or images for automatic extraction.',
  icon: '📋',
  color: '#1b96ff',
  category: 'Marketing',
  suggestedPrompts: [
    'Create a new campaign brief for a summer sale',
    'I have a briefing document to upload',
    'List my existing campaign briefs',
    'Link a brief to a campaign',
  ],
};

const ACCENT = '#1b96ff';
const BG = 'rgba(1,118,211,0.12)';
const GLOW = 'rgba(27,150,255,0.2)';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = '.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp,.docx,.txt';

function formatDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function BriefUploadWorkspace({ onBack, onLogout }: Props) {
  const [tab, setTab] = useState<'chat' | 'briefs'>('chat');
  const [files, setFiles] = useState<FileContext[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [briefsLoading, setBriefsLoading] = useState(false);
  const [briefsError, setBriefsError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [resolvedAgent, setResolvedAgent] = useState<Agent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamically resolve the Campaign Brief Upload Agent ID from the connected org
  useEffect(() => {
    fetchOrgAgents()
      .then((agents) => {
        const match = agents.find(a => a.DeveloperName === BRIEF_AGENT_DEV_NAME);
        if (match) {
          setResolvedAgent({
            ...BRIEF_AGENT_DEFAULTS,
            id: match.Id,
            name: match.MasterLabel || BRIEF_AGENT_DEFAULTS.name,
          });
        } else {
          setAgentError(
            `Campaign Brief Upload Agent not found on this org. ` +
            `Deploy the "${BRIEF_AGENT_DEV_NAME}" agent to this org first.`
          );
        }
      })
      .catch((e) => setAgentError(`Failed to load agents: ${e.message}`));
  }, []);

  const {
    messages, sendMessage, clearChat,
    isLoading, isStreaming, streamingText, error,
  } = useAgentChat({ agentApiName: resolvedAgent?.id || '' });

  const BRIEF_AGENT = resolvedAgent || { id: '', ...BRIEF_AGENT_DEFAULTS };

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Load briefs when switching to briefs tab
  useEffect(() => {
    if (tab !== 'briefs') return;
    setBriefsLoading(true);
    setBriefsError(null);
    fetchBriefs()
      .then((data) => setBriefs(data.briefs))
      .catch((e) => setBriefsError(e.message))
      .finally(() => setBriefsLoading(false));
  }, [tab]);

  // ─── File handling ───────────────────────────────────────────────
  const processFiles = useCallback(async (rawFiles: FileList | File[]) => {
    const fileArray = Array.from(rawFiles).filter(f => ACCEPTED_TYPES.includes(f.type));
    if (fileArray.length === 0) {
      setUploadError('No supported files selected. Accepted: PDF, Excel, CSV, Word, images, text.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const results = await extractFiles(fileArray);
      setFiles(prev => [...prev, ...results]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Chat handlers ───────────────────────────────────────────────
  function handleSubmit() {
    if (!input.trim() || isLoading || isStreaming) return;
    const msg = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Pass file context with the first message that has files attached
    const ctx = files.length > 0 ? files : undefined;
    sendMessage(msg, ctx);
    // Clear files after sending (they're now injected into the conversation)
    if (ctx) setFiles([]);
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
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-0 left-1/3 w-[600px] h-[300px] pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${GLOW} 0%, transparent 70%)` }} />

      <div className="relative flex h-screen">
        {/* Left panel — file upload + briefs list */}
        <div className="flex flex-col overflow-hidden transition-all duration-500"
          style={{ width: '400px', minWidth: '340px' }}>
          <div className="flex flex-col h-full px-5 py-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={onBack}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 transition-colors hover:bg-white/5">
                  ←
                </button>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                  style={{ background: BG, border: `1px solid ${ACCENT}30`, boxShadow: `0 0 16px ${GLOW}` }}>
                  📋
                </div>
                <div>
                  <div className="text-white font-semibold text-sm leading-none">Campaign Briefs</div>
                  <div className="text-white/30 text-xs mt-0.5">Upload & create with AI</div>
                </div>
              </div>
              <button onClick={onLogout}
                className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10">
                Sign out
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-4 shrink-0 rounded-xl p-1"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {(['chat', 'briefs'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex-1 text-xs font-medium py-2 rounded-lg transition-all capitalize"
                  style={{
                    background: tab === t ? BG : 'transparent',
                    color: tab === t ? ACCENT : 'rgba(255,255,255,0.4)',
                    border: tab === t ? `1px solid ${ACCENT}30` : '1px solid transparent',
                  }}>
                  {t === 'chat' ? '💬 Upload & Chat' : '📄 Existing Briefs'}
                </button>
              ))}
            </div>

            {/* Upload & Chat tab */}
            {tab === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* File upload dropzone */}
                <div
                  className="shrink-0 rounded-xl p-4 mb-4 cursor-pointer transition-all"
                  style={{
                    background: dragOver ? 'rgba(27,150,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `2px dashed ${dragOver ? ACCENT : 'rgba(255,255,255,0.08)'}`,
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS}
                    className="hidden"
                    onChange={(e) => e.target.files && processFiles(e.target.files)}
                  />
                  <div className="text-center">
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="spinner spinner-sm" />
                        <span className="text-xs text-white/50">Extracting content…</span>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl mb-1">📎</div>
                        <p className="text-xs text-white/40">
                          Drop files here or click to browse
                        </p>
                        <p className="text-xs text-white/20 mt-1">
                          PDF, Excel, CSV, Word, Images, Text
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {uploadError && (
                  <div className="shrink-0 mb-3 rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'rgba(186,5,23,0.08)', color: '#ff6b6b', border: '1px solid rgba(186,5,23,0.2)' }}>
                    {uploadError}
                  </div>
                )}

                {/* Attached files */}
                {files.length > 0 && (
                  <div className="shrink-0 mb-3">
                    <p className="text-xs text-white/30 mb-2 font-medium">
                      {files.length} file{files.length > 1 ? 's' : ''} attached — content will be sent with your next message
                    </p>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span className="text-sm">{getFileIcon(f.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/70 truncate">{f.name}</div>
                            <div className="text-xs text-white/25">
                              {f.error ? `⚠️ ${f.error}` : `${(f.size / 1024).toFixed(0)} KB · ${f.preview?.substring(0, 60) || 'Extracted'}…`}
                            </div>
                          </div>
                          <button onClick={() => removeFile(i)}
                            className="text-white/20 hover:text-white/50 text-xs">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested prompts for empty state */}
                {isEmpty && files.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                      style={{ background: BG, border: `1px solid ${ACCENT}40`, boxShadow: `0 0 30px ${GLOW}` }}>
                      📋
                    </div>
                    <h3 className="text-base font-bold text-white mb-1">Campaign Brief Agent</h3>
                    <p className="text-xs text-white/35 leading-relaxed mb-6 max-w-xs">
                      Upload briefing documents or describe your campaign idea. The agent will extract key details and create a Brief record.
                    </p>
                    <div className="w-full space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/20 mb-2">Try…</p>
                      {BRIEF_AGENT.suggestedPrompts?.map((prompt) => (
                        <button key={prompt}
                          onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                          className="w-full text-left text-xs px-3 py-2.5 rounded-xl text-white/45 hover:text-white/75 transition-all"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT + '50'; e.currentTarget.style.background = BG; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
                          "{prompt}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Briefs list tab */}
            {tab === 'briefs' && (
              <div className="flex-1 overflow-y-auto">
                {briefsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="spinner spinner-sm" />
                    <span className="text-xs text-white/40 ml-2">Loading briefs…</span>
                  </div>
                )}
                {briefsError && (
                  <div className="rounded-xl px-4 py-3 text-xs"
                    style={{ background: 'rgba(221,122,1,0.08)', color: '#dd7a01', border: '1px solid rgba(221,122,1,0.2)' }}>
                    {briefsError}
                  </div>
                )}
                {!briefsLoading && !briefsError && briefs.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-3">📭</div>
                    <p className="text-sm text-white/40">No briefs found</p>
                    <p className="text-xs text-white/20 mt-1">Use the chat to create your first campaign brief.</p>
                  </div>
                )}
                {!briefsLoading && briefs.length > 0 && (
                  <div className="space-y-2">
                    {briefs.map((b) => (
                      <div key={b.Id} className="rounded-xl px-4 py-3 transition-all hover:bg-white/[0.04]"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-white/80">{b.Name}</span>
                          {b.Priority && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: b.Priority === 'High' ? 'rgba(186,5,23,0.12)' : 'rgba(255,255,255,0.06)',
                                color: b.Priority === 'High' ? '#ff6b6b' : 'rgba(255,255,255,0.4)',
                                border: `1px solid ${b.Priority === 'High' ? 'rgba(186,5,23,0.2)' : 'rgba(255,255,255,0.08)'}`,
                              }}>
                              {b.Priority}
                            </span>
                          )}
                        </div>
                        {b.Description && (
                          <p className="text-xs text-white/35 line-clamp-2 mb-1">{b.Description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-white/20">
                          {b.PrimaryGoal && <span>🎯 {b.PrimaryGoal}</span>}
                          {b.TargetAudience && <span>👥 {b.TargetAudience}</span>}
                          <span className="ml-auto">{formatDate(b.CreatedDate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — Agent Chat */}
        <div className="flex-1 flex flex-col h-full glass-chat overflow-hidden relative">
          {/* Ambient glow */}
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${GLOW} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />

          {/* Header */}
          <div className="relative shrink-0 px-6 py-4 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: BG, border: `1px solid ${ACCENT}30` }}>
                {BRIEF_AGENT.icon}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white leading-tight">{BRIEF_AGENT.name}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isStreaming ? (
                    <><span className="spinner spinner-sm" /><span className="text-xs" style={{ color: ACCENT }}>Responding…</span></>
                  ) : isLoading ? (
                    <><span className="spinner spinner-sm" /><span className="text-xs text-white/40">Connecting…</span></>
                  ) : (
                    <><span className="live-dot" /><span className="text-xs text-white/30">Ready</span></>
                  )}
                </div>
              </div>
            </div>
            <button onClick={clearChat}
              className="text-xs text-white/30 hover:text-white/60 px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/15 transition-all">
              New chat
            </button>
          </div>

          {/* Messages */}
          <div className="relative flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Agent not found on this org */}
            {agentError && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 panel-animate">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-6"
                  style={{ background: 'rgba(220,90,20,0.12)', border: '1px solid rgba(220,90,20,0.3)' }}>
                  ⚠️
                </div>
                <h2 className="text-lg font-bold text-white mb-2">Agent Not Available</h2>
                <p className="text-sm text-white/45 max-w-sm leading-relaxed">{agentError}</p>
                <button onClick={onBack}
                  className="mt-4 text-xs px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white/80 hover:border-white/25 transition-all">
                  ← Back
                </button>
              </div>
            )}

            {isEmpty && !agentError && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 panel-animate">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
                    style={{ background: BG, border: `1px solid ${ACCENT}40`, boxShadow: `0 0 40px ${GLOW}` }}>
                    {BRIEF_AGENT.icon}
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{BRIEF_AGENT.name}</h2>
                <p className="text-sm text-white/35 max-w-sm leading-relaxed">
                  Upload a campaign brief document on the left, then describe your campaign. I'll extract the details and create a Brief record.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
            ))}

            {isStreaming && streamingText && (
              <MessageBubble role="agent" content={streamingText} streaming />
            )}

            {isLoading && !isStreaming && <ThinkingBubble />}

            {error && (
              <div className="glass rounded-xl px-4 py-3 text-sm border"
                style={{ background: 'rgba(220,90,20,0.08)', borderColor: 'rgba(220,90,20,0.25)', color: 'rgba(255,200,160,0.95)' }}>
                <div className="flex items-start gap-2">
                  <span className="text-lg shrink-0">⚠️</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white/90 mb-1">Agent unavailable</div>
                    <div className="text-white/60 leading-relaxed">{error}</div>
                    <button onClick={clearChat}
                      className="mt-2 text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
                      style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="relative shrink-0 px-4 py-4 border-t border-white/5">
            {/* File count badge */}
            {files.length > 0 && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: BG, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
                📎 {files.length} file{files.length > 1 ? 's' : ''} attached — will be sent with your next message
              </div>
            )}
            <div className="flex items-end gap-3 rounded-2xl px-4 py-3 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe your campaign or ask about briefs…"
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
                    ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`
                    : 'rgba(255,255,255,0.08)',
                }}>
                ↑
              </button>
            </div>
            <p className="text-center text-xs text-white/15 mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────── */

/** Render text with clickable URLs and basic **bold** formatting */
function renderRichText(text: string) {
  // Split on URLs (https:// or http://) and **bold** markers
  const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('http://') || part.startsWith('https://')) {
      // Clickable link — opens in new tab
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: '#60a5fa', textDecorationColor: '#60a5fa80' }}>
          {part.includes('/lightning/r/Brief/') ? '🔗 Open Brief in Salesforce' : part}
        </a>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MessageBubble({ role, content, streaming }: { role: 'user' | 'agent'; content: string; streaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 msg-animate ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5"
          style={{ background: BG, border: `1px solid ${ACCENT}30` }}>
          📋
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
          isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
        } ${streaming ? 'streaming-cursor' : ''}`}
        style={isUser ? {
          background: `linear-gradient(135deg, ${ACCENT}ee, ${ACCENT}99)`,
          color: '#fff',
        } : {
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.85)',
        }}>
        {isUser ? content : renderRichText(content)}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3 msg-animate">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        📋
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ animation: `pulse-dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return '📊';
  if (mimeType.includes('wordprocessingml')) return '📝';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'text/plain') return '📄';
  return '📎';
}
