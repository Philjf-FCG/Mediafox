import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AppTheme } from '../theme';

interface Member { user_id: string; email: string; name: string; role: string; joined_at: string; }

const ROLE_COLORS: Record<string, string> = { owner: '#f97316', manager: '#a78bfa', editor: '#60a5fa', viewer: '#94a3b8' };

export default function Team({ colors }: { colors: AppTheme }) {
  const card: React.CSSProperties = { background: colors.surface2, borderRadius: 12, padding: 24, marginBottom: 20 };
  const input: React.CSSProperties = { background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.text, borderRadius: 8, padding: '10px 14px', fontSize: 14 };

  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState('');
  const [invite, setInvite] = useState({ email: '', name: '', role: 'editor' });
  const [msg, setMsg] = useState('');

  const load = () => api.get<{ members: Member[]; my_role: string }>('/team').then(r => { setMembers(r.data.members); setMyRole(r.data.my_role); }).catch(() => {});
  useEffect(() => { void load(); }, []);

  const handleInvite = async () => {
    try {
      await api.post('/team/invite', invite);
      setMsg(`${invite.name} added ✓`); setInvite({ email: '', name: '', role: 'editor' }); load();
    } catch (e: unknown) { setMsg((e as {response?:{data?:{error?:string}}}).response?.data?.error ?? 'Failed'); }
  };

  const canManage = ['owner', 'manager'].includes(myRole);

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: colors.text }}>Team</h1>

      {msg && <p style={{ color: msg.includes('✓') ? '#22c55e' : '#ef4444', marginBottom: 16, fontSize: 14 }}>{msg}</p>}

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: colors.text }}>Members</h2>
        {members.map(m => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>{m.name}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>{m.email}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLORS[m.role] ?? colors.textMuted, background: colors.inputBg, padding: '3px 10px', borderRadius: 10 }}>{m.role.toUpperCase()}</span>
          </div>
        ))}
        {members.length === 0 && <p style={{ color: colors.textMuted, fontSize: 14 }}>No members yet.</p>}
      </div>

      {canManage && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: colors.text }}>Add Member</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input style={{ ...input, flex: 1 }} placeholder="Name" value={invite.name} onChange={e => setInvite(v => ({ ...v, name: e.target.value }))} />
            <input style={{ ...input, flex: 1 }} placeholder="Email" value={invite.email} onChange={e => setInvite(v => ({ ...v, email: e.target.value }))} />
            <select style={{ ...input }} value={invite.role} onChange={e => setInvite(v => ({ ...v, role: e.target.value }))}>
              <option value="manager">Manager</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button style={{ background: '#f97316', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={handleInvite}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
