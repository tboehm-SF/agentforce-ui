/**
 * Server-proxy variants of the Agentforce API calls.
 *
 * In "showcase mode" (VITE_SHOWCASE_MODE=true), the React app talks to
 * our Express backend instead of Salesforce directly. This keeps SF
 * credentials server-side and lets anyone visit the Heroku URL without
 * needing a Salesforce account.
 */

import type { Session } from '../types';

/**
 * Ask the server to create a new agent session.
 * @param agentId  18-char BotDefinition record ID (e.g. 0Xxg7000000C2KbCAK)
 */
export async function createServerSession(agentId: string): Promise<Session> {
  const res = await fetch(`/api/agents/${agentId}/sessions`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    // Parse JSON error from server (which has already translated SF HTML errors into readable messages)
    let msg = `Failed to create session (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // fall back to raw text, truncated to avoid HTML dumps in the UI
      const txt = await res.text().catch(() => '');
      if (txt) msg = txt.slice(0, 300);
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return { sessionId: data.sessionId, agentId };
}

/**
 * Ask the server to end a session.
 */
export async function deleteServerSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

/**
 * Stream a message via the Express server (server proxies to SF SSE stream).
 */
export async function sendServerMessageStreaming(
  sessionId: string,
  message: string,
  onChunk: (chunk: string) => void,
  onDone:  (fullText: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Message failed: ${res.status} — ${err}`);
    }

    const reader  = res.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer    = '';
    let fullText  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by double newlines; split on blank lines
      const events = buffer.split(/\n\n/);
      buffer = events.pop() ?? '';

      for (const eventBlock of events) {
        // Each event block has lines: "event: Type", "id: ...", "data: {...}"
        const dataLine = eventBlock.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const evt = JSON.parse(raw);
          const type = evt?.type;

          if (type === 'TextChunk') {
            // Incremental text chunk during streaming
            const chunk = evt?.message?.text ?? evt?.text ?? '';
            if (chunk) { fullText += chunk; onChunk(chunk); }
          } else if (type === 'Inform') {
            // Complete assembled message — use as final text if streaming produced nothing
            const text = evt?.message?.message ?? evt?.message?.text ?? '';
            if (text && !fullText) { fullText = text; onChunk(text); }
          }
          // ProgressIndicator and EndOfTurn are informational — no text to display
        } catch {
          // Non-JSON keepalive lines — skip
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
