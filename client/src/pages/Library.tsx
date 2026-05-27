import { useEffect, useState, useRef } from 'react';
import { api } from '../api';

interface Asset { id: string; filename: string; mime_type: string; file_size: number; width: number | null; height: number | null; tags: string[]; created_at: string; url: string; }

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const input: React.CSSProperties = { background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 14 };

const fmt = (bytes: number) => bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;

export default function Library() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (search?: string) => {
    api.get<{ assets: Asset[] }>('/media', { params: search ? { q: search } : {} })
      .then(r => setAssets(r.data.assets)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('Uploaded ✓'); load();
    } catch { setMsg('Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const deleteAsset = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await api.delete(`/media/${id}`).catch(() => {});
    setSelected(null); load();
  };

  const filtered = q
    ? assets.filter(a => a.filename.toLowerCase().includes(q.toLowerCase()) || a.tags.some(t => t.toLowerCase().includes(q.toLowerCase())))
    : assets;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Media Library</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...input, width: 200 }} placeholder="Search…" value={q} onChange={e => { setQ(e.target.value); load(e.target.value || undefined); }} />
          <button style={{ background: '#f97316', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '+ Upload'}
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept="image/*,video/mp4" onChange={handleUpload} />
        </div>
      </div>

      {msg && <p style={{ color: msg.includes('✓') ? '#22c55e' : '#ef4444', marginBottom: 16, fontSize: 14 }}>{msg}</p>}

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#64748b', padding: 48 }}>
          <p style={{ fontSize: 14, marginBottom: 12 }}>No media files yet.</p>
          <button style={{ background: '#f97316', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => fileRef.current?.click()}>Upload your first file</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {filtered.map(a => (
            <div key={a.id} style={{ background: '#1e2333', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: selected?.id === a.id ? '2px solid #f97316' : '2px solid transparent' }}
              onClick={() => setSelected(a)}>
              {a.mime_type.startsWith('image/') ? (
                <img src={`/api${a.url}`} alt={a.filename} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: 120, background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 28 }}>
                  {a.mime_type.startsWith('video/') ? '▶' : '📄'}
                </div>
              )}
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmt(a.file_size)}{a.width ? ` · ${a.width}×${a.height}` : ''}</div>
                {a.tags.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {a.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, background: '#2d3748', color: '#94a3b8', borderRadius: 3, padding: '1px 5px' }}>{t}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset detail panel */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setSelected(null)}>
          <div style={{ background: '#1e2333', borderRadius: 16, padding: 28, maxWidth: 540, width: '90%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            {selected.mime_type.startsWith('image/') && (
              <img src={`/api${selected.url}`} alt={selected.filename} style={{ width: '100%', borderRadius: 8, marginBottom: 16, maxHeight: 300, objectFit: 'contain' }} />
            )}
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{selected.filename}</h3>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              {fmt(selected.file_size)}{selected.width ? ` · ${selected.width}×${selected.height}px` : ''} · {new Date(selected.created_at).toLocaleDateString()}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>TAGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selected.tags.map(t => (
                  <span key={t} style={{ fontSize: 12, background: '#2d3748', color: '#e2e8f0', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                    onClick={() => {
                      const newTags = selected.tags.filter(x => x !== t);
                      api.put(`/media/${selected.id}/tags`, { tags: newTags }).then(() => { setSelected(s => s ? { ...s, tags: newTags } : s); load(); }).catch(() => {});
                    }}>
                    {t} ×
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...input, flex: 1, padding: '6px 10px', fontSize: 13 }} placeholder="Add tag…" value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' || !tagInput.trim()) return;
                    const newTags = [...new Set([...selected.tags, tagInput.trim()])];
                    api.put(`/media/${selected.id}/tags`, { tags: newTags }).then(() => { setSelected(s => s ? { ...s, tags: newTags } : s); setTagInput(''); load(); }).catch(() => {});
                  }} />
                <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                  onClick={() => {
                    if (!tagInput.trim()) return;
                    const newTags = [...new Set([...selected.tags, tagInput.trim()])];
                    api.put(`/media/${selected.id}/tags`, { tags: newTags }).then(() => { setSelected(s => s ? { ...s, tags: newTags } : s); setTagInput(''); load(); }).catch(() => {});
                  }}>Add</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} onClick={() => deleteAsset(selected.id)}>Delete</button>
              <a href={`/api${selected.url}`} download={selected.filename} style={{ background: '#2d3748', color: '#e2e8f0', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>Download</a>
              <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
