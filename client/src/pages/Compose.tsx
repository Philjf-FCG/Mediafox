import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

interface Account { id: string; platform: string; display_name: string; type: string; status: string; }
interface LinkPreview { url: string; title: string | null; description: string | null; image: string | null; site_name: string | null; }
interface TikTokAssist {
  id: string;
  caption: string;
  status: 'draft' | 'handed_off' | 'published' | 'cancelled';
  handoff_note: string | null;
  publish_url: string | null;
  created_at: string;
}

const URL_REGEX = /https?:\/\/[^\s]+/;

const LIMITS: Record<string, number> = {
  bluesky: 300, linkedin: 3000, facebook: 63206, instagram: 2200, discord: 2000, slack: 4000,
};

const PLATFORM_COLORS: Record<string, string> = {
  bluesky: '#0085ff', linkedin: '#0a66c2', facebook: '#1877f2',
  instagram: '#e1306c', discord: '#5865f2', slack: '#4a154b',
};

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const label: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' };
const input: React.CSSProperties = { background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%', fontSize: 14 };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', minHeight: 120, fontFamily: 'inherit', lineHeight: 1.6 };
const btn = (primary = false): React.CSSProperties => ({
  padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
  background: primary ? '#f97316' : '#2d3748', color: primary ? '#fff' : '#e2e8f0',
});
const chip = (active: boolean, color?: string): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 20, border: `2px solid ${active ? (color ?? '#f97316') : '#2d3748'}`,
  background: active ? `${color ?? '#f97316'}1a` : 'transparent', color: active ? (color ?? '#f97316') : '#64748b',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
});

