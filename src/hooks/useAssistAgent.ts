import { useEffect, useState } from 'react';
import type { Agent } from '../types';

/**
 * Resolve a marketing agent's BotDefinition record ID by DeveloperName.
 * Used by workspaces that embed an AiAssistBar — the bar needs the
 * 18-char record ID to open an Agent Runtime API v1 session.
 */
export function useAssistAgent(
  developerName: string,
  fallback: Omit<Agent, 'id'>,
): Agent | null {
  const [agent, setAgent] = useState<Agent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/campaigns/agents', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(r.statusText)))
      .then((data: { agents: Array<{ Id: string; DeveloperName: string; MasterLabel: string }> }) => {
        if (cancelled) return;
        const hit = data.agents.find((a) => a.DeveloperName === developerName);
        if (hit) {
          setAgent({ ...fallback, id: hit.Id, developerName, name: hit.MasterLabel });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [developerName, fallback]);

  return agent;
}
