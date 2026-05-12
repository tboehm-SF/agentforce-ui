import express from 'express';
import cookieSession from 'cookie-session';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// ─── Salesforce config ────────────────────────────────────────────────────────
const SF_BASE_URL      = process.env.SF_BASE_URL      || 'https://storm-969c7ac7dcf66b.my.salesforce.com';
// AgentforceUIv3 Connected App — fresh app created 2026-05-12 to fix
// OAUTH_APPROVAL_ERROR_GENERIC caused by stale OauthToken records on v1/v2.
// PKCE-only (no client secret), scopes: api, chatbot_api, sfap_api.
const SF_CLIENT_ID = '3MVG9FofAY6PhRtG_wK6evWxsvT2V6bdd37LMLMauFQT1qVCeaF36n8WfCHFGOmShYxG6p51ZZfsnoZuBy44D';
const SF_API_VERSION   = process.env.SF_API_VERSION   || 'v62.0';
const SESSION_SECRET   = process.env.SESSION_SECRET   || 'agentforce-dev-secret-change-in-prod';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.set('trust proxy', 1); // Required behind Heroku's proxy for secure cookies

// Stateless cookie-based session — encrypted+signed payload lives in the
// browser's cookie itself, no server-side store. Survives dyno restarts,
// scales to N dynos, requires zero infrastructure.
app.use(cookieSession({
  name:     'agentforce_sess',
  keys:     [SESSION_SECRET],
  maxAge:   365 * 24 * 60 * 60 * 1000, // 365 days
  secure:   isProd,
  httpOnly: true,
  // 'none' is required because:
  //   1. herokuapp.com is on the Public Suffix List (each <app>.herokuapp.com
  //      is its own eTLD+1), so cookie-jar isolation is strict.
  //   2. The OAuth flow redirects salesforce.com → herokuapp.com — Safari ITP
  //      and Firefox strict mode treat this as cross-site. With sameSite=lax
  //      the cookie can drop on the redirect from SF.
  // 'none' + secure + httpOnly + signed = safe.
  sameSite: isProd ? 'none' : 'lax',
  path:     '/',
}));

// cookie-session writes the cookie synchronously during res.writeHead(),
// so there is no async save() to call. Express-session's req.session.save()
// is intentionally NOT shimmed here — adding a function property to the
// session object would make cookie-session see the session as 'changed'
// before any real data was set, which can cause subtle write-ordering
// bugs. Just modify req.session.* and call res.redirect() / res.json().

// ─── OAuth: Authorization Code + PKCE flow (no client secret needed) ─────────

/** Base64url-encode a buffer (no padding, url-safe) */
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper — build the public-facing URL behind Heroku's HTTPS proxy.
// Heroku terminates TLS at the load balancer, so req.protocol inside the
// dyno is 'http'. trust proxy + X-Forwarded-Proto fixes that, but we also
// belt-and-braces force https in production explicitly.
function publicBaseUrl(req) {
  const proto = isProd ? 'https' : (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  return `${proto}://${req.get('host')}`;
}

// Force-clear all session cookies and start a fresh login. Useful when the
// client has a stale cookie that the OAuth flow can't overwrite.
app.get('/auth/reset', (req, res) => {
  // Aggressively expire any cookies the browser might have for our session.
  for (const name of ['agentforce_sess', 'agentforce_sess.sig']) {
    res.clearCookie(name, { path: '/', secure: isProd, sameSite: isProd ? 'none' : 'lax', httpOnly: true });
    res.cookie(name, '', { path: '/', expires: new Date(0), secure: isProd, sameSite: isProd ? 'none' : 'lax', httpOnly: true });
  }
  // Then nuke any in-flight session and start fresh
  req.session = null;
  res.redirect('/auth/login');
});

// Step 1: Generate PKCE verifier+challenge, store in session, redirect to SF
app.get('/auth/login', (req, res) => {
  const codeVerifier  = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  // Store verifier in session so callback can use it
  req.session.pkce = codeVerifier;

  const redirectUri = `${publicBaseUrl(req)}/auth/callback`;
  const params = new URLSearchParams({
    response_type:          'code',
    client_id:              SF_CLIENT_ID,
    redirect_uri:           redirectUri,
    // sfap_api enables /agentforce/bootstrap/nameduser to issue a JWT for
    // the Agent Runtime API.
    // DO NOT add refresh_token scope — this org accumulates stale
    // OauthToken records that cause OAUTH_APPROVAL_ERROR_GENERIC when
    // refresh_token is requested. Without it, the access token expires
    // after ~2h; the exchangeForAgentJwt() function detects the HTML
    // login redirect and surfaces a "sign back in" message.
    scope:                  'api chatbot_api sfap_api',
    code_challenge:         codeChallenge,
    code_challenge_method:  'S256',
  });
  // cookie-session writes synchronously during res.writeHead() — no
  // explicit save needed. The PKCE verifier we just put on req.session
  // will be encoded into the Set-Cookie header before this redirect ships.
  res.redirect(`${SF_BASE_URL}/services/oauth2/authorize?${params}`);
});

// Step 2: SF sends ?code=... back — exchange using PKCE verifier (no secret)
app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('[auth/callback] SF error:', error, error_description);
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect('/?auth_error=no_code');
  }

  const codeVerifier = req.session.pkce;
  if (!codeVerifier) {
    console.error('[auth/callback] no PKCE verifier in session');
    return res.redirect('/?auth_error=session_missing_pkce');
  }
  delete req.session.pkce;

  try {
    const redirectUri = `${publicBaseUrl(req)}/auth/callback`;
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     SF_CLIENT_ID,
      redirect_uri:  redirectUri,
      code:          code,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(`${SF_BASE_URL}/services/oauth2/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[auth/callback] token exchange failed:', err);
      let friendlyErr = 'Token exchange failed';
      try { const j = JSON.parse(err); friendlyErr = j.error_description || j.error || friendlyErr; } catch {}
      return res.redirect(`/?auth_error=${encodeURIComponent(friendlyErr)}`);
    }

    const tokenData = await tokenRes.json();

    // Fetch user identity from the identity URL in the token response
    const idRes = await fetch(tokenData.id, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const identity = idRes.ok ? await idRes.json() : {};

    // Store everything in the server-side session (tokens never reach the browser)
    // api_instance_url is the correct base for the Agentforce Agent Runtime API
    req.session.auth = {
      accessToken:    tokenData.access_token,
      refreshToken:   tokenData.refresh_token, // null if scope didn't include refresh_token
      issuedAt:       Date.now(),
      instanceUrl:    tokenData.instance_url || SF_BASE_URL,
      apiInstanceUrl: tokenData.api_instance_url || tokenData.instance_url || SF_BASE_URL,
      username:       identity.preferred_username || identity.email || '',
      displayName:    identity.name || '',
    };

    // Diagnostic: log the cookie size we're about to send. cookie-session
    // serializes JSON → base64 → cookies.set, and browsers cap individual
    // cookies at ~4096 bytes. If the access token is unusually long, the
    // cookie can exceed this and silently get dropped by the browser.
    const sessSize = Buffer.byteLength(JSON.stringify(req.session));
    console.log('[auth/callback] session stored for', req.session.auth.username,
                '— payload size:', sessSize, 'bytes (token len:', tokenData.access_token.length, ')');

    if (sessSize > 3500) {
      console.warn('[auth/callback] WARNING: session payload near 4KB cookie limit — browser may drop it.');
    }

    // cookie-session writes synchronously during res.writeHead(). No save() needed.
    res.redirect('/?auth=ok');
  } catch (e) {
    console.error('[auth/callback] exception:', e.message);
    res.redirect(`/?auth_error=${encodeURIComponent(e.message)}`);
  }
});

// Refresh the SF access token using the refresh_token grant. Mutates
// req.session.auth in place. Returns true on success, false on failure.
async function refreshSfAccessToken(req) {
  const auth = req.session?.auth;
  if (!auth?.refreshToken) return false;
  try {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     SF_CLIENT_ID,
      refresh_token: auth.refreshToken,
    });
    const r = await fetch(`${SF_BASE_URL}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!r.ok) {
      console.error('[refresh] failed:', r.status, (await r.text()).slice(0, 200));
      return false;
    }
    const td = await r.json();
    auth.accessToken = td.access_token;
    auth.issuedAt    = Date.now();
    if (td.instance_url)     auth.instanceUrl    = td.instance_url;
    if (td.api_instance_url) auth.apiInstanceUrl = td.api_instance_url;
    console.log('[refresh] new access token for', auth.username);
    return true;
  } catch (e) {
    console.error('[refresh] exception:', e.message);
    return false;
  }
}

