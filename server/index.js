import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// ─── Salesforce config ────────────────────────────────────────────────────────
const SF_BASE_URL      = process.env.SF_BASE_URL      || 'https://storm-969c7ac7dcf66b.my.salesforce.com';
const SF_CLIENT_ID     = process.env.SF_CLIENT_ID     || '3MVG9FofAY6PhRtG_wK6evWxsvd255jT6tc13saSSIDE9ONH58WQzf7BOVKAe.jvJqjIFh07LaQ==';
const SF_API_VERSION   = process.env.SF_API_VERSION   || 'v62.0';
const SESSION_SECRET   = process.env.SESSION_SECRET   || 'agentforce-dev-secret-change-in-prod';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.set('trust proxy', 1); // Required behind Heroku's proxy for secure cookies

app.use(session({
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   isProd,   // HTTPS-only in prod
    httpOnly: true,
    maxAge:   2 * 60 * 60 * 1000, // 2 hours — matches SF token lifetime
  },
}));

// ─── OAuth: Authorization Code + PKCE flow (no client secret needed) ─────────

/** Base64url-encode a buffer (no padding, url-safe) */
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Step 1: Generate PKCE verifier+challenge, store in session, redirect to SF
app.get('/auth/login', (req, res) => {
  const codeVerifier  = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  // Store verifier in session so callback can use it
  req.session.pkce = codeVerifier;

  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const params = new URLSearchParams({
    response_type:          'code',
    client_id:              SF_CLIENT_ID,
    redirect_uri:           redirectUri,
    scope:                  'api chatbot_api',
    code_challenge:         codeChallenge,
    code_challenge_method:  'S256',
  });
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
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
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
      instanceUrl:    tokenData.instance_url || SF_BASE_URL,
      apiInstanceUrl: tokenData.api_instance_url || tokenData.instance_url || SF_BASE_URL,
      username:       identity.preferred_username || identity.email || '',
      displayName:    identity.name || '',
    };

    // Send user to the React app — no tokens in the URL
    res.redirect('/?auth=ok');
  } catch (e) {
    console.error('[auth/callback] exception:', e.message);
    res.redirect(`/?auth_error=${encodeURIComponent(e.message)}`);
  }
});

// Step 3: React app asks "am I logged in?" — returns user info (no token)
app.get('/api/auth/me', (req, res) => {
  if (!req.session.auth) return res.status(401).json({ authenticated: false });
  const { username, displayName, instanceUrl } = req.session.auth;
  res.json({ authenticated: true, username, displayName, instanceUrl });
});

