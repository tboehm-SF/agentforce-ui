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
