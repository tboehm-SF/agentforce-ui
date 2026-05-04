export interface SalesforceConfig {
  instanceUrl: string;
  accessToken: string;
}

export interface Agent {
  id: string;
  name: string;
  developerName: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  suggestedPrompts?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface Session {
  sessionId: string;
  agentId: string;
}

export interface AgentSession {
  sessionId: string;
  messages: Message[];
}

/** Auth state produced by OAuth login */
export interface AuthState {
  accessToken: string;
  instanceUrl: string;
  username?: string;
  displayName?: string;
  orgName?: string;
}

/** App phase — drives the multi-step onboarding and workspace routing */
export type AppPhase =
  | 'login'
  | 'mode-selector'    // NEW: pick what to work with
  | 'agent-picker'     // existing: choose agents (reached via Agents mode)
  | 'mission-control'  // existing: agent workspace
  | 'segments'         // NEW: Data Cloud segments workspace
  | 'campaigns'        // NEW: campaigns workspace (via marketing agent)
  | 'content';         // NEW: content query workspace

/** Mode picked by user at the mode-selector screen */
export type WorkspaceMode = 'agents' | 'segments' | 'campaigns' | 'content';

/** A Data Cloud segment record */
export interface Segment {
  marketSegmentId: string;
  apiName: string;
  displayName: string;
  description?: string;
  segmentStatus: string;   // 'ACTIVE' | 'INACTIVE' | 'DRAFT'
  publishStatus?: string;  // 'PUBLISHED' | 'UNPUBLISHED'
  segmentType?: string;
  dataSpace?: string;
  nextPublishDateTime?: string;
}