// Step 4: Fetch org agents using the session token — include Id (record ID needed for Agent API)
// CRITICAL: Only AgentforceServiceAgent types work with /einstein/ai-agent/v1/.
// Legacy EinsteinServiceAgent / MyDomainChatbot / ExternalCopilot return HTML 404s.
app.get('/api/auth/agents', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { accessToken, instanceUrl } = req.session.auth;
    // Include Type + IsDeleted so the client can filter to reachable agents only.
    // Some orgs don't expose Type on BotDefinition — if that fails we fall back.
    const queryWithType =
      "SELECT Id, DeveloperName, MasterLabel, Type FROM BotDefinition " +
      "WHERE IsDeleted = FALSE ORDER BY MasterLabel";
    const queryNoType =
      "SELECT Id, DeveloperName, MasterLabel FROM BotDefinition ORDER BY MasterLabel";

    async function runQuery(q) {
      const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q)}`;
      return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    let sfRes = await runQuery(queryWithType);
    if (!sfRes.ok) sfRes = await runQuery(queryNoType);

    if (!sfRes.ok) {
      const err = await sfRes.text();
      return res.status(sfRes.status).json({ error: err });
    }

    const data = await sfRes.json();
    res.json({ agents: data.records ?? [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── Segments API ─────────────────────────────────────────────────────────────

app.get('/api/segments', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    const page     = parseInt(req.query.page  || '0', 10);
    const pageSize = parseInt(req.query.pageSize || '25', 10);
    const url = `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments?offset=${page * pageSize}&batchSize=${pageSize}`;
    const sfRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!sfRes.ok) { const e = await sfRes.text(); return res.status(sfRes.status).json({ error: e }); }
    const data = await sfRes.json();
    res.json({ segments: data.segments ?? [], totalSize: data.totalSize ?? data.count ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/segments/:id', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    const sfRes = await fetch(
      `${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments/${req.params.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!sfRes.ok) { const e = await sfRes.text(); return res.status(sfRes.status).json({ error: e }); }
    res.json(await sfRes.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Campaigns API (via BotDefinition agent query) ────────────────────────────
// Returns the list of marketing-category agents to act as the "campaigns" entry point

app.get('/api/campaigns/agents', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    // Return ALL candidate marketing agents from the org. The client probes each
    // with a HEAD/preflight to know which are reachable via the Agent Runtime API.
    // Type column added so the client can filter out legacy Einstein bots.
    const q =
      "SELECT Id, DeveloperName, MasterLabel, Type FROM BotDefinition " +
      "WHERE DeveloperName IN ('Campaign_Performance_Agent','Marketing_NBA_Campaign_Agent'," +
      "'Paid_Media_Optimization_Agent','Marketing_Studio_Agent','Analytics_and_Visualization') " +
      "ORDER BY MasterLabel";

    // Try with Type first; if Type column is unavailable in this org, fall back
    const qNoType = q.replace(', Type', '');

    async function runQuery(query) {
      const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(query)}`;
      return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    const q = `SELECT Id, Name, Type, Status, StartDate, EndDate, ActualCost, BudgetedCost,
               NumberOfLeads, NumberOfConvertedLeads, NumberOfContacts, NumberOfResponses, IsActive
               FROM Campaign ORDER BY StartDate DESC NULLS LAST LIMIT 50`;
    const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(q.replace(/\s+/g, ' '))}`;
    const sfRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!sfRes.ok) { const e = await sfRes.text(); return res.status(sfRes.status).json({ error: e }); }
    const data = await sfRes.json();
    res.json({ campaigns: data.records ?? [], totalSize: data.totalSize ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Content API (Salesforce CMS) ─────────────────────────────────────────────

app.get('/api/content', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  try {
    const type = req.query.type || '';
    const page = parseInt(req.query.page || '0', 10);
    const pageSize = parseInt(req.query.pageSize || '20', 10);
    let url = `${instanceUrl}/services/data/v62.0/connect/cms/contents?page=${page}&pageSize=${pageSize}`;
    if (type) url += `&managedContentType=${encodeURIComponent(type)}`;
    const sfRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!sfRes.ok) { const e = await sfRes.text(); return res.status(sfRes.status).json({ error: e }); }
    res.json(await sfRes.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Chat API ─────────────────────────────────────────────────────────────────
// Uses the Agent Runtime API v1 — completely separate from the REST data API.
// Endpoint base: api_instance_url from the token response (not My Domain URL).
// Agent identifier: 18-char BotDefinition record ID (e.g. 0Xxg...), not developerName.
const sessionAgentMap = new Map();

// Agent Runtime API v1 — two known path conventions; we try the primary,
// then fall back to the versioned data path used by some newer orgs.
const agentApiBasePrimary = (apiInstanceUrl, agentId) =>
  `${apiInstanceUrl}/einstein/ai-agent/v1/agents/${agentId}`;
const agentApiBaseVersioned = (apiInstanceUrl, agentId) =>
  `${apiInstanceUrl}/services/data/${SF_API_VERSION}/einstein/ai-agent/v1/agents/${agentId}`;
const agentApiBase = agentApiBasePrimary; // primary alias used by existing send/delete paths

app.post('/api/agents/:agentId/sessions', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { agentId } = req.params;
  const { accessToken, instanceUrl, apiInstanceUrl } = req.session.auth;

  // Validate the agentId format — must be an 18-char SF record ID (starts with 0Xx for BotDefinition)
  if (!agentId || !/^0X[A-Za-z0-9]{13,16}$/.test(agentId)) {
    return res.status(400).json({
      error: `Invalid agent ID: "${agentId}". Expected 18-char BotDefinition record ID (starts with 0Xx).`,
    });
  }

  try {
    const sessionBody = JSON.stringify({
      externalSessionKey:    crypto.randomUUID(),
      instanceConfig:        { endpoint: instanceUrl },
      featureSupport:        'Streaming',
      streamingCapabilities: { chunkTypes: ['Text'] },
      bypassUser:            true,
    });
    const sessionHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Try primary path first, then versioned fallback if we get a 404
    let sfRes = await fetch(`${agentApiBasePrimary(apiInstanceUrl, agentId)}/sessions`, {
      method: 'POST', headers: sessionHeaders, body: sessionBody,
    });
    let usedPath = 'primary';

    if (sfRes.status === 404) {
      console.log('[create session] primary path 404, trying versioned path for agent', agentId);
      const alt = await fetch(`${agentApiBaseVersioned(apiInstanceUrl, agentId)}/sessions`, {
        method: 'POST', headers: sessionHeaders, body: sessionBody,
      });
      if (alt.ok) {
        sfRes = alt;
        usedPath = 'versioned';
      }
      // If alt also failed, keep the original 404 response for better error reporting
    }

    if (!sfRes.ok) {
      const rawErr = await sfRes.text();
      const contentType = sfRes.headers.get('content-type') || '';
      console.error(`[create session] SF error (${usedPath}):`, sfRes.status, rawErr.slice(0, 500));

      // Salesforce returns an HTML 404 page ("URL No Longer Exists") when the BotDefinition
      // is not an Agentforce Service Agent (e.g. it's a legacy Einstein Bot or the agent
      // isn't activated for the Agent Runtime API). Translate that into a clear message.
      if (sfRes.status === 404 && contentType.includes('text/html')) {
        return res.status(404).json({
          error:
            'This agent is not reachable via the Agent Runtime API. The record exists as a ' +
            "BotDefinition but isn't an Agentforce agent that's activated for API access. " +
            'Check in Setup → Agents that this agent has Status = Active and that the ' +
            '"Enable Agentforce for your org" setting is turned on.',
          agentId,
          hint: 'AGENT_NOT_AGENTFORCE_API_ENABLED',
        });
      }

      // Try to extract a JSON error body if SF returned one
      let parsedErr = rawErr;
      try {
        const json = JSON.parse(rawErr);
        parsedErr = json.message || json.error || json.errorCode || rawErr;
      } catch { /* leave as raw text */ }

      return res.status(sfRes.status).json({ error: String(parsedErr).slice(0, 500) });
    }

    const data = await sfRes.json();
    sessionAgentMap.set(data.sessionId, { agentId, apiInstanceUrl, instanceUrl, accessToken, sequenceId: 0 });
    res.json({ sessionId: data.sessionId });
  } catch (e) {
    console.error('[create session]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sessions/:id/messages', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { id }      = req.params;
  const { message } = req.body;
  const sessionInfo = sessionAgentMap.get(id);
  if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });

  // sequenceId must increment with each message in the session
  sessionInfo.sequenceId += 1;
  const { agentId, apiInstanceUrl, accessToken, sequenceId } = sessionInfo;

  try {
    const sfRes = await fetch(`${agentApiBase(apiInstanceUrl, agentId)}/sessions/${id}/messages/stream`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept:         'text/event-stream',
      },
      body: JSON.stringify({
        message: { sequenceId, type: 'Text', text: message },
        variables: [],
      }),
    });

    if (!sfRes.ok) {
      const err = await sfRes.text();
      console.error('[send message] SF error:', sfRes.status, err);
      return res.status(sfRes.status).json({ error: err });
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
  const { id }      = req.params;
  const sessionInfo = sessionAgentMap.get(id);
  if (!sessionInfo) return res.json({ ok: true });
  const { agentId, apiInstanceUrl, accessToken } = sessionInfo;
  try {
    await fetch(`${agentApiBase(apiInstanceUrl, agentId)}/sessions/${id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'x-session-end-reason': 'UserRequest' },
    });
    sessionAgentMap.delete(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Serve React app ──────────────────────────────────────────────────────────
if (isProd) {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_, r) => r.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`[agentforce-ui] :${PORT} (${isProd ? 'production' : 'development'})`));
