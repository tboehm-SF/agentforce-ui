import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Salesforce config ────────────────────────────────────────────────────────
// SF_BASE_URL / SF_CLIENT_ID are baked in for the tboehm@hls.ch org.
// SF_CLIENT_SECRET must be set as an env var (Heroku config or .env.local) —
// get it from: Setup → App Manager → "Agentforce UI" → View → Consumer Secret.
const SF_BASE_URL      = process.env.SF_BASE_URL    || 'https://storm-969c7ac7dcf66b.my.salesforce.com';
const SF_CLIENT_ID     = process.env.SF_CLIENT_ID   || '3MVG9FofAY6PhRtG_wK6evWxsvd255jT6tc13saSSIDE9ONH58WQzf7BOVKAe.jvJqjIFh07LaQ==';
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET || '';
const SF_API_VERSION   = process.env.SF_API_VERSION  || 'v62.0';

// In-memory token cache — one token is fine for a demo on a single dyno
let cachedToken = null;
let tokenExpiry  = 0;

// In-memory session map so message/delete routes know the agent name
// sessionId → agentDeveloperName
const sessionAgentMap = new Map();

// ─── Auth: Client Credentials OAuth flow ──────────────────────────────────────
async function getSFToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  });

  const res = await fetch(`${SF_BASE_URL}/services/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SF auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  console.log('[auth] token refreshed, expires in', data.expires_in, 's');
  return cachedToken;
}

// ─── SF API base path helper ───────────────────────────────────────────────────
const sfAgentBase = (agentName) =>
  `${SF_BASE_URL}/services/data/${SF_API_VERSION}/einstein/ai-agent/agents/${agentName}`;

// ─── POST /api/agents/:developerName/sessions ──────────────────────────────────
app.post('/api/agents/:developerName/sessions', async (req, res) => {
  const { developerName } = req.params;
  try {
    const token = await getSFToken();
    const sfRes = await fetch(`${sfAgentBase(developerName)}/sessions`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalSessionKey:    crypto.randomUUID(),
        instanceConfig:        { endpoint: SF_BASE_URL },
        streamingCapabilities: { chunkTypes: ['Text'] },
        bypassUser:            true,
      }),
    });

    if (!sfRes.ok) {
      const err = await sfRes.text();
      return res.status(sfRes.status).json({ error: err });
    }

    const data = await sfRes.json();
    // Remember which agent owns this session
    sessionAgentMap.set(data.sessionId, developerName);
    res.json({ sessionId: data.sessionId });
  } catch (e) {
    console.error('[create session]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/sessions/:id/messages — stream SSE back ───────────────────────
app.post('/api/sessions/:id/messages', async (req, res) => {
  const { id }    = req.params;
  const { message } = req.body;

  const agentName = sessionAgentMap.get(id);
  if (!agentName) return res.status(404).json({ error: 'Session not found' });

  try {
    const token = await getSFToken();
    const url   = `${sfAgentBase(agentName)}/sessions/${id}/messages`;

    const sfRes = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept:         'text/event-stream',
      },
      body: JSON.stringify({
        message:   { role: 'user', content: [{ type: 'text', text: message }] },
        variables: [],
      }),
    });

    if (!sfRes.ok) {
      const err = await sfRes.text();
      return res.status(sfRes.status).json({ error: err });
    }

    // Pipe SSE stream straight to the browser
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx/Heroku proxy buffering
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

// ─── DELETE /api/sessions/:id ─────────────────────────────────────────────────
app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const agentName = sessionAgentMap.get(id);
  if (!agentName) return res.json({ ok: true }); // already gone

  try {
    const token = await getSFToken();
    await fetch(`${sfAgentBase(agentName)}/sessions/${id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    sessionAgentMap.delete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[delete session]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Serve built React app in production ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  // /auth/callback is the OAuth redirect URI — React handles it client-side via hash
  app.get('*', (_, r) => r.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`[agentforce-ui] listening on :${PORT}`));
