import { useState } from 'react';
import type { Agent } from './types';
import { AgentMissionControl } from './components/AgentMissionControl';
import { AgentChatPanel } from './components/AgentChatPanel';
import './index.css';

export default function App() {
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);

  return (
    <div className="relative flex h-screen overflow-hidden bg-space">
      {/* Animated grid overlay */}
      <div className="absolute inset-0 bg-grid opacity-100 pointer-events-none" />

      {/* Mission control — always visible */}
      <AgentMissionControl
        activeAgent={activeAgent}
        onSelectAgent={setActiveAgent}
      />

      {/* Chat panel — slides in when agent selected */}
      {activeAgent && (
        <AgentChatPanel
          agent={activeAgent}
          onClose={() => setActiveAgent(null)}
        />
      )}
    </div>
  );
}
