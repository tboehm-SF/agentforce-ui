import { useState } from 'react';
import { buildAuthUrl, loadAuth, saveAuth } from '../api/oauth';
import type { OAuthResult } from '../api/oauth';

interface LoginScreenProps {
  onAuth: (result: OAuthResult) => void;
}

export function LoginScreen({ onAuth }: LoginScreenProps) {
  const [mode, setMode] = useState<'oauth' | 'token'>('oauth');
  const [clientId, setClientId] = useState('');
  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('https://hls-ch.my.salesforce.com');
  const [error, setError] = useState('');

  // Check if we're returning from OAuth redirect with a token in the hash
  const hashResult = loadAuth();
  if (hashResult) {
    setTimeout(() => onAuth(hashResult), 0);
  }

  function handleOAuth() {
    if (!clientId.trim()) {
      setError('Please enter your Connected App Client ID');
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    window.location.href = buildAuthUrl(clientId, redirectUri);
  }

  function handleTokenLogin() {
    if (!token.trim()) {
      setError('Please paste your access token');
      return;
    }
    const result = { accessToken: token.trim(), instanceUrl: instanceUrl.trim() };
    saveAuth(result);
    onAuth(result);
  }

  return (
    <div className="min-h-screen bg-[#032d60] flex items-center justify-center p-4">
      {/* Background grid decoration */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">
              ⚡
            </div>
            <div className="text-left">
              <div className="text-white text-2xl font-semibold">Agentforce</div>
              <div className="text-white/60 text-sm">HLS.ch Agent Console</div>
            </div>
          </div>
          <p className="text-white/50 text-sm">Sign in with your Salesforce org to get started</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Mode tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setMode('oauth')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mode === 'oauth'
                  ? 'text-[#0176d3] border-b-2 border-[#0176d3] bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Connected App (OAuth)
            </button>
            <button
              onClick={() => setMode('token')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mode === 'token'
                  ? 'text-[#0176d3] border-b-2 border-[#0176d3] bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Session Token
            </button>
          </div>

          <div className="p-6 space-y-4">
            {mode === 'oauth' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connected App Client ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="3MVG9..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0176d3] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Setup → App Manager → Your Connected App → Consumer Key
                  </p>
                </div>
                <button
                  onClick={handleOAuth}
                  className="w-full bg-[#0176d3] hover:bg-[#014486] text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>Sign in with Salesforce</span>
                  <span>→</span>
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instance URL
                  </label>
                  <input
                    type="text"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0176d3] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Token
                  </label>
                  <textarea
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your Salesforce access token..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0176d3] focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Get via: <code className="bg-gray-100 px-1 rounded">sf org display --target-org tboehm@hls.ch</code>
                  </p>
                </div>
                <button
                  onClick={handleTokenLogin}
                  className="w-full bg-[#0176d3] hover:bg-[#014486] text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  Connect to Org
                </button>
              </>
            )}

            {error && (
              <div className="text-sm text-[#ba0517] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Connecting to <span className="font-medium text-gray-600">tboehm@hls.ch</span> · hls-ch.my.salesforce.com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
