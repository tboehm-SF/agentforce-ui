import { useState, useEffect } from 'react';
import type { AppPhase, AuthState, Agent } from './types';
import {
  parseOAuthCallback, fetchIdentity,
  saveAuth, loadAuth, clearAuth,
} from './api/oauth';
import { AGENTS as ALL_KNOWN_AGENTS } from './data/agents';
import { LoginScreen }          from './components/LoginScreen';
import { AgentPicker }          from './components/AgentPicker';
import { AgentMissionControl }  from './components/AgentMissionControl';
import { AgentChatPanel }       from './components/AgentChatPanel';
import './index.css';

/**
 * Three-phase flow:
 *   login  →  agent-picker  →  mission-control
 *
 * OAuth callback lands back on /auth/callback with #access_token=...
 * We detect it, strip the hash, restore identity, then move to picker.
 */
export default function App() {
  const [phase,       setPhase]       = useState<AppPhase>('login');
  const [auth,        setAuth]        = useState<AuthState | null>(null);
  const [pinnedAgents,setPinnedAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);

  // ── On mount: check for OAuth callback or restored session ──────────────────
  useEffect(() => {
    const hash = window.location.hash;

    if (hash.includes('access_token')) {
      // Coming back from Salesforce login
      const partial = parseOAuthCallback(hash);
      if (partial) {
        // Remove tokens from URL bar immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        // Enrich with user identity then advance to picker
        fetchIdentity(partial).then((full) => {
          saveAuth(full);
          setAuth(full);
          setPhase('agent-picker');
        });
        return;
      }
    }

    // Restore persisted session (page refresh) — validate token first
    const saved = loadAuth();
    if (saved) {
      // Quick ping to check the token is still alive
      fetch(`${saved.instanceUrl}/services/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${saved.accessToken}` },
      }).then((res) => {
        if (!res.ok) {
          // Token expired — clear and stay on login
          clearAuth();
          return;
        }
        const savedIds = JSON.parse(sessionStorage.getItem('sf_pinned_agents') ?? '[]') as string[];
        const agents   = savedIds.length
          ? ALL_KNOWN_AGENTS.filter((a) => savedIds.includes(a.id))
          : ALL_KNOWN_AGENTS;

        setAuth(saved);
        setPinnedAgents(agents.length ? agents : ALL_KNOWN_AGENTS);
        setPhase('mission-control');
      }).catch(() => {
        clearAuth();
      });
    }
  }, []);

  function handlePickerConfirm(selected: Agent[]) {
    setPinnedAgents(selected);
    setPhase('mission-control');
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setPinnedAgents([]);
    setActiveAgent(null);
    setPhase('login');
  }

  // ── Render phase ─────────────────────────────────────────────────────────────
  if (phase === 'login') {
    return <LoginScreen />;
  }

  if (phase === 'agent-picker' && auth) {
    return (
      <AgentPicker
        auth={auth}
        onConfirm={handlePickerConfirm}
        onLogout={handleLogout}
      />
    );
  }

  // Mission control
  return (
    <div className="relative flex h-screen overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid opacity-100 pointer-events-none" />

      <AgentMissionControl
        activeAgent={activeAgent}
        onSelectAgent={setActiveAgent}
        agents={pinnedAgents}
        auth={auth}
        onLogout={handleLogout}
      />

      {activeAgent && (
        <AgentChatPanel
          agent={activeAgent}
          onClose={() => setActiveAgent(null)}
        />
      )}
    </div>
  );
}
