import { useEffect, useState, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { api } from '../api';

interface Post { id: string; status: string; scheduled_at: string | null; published_at: string | null; title: string | null; variants: { account_id: string }[]; }

const STATUS_COLORS: Record<string, string> = { scheduled: '#3b82f6', published: '#22c55e', failed: '#ef4444', default: '#64748b' };
const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24 };

export default function Calendar() {
  const [month, setMonth] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [rescheduleMsg, setRescheduleMsg] = useState('');

  const load = useCallback(() => {
    const from = startOfMonth(month).toISOString();
    const to = endOfMonth(month).toISOString();
    api.get<{ posts: Post[] }>(`/posts/calendar?from=${from}&to=${to}`)
      .then(r => setPosts(r.data.posts)).catch(() => {});
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const getPostDate = (p: Post) => p.scheduled_at ?? p.published_at;
  const postsOnDay = (day: Date) => posts.filter(p => { const d = getPostDate(p); return d && isSameDay(new Date(d), day); });

  const handleDrop = async (day: Date) => {
    if (!dragging) return;
    const post = posts.find(p => p.id === dragging);
    if (!post || post.status !== 'scheduled') return;

    const existing = post.scheduled_at ? new Date(post.scheduled_at) : new Date();
    const newDate = new Date(day);
    newDate.setHours(existing.getHours(), existing.getMinutes(), 0, 0);

    if (isSameDay(newDate, existing)) return;

    try {
      await api.post(`/posts/${post.id}/schedule`, { scheduled_at: newDate.toISOString() });
      setRescheduleMsg(`Rescheduled to ${format(newDate, 'MMM d')}`);
      setTimeout(() => setRescheduleMsg(''), 3000);
      load();
    } catch {
      setRescheduleMsg('Reschedule failed');
      setTimeout(() => setRescheduleMsg(''), 2000);
    }
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Calendar</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {rescheduleMsg && <span style={{ fontSize: 13, color: rescheduleMsg.includes('failed') ? '#ef4444' : '#22c55e' }}>{rescheduleMsg}</span>}
          <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }} onClick={() => setMonth(m => subMonths(m, 1))}>‹</button>
          <span style={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>{format(month, 'MMMM yyyy')}</span>
          <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }} onClick={() => setMonth(m => addMonths(m, 1))}>›</button>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#161b27' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#2d3748' }}>
          {Array.from({ length: startOfMonth(month).getDay() }).map((_, i) => (
            <div key={`pad-${i}`} style={{ background: '#161b27', minHeight: 90 }} />
          ))}

          {days.map(day => {
            const dayKey = day.toISOString();
            const dayPosts = postsOnDay(day);
            const isToday = isSameDay(day, new Date());
            const isOver = dragOver === dayKey;
            return (
              <div key={dayKey}
                style={{ background: isOver ? '#263040' : '#1e2333', minHeight: 90, padding: 8, cursor: dayPosts.length ? 'pointer' : 'default', transition: 'background .15s', outline: isOver ? '2px solid #3b82f6' : 'none', outlineOffset: -2 }}
                onDragOver={e => { e.preventDefault(); setDragOver(dayKey); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => { handleDrop(day); setDragOver(null); }}
                onClick={() => dayPosts.length === 1 && setSelected(dayPosts[0])}>
                <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 400, color: isToday ? '#f97316' : '#94a3b8', marginBottom: 4 }}>
                  {format(day, 'd')}
                </div>
                {dayPosts.slice(0, 3).map(p => (
                  <div key={p.id}
                    draggable={p.status === 'scheduled'}
                    onDragStart={() => setDragging(p.id)}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    style={{ background: STATUS_COLORS[p.status] ?? STATUS_COLORS.default, borderRadius: 3, padding: '2px 5px', fontSize: 10, color: '#fff', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: p.status === 'scheduled' ? 'grab' : 'pointer', opacity: dragging === p.id ? 0.5 : 1 }}
                    onClick={e => { e.stopPropagation(); setSelected(p); }}>
                    {p.title ?? 'Post'}
                  </div>
                ))}
                {dayPosts.length > 3 && <div style={{ fontSize: 10, color: '#64748b' }}>+{dayPosts.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12 }}>
        {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'default').map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: v, display: 'inline-block' }} />
            {k}
          </span>
        ))}
        <span style={{ color: '#64748b' }}>Drag scheduled posts to reschedule</span>
      </div>

      {/* Post detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setSelected(null)}>
          <div style={{ background: '#1e2333', borderRadius: 16, padding: 32, maxWidth: 480, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: 12 }}>{selected.title ?? 'Post'}</h3>
            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>
              {selected.scheduled_at && `Scheduled: ${new Date(selected.scheduled_at).toLocaleString()}`}
              {selected.published_at && `Published: ${new Date(selected.published_at).toLocaleString()}`}
            </div>
            <span style={{ background: STATUS_COLORS[selected.status], color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{selected.status}</span>
            <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>{selected.variants.length} variant(s)</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={{ background: '#2d3748', border: 'none', color: '#e2e8f0', padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }} onClick={() => setSelected(null)}>Close</button>
              <a href="/compose" style={{ background: '#f97316', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>+ New Post</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
