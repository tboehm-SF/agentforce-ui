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

// Detail lookup — path param is the segment's apiName (NOT marketSegmentId).
// Returns the segment definition + criteria + a small sample of member records.
app.get('/api/segments/:apiName', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { accessToken, instanceUrl } = req.session.auth;
  const { apiName } = req.params;
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    // Fetch definition + members in parallel
    const [defRes, memRes] = await Promise.all([
      fetch(`${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments/${apiName}`, { headers }),
      fetch(`${instanceUrl}/services/data/${SF_API_VERSION}/ssot/segments/${apiName}/members?limit=5`, { headers }),
    ]);

    if (!defRes.ok) {
      const e = await defRes.text();
      return res.status(defRes.status).json({ error: e.slice(0, 400) });
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
    const jwt    = await exchangeForAgentJwt(instanceUrl, accessToken);

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
    const qRes = await fetch(qUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!qRes.ok) { const e = await qRes.text(); return res.status(qRes.status).json({ error: e }); }
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
          const dRes = await fetch(
            `${instanceUrl}/services/data/${SF_API_VERSION}/connect/cms/contents/${r.ContentKey}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
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

/** Exchange the Core OAuth access token for an Agent-API-scoped JWT. */
async function exchangeForAgentJwt(instanceUrl, accessToken) {
  const url = `${instanceUrl}/agentforce/bootstrap/nameduser`;
  const r = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: `sid=${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    redirect: 'manual', // don't follow the login redirect — we want to detect it
  });

  const contentType = r.headers.get('content-type') || '';
  const body        = await r.text();

  // Detect login-redirect HTML page — the most common failure mode
  const isHtmlLoginRedirect =
    contentType.includes('text/html') ||
    body.trim().startsWith('<!DOCTYPE') ||
    body.trim().startsWith('<html');

  if (isHtmlLoginRedirect) {
    throw new Error(
      'Your session doesn\'t have Agentforce API permission. Sign out and sign back in to ' +
      're-approve the app with the updated scopes, then try again.'
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
    // 1. Exchange Core token → Agent-API JWT
    const agentJwt = await exchangeForAgentJwt(instanceUrl, accessToken);

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
async function getFreshJwt(sessionInfo) {
  const ageMin = (Date.now() - sessionInfo.jwtAcquiredAt) / 60000;
  if (ageMin < 50) return sessionInfo.agentJwt;
  sessionInfo.agentJwt = await exchangeForAgentJwt(sessionInfo.instanceUrl, sessionInfo.accessToken);
  sessionInfo.jwtAcquiredAt = Date.now();
  return sessionInfo.agentJwt;
}

app.post('/api/sessions/:id/messages', async (req, res) => {
  if (!req.session.auth) return res.status(401).json({ error: 'Not authenticated' });
  const { id }      = req.params;
  const { message } = req.body;
  const sessionInfo = sessionAgentMap.get(id);
  if (!sessionInfo) return res.status(404).json({ error: 'Session not found or expired. Start a new chat.' });

  sessionInfo.sequenceId += 1;
  const { sequenceId } = sessionInfo;

  try {
    const jwt = await getFreshJwt(sessionInfo);
    const sfRes = await fetchAgentApi(`/einstein/ai-agent/v1/sessions/${id}/messages/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'x-client-name': 'agentforce-ui',
      },
      body: JSON.stringify({
        message: { sequenceId, type: 'Text', text: message },
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
    const jwt = await getFreshJwt(sessionInfo);
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
