# Salesforce Marketing Cloud & Data Cloud APIs
## Segments · Campaigns · Content · Query · Natural Language

---

## Architecture Decision for the UI

The app needs a **mode selector** at the start — instead of just "Agents", the user picks what they want to work with:

| Mode | Underlying API | What the user can do |
|---|---|---|
| 🤖 **Agents** | Agentforce Agent Runtime API v1 | Chat with any deployed Agentforce agent |
| 👥 **Segments** | Data Cloud Segment API (`/ssot/segments`) | List, query, create segments |
| 📣 **Campaigns** | MC REST API + Data Cloud Query | List campaigns, query MI performance |
| 🧩 **Content** | Salesforce CMS Connect API / MC Asset API | Search/tag content assets |
| 🔍 **Query** | Data Cloud Query API (`/query`) | Run SQL against DMOs |

---

## 1. Data Cloud Segment API

**Base URL:** `https://<instance>.salesforce.com/services/data/v62.0/ssot/`
**Auth:** Standard Salesforce OAuth Bearer token. Requires `cdp_profile_api` scope.

### Key Endpoints

| Operation | Method | Path |
|---|---|---|
| List segments | GET | `/services/data/v62.0/ssot/segments` |
| Get segment | GET | `/services/data/v62.0/ssot/segments/{id}` |
| Create segment | POST | `/services/data/v62.0/ssot/segments` |
| Publish segment | POST | `/services/data/v62.0/ssot/segments/{id}/actions/publish` |
| Get segment members | GET | `/services/data/v62.0/ssot/segments/{id}/members` |
| Create lookalike | POST | `/services/data/v62.0/ssot/segments` (with `segmentType: LOOKALIKE`) |

### Create Segment Request Body
```json
{
  "name": "High-Value Customers",
  "description": "Customers with spend > $1000",
  "segmentOnObjectName": "Individual__dlm",
  "includeCriteria": {
    "criteria": [
      { "field": "TotalSpend__c", "operator": "greaterThan", "value": "1000" }
    ]
  }
}
```

### Segment Publish States
`SEEDING → READY → PUBLISHING → PUBLISHED`

### Natural Language → Segment
No direct NLQ-to-segment API exists. The pattern is:
1. Use Agentforce Agent with a custom "Create Segment" GenAI Function
2. The agent LLM interprets NL intent and invokes the function
3. The function calls `POST /ssot/segments` with constructed criteria

---

## 2. Marketing Cloud Campaigns API

Two completely separate surfaces exist:

### A. MC Engagement (Legacy REST API)
**Base URL:** `https://<subdomain>.rest.marketingcloudapis.com/`
**Auth:** Separate MC OAuth — **different client_id/secret** from Salesforce Core. Uses `https://<subdomain>.auth.marketingcloudapis.com/v2/token`.

> ⚠️ **Important:** MC REST API requires a separate Connected App in the MC Business Unit, not the Salesforce Core Connected App. Cannot reuse PKCE tokens from Core login.

| Operation | Method | Path |
|---|---|---|
| List campaigns | GET | `/hub/v1/campaigns` |
| Get campaign | GET | `/hub/v1/campaigns/{id}` |
| Create campaign | POST | `/hub/v1/campaigns` |
| List campaign assets | GET | `/hub/v1/campaigns/{id}/assets` |

**Create Campaign Body:**
```json
{
  "name": "Summer Promo 2026",
  "description": "Summer campaign for EMEA",
  "campaignCode": "SUMMER2026",
  "color": "#FF5733",
  "favorite": false
}
```

> ⚠️ **Performance metrics are NOT returned by `/hub/v1/campaigns`**. Opens/clicks/conversions require the SOAP API or Analytics Builder Data Extract.

### B. Marketing Intelligence (Data Cloud-based)
- Campaigns live in Data Cloud DMOs after MI pipeline ingestion as `MCI_Campaign__dlm`
- Queryable via the **Data Cloud Query API** (section 4)
- Also accessible via the **Paid Media Optimization Agent** (Agentforce agent)

---

## 3. Content / Asset API

Two separate surfaces:

### A. Salesforce CMS Connect API (Core)
**Base URL:** `https://<instance>.salesforce.com/services/data/v64.0/connect/cms/`
**Auth:** Standard Salesforce OAuth Bearer token.

| Operation | Method | Path |
|---|---|---|
| List CMS contents | GET | `/connect/cms/contents` |
| Filter by type | GET | `/connect/cms/contents?managedContentType=cms_image` |
| Get content by key | GET | `/connect/cms/contents/{contentKey}` |
| Search by channel | GET | `/connect/cms/contents?channels={channelId}` |

**Notes:**
- Tag-based search is NOT native — must filter client-side or use fuzzy string matching
- Content keys follow the format `MC...` (28-char strings starting with `MC`)
- Cross-workspace images return 403

### B. MC Content Builder REST API (Legacy MC)
**Base URL:** `https://<subdomain>.rest.marketingcloudapis.com/asset/v1/`
**Auth:** MC OAuth (separate from Core — see section 2)

| Operation | Method | Path |
|---|---|---|
| List assets | GET | `/asset/v1/content/assets` |
| Get asset | GET | `/asset/v1/content/assets/{id}` |
| Search by OData filter | GET | `/asset/v1/content/assets?$filter=name like '%promo%'` |
| List categories | GET | `/asset/v1/content/categories` |
| Filter by category | GET | `/asset/v1/content/assets?$filter=category.id eq {categoryId}` |

