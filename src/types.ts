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

/** App phase — drives the 3-step onboarding */
export type AppPhase = 'login' | 'agent-picker' | 'mission-control';
