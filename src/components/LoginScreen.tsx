import { useState, useEffect } from 'react';
import { startLogin, fetchOrgs } from '../api/oauth';
import type { OrgEntry } from '../types';

interface Props {
  error?: string | null;
}

export function LoginScreen({ error }: Props) {
  const [hovering, setHovering] = useState(false);
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrgs().then((o) => {
      setOrgs(o);
      if (o.length > 0) setSelectedOrg(o[0].id);
      setLoading(false);
    });
  }, []);

  const currentOrg = orgs.find(o => o.id === selectedOrg);
  const multiOrg = orgs.length > 1;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-space">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(1,118,211,0.15) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(144,80,233,0.12) 0%, transparent 70%)' }} />

      <div className="absolute w-3 h-3 rounded-full opacity-40 pointer-events-none"
        style={{ background: '#1b96ff', top: '20%', left: '15%', animation: 'orbit 8s linear infinite' }} />
      <div className="absolute w-2 h-2 rounded-full opacity-30 pointer-events-none"
        style={{ background: '#9050e9', bottom: '25%', right: '20%', animation: 'orbit 12s linear infinite reverse' }} />

      <div className="relative w-full max-w-sm mx-4 panel-animate">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-5">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, rgba(1,118,211,0.3), rgba(144,80,233,0.3))',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: hovering
                  ? '0 0 60px rgba(27,150,255,0.5), 0 0 120px rgba(144,80,233,0.2)'
                  : '0 0 30px rgba(27,150,255,0.2)',
              }}
            >⚡</div>
            <div className="absolute w-2.5 h-2.5 rounded-full bg-[#2e844a] border border-[#05080f]"
              style={{ top: -2, right: -2, animation: 'pulse-dot 2s ease-in-out infinite' }} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            Agent<span className="gradient-text">force</span>
          </h1>
          <p className="text-sm text-white/35 leading-relaxed">
            Connect to your Salesforce org to access<br />your AI agents
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6 transition-all duration-300"
          style={{ boxShadow: hovering ? '0 20px 60px rgba(1,118,211,0.15)' : '0 8px 32px rgba(0,0,0,0.3)' }}>

          {/* Error banner */}
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-xl text-xs text-red-300"
              style={{ background: 'rgba(186,5,23,0.15)', border: '1px solid rgba(186,5,23,0.3)' }}>
              <span className="font-semibold">Login error: </span>{error}
            </div>
          )}

          {/* Org selector — shown when multiple orgs are available */}
          {multiOrg && (
            <div className="mb-4">
              <label className="text-xs font-medium text-white/40 block mb-2">Select Organization</label>
              <div className="space-y-2">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrg(org.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                    style={{
                      background: selectedOrg === org.id ? 'rgba(1,118,211,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedOrg === org.id ? 'rgba(27,150,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                      style={{
                        background: selectedOrg === org.id ? 'rgba(27,150,255,0.2)' : 'rgba(255,255,255,0.06)',
                      }}>
                      🏢
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium" style={{ color: selectedOrg === org.id ? '#1b96ff' : 'rgba(255,255,255,0.6)' }}>
                        {org.label}
                      </div>
                      <div className="text-xs text-white/25 truncate">{org.domain}</div>
                    </div>
                    {selectedOrg === org.id && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: '#1b96ff' }}>
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Org indicator — single org only */}
          {!multiOrg && currentOrg && (
            <div className="flex items-center gap-3 mb-6 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-7 h-7 rounded-lg bg-[#1b96ff]/15 flex items-center justify-center text-sm">🏢</div>
              <div>
                <div className="text-xs font-medium text-white/60">{currentOrg.label}</div>
                <div className="text-xs text-white/30">{currentOrg.domain}</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="text-xs text-[#2e844a]">Live</span>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="spinner spinner-sm" />
              <span className="text-xs text-white/40 ml-2">Loading orgs…</span>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => startLogin(selectedOrg || undefined)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            disabled={loading || !selectedOrg}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2.5 relative overflow-hidden group disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: hovering && !loading ? 'linear-gradient(135deg, #1b96ff, #0176d3)' : 'linear-gradient(135deg, #0176d3, #014486)',
              boxShadow: hovering && !loading ? '0 8px 24px rgba(27,150,255,0.4)' : 'none',
              transform: hovering && !loading ? 'translateY(-1px)' : 'none',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
            Sign in with Salesforce
            <span className="opacity-60">→</span>
          </button>

          <p className="text-center text-xs text-white/20 mt-4">
            Authorization Code flow · Credentials never leave Salesforce
          </p>
        </div>

        <p className="text-center text-xs text-white/15 mt-6">
          Agentforce UI · Built on Salesforce Einstein
        </p>
      </div>
    </div>
  );
}
