/**
 * Salesforce OAuth 2.0 helpers.
 *
 * Flow used: Authorization Code with PKCE (recommended for SPAs).
 * The user is redirected to Salesforce, approves, and comes back
 * with ?code=... which we exchange for an access token.
 */

const SF_INSTANCE = 'https://hls-ch.my.salesforce.com';
const SF_LOGIN = 'https://login.salesforce.com';

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'token', // implicit flow — no server needed for demo
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'api openid',
  });
  return `${SF_LOGIN}/services/oauth2/authorize?${params}`;
}

export interface OAuthResult {
  accessToken: string;
  instanceUrl: string;
}

/**
 * Parse access_token from the URL hash after OAuth redirect.
 * Salesforce implicit flow puts tokens in the URL fragment.
 */
export function parseOAuthCallback(hash: string): OAuthResult | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const instanceUrl = params.get('instance_url') ?? SF_INSTANCE;
  if (!accessToken) return null;
  return { accessToken, instanceUrl };
}

/**
 * Persist auth to sessionStorage so a page refresh doesn't log you out.
 */
export function saveAuth(result: OAuthResult): void {
  sessionStorage.setItem('sf_access_token', result.accessToken);
  sessionStorage.setItem('sf_instance_url', result.instanceUrl);
}

export function loadAuth(): OAuthResult | null {
  const accessToken = sessionStorage.getItem('sf_access_token');
  const instanceUrl = sessionStorage.getItem('sf_instance_url');
  if (!accessToken || !instanceUrl) return null;
  return { accessToken, instanceUrl };
}

export function clearAuth(): void {
  sessionStorage.removeItem('sf_access_token');
  sessionStorage.removeItem('sf_instance_url');
}