/**
 * Wrapper around fetch() that auto-retries once on 401 by refreshing the
 * SF access token. Use this for ANY call to instanceUrl that uses the
 * Bearer access token from the session.
 *
 * Usage:
 *   const r = await sfFetch(req, url, { headers: { Accept: 'application/json' } });
 */
async function sfFetch(req, url, init = {}) {
  const auth = req.session?.auth;
  if (!auth?.accessToken) {
    return new Response(JSON.stringify({ error: 'No session' }), { status: 401 });
  }
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${auth.accessToken}` };
  let r = await fetch(url, { ...init, headers });
  if (r.status === 401 && auth.refreshToken) {
    console.log('[sfFetch] 401 on', url.slice(0, 80), '— attempting token refresh');
    const ok = await refreshSfAccessToken(req);
    if (ok) {
      const headers2 = { ...(init.headers || {}), Authorization: `Bearer ${auth.accessToken}` };
      r = await fetch(url, { ...init, headers: headers2 });
    }
  }
  return r;
}

// Step 3: React app asks "am I logged in?" — returns user info (no token)
app.get('/api/auth/me', (req, res) => {
  if (!req.session.auth) return res.status(401).json({ authenticated: false });
  const { username, displayName, instanceUrl } = req.session.auth;
  res.json({ authenticated: true, username, displayName, instanceUrl });
});

// Diagnostic — returns whether each downstream API is reachable with the
// current session. Helps debug "I get logged in but nothing loads" issues.
// Auth-optional: returns session state info even when not signed in so we
// can distinguish "no session" from "session exists but APIs fail".
app.get('/api/auth/diagnose', async (req, res) => {
  // Decode the cookie payload manually so we can see what's actually inside
  // (cookie-session uses base64-encoded JSON, no encryption — only signed).
  let decodedSession = null;
  try {
    const m = (req.headers.cookie || '').match(/agentforce_sess=([^;]+)/);
    if (m) {
      const decoded = Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8');
      decodedSession = JSON.parse(decoded);
      // Truncate accessToken for safety in the diagnostic output
      if (decodedSession?.auth?.accessToken) {
        decodedSession.auth.accessToken = decodedSession.auth.accessToken.slice(0, 25) + '… (' + decodedSession.auth.accessToken.length + ' chars)';
      }
    }
  } catch (e) {
    decodedSession = { decodeError: e.message };
  }

  const sessionInfo = {
    sessionExists:    !!req.session,
    authPresent:      !!req.session?.auth,
    storeType:        'cookie (stateless, signed)',
    cookieMaxAgeDays: 365,
    cookieSameSite:   isProd ? 'none' : 'lax',
    cookieSecure:     isProd,
    nodeEnv:          process.env.NODE_ENV,
    headerXFwdProto:  req.headers['x-forwarded-proto'],
    reqProtocol:      req.protocol,
    host:             req.get('host'),
    cookieReceived:   !!(req.headers.cookie && req.headers.cookie.includes('agentforce_sess')),
    rawCookieHeader:  (req.headers.cookie || '(none)').slice(0, 250),
    cookieKeysInPayload: decodedSession && typeof decodedSession === 'object' ? Object.keys(decodedSession) : [],
    decodedSession,
    userAgentHint:    (req.headers['user-agent'] || '').slice(0, 100),
  };

  if (!req.session?.auth) {
    return res.status(200).json({
      ok: false,
      reason: 'No active session — log in first.',
      sessionInfo,
      hint:
        'Open https://martech-headless360-03addb2cdc06.herokuapp.com/ in the same browser tab, ' +
        'click Sign in, complete OAuth, then come back to /api/auth/diagnose.',
    });
  }

  const { accessToken, instanceUrl, username } = req.session.auth;
  const results = {};
  results.session = { ...sessionInfo, username, instanceUrl, accessTokenPrefix: accessToken.slice(0, 30) + '…' };

  async function probe(label, url, init = {}) {
    try {
      const r = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
      });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
      results[label] = {
        status: r.status,
        ok:     r.ok,
        body:   typeof body === 'object' ? JSON.stringify(body).slice(0, 300) : body,
      };
    } catch (e) {
      results[label] = { error: e.message };
    }
  }

  // Identify token scopes via SF userinfo
  await probe('userinfo', `${instanceUrl}/services/oauth2/userinfo`);
  // Test segments
  await probe('segments_list', `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments?offset=0&batchSize=1`);
  await probe('campaign_query', `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent('SELECT Id FROM Campaign LIMIT 1')}`);
  await probe('cms_query', `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent("SELECT Id FROM ManagedContent WHERE AuthoredManagedContentSpaceId='" + (process.env.CMS_WORKSPACE_ID || '0Zug7000000GnsoCAC') + "' LIMIT 1")}`);
  // Test JWT exchange (uses Cookie auth, NOT Bearer)
  try {
    const r = await fetch(`${instanceUrl}/agentforce/bootstrap/nameduser`, {
      headers: { Cookie: `sid=${accessToken}` },
      redirect: 'manual',
    });
    const ct = r.headers.get('content-type') || '';
    const text = await r.text();
    results.jwt_bootstrap = {
      status: r.status,
      contentType: ct,
      isJson: ct.includes('application/json'),
      preview: text.slice(0, 100),
    };
  } catch (e) {
    results.jwt_bootstrap = { error: e.message };
  }

  res.json({ instanceUrl, results });
});

// Step 4: Fetch org agents using the session token — include Id (record ID needed for Agent API)
// CRITICAL: Only AgentforceServiceAgent types work with /einstein/ai-agent/v1/.
// Legacy EinsteinServiceAgent / MyDomainChatbot / ExternalCopilot return HTML 404s.
app.get('/api/auth/agents', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { instanceUrl } = req.session.auth;
    const queryWithType =
      "SELECT Id, DeveloperName, MasterLabel, Type FROM BotDefinition " +
      "WHERE IsDeleted = FALSE ORDER BY MasterLabel";
    const queryNoType =
      "SELECT Id, DeveloperName, MasterLabel FROM BotDefinition ORDER BY MasterLabel";

    async function runQuery(q) {
      const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q)}`;
      return sfFetch(req, url);
    }

    let sfRes = await runQuery(queryWithType);
    if (!sfRes.ok) sfRes = await runQuery(queryNoType);

    if (!sfRes.ok) {
      const errText = await sfRes.text();
      console.error('[/api/auth/agents]', sfRes.status, errText.slice(0, 300));
      return res.status(sfRes.status).json({
        error: `Couldn't load agents (${sfRes.status}). Sign in again to refresh your session.`,
        details: errText.slice(0, 200),
      });
    }
    const data = await sfRes.json();
    res.json({ agents: data.records ?? [] });
  } catch (e) {
    console.error('[/api/auth/agents]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  // cookie-session: clear by assigning null
  req.session = null;
  res.json({ ok: true });
});

