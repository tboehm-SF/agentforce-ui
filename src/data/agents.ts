import type { Agent } from '../types';

/**
 * Rich metadata for ExternalCopilot agents on the org.
 * Only agents with Type = 'ExternalCopilot' are accessible via the Agent Runtime API.
 * DeveloperName matches BotDefinition.DeveloperName in the org.
 */
export const AGENTS: Agent[] = [
  {
    id: 'campaign-brief-upload',
    name: 'Campaign Brief Upload',
    developerName: 'Campaign_Brief_Upload_Agent',
    description: 'Create campaign briefs from uploaded files or conversation — AI extracts key fields and saves to Salesforce.',
    icon: '📋',
    color: '#2e844a',
    category: 'Marketing',
    suggestedPrompts: [
      'Create a new campaign brief for our Q3 wellness push',
      'I have a PDF brief to upload — help me extract the details',
      'Start a brief for an email campaign targeting dermatologists',
    ],
  },
  {
    id: 'astro-evidence',
    name: 'Astro Evidence Agent',
    developerName: 'Astro_Evidence_Agent',
    description: 'Collect, organize, and present evidence-backed answers to business questions using org data.',
    icon: '🔭',
    color: '#032d60',
    category: 'Productivity',
    suggestedPrompts: [
      'What evidence supports our Q2 pipeline forecast?',
      'Find data points that validate our lead scoring model',
      'Summarize evidence for our board presentation on growth',
    ],
  },
  {
    id: 'makana-email',
    name: 'Makana Email Service',
    developerName: 'Makana_Email_Service_Agent',
    description: 'Draft and send personalized patient email communications for Makana Health workflows.',
    icon: '📧',
    color: '#2e844a',
    category: 'Service',
    suggestedPrompts: [
      'Draft a post-visit follow-up email for Patient A',
      'Write a reminder for an upcoming procedure',
      'Create a care plan summary email',
    ],
  },
];

export const CATEGORIES = [...new Set(AGENTS.map((a) => a.category))];
