# Mode Selector Build Plan
## Agents · Segments · Campaigns · Content

---

## What We're Building

Replace the current "agent picker only" onboarding with a **mode selector** that lets the user choose what to work with. Each mode gets its own workspace UI after login.

```
Login → Mode Selector → [Agents | Segments | Campaigns | Content] → Workspace
```

---

## Auth Changes Required

### New OAuth Scopes (add to Connected App + authorize URL)
```
api  chatbot_api  cdp_api  cdp_profile_api  offline_access
```

- `cdp_api` — required as base for all Data Cloud calls
- `cdp_profile_api` — required for Segment API
- Both must be on the Connected App AND in the authorize request scope string

### Data Cloud Token Exchange
After PKCE login, do a background token exchange to get a DC-scoped token:

```
POST https://<core-org>/services/a360/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:salesforce:grant-type:external:cdp
subject_token=<core_access_token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
```

Response gives `access_token` + `instance_url` (the DC tenant URL, e.g. `https://<org-id>.c360a.salesforce.com`). Store both in session.

---

## API Reference

### Segments — `/ssot/segments`
**Base:** DC tenant `instance_url` from token exchange  
**Auth:** DC-scoped `access_token`

```
GET  {dcUrl}/services/data/v62.0/ssot/segments
POST {dcUrl}/services/data/v62.0/ssot/segments
POST {dcUrl}/services/data/v62.0/ssot/segments/{id}/actions/publish
GET  {dcUrl}/services/data/v62.0/ssot/segments/{id}/members
```

List response:
```json
{
  "segments": [
    { "id": "0sDxx...", "name": "High Value Customers", "segmentStatus": "Published", "memberCount": 14200 }
  ],
  "count": 42,
  "nextPageUrl": "/services/data/v62.0/ssot/segments?page=2&pageSize=25"
}
```

Create request body:
```json
{
  "name": "High-Value Customers",
  "segmentOnObjectName": "Individual__dlm",
  "includeCriteria": {
    "criteria": [{ "field": "TotalSpend__c", "operator": "greaterThan", "value": "1000" }]
  }
}
```

### Campaigns — Data Cloud Query
**Base:** DC tenant `instance_url`  
**Auth:** DC-scoped `access_token`

```
POST {dcUrl}/services/data/v1/query
Body: { "sql": "SELECT Id__c, Name__c, Status__c FROM MCI_Campaign__dlm LIMIT 50" }
```

### Content — CMS Connect API
**Base:** Core `instanceUrl`  
**Auth:** Core `accessToken` (no DC exchange needed)

```
GET {instanceUrl}/services/data/v64.0/connect/cms/contents?managedContentType=cms_image
GET {instanceUrl}/services/data/v64.0/connect/cms/contents?channels={channelId}
```

---

## Implementation Steps

### Step 1 — Connected App Scopes
Deploy updated Connected App with `cdp_api` + `cdp_profile_api` scopes.

### Step 2 — Server: Add DC token exchange
After PKCE login, immediately exchange for DC token. Store `dcAccessToken` + `dcInstanceUrl` in session alongside existing `accessToken` + `instanceUrl`.

### Step 3 — Server: Add new API routes
```
GET  /api/segments              → list segments
POST /api/segments              → create segment
POST /api/segments/:id/publish  → publish segment
GET  /api/campaigns             → query campaigns via DC Query API
GET  /api/content               → list CMS assets
```

### Step 4 — Frontend: AppPhase enum update
Add `'mode-selector'` phase between `'agent-picker'` and `'mission-control'`.

### Step 5 — Frontend: ModeSelector component
New screen showing 4 tiles: Agents / Segments / Campaigns / Content.

### Step 6 — Frontend: Segments workspace
List view of segments with status chips. Create button opens NL input → passes to existing Agentforce agent OR calls API directly.

### Step 7 — Frontend: Campaigns workspace
Table of campaigns queried from `MCI_Campaign__dlm`.

### Step 8 — Frontend: Content workspace
Grid of CMS assets filterable by type and tag.

---

## Phase Types Update
```typescript
export type AppPhase = 
  | 'login'
  | 'mode-selector'    // NEW — pick Agents/Segments/Campaigns/Content
  | 'agent-picker'     // existing — only reached from Agents mode
  | 'mission-control'; // existing — agent workspace
```

New phases for non-Agent modes:
```typescript
  | 'segments'
  | 'campaigns'
  | 'content'
```

---

## UI Design Notes
- Mode selector uses same dark glassmorphism aesthetic as rest of app
- Each mode tile has icon, title, 1-line description, color accent
- Agents = blue (#1b96ff), Segments = teal (#06a59a), Campaigns = purple (#9050e9), Content = orange (#dd7a01)
- After picking a mode, the header shows a breadcrumb back to mode selector
- Natural language input available in Segments/Campaigns/Content → routes to appropriate Agentforce marketing agent
