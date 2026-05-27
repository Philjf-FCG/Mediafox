import { useEffect, useState } from 'react';
import { api, setStudioId, getStudioId } from '../api';

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const input: React.CSSProperties = { background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%', fontSize: 14 };

export default function Settings() {
  const [studioId, setStudio] = useState(getStudioId());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [integrationSaved, setIntegrationSaved] = useState(false);
  const [integrationError, setIntegrationError] = useState('');
  const [loadingIntegration, setLoadingIntegration] = useState(false);

  const [linkedinClientId, setLinkedinClientId] = useState('');
  const [linkedinClientSecret, setLinkedinClientSecret] = useState('');
  const [linkedinRedirectUri, setLinkedinRedirectUri] = useState('');
  const [linkedinScopes, setLinkedinScopes] = useState('r_liteprofile,w_member_social');
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [metaRedirectUri, setMetaRedirectUri] = useState('');
  const [metaScopes, setMetaScopes] = useState('pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,instagram_manage_insights');
  const [hasLinkedInSecret, setHasLinkedInSecret] = useState(false);
  const [hasMetaSecret, setHasMetaSecret] = useState(false);

  const loadIntegrationSettings = async () => {
    setLoadingIntegration(true);
    setIntegrationError('');
    try {
      const r = await api.get<{
        effective: {
          linkedin_client_id: string | null;
          linkedin_redirect_uri: string | null;
          linkedin_scopes: string | null;
          meta_app_id: string | null;
          meta_redirect_uri: string | null;
          meta_scopes: string | null;
          has_linkedin_client_secret: boolean;
          has_meta_app_secret: boolean;
        };
      }>('/team/integration-settings');
      const e = r.data.effective;
      setLinkedinClientId(e.linkedin_client_id || '');
      setLinkedinRedirectUri(e.linkedin_redirect_uri || '');
      setLinkedinScopes(e.linkedin_scopes || 'r_liteprofile,w_member_social');
      setMetaAppId(e.meta_app_id || '');
      setMetaRedirectUri(e.meta_redirect_uri || '');
      setMetaScopes(e.meta_scopes || 'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,instagram_manage_insights');
      setHasLinkedInSecret(Boolean(e.has_linkedin_client_secret));
      setHasMetaSecret(Boolean(e.has_meta_app_secret));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIntegrationError(msg || 'Failed to load integration settings');
    } finally {
      setLoadingIntegration(false);
    }
  };

  useEffect(() => {
    void loadIntegrationSettings();
  }, []);

  const save = async () => {
    setError('');
    setStudioId(studioId.trim());
    try {
      await api.post('/team/bootstrap', { studio_id: studioId.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Unable to access this studio. Ask an owner or manager to invite you.');
    }
  };

  const saveIntegrationSettings = async () => {
    setIntegrationError('');
    try {
      await api.put('/team/integration-settings', {
        linkedin_client_id: linkedinClientId,
        linkedin_client_secret: linkedinClientSecret,
        linkedin_redirect_uri: linkedinRedirectUri,
        linkedin_scopes: linkedinScopes,
        meta_app_id: metaAppId,
        meta_app_secret: metaAppSecret,
        meta_redirect_uri: metaRedirectUri,
        meta_scopes: metaScopes,
      });
      setLinkedinClientSecret('');
      setMetaAppSecret('');
      setIntegrationSaved(true);
      setTimeout(() => setIntegrationSaved(false), 2000);
      await loadIntegrationSettings();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIntegrationError(msg || 'Failed to save integration settings');
    }
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Studio</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          The Studio ID ties MediaFox to your Fox Suite studio. This is set automatically if you arrive from BudgetFox/FoxAuth.
        </p>
        <input style={input} placeholder="Studio ID" value={studioId} onChange={e => setStudio(e.target.value)} />
        <button style={{ marginTop: 12, background: '#f97316', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => { void save(); }}>
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        {error ? <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{error}</p> : null}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>About</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>MediaFox v0.1.0 — Social media management for the Fox Suite</p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Integration OAuth</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          Configure LinkedIn and Meta credentials at runtime per studio. Changes apply immediately without server restart.
        </p>

        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>LinkedIn</h3>
        <input style={input} placeholder="LinkedIn Client ID" value={linkedinClientId} onChange={e => setLinkedinClientId(e.target.value)} />
        <input style={{ ...input, marginTop: 8 }} type="password" placeholder={hasLinkedInSecret ? 'LinkedIn Client Secret (leave blank to keep current)' : 'LinkedIn Client Secret'} value={linkedinClientSecret} onChange={e => setLinkedinClientSecret(e.target.value)} />
        <input style={{ ...input, marginTop: 8 }} placeholder="LinkedIn Redirect URI" value={linkedinRedirectUri} onChange={e => setLinkedinRedirectUri(e.target.value)} />
        <input style={{ ...input, marginTop: 8, marginBottom: 14 }} placeholder="LinkedIn Scopes (comma-separated)" value={linkedinScopes} onChange={e => setLinkedinScopes(e.target.value)} />

        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Facebook / Instagram (Meta)</h3>
        <input style={input} placeholder="Meta App ID" value={metaAppId} onChange={e => setMetaAppId(e.target.value)} />
        <input style={{ ...input, marginTop: 8 }} type="password" placeholder={hasMetaSecret ? 'Meta App Secret (leave blank to keep current)' : 'Meta App Secret'} value={metaAppSecret} onChange={e => setMetaAppSecret(e.target.value)} />
        <input style={{ ...input, marginTop: 8 }} placeholder="Meta Redirect URI" value={metaRedirectUri} onChange={e => setMetaRedirectUri(e.target.value)} />
        <input style={{ ...input, marginTop: 8 }} placeholder="Meta Scopes (comma-separated)" value={metaScopes} onChange={e => setMetaScopes(e.target.value)} />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={{ background: '#334155', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => { void loadIntegrationSettings(); }}>
            {loadingIntegration ? 'Loading...' : 'Reload'}
          </button>
          <button style={{ background: '#f97316', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => { void saveIntegrationSettings(); }}>
            {integrationSaved ? 'Saved ✓' : 'Save OAuth Settings'}
          </button>
        </div>

        {integrationError ? <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{integrationError}</p> : null}
      </div>
    </div>
  );
}
