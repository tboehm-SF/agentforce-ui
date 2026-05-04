/**
 * Salesforce OAuth 2.0 — User-Agent (Implicit) flow.
 *
 * We use implicit because:
 * - No backend exchange step required for the login phase
 * - The user's token is only used for identity + agent discovery
 * - Actual chat calls go through the server's client-credentials token
 *
 * Connected App: "Agentforce UI" (AgentforceUI)
 * Consumer Key:  3MVG9FofAY6PhRtG_wK6evWxsvd255jT6tc13saSSIDE9ONH58WQzf7BOVKAe.jvJqjIFh07LaQ==
 */

import type { AuthState } from '../types';

// Use the My Domain URL so SF doesn't redirect mid-flow
const SF_INSTANCE_URL = 'https://storm-969c7ac7dcf66b.my.salesforce.com';
const CLIENT_ID       = '3MVG9FofAY6PhRtG_wK6evWxsvd255jT6tc13saSSIDE9ONH58WQzf7BOVKAe.jvJqjIFh07LaQ==';

/** Build the Salesforce authorization URL using the org's My Domain. */
export function buildAuthUrl(): string {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const params = new URLSearchParams({
    response_type: 'token',
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    scope:         'api openid',
    prompt:        'login',
  });
  return `${SF_INSTANCE_URL}/services/oauth2/authorize?${params}`;
}

/** Parse access_token from the URL hash after OAuth redirect. */
export function parseOAuthCallback(hash: string): AuthState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const instanceUrl = params.get('instance_url');
  if (!accessToken || !instanceUrl) return null;
  return { accessToken, instanceUrl };
}

/** Fetch the logged-in user's identity info using their token. */
export async function fetchIdentity(auth: AuthState): Promise<AuthState> {
  const res = await fetch(`${auth.instanceUrl}/services/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!res.ok) return auth;
  const data = await res.json();
  return {
    ...auth,
    username:    data.preferred_username ?? data.email ?? '',
    displayName: data.name               ?? '',
    orgName:     data.organization_id    ?? '',
  };
}

/**
 * Fetch all active BotDefinitions from the org using the user's token.
 * Returns raw [{Id, DeveloperName, MasterLabel}] records.
 */
export async function fetchOrgAgents(auth: AuthState): Promise<Array<{
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
}>> {
  const url = `${auth.instanceUrl}/services/data/v62.0/query?q=` +
    encodeURIComponent('SELECT Id, DeveloperName, MasterLabel FROM BotDefinition ORDER BY MasterLabel');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch agents: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.records ?? [];
}

const AUTH_KEY = 'sf_auth';

export function saveAuth(auth: AuthState): void {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function loadAuth(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem('sf_pinned_agents');
}