// ─── Segments API ─────────────────────────────────────────────────────────────

app.get('/api/segments', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { instanceUrl } = req.session.auth;
  try {
    const page     = parseInt(req.query.page  || '0', 10);
    const pageSize = parseInt(req.query.pageSize || '25', 10);
    const url = `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments?offset=${page * pageSize}&batchSize=${pageSize}`;
    const sfRes = await sfFetch(req, url);
    if (!sfRes.ok) {
      const errText = await sfRes.text();
      console.error('[/api/segments] SF error:', sfRes.status, errText.slice(0, 400));
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = Array.isArray(parsed) ? parsed[0]?.message || parsed[0]?.errorCode || errText : (parsed.message || parsed.error || errText);
      } catch { /* keep raw */ }
      return res.status(sfRes.status).json({
        error: `Couldn't load segments (${sfRes.status}): ${String(errMsg).slice(0, 300)}`,
        hint: sfRes.status === 403 ? 'User may need cdp_api / cdp_profile_api OAuth scope or Data Cloud admin perm set.' : undefined,
      });
    }
    const data = await sfRes.json();
    res.json({ segments: data.segments ?? [], totalSize: data.totalSize ?? data.count ?? 0 });
  } catch (e) {
    console.error('[/api/segments]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Detail lookup — path param is the segment's apiName (NOT marketSegmentId).
// Returns the segment definition + criteria + a small sample of member records.
app.get('/api/segments/:apiName', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { instanceUrl } = req.session.auth;
  const { apiName } = req.params;

  try {
    // Fetch definition + members in parallel — both go through sfFetch
    // so a single token refresh covers both calls
    const [defRes, memRes] = await Promise.all([
      sfFetch(req, `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments/${apiName}`),
      sfFetch(req, `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments/${apiName}/members?limit=5`),
    ]);

    if (!defRes.ok) {
      const errText = await defRes.text();
      console.error('[/api/segments/:apiName] SF error:', defRes.status, errText.slice(0, 400));
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = Array.isArray(parsed) ? parsed[0]?.message || parsed[0]?.errorCode || errText : (parsed.message || parsed.error || errText);
      } catch { /* keep raw */ }
      return res.status(defRes.status).json({ error: `Detail failed (${defRes.status}): ${String(errMsg).slice(0, 300)}` });
    }
    const defBody = await defRes.json();
    // /ssot/segments/{apiName} returns { segments: [...] } with one entry
    const segment = defBody.segments?.[0] || defBody;

    // Parse includeCriteria if it's a stringified JSON blob
    let parsedCriteria = null;
    if (typeof segment.includeCriteria === 'string') {
      try { parsedCriteria = JSON.parse(segment.includeCriteria); } catch { /* keep as raw string */ }
    }

    // Members: best-effort — may 403 if not published
    let memberSample = [];
    let memberCount  = null;
    if (memRes.ok) {
      const m = await memRes.json();
      memberSample = m.data ?? m.members ?? [];
      memberCount  = m.totalSize ?? m.totalCount ?? null;
    }

    res.json({
      segment: { ...segment, parsedCriteria },
      memberSample,
      memberCount,
    });
  } catch (e) {
    console.error('[segment detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Segment Member Profile Resolution ──────────────────────────────────────
// Resolves segment members from hash IDs to full unified profiles.
// Steps:
//   1. Discover the org-specific SMH (Segment Membership History) table name
//   2. Query members of a specific segment via Segment_Id__c
//   3. Resolve unified individual IDs to full profile data (name, email, etc.)
// Uses the Data Cloud queryv2 REST endpoint (POST /ssot/query with SQL).

let smhTableCache = null; // { name, discoveredAt }

/** POST to /ssot/query with a SQL string, return parsed response. */
async function dcQuery(req, sql) {
  const { instanceUrl } = req.session.auth;
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/query`;
  const r = await sfFetch(req, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Data Cloud query failed (${r.status}): ${errText.slice(0, 300)}`);
  }
  return r.json();
}

/** Discover the SMH table name by querying DataSourceObject for tables containing "SMH". */
async function discoverSmhTable(req) {
  if (smhTableCache && Date.now() - smhTableCache.discoveredAt < 30 * 60 * 1000) {
    return smhTableCache.name;
  }
  const result = await dcQuery(req,
    "SELECT DataSourceObject__dlm.ssot__Name__c FROM DataSourceObject__dlm WHERE DataSourceObject__dlm.ssot__Name__c LIKE '%SMH%'"
  );
  const rows = result.data || [];
  if (rows.length === 0) throw new Error('No segment membership history (SMH) table found. Ensure segments are published.');
  // Prefer Individual-based SMH tables
  const names = rows.map(r => Array.isArray(r) ? r[0] : r?.ssot__Name__c || r);
  const indivTable = names.find(n => typeof n === 'string' && n.toLowerCase().includes('individual'));
  const tableName = indivTable || names[0];
  smhTableCache = { name: tableName, discoveredAt: Date.now() };
  console.log('[smh-discovery] Found SMH table:', tableName);
  return tableName;
}

// GET /api/segments/:apiName/profiles — resolve segment members to full profiles
app.get('/api/segments/:apiName/profiles', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { instanceUrl } = req.session.auth;
  const { apiName } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    // 1. Get the MarketSegment record ID from the apiName
    const segQ = `SELECT Id, Name FROM MarketSegment WHERE ApiName = '${apiName.replace(/'/g, "''")}' LIMIT 1`;
    const segUrl = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(segQ)}`;
    const segRes = await sfFetch(req, segUrl);
    if (!segRes.ok) {
      const e = await segRes.text();
      return res.status(segRes.status).json({ error: `MarketSegment lookup failed: ${e.slice(0, 200)}` });
    }
    const segData = await segRes.json();
    if (!segData.records || segData.records.length === 0) {
      return res.status(404).json({ error: `Segment "${apiName}" not found in MarketSegment` });
    }
    const segmentId = segData.records[0].Id;
    const segmentName = segData.records[0].Name;
    // SF IDs in SMH are 15-char
    const segmentId15 = segmentId.substring(0, 15);

    // 2. Discover the SMH table name
    const smhTable = await discoverSmhTable(req);

    // 3. Query segment members — deduplicated by unified individual ID
    const memberSql =
      `SELECT Id__c, MAX(Timestamp__c) as LatestTimestamp ` +
      `FROM ${smhTable} ` +
      `WHERE Segment_Id__c = '${segmentId15}' ` +
      `GROUP BY Id__c ` +
      `LIMIT ${limit}`;
    const memberResult = await dcQuery(req, memberSql);
    const memberRows = memberResult.data || [];

    if (memberRows.length === 0) {
      return res.json({
        segmentName,
        segmentId,
        profiles: [],
        count: 0,
        message: 'No members found. Segment may not be published yet.',
      });
    }

    // Extract unified individual IDs from positional arrays
    // queryv2 returns either positional arrays or objects depending on API version
    const unifiedIds = memberRows.map(r => Array.isArray(r) ? r[0] : r?.Id__c || r?.id__c || Object.values(r)[0]);
    const validIds = unifiedIds.filter(id => id && typeof id === 'string');

    if (validIds.length === 0) {
      return res.json({ segmentName, segmentId, profiles: [], count: 0, message: 'Could not parse member IDs.' });
    }

    // 4. Resolve unified IDs to full profiles from ssot__Individual__dlm
    const idList = validIds.map(id => `'${id}'`).join(',');
    const profileSql =
      `SELECT ssot__Id__c, ssot__FirstName__c, ssot__LastName__c, ` +
      `ssot__DataSourceId__c ` +
      `FROM ssot__Individual__dlm ` +
      `WHERE ssot__Id__c IN (${idList})`;
    let profiles = [];
    try {
      const profileResult = await dcQuery(req, profileSql);
      const profileRows = profileResult.data || [];
      // Parse metadata to map column positions to field names
      const meta = profileResult.metadata || {};
      const columns = Object.keys(meta);

      profiles = profileRows.map(row => {
        if (Array.isArray(row)) {
          const obj = {};
          columns.forEach((col, i) => { obj[col] = row[i]; });
          return obj;
        }
        return row;
      });
    } catch (profileErr) {
      console.warn('[profiles] Could not resolve profiles:', profileErr.message);
      // Return members without profile enrichment
      profiles = validIds.map(id => ({ ssot__Id__c: id }));
    }

    // 5. Try to enrich with email from ContactPointEmail
    try {
      const emailSql =
        `SELECT ssot__PartyId__c, ssot__EmailAddress__c ` +
        `FROM ssot__ContactPointEmail__dlm ` +
        `WHERE ssot__PartyId__c IN (${idList})`;
      const emailResult = await dcQuery(req, emailSql);
      const emailRows = emailResult.data || [];
      const emailMeta = Object.keys(emailResult.metadata || {});
      const emailMap = {};
      for (const row of emailRows) {
        const partyId = Array.isArray(row) ? row[emailMeta.indexOf('ssot__PartyId__c')] || row[0] : row?.ssot__PartyId__c;
        const email = Array.isArray(row) ? row[emailMeta.indexOf('ssot__EmailAddress__c')] || row[1] : row?.ssot__EmailAddress__c;
        if (partyId && email) emailMap[partyId] = email;
      }
      // Merge emails into profiles
      for (const p of profiles) {
        const id = p.ssot__Id__c || p['ssot__Id__c'];
        if (id && emailMap[id]) p.email = emailMap[id];
      }
    } catch { /* email enrichment is best-effort */ }

    res.json({
      segmentName,
      segmentId,
      profiles,
      count: profiles.length,
      totalMembers: memberRows.length,
    });
  } catch (e) {
    console.error('[segment profiles]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── AI Segment Builder ──────────────────────────────────────────────────────
// Two-step workflow:
//   POST /api/segments/plan   → LLM drafts a segment spec from NL input (preview)
//   POST /api/segments/create → creates the segment using a previously approved plan
//
// The LLM only outputs a high-level spec (field, operator, value). We synthesize
// the full SF includeCriteria JSON server-side from a template to avoid LLM
// hallucination of SF schema details.

const SEGMENT_DMO = 'UnifiedIndividual__dlm';

/** Fetch the DMO field list (cached for 5min). */
let dmoFieldCache = null;
async function getUnifiedIndividualFields(accessToken, instanceUrl) {
  if (dmoFieldCache && Date.now() - dmoFieldCache.at < 5 * 60 * 1000) return dmoFieldCache.fields;
  const r = await fetch(
    `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/data-model-objects/${SEGMENT_DMO}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!r.ok) throw new Error(`Failed to load DMO schema: ${r.status}`);
  const data = await r.json();
  const fields = (data.fields || []).map((f) => ({ name: f.name, type: f.type, label: f.label }));
  dmoFieldCache = { at: Date.now(), fields };
  return fields;
}

