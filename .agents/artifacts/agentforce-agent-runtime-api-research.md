# Salesforce Agentforce Agent Runtime API — Research Findings

## Root Causes of "Cannot Query" Issue (Fixed)

Three distinct bugs were causing agent queries to fail silently:

| # | Bug | Wrong Value | Correct Value |
|---|-----|-------------|---------------|
| 1 | API path | `/services/data/v62.0/einstein/ai-agent/agents/` | `/einstein/ai-agent/v1/agents/` |
| 2 | Agent identifier | `developerName` (e.g. `Service_Sunny_Bot`) | 18-char record ID (e.g. `0Xxg7000000C2KbCAK`) |
| 3 | OAuth scopes | `api` only | `api chatbot_api` |

---

## 1. Correct Endpoint Format

The Agent Runtime API is **completely separate** from the standard Salesforce REST data API. It does **not** use the `/services/data/vXX.0/` prefix.

| Operation | Method | Path |
|---|---|---|
| Create session | POST | `{api_instance_url}/einstein/ai-agent/v1/agents/{agentId}/sessions` |
| Send streaming message | POST | `{api_instance_url}/einstein/ai-agent/v1/agents/{agentId}/sessions/{sessionId}/messages/stream` |
| Send sync message | POST | `{api_instance_url}/einstein/ai-agent/v1/agents/{agentId}/sessions/{sessionId}/messages` |
| End session | DELETE | `{api_instance_url}/einstein/ai-agent/v1/sessions/{sessionId}` |

**Base URL:** Use `api_instance_url` from the OAuth token response — not the My Domain URL. Store it in the session on login:
```js
req.session.auth.apiInstanceUrl = tokenData.api_instance_url || tokenData.instance_url;
```

---

## 2. Agent Identifier

Use the **18-character BotDefinition record ID** (starts with `0Xxg`), not the `DeveloperName`.

Query to get IDs:
```sql
SELECT Id, DeveloperName, MasterLabel FROM BotDefinition ORDER BY MasterLabel
```

The `Id` field (e.g. `0Xxg7000000C2KbCAK`) is what goes in the API URL path.

---

## 3. Required OAuth Scopes

| Scope (API name) | Metadata XML name | Purpose |
|---|---|---|
| `api` | `Api` | Standard REST API access |
| `chatbot_api` | `Chatbot` | Agent Runtime API access (**required**) |
| `refresh_token` | `RefreshToken` | Session persistence |

Both the **Connected App** configuration AND the **authorize request** scope parameter must include `chatbot_api`.

Connected App metadata:
```xml
<scopes>Api</scopes>
<scopes>Chatbot</scopes>
<scopes>RefreshToken</scopes>
```

Authorize URL scope parameter: `scope: 'api chatbot_api'`

---

## 4. Session Creation Request Body

```json
{
  "externalSessionKey": "550e8400-e29b-41d4-a716-446655440000",
  "instanceConfig": {
    "endpoint": "https://your-domain.my.salesforce.com"
  },
  "featureSupport": "Streaming",
  "streamingCapabilities": {
    "chunkTypes": ["Text"]
  },
  "bypassUser": true
}
```

- `externalSessionKey`: Fresh `crypto.randomUUID()` per session
- `instanceConfig.endpoint`: My Domain URL (not `api_instance_url`)
- `featureSupport`: `"Streaming"` required for streaming responses
- `bypassUser: true`: Required for server-to-server calls; uses agent's configured "Run As" user

---

## 5. Send Message Request Body

```json
{
  "message": {
    "sequenceId": 1,
    "type": "Text",
    "text": "Hello, what can you help me with?"
  },
  "variables": []
}
```

- `sequenceId`: **Must increment** with each message in the session (start at 1)
- Old body format `{ role, content: [{ type, text }] }` is wrong for v1

---

## 6. SSE Event Types (Streaming Response)

Events arrive as `text/event-stream` blocks separated by blank lines:
```
event: TextChunk
id: 123
data: {"type":"TextChunk","message":{"text":"Here is"}}

event: TextChunk
data: {"type":"TextChunk","message":{"text":" your answer"}}

event: Inform
data: {"type":"Inform","message":{"message":"Here is your answer"}}

event: EndOfTurn
data: {"type":"EndOfTurn"}
```

| Event Type | Action |
|---|---|
| `ProgressIndicator` | Agent is thinking — show spinner |
| `TextChunk` | Append `evt.message.text` to streaming display |
| `Inform` | Complete message — use as fallback if `TextChunk` produced nothing |
| `EndOfTurn` | Streaming complete |
| `ValidationFailureChunk` | Content policy triggered — show error |

SSE parser must split on **double newlines** (`\n\n`), then find the `data:` line within each block.

---

## 7. Session Termination

```http
DELETE /einstein/ai-agent/v1/sessions/{sessionId}
Authorization: Bearer {token}
x-session-end-reason: UserRequest
```

---

## 8. Common Errors

| HTTP | Error | Cause |
|---|---|---|
| 400 | `"{value} is not a valid agent ID"` | Wrong ID format — must be record ID, not developerName |
| 401 | Unauthorized | Missing/expired token or missing `chatbot_api` scope |
| 404 | Not Found | Wrong API path (using `/services/data/` prefix) OR wrong `api_instance_url` |
| 500 | `EngineConfigLookupException` | Wrong domain in `instanceConfig.endpoint` — use My Domain, not Lightning domain |
| 500 | `HttpServerErrorException` | Wrong agent ID |

**Agent type restriction:** The Agent API does **not** support agents of type `Agentforce (Default)`.

---

## Sources

- [SF Agent API Get Started](https://developer.salesforce.com/docs/einstein/genai/guide/agent-api-get-started.html)
- [SF Agent API Troubleshooting](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-troubleshooting.html)
- [SF Agent API Examples](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-examples.html)
- [pozil/agent-api-node-client](https://github.com/pozil/agent-api-node-client) — reference implementation
- [misu007/agentforce-headless-agent-nextjs-demo](https://github.com/misu007/agentforce-headless-agent-nextjs-demo) — confirmed endpoint paths
