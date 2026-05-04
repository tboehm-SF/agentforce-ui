import { useState, useEffect } from 'react';
import type { AppPhase, AuthState, Agent } from './types';
import { checkSession, logout } from './api/oauth';
import { AGENTS as ALL_KNOWN_AGENTS } from './data/agents';
import { LoginScreen }         from './components/LoginScreen';
import { AgentPicker }         from './components/AgentPicker';
import { AgentMissionControl } from './components/AgentMissionControl';
import { AgentChatPanel }      from './components/AgentChatPanel';
import './index.css';

/**
 * Three-phase flow:
 *   login  →  agent-picker  →  mission-control
 *
 * Auth is handled server-side (Authorization Code flow).
 * The React app just polls /api/auth/me to find out if a session exists.
 *
 * After SF redirects back to /?auth=ok the useEffect detects this,
 * confirms the session, and advances to the agent picker.
 */
export default function App() {
  const [phase,        setPhase]        = useState<AppPhase>('login');
  const [auth,         setAuth]         = useState<AuthState | null>(null);
  const [pinnedAgents, setPinnedAgents] = useState<Agent[]>([]);
  const [activeAgent,  setActiveAgent]  = useState<Agent | null>(null);
  const [authError,    setAuthError]    = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authOk  = params.get('auth');
    const errMsg  = params.get('auth_error');

    // Clean up URL regardless
    if (authOk || errMsg) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (errMsg) {
      setAuthError(decodeURIComponent(errMsg));
      return;
    }

    // Check for an existing server session (covers both ?auth=ok and page refreshes)
    checkSession().then((session) => {
      if (session) {
        setAuth(session);
        // Restore previously pinned agents if any
        const savedIds = JSON.parse(sessionStorage.getItem('sf_pinned_agents') ?? '[]') as string[];
        const agents   = savedIds.length
          ? ALL_KNOWN_AGENTS.filter((a) => savedIds.includes(a.id))
          : [];

        if (authOk || agents.length === 0) {
          // Fresh login — always go through picker
          setPhase('agent-picker');
        } else {
          // Page refresh with pinned agents — restore workspace
          setPinnedAgents(agents);
          setPhase('mission-control');
        }
      }
    });
  }, []);

  function handlePickerConfirm(selected: Agent[]) {
    sessionStorage.setItem('sf_pinned_agents', JSON.stringify(selected.map((a) => a.id)));
    setPinnedAgents(selected);
    setPhase('mission-control');
  }

  async function handleLogout() {
    await logout();
    sessionStorage.removeItem('sf_pinned_agents');
    setAuth(null);
    setPinnedAgents([]);
    setActiveAgent(null);
    setAuthError(null);
    setPhase('login');
  }

  if (phase === 'login') {
    return <LoginScreen error={authError} />;
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

  return (
    <div className="relative flex h-screen overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
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
