import { useState, useEffect } from 'react';
import type { Agent } from './types';
import type { OAuthResult } from './api/oauth';
import { loadAuth, saveAuth, clearAuth, parseOAuthCallback } from './api/oauth';
import { LoginScreen } from './components/LoginScreen';
import { AgentSidebar } from './components/AgentSidebar';
import { ChatWindow } from './components/ChatWindow';
import { AgentDashboard } from './components/AgentDashboard';
import './index.css';

/**
 * VITE_SHOWCASE_MODE=true → skip login, server holds SF credentials.
 * Default (false) → user logs in via OAuth, token stored in sessionStorage.
 */
const SHOWCASE = import.meta.env.VITE_SHOWCASE_MODE === 'true';

// Synthetic auth object for showcase mode (token not needed client-side)
const SHOWCASE_AUTH: OAuthResult = {
  accessToken: 'server-managed',
  instanceUrl: import.meta.env.VITE_SF_INSTANCE_URL || 'https://hls-ch.my.salesforce.com',
};

export default function App() {
  const [auth, setAuth] = useState<OAuthResult | null>(SHOWCASE ? SHOWCASE_AUTH : null);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);

  // On mount: handle OAuth callback hash OR restore persisted session
  useEffect(() => {
    if (SHOWCASE) return; // skip auth logic entirely in showcase mode

    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const result = parseOAuthCallback(hash);
      if (result) {
        saveAuth(result);
        setAuth(result);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
    }
    const persisted = loadAuth();
    if (persisted) setAuth(persisted);
  }, []);

  function handleAuth(result: OAuthResult) {
    saveAuth(result);
    setAuth(result);
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setActiveAgent(null);
  }

  if (!auth) {
    return <LoginScreen onAuth={handleAuth} />;
  }

  const sfConfig = { accessToken: auth.accessToken, instanceUrl: auth.instanceUrl };

  return (
    <div className="flex h-screen overflow-hidden">
      <AgentSidebar
        activeAgent={activeAgent}
        onSelectAgent={setActiveAgent}
        onLogout={handleLogout}
        orgUser="tboehm@hls.ch"
        showcaseMode={SHOWCASE}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeAgent ? (
          <ChatWindow agent={activeAgent} config={sfConfig} />
        ) : (
          <AgentDashboard onSelectAgent={setActiveAgent} />
        )}
      </main>
    </div>
  );
}