export default function Compose() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');
  const [perVariant, setPerVariant] = useState(false);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [scheduledAt, setScheduledAt] = useState('');
  const [postType, setPostType] = useState<'company' | 'personal'>('company');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastPostId, setLastPostId] = useState<string | null>(null);
  const [tiktokCaption, setTiktokCaption] = useState('');
  const [tiktokNote, setTiktokNote] = useState('');
  const [tiktokSubmitting, setTiktokSubmitting] = useState(false);
  const [tiktokAssists, setTiktokAssists] = useState<TikTokAssist[]>([]);
  const [loadingTikTokAssists, setLoadingTikTokAssists] = useState(false);
  const [completingAssistId, setCompletingAssistId] = useState<string | null>(null);
  const [publishUrlByAssistId, setPublishUrlByAssistId] = useState<Record<string, string>>({});
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ accounts: Account[] }>('/accounts').then(r => setAccounts(r.data.accounts.filter(a => a.status === 'active'))).catch(() => {});
  }, []);

  const toggleAccount = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const getBody = (accountId: string) => perVariant ? (variants[accountId] ?? body) : body;

  const suggestCaption = async () => {
    if (!body && selected.size === 0) return;
    setAiLoading(true);
    const firstAccount = accounts.find(a => selected.has(a.id));
    try {
      const r = await api.post<{ suggestions: string[] }>('/ai/suggest-caption', {
        existing_copy: body || undefined,
        topic: body || 'social media post',
        platform: firstAccount?.platform,
      });
      setAiSuggestions(r.data.suggestions);
    } catch { /* silent */ }
    finally { setAiLoading(false); }
  };

  const suggestHashtags = async () => {
    if (!body) return;
    setAiLoading(true);
    const firstAccount = accounts.find(a => selected.has(a.id));
    try {
      const r = await api.post<{ hashtags: string[] }>('/ai/suggest-hashtags', { text: body, platform: firstAccount?.platform });
      setHashtags(r.data.hashtags);
    } catch { /* silent */ }
    finally { setAiLoading(false); }
  };

  const fetchLinkPreview = (text: string) => {
    const match = text.match(URL_REGEX);
    if (!match) { setLinkPreview(null); return; }
    const url = match[0];
    if (linkPreview?.url === url) return;
    if (previewDebounce.current) clearTimeout(previewDebounce.current);
    previewDebounce.current = setTimeout(() => {
      api.get<LinkPreview>(`/media/link-preview?url=${encodeURIComponent(url)}`)
        .then(r => setLinkPreview(r.data.title ? r.data : null))
        .catch(() => setLinkPreview(null));
    }, 800);
  };

  const buildVariants = () =>
    Array.from(selected).map(accountId => ({ account_id: accountId, body: getBody(accountId), media_ids: [] }));

  const handleSaveDraft = useCallback(async () => {
    if (!selected.size) { setStatus('Select at least one account'); return; }
    setSaving(true);
    try {
      const r = await api.post<{ post: { id: string } }>('/posts', { title: body.slice(0, 50), variants: buildVariants() });
      setLastPostId(r.data.post.id);
      setTiktokCaption(body);
      setStatus('Draft saved ✓');
      setBody(''); setSelected(new Set()); setVariants({});
    } catch { setStatus('Save failed'); }
    finally { setSaving(false); }
  }, [selected, body, variants, perVariant]);

  const handlePublish = useCallback(async () => {
    if (!selected.size) { setStatus('Select at least one account'); return; }
    setSaving(true);
    try {
      const res = await api.post<{ post: { id: string } }>('/posts', { title: body.slice(0, 50), variants: buildVariants() });
      setLastPostId(res.data.post.id);
      setTiktokCaption(body);
      if (scheduledAt) {
        await api.post(`/posts/${res.data.post.id}/schedule`, { scheduled_at: scheduledAt });
        setStatus(`Scheduled for ${new Date(scheduledAt).toLocaleString()} ✓`);
      } else {
        await api.post(`/posts/${res.data.post.id}/publish`);
        setStatus('Publishing… ✓');
      }
      setBody(''); setSelected(new Set()); setVariants({}); setScheduledAt('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setStatus(e.response?.data?.error ?? 'Publish failed');
    }
    finally { setSaving(false); }
  }, [selected, body, variants, perVariant, scheduledAt]);

  const createTikTokAssist = useCallback(async () => {
    if (!lastPostId) { setStatus('Create a post first'); return; }
    if (!tiktokCaption.trim()) { setStatus('TikTok caption is required'); return; }
    setTiktokSubmitting(true);
    try {
      await api.post(`/posts/${lastPostId}/tiktok-assists`, {
        caption: tiktokCaption.trim(),
        handoff_note: tiktokNote.trim() || undefined,
      });
      setStatus('TikTok handoff created ✓');
      setTiktokNote('');
      const list = await api.get<{ assists: TikTokAssist[] }>(`/posts/${lastPostId}/tiktok-assists`);
      setTiktokAssists(list.data.assists || []);
    } catch {
      setStatus('Failed to create TikTok handoff');
    } finally {
      setTiktokSubmitting(false);
    }
  }, [lastPostId, tiktokCaption, tiktokNote]);

  const loadTikTokAssists = useCallback(async (postId: string) => {
    setLoadingTikTokAssists(true);
    try {
      const r = await api.get<{ assists: TikTokAssist[] }>(`/posts/${postId}/tiktok-assists`);
      setTiktokAssists(r.data.assists || []);
    } catch {
      setTiktokAssists([]);
    } finally {
      setLoadingTikTokAssists(false);
    }
  }, []);

  const completeTikTokAssist = useCallback(async (assistId: string) => {
    if (!lastPostId) return;
    const publishUrl = (publishUrlByAssistId[assistId] || '').trim();
    if (!/^https?:\/\//i.test(publishUrl)) {
      setStatus('TikTok publish URL must start with http:// or https://');
      return;
    }

    setCompletingAssistId(assistId);
    try {
      await api.post(`/posts/${lastPostId}/tiktok-assists/${assistId}/complete`, { publish_url: publishUrl });
      setStatus('TikTok handoff marked published ✓');
      setPublishUrlByAssistId(prev => ({ ...prev, [assistId]: '' }));
      await loadTikTokAssists(lastPostId);
    } catch {
      setStatus('Failed to mark TikTok handoff published');
    } finally {
      setCompletingAssistId(null);
    }
  }, [lastPostId, publishUrlByAssistId, loadTikTokAssists]);

  useEffect(() => {
    if (!lastPostId) {
      setTiktokAssists([]);
      setPublishUrlByAssistId({});
      return;
    }
    void loadTikTokAssists(lastPostId);
  }, [lastPostId, loadTikTokAssists]);

  const selectedAccounts = accounts.filter(a => selected.has(a.id));

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Compose</h1>

      {/* Context */}
      <div style={card}>
        <span style={label}>Posting as</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['company', 'personal'] as const).map(t => (
            <button key={t} style={chip(postType === t)} onClick={() => setPostType(t)}>
              {t === 'company' ? '🏢 Company' : '👤 Personal'}
            </button>
          ))}
        </div>
      </div>

      {/* Platform selector */}
      <div style={card}>
        <span style={label}>Platforms & Accounts</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {accounts.filter(a => a.type === postType).map(a => (
            <button key={a.id} style={chip(selected.has(a.id), PLATFORM_COLORS[a.platform])}
              onClick={() => toggleAccount(a.id)}>
              {a.platform} · {a.display_name}
            </button>
          ))}
          {accounts.filter(a => a.type === postType).length === 0 && (
            <p style={{ color: '#64748b', fontSize: 14 }}>No {postType} accounts connected. <a href="/accounts" style={{ color: '#f97316' }}>Connect one →</a></p>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={label}>Post content</span>
          {selected.size > 1 && (
            <button style={{ ...btn(), fontSize: 12, padding: '4px 12px' }} onClick={() => setPerVariant(v => !v)}>
              {perVariant ? '⬆ Merge to single' : '↔ Edit per platform'}
            </button>
          )}
        </div>

        {!perVariant ? (
          <>
            <textarea style={textarea} value={body} onChange={e => { setBody(e.target.value); fetchLinkPreview(e.target.value); }} placeholder="What do you want to say?" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={{ ...btn(), fontSize: 12, padding: '4px 12px' }} onClick={suggestCaption} disabled={aiLoading}>
                {aiLoading ? '…' : '✦ Suggest'}
              </button>
              <button style={{ ...btn(), fontSize: 12, padding: '4px 12px' }} onClick={suggestHashtags} disabled={aiLoading || !body}>
                # Hashtags
              </button>
            </div>
            {aiSuggestions.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aiSuggestions.map((s, i) => (
                  <div key={i} style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 12, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}
                    onClick={() => { setBody(s); setAiSuggestions([]); }}>
                    {s}
                  </div>
                ))}
                <button style={{ ...btn(), fontSize: 12, padding: '4px 12px', alignSelf: 'flex-start' }} onClick={() => setAiSuggestions([])}>Dismiss</button>
              </div>
            )}
            {hashtags.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {hashtags.map(h => (
                  <button key={h} style={{ ...chip(false), fontSize: 12, padding: '3px 10px' }}
                    onClick={() => { setBody(b => b + ' ' + h); setHashtags(ht => ht.filter(x => x !== h)); }}>
                    {h}
                  </button>
                ))}
              </div>
            )}
            {selectedAccounts.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {selectedAccounts.map(a => {
                  const limit = LIMITS[a.platform] ?? 5000;
                  const over = body.length > limit;
                  return (
                    <span key={a.id} style={{ fontSize: 12, color: over ? '#ef4444' : '#64748b' }}>
                      {a.platform}: {body.length}/{limit}{over ? ' ⚠ over limit' : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          selectedAccounts.map(a => {
            const limit = LIMITS[a.platform] ?? 5000;
            const text = variants[a.id] ?? body;
            const over = text.length > limit;
            return (
              <div key={a.id} style={{ marginBottom: 16 }}>
                <span style={{ ...label, color: PLATFORM_COLORS[a.platform] }}>{a.platform} · {a.display_name}</span>
                <textarea style={{ ...textarea, borderColor: over ? '#ef4444' : '#2d3748' }}
                  value={text}
                  onChange={e => setVariants(v => ({ ...v, [a.id]: e.target.value }))}
                  placeholder={`Post for ${a.platform}…`} />
                <span style={{ fontSize: 12, color: over ? '#ef4444' : '#64748b' }}>{text.length}/{limit}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Link preview card */}
      {linkPreview && (
        <div style={{ ...card, display: 'flex', gap: 16, padding: 16, border: '1px solid #2d3748' }}>
          {linkPreview.image && (
            <img src={linkPreview.image} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{linkPreview.site_name ?? new URL(linkPreview.url).hostname}</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkPreview.title}</div>
            {linkPreview.description && <div style={{ fontSize: 13, color: '#94a3b8', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{linkPreview.description}</div>}
          </div>
          <button onClick={() => setLinkPreview(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, alignSelf: 'flex-start' }}>×</button>
        </div>
      )}

      {/* Schedule */}
      <div style={card}>
        <span style={label}>Schedule (optional — leave blank to publish now)</span>
        <input type="datetime-local" style={input} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
      </div>

      {status && <p style={{ color: status.includes('✓') ? '#22c55e' : '#ef4444', marginBottom: 16, fontSize: 14 }}>{status}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btn()} onClick={handleSaveDraft} disabled={saving}>Save Draft</button>
        <button style={btn(true)} onClick={handlePublish} disabled={saving}>
          {scheduledAt ? 'Schedule' : 'Publish Now'}
        </button>
      </div>

      {lastPostId && (
        <div style={{ ...card, marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>TikTok Assisted Handoff</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Create a handoff task for manual TikTok Business publish and track completion URL later.</p>
          <span style={label}>Caption</span>
          <textarea style={{ ...textarea, minHeight: 90, marginBottom: 10 }} value={tiktokCaption} onChange={e => setTiktokCaption(e.target.value)} placeholder="TikTok caption" />
          <span style={label}>Handoff note (optional)</span>
          <input style={{ ...input, marginBottom: 10 }} value={tiktokNote} onChange={e => setTiktokNote(e.target.value)} placeholder="Who should publish, timing, CTA, etc." />
          <button style={{ ...btn(true), background: '#111827' }} onClick={() => { void createTikTokAssist(); }} disabled={tiktokSubmitting}>
            {tiktokSubmitting ? 'Creating…' : 'Create TikTok Handoff'}
          </button>

          <div style={{ marginTop: 14, borderTop: '1px solid #2d3748', paddingTop: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Current Handoffs</h3>
            {loadingTikTokAssists && <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading handoffs…</p>}
            {!loadingTikTokAssists && tiktokAssists.length === 0 && (
              <p style={{ color: '#64748b', fontSize: 13 }}>No TikTok handoffs created for this post yet.</p>
            )}
            {!loadingTikTokAssists && tiktokAssists.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {tiktokAssists.map(assist => (
                  <div key={assist.id} style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>Status: {assist.status}</span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>{new Date(assist.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{assist.caption}</p>
                    {assist.handoff_note && <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>Note: {assist.handoff_note}</p>}
                    {assist.publish_url ? (
                      <a href={assist.publish_url} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontSize: 12 }}>Published URL ↗</a>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={input}
                          placeholder="https://www.tiktok.com/@account/video/..."
                          value={publishUrlByAssistId[assist.id] ?? ''}
                          onChange={e => setPublishUrlByAssistId(prev => ({ ...prev, [assist.id]: e.target.value }))}
                        />
                        <button
                          style={{ ...btn(true), whiteSpace: 'nowrap' }}
                          onClick={() => { void completeTikTokAssist(assist.id); }}
                          disabled={completingAssistId === assist.id}
                        >
                          {completingAssistId === assist.id ? 'Saving…' : 'Mark Published'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
