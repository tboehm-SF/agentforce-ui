import { useState, useEffect } from 'react';
import type { AppPhase, AuthState, Agent, WorkspaceMode } from './types';
import { checkSession, logout } from './api/oauth';
import { AGENTS as ALL_KNOWN_AGENTS } from './data/agents';
import { LoginScreen }         from './components/LoginScreen';
import { ModeSelector }        from './components/ModeSelector';
import { AgentPicker }         from './components/AgentPicker';
import { AgentMissionControl } from './components/AgentMissionControl';
import { AgentChatPanel }      from './components/AgentChatPanel';
import { SegmentsWorkspace }   from './components/SegmentsWorkspace';
import { CampaignsWorkspace }  from './components/CampaignsWorkspace';
import { ContentWorkspace }    from './components/ContentWorkspace';
import { BriefUploadWorkspace } from './components/BriefUploadWorkspace';
import './index.css';

/**
 * Multi-phase flow:
 *   login  →  mode-selector  →  [agents | segments | campaigns | content]
 *
 * Agents path:  mode-selector → agent-picker → mission-control
 * Other paths:  mode-selector → segments / campaigns / content workspace
 */
export default function App() {
  const [phase,        setPhase]        = useState<AppPhase>('login');
  const [auth,         setAuth]         = useState<AuthState | null>(null);
  const [pinnedAgents, setPinnedAgents] = useState<Agent[]>([]);
  const [activeAgent,  setActiveAgent]  = useState<Agent | null>(null);
  const [authError,    setAuthError]    = useState<string | null>(null);

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const authOk  = params.get('auth');
    const errMsg  = params.get('auth_error');

    if (authOk || errMsg) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (errMsg) {
      setAuthError(decodeURIComponent(errMsg));
      return;
    }

    checkSession().then((session) => {
      if (session) {
        setAuth(session);

        if (authOk) {
          // Fresh OAuth callback — always go to mode selector first
          setPhase('mode-selector');
        } else {
          // Page refresh — restore last workspace if we can
          const lastPhase = sessionStorage.getItem('sf_last_phase') as AppPhase | null;
          if (lastPhase === 'segments' || lastPhase === 'campaigns' || lastPhase === 'content' || lastPhase === 'brief-upload') {
            setPhase(lastPhase);
          } else {
            // Restore agent workspace if pinned agents exist
            const savedIds = JSON.parse(sessionStorage.getItem('sf_pinned_agents') ?? '[]') as string[];
            const agents   = savedIds.length
              ? ALL_KNOWN_AGENTS.filter((a) => savedIds.includes(a.id))
              : [];

            if (agents.length > 0) {
              setPinnedAgents(agents);
              setPhase('mission-control');
            } else {
              setPhase('mode-selector');
            }
          }
        }
      }
    });
  }, []);

  function handleModeSelect(mode: WorkspaceMode) {
    if (mode === 'agents') {
      sessionStorage.setItem('sf_last_phase', 'agent-picker');
      setPhase('agent-picker');
    } else {
      sessionStorage.setItem('sf_last_phase', mode);
      setPhase(mode);
    }
  }

  function handlePickerConfirm(selected: Agent[]) {
    sessionStorage.setItem('sf_pinned_agents', JSON.stringify(selected.map((a) => a.id)));
    sessionStorage.setItem('sf_last_phase', 'mission-control');
    setPinnedAgents(selected);
    setPhase('mission-control');
  }

  function handleBackToModeSelector() {
    sessionStorage.removeItem('sf_last_phase');
    setActiveAgent(null);
    setPhase('mode-selector');
  }

  async function handleLogout() {
    await logout();
    sessionStorage.removeItem('sf_pinned_agents');
    sessionStorage.removeItem('sf_last_phase');
    setAuth(null);
    setPinnedAgents([]);
    setActiveAgent(null);
    setAuthError(null);
    setPhase('login');
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (phase === 'login') {
    return <LoginScreen error={authError} />;
  }

  if (phase === 'mode-selector' && auth) {
    return (
      <ModeSelector
        auth={auth}
        onSelect={handleModeSelect}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === 'agent-picker' && auth) {
    return (
      <AgentPicker
        auth={auth}
        onConfirm={handlePickerConfirm}
        onLogout={handleLogout}
        onBack={handleBackToModeSelector}
      />
    );
  }

  if (phase === 'segments' && auth) {
    return (
      <SegmentsWorkspace
        auth={auth}
        onBack={handleBackToModeSelector}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === 'campaigns' && auth) {
    return (
      <CampaignsWorkspace
        auth={auth}
        onBack={handleBackToModeSelector}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === 'brief-upload' && auth) {
    return (
      <BriefUploadWorkspace
        auth={auth}
        onBack={handleBackToModeSelector}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === 'content' && auth) {
    return (
      <ContentWorkspace
        auth={auth}
        onBack={handleBackToModeSelector}
        onLogout={handleLogout}
      />
    );
  }

  // mission-control (default)
  return (
    <div className="relative flex h-screen overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <AgentMissionControl
        activeAgent={activeAgent}
        onSelectAgent={setActiveAgent}
        agents={pinnedAgents}
        auth={auth}
        onLogout={handleLogout}
        onBack={handleBackToModeSelector}
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
