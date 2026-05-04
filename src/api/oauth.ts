/**
 * Auth API — Authorization Code flow (server-side token exchange).
 *
 * The browser never sees any tokens. The server handles:
 *   GET /auth/login       → redirects to Salesforce
 *   GET /auth/callback    → exchanges code for token, stores in session
 *   GET /api/auth/me      → returns user info from session (or 401)
 *   GET /api/auth/agents  → returns BotDefinition list using session token
 *   POST /api/auth/logout → destroys session
 */

import type { AuthState } from '../types';

/** Kick off login — navigate to the server's /auth/login endpoint. */
export function startLogin(): void {
  window.location.href = '/auth/login';
}

/**
 * Check if a server session exists.
 * Returns AuthState if logged in, null if not.
 */
export async function checkSession(): Promise<AuthState | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.authenticated) return null;
    return {
      accessToken: 'server-managed', // token never leaves server
      instanceUrl: data.instanceUrl,
      username:    data.username,
      displayName: data.displayName,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the list of BotDefinition agents via the server session.
 */
export async function fetchOrgAgents(): Promise<Array<{
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
}>> {
  const res = await fetch('/api/auth/agents', { credentials: 'include' });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch agents: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data.agents ?? [];
}

/** Log out and destroy the server session. */
export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
