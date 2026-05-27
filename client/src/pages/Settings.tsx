import { useState } from 'react';
import { setStudioId, getStudioId } from '../api';

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const input: React.CSSProperties = { background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%', fontSize: 14 };

export default function Settings() {
  const [studioId, setStudio] = useState(getStudioId());
  const [saved, setSaved] = useState(false);

  const save = () => { setStudioId(studioId); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div style={{ maxWidth: 500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Studio</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          The Studio ID ties MediaFox to your Fox Suite studio. This is set automatically if you arrive from BudgetFox/FoxAuth.
        </p>
        <input style={input} placeholder="Studio ID" value={studioId} onChange={e => setStudio(e.target.value)} />
        <button style={{ marginTop: 12, background: '#f97316', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={save}>
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>About</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>MediaFox v0.1.0 — Social media management for the Fox Suite</p>
      </div>
    </div>
  );
}
