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
 */
export async function createServerSession(agentDeveloperName: string): Promise<Session> {
  const res = await fetch(`/api/agents/${agentDeveloperName}/sessions`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create session: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return { sessionId: data.sessionId, agentId: agentDeveloperName };
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
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const event = JSON.parse(raw);
          const text =
            event?.data?.message?.content?.[0]?.text ??
            event?.message?.content?.[0]?.text        ??
            event?.text                               ??
            '';
          if (text) {
            fullText += text;
            onChunk(text);
          }
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
