import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────
interface AppUser {
  _id: string;
  username: string;
  role: 'admin' | 'user' | 'technician';
  isOnline: boolean;
  lastSeen?: string;
}

interface DirectMessage {
  _id: string;
  from: string;
  fromRole: string;
  to: string;
  text: string;
  read: boolean;
  createdAt: string;
}

interface MessagingPageProps {
  currentUsername: string;
  currentRole: string;
  token: string;
  socket: import('socket.io-client').Socket;
}

// ─── Helpers ─────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  admin:      '#ef4444',
  technician: '#3b82f6',
  user:       '#22c55e',
};

const ROLE_LABELS: Record<string, string> = {
  admin:      'Admin',
  technician: 'Technicien',
  user:       'Utilisateur',
};

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60)    return 'maintenant';
  if (s < 3600)  return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ username, role, size = 40, online }: { username: string; role: string; size?: number; online?: boolean }) {
  const color = ROLE_COLORS[role] || '#64748b';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `${color}20`,
        border: `1.5px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, color,
      }}>
        {username[0]?.toUpperCase()}
      </div>
      {online !== undefined && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: size * 0.28, height: size * 0.28, borderRadius: '50%',
          background: online ? '#22c55e' : '#334155',
          border: `2px solid #0f172a`,
          boxShadow: online ? '0 0 6px #22c55e88' : 'none',
        }} />
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────
export default function MessagingPage({ currentUsername, currentRole, token, socket }: MessagingPageProps) {
  const [users, setUsers]               = useState<AppUser[]>([]);
  const [activeUser, setActiveUser]     = useState<AppUser | null>(null);
  const [messages, setMessages]         = useState<DirectMessage[]>([]);
  const [input, setInput]               = useState('');
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load users & unread counts ──
  useEffect(() => {
    fetch('http://localhost:5000/api/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => setUsers(data.filter((u: AppUser) => u.username !== currentUsername)))
      .catch(console.error);

    fetch('http://localhost:5000/api/messages/unread/counts', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(setUnreadCounts)
      .catch(console.error);
  }, [token, currentUsername]);

  // ── Socket listeners ──
  useEffect(() => {
    const handleDM = (msg: DirectMessage) => {
      // Update messages if conversation is open
      if (
        activeUser &&
        ((msg.from === activeUser.username && msg.to === currentUsername) ||
         (msg.from === currentUsername && msg.to === activeUser.username))
      ) {
        setMessages(prev => {
          if (prev.some(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      } else if (msg.from !== currentUsername) {
        // Increment unread count
        setUnreadCounts(prev => ({ ...prev, [msg.from]: (prev[msg.from] || 0) + 1 }));
      }
    };

    const handleUserStatus = (data: { username: string; isOnline: boolean; lastSeen?: string }) => {
      setUsers(prev => prev.map(u =>
        u.username === data.username
          ? { ...u, isOnline: data.isOnline, lastSeen: data.lastSeen }
          : u
      ));
      if (activeUser?.username === data.username) {
        setActiveUser(prev => prev ? { ...prev, isOnline: data.isOnline } : null);
      }
    };

    const handleMessagesRead = ({ from }: { from: string }) => {
      setUnreadCounts(prev => { const n = { ...prev }; delete n[from]; return n; });
    };

    socket.on('direct-message', handleDM);
    socket.on('user-status',    handleUserStatus);
    socket.on('messages-read',  handleMessagesRead);

    return () => {
      socket.off('direct-message', handleDM);
      socket.off('user-status',    handleUserStatus);
      socket.off('messages-read',  handleMessagesRead);
    };
  }, [socket, activeUser, currentUsername]);

  // ── Auto scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Select conversation ──
  const selectUser = useCallback(async (u: AppUser) => {
    setActiveUser(u);
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/messages/${u.username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const msgs = await res.json();
      setMessages(msgs);
      setUnreadCounts(prev => { const n = { ...prev }; delete n[u.username]; return n; });
      socket.emit('mark-read', { from: u.username, to: currentUsername });
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [token, socket, currentUsername]);

  // ── Send message ──
  const handleSend = () => {
    if (!input.trim() || !activeUser) return;
    socket.emit('send-direct-message', {
      from:     currentUsername,
      fromRole: currentRole,
      to:       activeUser.username,
      text:     input.trim(),
    });
    setInput('');
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const filteredUsers = users
    .filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      const ua = unreadCounts[a.username] || 0;
      const ub = unreadCounts[b.username] || 0;
      if (ua !== ub) return ub - ua;
      return a.username.localeCompare(b.username);
    });

  return (
    <div style={{
      height: '100vh', display: 'flex',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      background: '#0f172a',
    }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: 280, borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        background: '#0a1628',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
              💬 Messagerie
            </h2>
            {totalUnread > 0 && (
              <div style={{
                background: '#ef4444', color: '#fff', borderRadius: 10,
                padding: '2px 8px', fontSize: 10, fontWeight: 700,
              }}>
                {totalUnread}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '8px 12px',
          }}>
            <span style={{ color: '#475569', fontSize: 13 }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: '#e2e8f0', fontSize: 13, width: '100%',
              }}
            />
          </div>
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredUsers.map(u => {
            const unread = unreadCounts[u.username] || 0;
            const isActive = activeUser?._id === u._id;
            return (
              <button
                key={u._id}
                onClick={() => selectUser(u)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  padding: '12px 16px', border: 'none', cursor: 'pointer',
                  background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                  transition: 'all 0.12s', textAlign: 'left',
                }}
              >
                <Avatar username={u.username} role={u.role} size={38} online={u.isOnline} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username}
                    </span>
                    {unread > 0 && (
                      <div style={{
                        background: '#ef4444', color: '#fff', borderRadius: '50%',
                        width: 18, height: 18, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>
                        {unread}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: ROLE_COLORS[u.role] || '#64748b' }}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    <span style={{ fontSize: 10, color: '#334155' }}>·</span>
                    <span style={{ fontSize: 10, color: u.isOnline ? '#22c55e' : '#475569' }}>
                      {u.isOnline ? '● En ligne' : u.lastSeen ? `vu ${timeAgo(u.lastSeen)}` : '○ Hors ligne'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredUsers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#334155', fontSize: 12, padding: 30 }}>
              Aucun utilisateur trouvé
            </div>
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeUser ? (
          <>
            {/* Chat header */}
            <div style={{
              padding: '14px 22px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#0a1628',
            }}>
              <Avatar username={activeUser.username} role={activeUser.role} size={36} online={activeUser.isOnline} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{activeUser.username}</div>
                <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: ROLE_COLORS[activeUser.role] || '#64748b' }}>
                    {ROLE_LABELS[activeUser.role] || activeUser.role}
                  </span>
                  <span style={{ color: '#334155' }}>·</span>
                  <span style={{ color: activeUser.isOnline ? '#22c55e' : '#475569' }}>
                    {activeUser.isOnline ? '● En ligne' : '○ Hors ligne'}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {loading && (
                <div style={{ textAlign: 'center', color: '#334155', fontSize: 12, padding: 20 }}>
                  Chargement...
                </div>
              )}
              {messages.map((msg, idx) => {
                const isMe = msg.from === currentUsername;
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const showTime = !prevMsg || new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 300000;
                const showAvatar = !isMe && (!prevMsg || prevMsg.from !== msg.from);
                const roleColor = ROLE_COLORS[msg.fromRole] || '#64748b';

                return (
                  <div key={msg._id}>
                    {showTime && (
                      <div style={{ textAlign: 'center', margin: '10px 0 6px', fontSize: 10, color: '#334155' }}>
                        ── {fmtTime(msg.createdAt)} ──
                      </div>
                    )}
                    {!isMe && showAvatar && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingLeft: 32 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: roleColor }}>{msg.from}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                          background: `${roleColor}20`, color: roleColor, border: `1px solid ${roleColor}40`,
                          textTransform: 'uppercase',
                        }}>
                          {ROLE_LABELS[msg.fromRole] || msg.fromRole}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginBottom: 2 }}>
                      {!isMe && (
                        <div style={{ width: 24, flexShrink: 0 }}>
                          {showAvatar && (
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: `${roleColor}20`, border: `1px solid ${roleColor}44`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: roleColor,
                            }}>
                              {msg.from[0]}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '60%', padding: '10px 14px',
                        borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMe
                          ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                          : 'rgba(255,255,255,0.06)',
                        color: '#e2e8f0',
                        fontSize: 13, lineHeight: 1.55,
                        border: !isMe ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        boxShadow: isMe ? '0 2px 12px rgba(59,130,246,0.25)' : 'none',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && !loading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 13 }}>
                  Démarrez la conversation avec {activeUser.username}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '12px 22px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', gap: 10, alignItems: 'center',
              background: '#0a1628',
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Message à ${activeUser.username}...`}
                autoFocus
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '11px 16px',
                  color: '#e2e8f0', fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(255,255,255,0.04)',
                  border: 'none', borderRadius: 10, padding: '11px 20px',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  color: input.trim() ? '#fff' : '#334155',
                  fontSize: 13, fontWeight: 700,
                  transition: 'all 0.15s',
                  boxShadow: input.trim() ? '0 2px 12px rgba(59,130,246,0.3)' : 'none',
                }}
              >
                ➤
              </button>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 14,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>💬</div>
            <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
              Sélectionnez une conversation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}