/** Map a friendly operator to SF's enum form. */
function toSfOperator(op, fieldType) {
  const o = String(op).toLowerCase().trim();
  if (['equals', '=', 'is'].includes(o))               return 'equal to';
  if (['not equals', '!=', 'is not'].includes(o))      return 'not equal to';
  if (o === 'contains')                                 return 'contains';
  if (['greater than', '>'].includes(o))                return 'greater than';
  if (['less than', '<'].includes(o))                   return 'less than';
  if (['greater or equal', '>='].includes(o))           return 'greater than or equal';
  if (['less or equal', '<='].includes(o))              return 'less than or equal';
  if (o === 'before')                                   return 'less than';
  if (o === 'after')                                    return 'greater than';
  if (o === 'in')                                       return 'in';
  // Default: equal to
  return 'equal to';
}

function buildIncludeCriteria(filters, dmoFields) {
  const fieldMap = Object.fromEntries(dmoFields.map((f) => [f.name, f]));
  const comparisons = filters.map((f) => {
    const fieldMeta = fieldMap[f.field];
    if (!fieldMeta) throw new Error(`Unknown field: ${f.field}`);
    const type        = fieldMeta.type || 'Text';
    const isNumber    = type === 'Number';
    const isDate      = type === 'DateTime' || type === 'Date';
    const compType    = isNumber ? 'NumberComparison' : isDate ? 'DateTimeComparison' : 'TextComparison';
    const dataType    = isNumber ? 'NUMBER' : isDate ? 'DATE_TIME' : 'TEXT';
    return {
      type: compType,
      path: null,
      joinPath: null,
      subject: { objectApiName: SEGMENT_DMO, fieldApiName: f.field },
      selfReference: false,
      operator: toSfOperator(f.operator, type),
      businessTypeArgument: null,
      subjectFieldDataType: dataType,
      subjectFieldBusinessType: dataType,
      subjectFieldSourceType: 'DIRECT',
      value: isNumber ? Number(f.value) : f.value,
    };
  });
  return {
    filter: {
      type: 'LogicalComparison',
      operator: 'and',
      filters: comparisons,
    },
    containerObjectApiName: SEGMENT_DMO,
    path: [],
    joinPath: [],
  };
}

