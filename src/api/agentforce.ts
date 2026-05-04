import type { SalesforceConfig, Session } from '../types';

const AGENT_API_VERSION = 'v62.0';

/**
 * Create a new agent session. This must be called before sending messages.
 * Agentforce sessions are stateful — the sessionId binds all turns together.
 */
export async function createSession(
  config: SalesforceConfig,
  agentApiName: string
): Promise<Session> {
  const url = `${config.instanceUrl}/services/data/${AGENT_API_VERSION}/einstein/ai-agent/agents/${agentApiName}/sessions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'X-Org-Id': '', // filled at call site if needed
    },
    body: JSON.stringify({
      externalSessionKey: crypto.randomUUID(),
      instanceConfig: { endpoint: config.instanceUrl },
      streamingCapabilities: { chunkTypes: ['Text'] },
      bypassUser: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create session: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return { sessionId: data.sessionId, agentId: agentApiName };
}

/**
 * End an existing session. Always clean up sessions when done.
 */
export async function endSession(
  config: SalesforceConfig,
  agentApiName: string,
  sessionId: string
): Promise<void> {
  const url = `${config.instanceUrl}/services/data/${AGENT_API_VERSION}/einstein/ai-agent/agents/${agentApiName}/sessions/${sessionId}`;

  await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
}

/**
 * Send a message and stream the response using Server-Sent Events.
 * Calls `onChunk` for each text piece as it arrives.
 * Calls `onDone` when the full response is complete.
 */
export async function sendMessageStreaming(
  config: SalesforceConfig,
  agentApiName: string,
  sessionId: string,
  message: string,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  const url = `${config.instanceUrl}/services/data/${AGENT_API_VERSION}/einstein/ai-agent/agents/${agentApiName}/sessions/${sessionId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: { role: 'user', content: [{ type: 'text', text: message }] },
        variables: [],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Message failed: ${res.status} — ${err}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

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
          // Handle text chunks from Agentforce streaming
          const text =
            event?.data?.message?.content?.[0]?.text ??
            event?.message?.content?.[0]?.text ??
            event?.text ??
            '';
          if (text) {
            fullText += text;
            onChunk(text);
          }
        } catch {
          // Non-JSON lines (keep-alive pings etc.) are ignored
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
