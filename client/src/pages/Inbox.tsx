import { useEffect, useState } from 'react';
import { api } from '../api';

interface InboxItem {
  id: string; platform: string; type: string; author_name: string | null;
  body: string | null; status: string; received_at: string; account_id: string;
}

interface Account { id: string; platform: string; display_name: string; }

const PLATFORM_COLORS: Record<string, string> = {
  bluesky: '#0085ff', linkedin: '#0a66c2', facebook: '#1877f2',
  instagram: '#e1306c', discord: '#5865f2', slack: '#4a154b',
};

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 0, overflow: 'hidden' };

export default function Inbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState<'unread' | 'all' | 'resolved'>('unread');
  const [replying, setReplying] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    const status = filter === 'all' ? undefined : filter;
    api.get<{ items: InboxItem[] }>('/inbox', { params: status ? { status } : {} })
      .then(r => setItems(r.data.items)).catch(() => {});
  };

  useEffect(() => {
    api.get<{ accounts: Account[] }>('/accounts').then(r => setAccounts(r.data.accounts)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filter]);

  const markRead = (id: string) => {
    api.put(`/inbox/${id}`, { status: 'read' }).then(load).catch(() => {});
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: 'read' } : prev);
  };

  const handleReply = async () => {
    if (!reply.trim() || !selected) return;
    setReplying(true);
    try {
      await api.post(`/inbox/${selected.id}/reply`, { text: reply, account_id: selected.account_id });
      setMsg('Replied ✓');
      setReply('');
      load();
    } catch { setMsg('Reply failed'); }
    finally { setReplying(false); }
  };

  const filtered = items.filter(i => filter === 'all' ? true : i.status === filter);

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 96px)' }}>
      {/* Left panel */}
      <div style={{ width: 320, flexShrink: 0 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Inbox</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['unread', 'all', 'resolved'] as const).map(f => (
            <button key={f} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? '#f97316' : '#2d3748', color: filter === f ? '#fff' : '#94a3b8' }} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <div style={{ ...card, overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          {filtered.length === 0 && <p style={{ padding: 20, color: '#64748b', fontSize: 14 }}>No items</p>}
          {filtered.map(item => (
            <div key={item.id}
              style={{ padding: '14px 16px', borderBottom: '1px solid #2d3748', cursor: 'pointer', background: selected?.id === item.id ? '#161b27' : 'transparent', borderLeft: `3px solid ${PLATFORM_COLORS[item.platform] ?? '#64748b'}` }}
              onClick={() => { setSelected(item); if (item.status === 'unread') markRead(item.id); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: PLATFORM_COLORS[item.platform] }}>{item.platform}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(item.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ fontWeight: item.status === 'unread' ? 700 : 400, fontSize: 13, marginBottom: 2 }}>{item.author_name ?? 'Unknown'}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.body ?? '(no content)'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, background: '#1e2333', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Select a message</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: PLATFORM_COLORS[selected.platform] }}>{selected.platform} · {selected.type}</span>
              <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>from {selected.author_name ?? 'Unknown'}</span>
            </div>
            <div style={{ flex: 1, color: '#e2e8f0', fontSize: 15, lineHeight: 1.6, overflowY: 'auto' }}>{selected.body ?? '(no content)'}</div>
            <div style={{ borderTop: '1px solid #2d3748', paddingTop: 16, marginTop: 16 }}>
              {msg && <p style={{ color: msg.includes('✓') ? '#22c55e' : '#ef4444', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
              <textarea
                style={{ width: '100%', background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, resize: 'none', minHeight: 80, fontFamily: 'inherit' }}
                placeholder="Write a reply…"
                value={reply}
                onChange={e => setReply(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
                <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                  onClick={() => { api.put(`/inbox/${selected.id}`, { status: 'resolved' }).then(load); setSelected(null); }}>
                  Resolve
                </button>
                <button style={{ background: '#f97316', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={handleReply} disabled={replying || !reply.trim()}>
                  {replying ? 'Sending…' : 'Reply'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
