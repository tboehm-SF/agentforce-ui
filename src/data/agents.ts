import type { Agent } from '../types';

/**
 * Known agents in the tboehm@hls.ch org.
 * The `developerName` must match the Bot API Name in Setup > Agents.
 * Edit these to match your actual Agentforce agent API names.
 */
export const AGENTS: Agent[] = [
  {
    id: 'email-marketing',
    name: 'Email Marketing Studio',
    developerName: 'Email_Marketing_Studio',
    description: 'Generate campaigns, subject lines, body copy, and segmentation strategies for your email marketing efforts.',
    icon: '✉️',
    color: '#0176d3',
    category: 'Marketing',
    suggestedPrompts: [
      'Write a welcome email for new HLS subscribers',
      'Create a 3-email nurture sequence for healthcare decision-makers',
      'Generate 5 subject line variations for our Q2 webinar',
      'Draft a re-engagement campaign for inactive contacts',
    ],
  },
  {
    id: 'lead-qualifier',
    name: 'Lead Qualifier',
    developerName: 'Lead_Qualifier_Agent',
    description: 'Analyze and score inbound leads, suggest next best actions, and prioritize your pipeline.',
    icon: '🎯',
    color: '#9050e9',
    category: 'Sales',
    suggestedPrompts: [
      'Score this lead: CMO at 500-person hospital, downloaded whitepaper',
      'What questions should I ask to qualify a healthcare IT lead?',
      'Analyze my top 10 leads and rank them by close probability',
    ],
  },
  {
    id: 'case-resolver',
    name: 'Case Resolver',
    developerName: 'Case_Resolver_Agent',
    description: 'Summarize support cases, suggest resolutions, and draft customer responses.',
    icon: '🛠️',
    color: '#06a59a',
    category: 'Service',
    suggestedPrompts: [
      'Summarize case #12345 and suggest resolution steps',
      'Draft a polite response to an escalated billing complaint',
      'What are the most common case categories this quarter?',
    ],
  },
  {
    id: 'campaign-analyst',
    name: 'Campaign Analyst',
    developerName: 'Campaign_Analyst_Agent',
    description: 'Analyze campaign performance data, identify trends, and recommend optimizations.',
    icon: '📊',
    color: '#dd7a01',
    category: 'Marketing',
    suggestedPrompts: [
      'How did our last email campaign perform vs. benchmark?',
      'Which audience segment had the highest CTR last quarter?',
      'Recommend changes to improve our open rate',
    ],
  },
];

export const CATEGORIES = [...new Set(AGENTS.map((a) => a.category))];