/** Call the Einstein LLM Gateway on api.salesforce.com. */
async function callEinsteinLlm(jwt, prompt) {
  const r = await fetch(
    'https://api.salesforce.com/einstein/platform/v1/models/sfdc_ai__DefaultGPT4Omni/generations',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'x-client-feature-id': 'EinsteinGptForDevelopers',
      },
      body: JSON.stringify({ prompt }),
    }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`LLM request failed (${r.status}): ${err.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.generation?.generatedText || '';
}

app.post('/api/segments/plan', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  const { description } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: 'Missing description' });

  try {
    const fields = await getUnifiedIndividualFields(accessToken, instanceUrl);
    const jwt    = await exchangeForAgentJwt(req, instanceUrl, accessToken);

    const fieldList = fields
      .map((f) => `  ${f.name} (${f.type}) — ${f.label}`)
      .join('\n');

    const prompt =
      'You are a segment builder for Salesforce Data Cloud. The target object is ' +
      `${SEGMENT_DMO} which has these fields:\n${fieldList}\n\n` +
      'Given the natural-language description below, output ONLY a JSON object (no markdown ' +
      'fences, no commentary) with this exact shape:\n' +
      '{\n' +
      '  "name": "<snake_case API name, max 30 chars, ASCII only>",\n' +
      '  "displayName": "<Title Case display name, max 60 chars>",\n' +
      '  "description": "<one-line summary>",\n' +
      '  "filters": [\n' +
      '    {"field": "<field api name from list>", "operator": "<equals|not equals|contains|greater than|less than|before|after>", "value": "<string>"}\n' +
      '  ]\n' +
      '}\n\n' +
      `Description: ${description}`;

    const raw = await callEinsteinLlm(jwt, prompt);
    // Strip markdown fences if any
    const cleaned = raw.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let plan;
    try { plan = JSON.parse(cleaned); }
    catch {
      return res.status(422).json({ error: 'LLM did not return valid JSON', raw });
    }
    // Validate fields exist
    const validFieldNames = new Set(fields.map((f) => f.name));
    const unknownFields = (plan.filters || [])
      .map((f) => f.field).filter((f) => !validFieldNames.has(f));
    if (unknownFields.length) {
      return res.status(422).json({
        error: `LLM referenced unknown field(s): ${unknownFields.join(', ')}. Try rephrasing.`,
        raw,
      });
    }
    res.json({ plan, fields: fields.slice(0, 20) });
  } catch (e) {
    console.error('[segment plan]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/segments/create', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  const { plan } = req.body || {};
  if (!plan?.name || !Array.isArray(plan.filters) || !plan.filters.length) {
    return res.status(400).json({ error: 'Missing plan or filters' });
  }

  try {
    const fields = await getUnifiedIndividualFields(accessToken, instanceUrl);
    const includeCriteria = buildIncludeCriteria(plan.filters, fields);

    // Truncate/sanitize name to meet SF constraints
    const apiName = String(plan.name).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 30);

    const body = {
      displayName: plan.displayName || apiName.replace(/_/g, ' '),
      apiName,
      description: plan.description || '',
      dataSpaceName: 'default',
      includeCriteria: JSON.stringify(includeCriteria),
      segmentOnObjectApiName: SEGMENT_DMO,
      publishSchedule: { interval: 'NONE' },
    };

    const r = await fetch(
      `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments`,
      {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const respText = await r.text();
    if (!r.ok) {
      console.error('[segment create] SF error:', r.status, respText.slice(0, 500));
      return res.status(r.status).json({ error: `Create failed (${r.status}): ${respText.slice(0, 400)}` });
    }
    let created;
    try { created = JSON.parse(respText); } catch { created = { raw: respText }; }
    res.json({ segment: created });
  } catch (e) {
    console.error('[segment create]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Campaigns API (via BotDefinition agent query) ────────────────────────────
// Returns the list of marketing-category agents to act as the "campaigns" entry point

app.get('/api/campaigns/agents', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { instanceUrl } = req.session.auth;
  try {
    const q =
      "SELECT Id, DeveloperName, MasterLabel, Type FROM BotDefinition " +
      "WHERE DeveloperName IN ('Campaign_Performance_Agent','Marketing_NBA_Campaign_Agent'," +
      "'Paid_Media_Optimization_Agent','Marketing_Studio_Agent','Analytics_and_Visualization') " +
      "ORDER BY MasterLabel";
    const qNoType = q.replace(', Type', '');

    async function runQuery(query) {
      const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(query)}`;
      return sfFetch(req, url);
    }

    let sfRes = await runQuery(q);
    if (!sfRes.ok) sfRes = await runQuery(qNoType);

    if (!sfRes.ok) { const e = await sfRes.text(); return res.status(sfRes.status).json({ error: e }); }
    const data = await sfRes.json();
    res.json({ agents: data.records ?? [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Standard SF Campaign records — works with Core OAuth (no DC token exchange)
app.get('/api/campaigns/records', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { instanceUrl } = req.session.auth;
  try {
    const q = `SELECT Id, Name, Type, Status, StartDate, EndDate, ActualCost, BudgetedCost,
               NumberOfLeads, NumberOfConvertedLeads, NumberOfContacts, NumberOfResponses, IsActive
               FROM Campaign ORDER BY StartDate DESC NULLS LAST LIMIT 50`;
    const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q.replace(/\s+/g, ' '))}`;
    const sfRes = await sfFetch(req, url);
    if (!sfRes.ok) {
      const errText = await sfRes.text();
      console.error('[/api/campaigns/records] SF error:', sfRes.status, errText.slice(0, 400));
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = Array.isArray(parsed) ? parsed[0]?.message || errText : (parsed.message || errText);
      } catch { /* keep raw */ }
      return res.status(sfRes.status).json({ error: `Campaigns failed (${sfRes.status}): ${String(errMsg).slice(0, 300)}` });
    }
    const data = await sfRes.json();
    res.json({ campaigns: data.records ?? [], totalSize: data.totalSize ?? 0 });
  } catch (e) {
    console.error('[/api/campaigns/records]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── File Upload + Extraction Pipeline ───────────────────────────────────────
// Accepts multi-format file uploads (PDF, Excel, CSV, Word, images, text),
// extracts text content server-side, and returns it for agent chat context.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

/** Extract text content from a file buffer based on MIME type. */
async function extractFileContent(file) {
  const { mimetype, buffer, originalname } = file;

  // PDF
  if (mimetype === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    // pdf-parse expects a Buffer — convert from Uint8Array if needed
    const data = await pdfParse(Buffer.from(buffer));
    return {
      text: data.text,
      metadata: { pages: data.numpages, title: data.info?.Title || originalname },
      preview: data.text.substring(0, 500),
    };
  }

  // Excel / CSV
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype === 'text/csv') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';
    const sheetSummaries = {};
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const rows = XLSX.utils.sheet_to_json(sheet);
      fullText += `\n--- Sheet: ${name} (${rows.length} rows) ---\n${csv}`;
      sheetSummaries[name] = rows.length;
    }
    return {
      text: fullText.trim(),
      metadata: { sheets: workbook.SheetNames, rowCounts: sheetSummaries },
      preview: fullText.substring(0, 500),
    };
  }

  // Word documents (docx) — extract from internal XML
  if (mimetype.includes('wordprocessingml')) {
    try {
      const { Readable } = await import('stream');
      const { createUnzip } = await import('zlib');
      // Use a simple approach: find document.xml in the zip and strip XML tags
      const entries = [];
      // Node 22+ has built-in unzip support via decompress, but for simplicity
      // we'll use a basic approach to find the document.xml content
      const headerIdx = buffer.indexOf(Buffer.from('word/document.xml'));
      if (headerIdx >= 0) {
        // Manual zip parsing is fragile — try the text extraction fallback
        const textContent = buffer.toString('utf8')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/PK.*$/s, '') // strip zip binary data
          .trim();
        const cleaned = textContent.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          text: cleaned.substring(0, 50000),
          metadata: { format: 'docx', name: originalname },
          preview: cleaned.substring(0, 500),
        };
      }
      return { text: '', metadata: { format: 'docx', error: 'Could not parse document' }, preview: '' };
    } catch (e) {
      return { text: '', metadata: { format: 'docx', error: e.message }, preview: '' };
    }
  }

  // Images — no OCR yet, return description
  if (mimetype.startsWith('image/')) {
    return {
      text: `[Image file: ${originalname} (${mimetype}, ${(buffer.length / 1024).toFixed(1)}KB). Image content cannot be extracted as text. Please describe what this image contains.]`,
      metadata: { format: mimetype, size: buffer.length, name: originalname },
      preview: `Image: ${originalname}`,
    };
  }

  // Plain text
  if (mimetype === 'text/plain') {
    const text = buffer.toString('utf8');
    return { text, metadata: { format: 'text', name: originalname }, preview: text.substring(0, 500) };
  }

  throw new Error(`Unsupported file type: ${mimetype}`);
}

function requireAuth(req, res, next) {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// POST /api/files/extract — upload files, extract text content
app.post('/api/files/extract', requireAuth, upload.array('files', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const results = [];
  for (const file of req.files) {
    try {
      const extracted = await extractFileContent(file);
      results.push({
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        extractedText: extracted.text,
        metadata: extracted.metadata,
        preview: extracted.preview,
      });
    } catch (err) {
      console.error('[file extract]', file.originalname, err.message);
      results.push({
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        error: err.message,
      });
    }
  }
  res.json({ files: results });
});

// ─── Brief API (direct CRUD — complements the agent's Apex actions) ─────────

app.get('/api/briefs', requireAuth, async (req, res) => {
  const { instanceUrl } = req.session.auth;
  try {
    const q = `SELECT Id, Name, Description, KeyMessage, TargetAudience, PrimaryGoal,
               PrimaryKpi, PrimaryCtas, Priority, AdditionalNotes, IsConversational, CreatedDate
               FROM Brief ORDER BY CreatedDate DESC LIMIT 50`;
    const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q.replace(/\s+/g, ' '))}`;
    const sfRes = await sfFetch(req, url);
    if (!sfRes.ok) {
      const errText = await sfRes.text();
      return res.status(sfRes.status).json({ error: errText.slice(0, 300) });
    }
    const data = await sfRes.json();
    res.json({ briefs: data.records ?? [], totalSize: data.totalSize ?? 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Content API (Salesforce CMS Workspace "Default_Content_Workspace") ──────
// Shows the assets in the Default Content Workspace (0Zug7000000GnsoCAC).
// Uses SOQL on ManagedContent filtered by AuthoredManagedContentSpaceId, then
// enriches each item with its contentBody (via the /contents/{key} endpoint)
// to surface thumbnails and rich text.

const CMS_WORKSPACE_ID = process.env.CMS_WORKSPACE_ID || '0Zug7000000GnsoCAC';

app.get('/api/content', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    const type     = req.query.type || '';
    const page     = parseInt(req.query.page || '0', 10);
    const pageSize = parseInt(req.query.pageSize || '20', 10);

    // 1. List all assets in the workspace
    let whereClause = `AuthoredManagedContentSpaceId='${CMS_WORKSPACE_ID}'`;
    if (type) {
      // Map friendly filter values to ContentTypeFullyQualifiedName
      const typeMap = {
        cms_image: 'sfdc_cms__image',
        image:     'sfdc_cms__image',
        document:  'sfdc_cms__document',
        news:      'sfdc_cms__news',
        email:     'sfdc_cms__email',
      };
      const cmsType = typeMap[type] || type;
      whereClause += ` AND ContentTypeFullyQualifiedName='${cmsType}'`;
    }
    const q =
      `SELECT Id, Name, ApiName, ContentKey, ContentTypeFullyQualifiedName, ` +
      `CreatedDate, LastModifiedDate FROM ManagedContent WHERE ${whereClause} ` +
      `ORDER BY LastModifiedDate DESC LIMIT 200`;
    const qUrl = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q)}`;
    const qRes = await sfFetch(req, qUrl);
    if (!qRes.ok) {
      const errText = await qRes.text();
      console.error('[/api/content] SF SOQL error:', qRes.status, errText.slice(0, 400));
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = Array.isArray(parsed) ? parsed[0]?.message || parsed[0]?.errorCode || errText : (parsed.message || parsed.error || errText);
      } catch { /* keep raw */ }
      return res.status(qRes.status).json({
        error: `Couldn't load content (${qRes.status}): ${String(errMsg).slice(0, 300)}`,
        hint: qRes.status === 400 ? 'CMS_WORKSPACE_ID may be invalid or user lacks ManagedContent read.' : undefined,
      });
    }
    const { records = [], totalSize = 0 } = await qRes.json();

    // 2. Paginate to the requested window
    const start = page * pageSize;
    const pageRecords = records.slice(start, start + pageSize);

    // 3. Enrich each item with its rendered body (parallel, best-effort)
    const enriched = await Promise.all(
      pageRecords.map(async (r) => {
        const short = {
          id:                 r.Id,
          contentKey:         r.ContentKey,
          title:              r.Name,
          apiName:            r.ApiName,
          managedContentType: (r.ContentTypeFullyQualifiedName || '').replace('sfdc_cms__', ''),
          contentTypeFqn:     r.ContentTypeFullyQualifiedName,
          publishedDate:      r.LastModifiedDate,
        };
        try {
          const dRes = await sfFetch(
            req,
            `${instanceUrl}/services/data/${SF_API_VERSION}/connect/cms/contents/${r.ContentKey}`,
          );
          if (!dRes.ok) return short;
          const detail = await dRes.json();
          const body   = detail.contentBody || {};
          // Build contentNodes in a shape the UI already expects
          const contentNodes = {};
          if (body['sfdc_cms:media']?.url) {
            contentNodes.source = {
              // Prefix instanceUrl so the browser can load it with cookies/session
              value:    `${instanceUrl}${body['sfdc_cms:media'].url}`,
              nodeType: 'Media',
            };
          }
          if (body['sfdc_cms:media']?.altText) {
            contentNodes.altText = { value: body['sfdc_cms:media'].altText, nodeType: 'Text' };
          }
          if (body.title) contentNodes.title = { value: body.title, nodeType: 'Text' };
          if (body.excerpt || body.summary) {
            contentNodes.excerpt = { value: body.excerpt || body.summary, nodeType: 'Text' };
          }
          return { ...short, contentNodes, isPublished: detail.isPublished };
        } catch { return short; }
      })
    );

    res.json({
      items: enriched,
      total: totalSize,
      nextPageUrl: start + pageSize < totalSize ? `?page=${page + 1}` : null,
      workspace: { id: CMS_WORKSPACE_ID },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Chat API ─────────────────────────────────────────────────────────────────
// CRITICAL: The Agent Runtime API (Agentforce v1) requires a JWT token that is
// DIFFERENT from the standard Core OAuth access token. Flow:
//   1. Exchange the Core access token via GET {instanceUrl}/agentforce/bootstrap/nameduser
//      sending the access token as Cookie (sid={token}), NOT Bearer.
//   2. Response is JSON { access_token: "<JWT>" } — that JWT is scoped for api.salesforce.com.
//   3. Use that JWT as Bearer to POST https://api.salesforce.com/einstein/ai-agent/v1/agents/{id}/sessions.
//   4. Session create body MUST NOT include `bypassUser: true` for user-driven flows.
// The endpoint falls back through 3 hosts: api / test.api / dev.api (matches @salesforce/agents plugin).
// We cache the Agent JWT per session to avoid re-exchanging on every message.

const sessionAgentMap = new Map();
const AGENT_API_HOSTS = ['api.salesforce.com', 'test.api.salesforce.com', 'dev.api.salesforce.com'];

/**
 * Exchange the Core OAuth access token for an Agent-API-scoped JWT.
 * Pass req so we can auto-refresh the access token if SF returns the
 * HTML login page (which happens when the cookie-auth'd session is
 * expired). The retry uses the freshly-refreshed token.
 */
async function exchangeForAgentJwt(req, instanceUrl, accessToken) {
  async function attempt(token) {
    const url = `${instanceUrl}/agentforce/bootstrap/nameduser`;
    console.log(`[exchangeForAgentJwt] GET ${url}  token-prefix=${token?.slice(0,12)}…`);
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: `sid=${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      redirect: 'manual',
    });
    const contentType = r.headers.get('content-type') || '';
    const body        = await r.text();
    const isHtmlLoginRedirect =
      contentType.includes('text/html') ||
      body.trim().startsWith('<!DOCTYPE') ||
      body.trim().startsWith('<html');
    console.log(`[exchangeForAgentJwt] status=${r.status} content-type=${contentType} isHtml=${isHtmlLoginRedirect} body-prefix=${body.slice(0,120)}`);
    return { r, body, contentType, isHtmlLoginRedirect };
  }

  let { r, body, isHtmlLoginRedirect } = await attempt(accessToken);

  // If the bootstrap returned the SF login page, the access token is stale.
  // Try a refresh-token grant and retry the bootstrap.
  if (isHtmlLoginRedirect && req?.session?.auth?.refreshToken) {
    console.log('[exchangeForAgentJwt] HTML login redirect — attempting token refresh');
    const ok = await refreshSfAccessToken(req);
    console.log(`[exchangeForAgentJwt] refresh result=${ok}, new token prefix=${req?.session?.auth?.accessToken?.slice(0,12)}…`);
    if (ok) {
      ({ r, body, isHtmlLoginRedirect } = await attempt(req.session.auth.accessToken));
    }
  }

  if (isHtmlLoginRedirect) {
    console.error('[exchangeForAgentJwt] STILL HTML after refresh — giving up. body-prefix:', body.slice(0, 300));
    throw new Error(
      'Your session expired and could not be refreshed. Sign out and sign back in.'
    );
  }

  if (!r.ok) {
    throw new Error(
      `Agent JWT exchange failed (HTTP ${r.status}). ` +
      `Body: ${body.slice(0, 200)}`
    );
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Agent JWT exchange returned non-JSON body: ${body.slice(0, 200)}`);
  }
  if (!data.access_token) {
    throw new Error(`JWT exchange returned no access_token: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token;
}

/** Fetch a URL against api.salesforce.com with automatic endpoint fallback (prod → test → dev). */
async function fetchAgentApi(path, options) {
  let lastErr;
  for (const host of AGENT_API_HOSTS) {
    const url = `https://${host}${path}`;
    const r = await fetch(url, options);
    if (r.status !== 404) return r;
    lastErr = r;
  }
  return lastErr; // all 404 — return the last one so caller gets a consistent response object
}

app.post('/api/agents/:agentId/sessions', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { agentId } = req.params;
  const { accessToken, instanceUrl } = req.session.auth;

  if (!agentId || !/^0X[A-Za-z0-9]{13,16}$/.test(agentId)) {
    return res.status(400).json({
      error: `Invalid agent ID: "${agentId}". Expected 18-char BotDefinition record ID (starts with 0X).`,
    });
  }

  try {
    // 1. Exchange Core token → Agent-API JWT (auto-refreshes if stale)
    const agentJwt = await exchangeForAgentJwt(req, instanceUrl, accessToken);

    // 2. Create session on api.salesforce.com
    const sfRes = await fetchAgentApi(`/einstein/ai-agent/v1/agents/${agentId}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agentJwt}`,
        'Content-Type': 'application/json',
        'x-client-name': 'agentforce-ui',
      },
      body: JSON.stringify({
        externalSessionKey:    crypto.randomUUID(),
        instanceConfig:        { endpoint: instanceUrl },
        streamingCapabilities: { chunkTypes: ['Text'] },
      }),
    });

    if (!sfRes.ok) {
      const rawErr = await sfRes.text();
      console.error('[create session] Agent API error:', sfRes.status, rawErr.slice(0, 500));
      let parsedErr = rawErr;
      try {
        const j = JSON.parse(rawErr);
        parsedErr = j.message || j.error || j.errorCode || rawErr;
      } catch { /* keep raw */ }
      return res.status(sfRes.status).json({
        error: `Agent session creation failed (${sfRes.status}): ${String(parsedErr).slice(0, 400)}`,
        agentId,
      });
    }

    const data = await sfRes.json();
    // Cache JWT + agent context so we don't re-exchange on every message
    sessionAgentMap.set(data.sessionId, {
      agentId,
      instanceUrl,
      accessToken,
      agentJwt,
      jwtAcquiredAt: Date.now(),
      sequenceId: 0,
    });
    // Include the greeting message so the UI can show it immediately
    res.json({
      sessionId: data.sessionId,
      greeting: data.messages?.[0]?.message,
    });
  } catch (e) {
    console.error('[create session]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Refresh the JWT if it's older than 50 minutes (they expire at 60). */
async function getFreshJwt(req, sessionInfo) {
  const ageMin = (Date.now() - sessionInfo.jwtAcquiredAt) / 60000;
  if (ageMin < 50) return sessionInfo.agentJwt;
  sessionInfo.agentJwt = await exchangeForAgentJwt(req, sessionInfo.instanceUrl, sessionInfo.accessToken);
  sessionInfo.jwtAcquiredAt = Date.now();
  return sessionInfo.agentJwt;
}

app.post('/api/sessions/:id/messages', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { id }      = req.params;
  const { message, fileContext } = req.body;
  const sessionInfo = sessionAgentMap.get(id);
  if (!sessionInfo) return res.status(404).json({ error: 'Session not found or expired. Start a new chat.' });

  // Build the enriched message — if the user uploaded files, prepend their
  // extracted text so the agent has full context for brief creation.
  let enrichedMessage = message;
  if (Array.isArray(fileContext) && fileContext.length > 0) {
    const filesSummary = fileContext
      .filter(f => f.extractedText)
      .map(f => `--- File: ${f.name} (${f.type}) ---\n${f.extractedText}`)
      .join('\n\n');
    if (filesSummary) {
      enrichedMessage =
        `The user has uploaded the following files for context:\n\n${filesSummary}\n\n` +
        `User message: ${message}`;
    }
  }

  sessionInfo.sequenceId += 1;
  const { sequenceId } = sessionInfo;

  try {
    const jwt = await getFreshJwt(req, sessionInfo);
    const sfRes = await fetchAgentApi(`/einstein/ai-agent/v1/sessions/${id}/messages/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'x-client-name': 'agentforce-ui',
      },
      body: JSON.stringify({
        message: { sequenceId, type: 'Text', text: enrichedMessage },
        variables: [],
      }),
    });

    if (!sfRes.ok) {
      const err = await sfRes.text();
      console.error('[send message] Agent API error:', sfRes.status, err.slice(0, 500));
      let parsed = err;
      try {
        const j = JSON.parse(err);
        parsed = j.message || j.error || err;
      } catch { /* keep raw */ }
      return res.status(sfRes.status).json({ error: String(parsed).slice(0, 400) });
    }

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader  = sfRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (e) {
    console.error('[send message]', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const sessionInfo = sessionAgentMap.get(id);
  if (!sessionInfo) return res.json({ ok: true });
  try {
    const jwt = await getFreshJwt(req, sessionInfo);
    await fetchAgentApi(`/einstein/ai-agent/v1/sessions/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'x-session-end-reason': 'UserRequest',
        'x-client-name': 'agentforce-ui',
      },
    });
    sessionAgentMap.delete(id);
    res.json({ ok: true });
  } catch (e) {
    // Silent failure is fine — session will time out server-side
    sessionAgentMap.delete(id);
    res.json({ ok: true, warning: e.message });
  }
});

// ─── Serve React app ──────────────────────────────────────────────────────────
if (isProd) {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_, r) => r.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`[agentforce-ui] :${PORT} (${isProd ? 'production' : 'development'})`));