**Available `$filter` fields:** `name`, `category.id`, `assetType.name`, `createdDate`, `tags`

---

## 4. Data Cloud Query API

**Base URL:** `https://<data-cloud-tenant>.salesforce.com/services/data/v1/`

> ⚠️ **Requires Token Exchange** — Core OAuth token must be exchanged for a Data Cloud-scoped token:

```http
POST https://<core-org>.salesforce.com/services/a360/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:salesforce:grant-type:external:cdp
&subject_token=<core_access_token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
```

The returned `access_token` is used for all Data Cloud calls.

### Query Endpoint

| Operation | Method | Path |
|---|---|---|
| Run SQL query | POST | `/services/data/v1/query` |
| Get next batch | GET | `/services/data/v1/query/{nextBatchId}` |

**Request Body:**
```json
{
  "sql": "SELECT ssot__Id__c, ssot__FirstName__c FROM ssot__Individual__dlm WHERE ssot__TotalSpend__c > 1000 LIMIT 100"
}
```

**Response:**
```json
{
  "data": [{ "ssot__Id__c": "...", "ssot__FirstName__c": "..." }],
  "rowCount": 42,
  "done": true,
  "nextBatchId": null
}
```

**DMO naming conventions:**
- Standard DMOs: `ssot__` prefix + `__dlm` suffix (e.g. `ssot__Individual__dlm`)
- Custom DMOs: no prefix + `__dlm` suffix (e.g. `MCI_Campaign__dlm`)

**Natural Language → SQL:** No public NLQ API. Salesforce's internal WAII engine does this but is not externally exposed. Pattern: use Agentforce agent with a "Run Query" GenAI Function.

---

## 5. Agentforce Marketing Agents

All marketing agents use the **standard Agent Runtime API v1** — no separate API surface.

**Base URL:** `https://<org>.salesforce.com/einstein/ai-agent/v1/`

Confirmed marketing agent templates:

| Agent | Bot API Name | Best For |
|---|---|---|
| Paid Media Optimization Agent | `Paid_Media_Optimization_Agent` | Campaign performance, MI data |
| Analytics & Visualization Agent | `Analytics_and_Visualization` | Data analysis, charts |
| Marketing NBA Campaign Agent | `Marketing_NBA_Campaign_Agent` | Next-best-action recommendations |
| Campaign Performance Agent | `Campaign_Performance_Agent` | Campaign metrics |
| Marketing Studio Agent | `Marketing_Studio_Agent` | Email creation |

All are queried identically via the Agent Runtime API using their BotDefinition record ID (not the API name in the URL).

---

## Implementation Plan for the Mode Selector

### Phase 1 — Add to existing app
The initial screen gains a **mode picker** before showing the agent/workspace selector:

```
┌─────────────────────────────────────────────┐
│  What would you like to work with today?    │
│                                             │
│  🤖 Agents    👥 Segments    📣 Campaigns   │
│  🧩 Content   🔍 Query                     │
└─────────────────────────────────────────────┘
```

### Phase 2 — Per-mode capabilities
- **Agents:** Existing flow (agent picker → chat)
- **Segments:** List segments → view/create/publish; natural language creates via Agentforce agent
- **Campaigns:** Fetch from `/hub/v1/campaigns` (requires separate MC auth) or query Data Cloud DMOs
- **Content:** Browse CMS assets by type/tag/channel
- **Query:** Free-form SQL editor against Data Cloud DMOs with result table

### Auth Complexity
- **Agents, Segments, Content, Query (Core):** All work with existing PKCE token + `chatbot_api` + `cdp_profile_api` scopes
- **Campaigns (MC Engagement) + Content (MC):** Require **separate MC OAuth** — different auth server, different client credentials. This is the main blocker for full MC REST integration without a second login.

### Recommended Scope Order
1. Start with **Segments** + **Query** — both use Core OAuth already present
2. Add **Campaigns** via Data Cloud Query API (no separate MC auth needed, queries `MCI_Campaign__dlm`)
3. Add **Content** via CMS Connect API (also Core OAuth)
4. MC REST API campaigns/content require a Phase 2 with separate MC auth setup

---

## Sources
- Salesforce Internal: Lookalike Segmentation Design Doc (Drive `1EyiepMxdlKGNnP7YRfmjKrTsb56qrthhgQUYimHtx84`)
- Salesforce Internal: Marketing Intelligence Super Reference (Drive `1mFmSIImJZW-suluE8mBXg7CeAG36F7FB`)
- Salesforce Internal: Marketing Studio Email Agent Recipe (Drive `1aopyqlT5P8UC_ucJu1XmCbADhbwuQduH`)
- Salesforce Internal: Marketing NBA Agent Architecture (Drive `1Sgk4LqAr6Ie_XoqwPYvuRtejpl5v0gu8`)
- Salesforce Internal: Multi-Language Agents Guide (Drive `1vLH1hKUDlhEYydNMYp8XtvdSFzwF-OXortduMvrpZZM`)
- [SF Developer: Agent API Examples](https://developer.salesforce.com/docs/einstein/genai/guide/agent-api-examples.html)
- [MC REST API: Campaigns](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/getCampaignCollection.html)
- [MC REST API: Assets](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/assetSimpleQuery.html)
