import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { CheckSquare, Plus, Trash2, Calendar, User, Flag, X, Clock, CheckCircle2, Circle } from 'lucide-react';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

interface Task {
  _id: string;
  titre: string;
  description: string;
  priorite: 'haute' | 'moyenne' | 'basse';
  deadline: string | null;
  assigneA: string | null;
  statut: 'à faire' | 'en cours' | 'terminée';
  creePar: string;
  createdAt: string;
}

interface User { username: string; role: string; }

const PRIORITE_CFG = {
  haute:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   label: '🔴 Haute' },
  moyenne: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  label: '🟡 Moyenne' },
  basse:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   label: '🟢 Basse' },
};

const STATUT_CFG = {
  'à faire':  { color: '#94a3b8', icon: <Circle size={15} />,       label: 'À faire' },
  'en cours': { color: '#3b82f6', icon: <Clock size={15} />,        label: 'En cours' },
  'terminée': { color: '#22c55e', icon: <CheckCircle2 size={15} />, label: 'Terminée' },
};

const TasksPage: React.FC = () => {
  const token    = localStorage.getItem('token') || '';
  const role     = localStorage.getItem('role')  || 'user';
  const username = localStorage.getItem('username') || '';
  const isAdmin  = role === 'admin';

  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'toutes' | 'à faire' | 'en cours' | 'terminée'>('toutes');

  // Modal nouvelle task
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ titre: '', description: '', priorite: 'moyenne', deadline: '', assigneA: '' });
  const [formErr,  setFormErr]  = useState('');
  const [formLoad, setFormLoad] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('http://localhost:5000/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setTasks(data);
    } finally { setLoading(false); }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    const res  = await fetch('http://localhost:5000/api/users', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) setUsers(data.filter((u: User) => u.role !== 'admin'));
  }, [token, isAdmin]);

  useEffect(() => { fetchTasks(); fetchUsers(); }, [fetchTasks, fetchUsers]);

  // Socket.IO temps réel
  useEffect(() => {
    socket.on('nouvelle-task', (task: Task) => {
      if (isAdmin || task.assigneA === username)
        setTasks(p => [task, ...p]);
    });
    socket.on('task-updated', (updated: Task) => {
      setTasks(p => p.map(t => t._id === updated._id ? updated : t));
    });
    socket.on('task-deleted', ({ id }: { id: string }) => {
      setTasks(p => p.filter(t => t._id !== id));
    });
    return () => { socket.off('nouvelle-task'); socket.off('task-updated'); socket.off('task-deleted'); };
  }, [isAdmin, username]);

  const handleCreate = async () => {
    if (!form.titre.trim()) { setFormErr('Titre requis'); return; }
    setFormLoad(true); setFormErr('');
    try {
      const res = await fetch('http://localhost:5000/api/tasks', {
        method: 'POST', headers,
        body: JSON.stringify({ ...form, deadline: form.deadline || null, assigneA: form.assigneA || null })
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.message); return; }
      setShowModal(false);
      setForm({ titre: '', description: '', priorite: 'moyenne', deadline: '', assigneA: '' });
    } catch { setFormErr('Erreur serveur'); }
    finally { setFormLoad(false); }
  };

  const handleStatut = async (id: string, statut: Task['statut']) => {
    await fetch(`http://localhost:5000/api/tasks/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ statut })
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette task ?')) return;
    await fetch(`http://localhost:5000/api/tasks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  };

  const filtered = tasks.filter(t => filter === 'toutes' || t.statut === filter);
  const counts   = {
    toutes:     tasks.length,
    'à faire':  tasks.filter(t => t.statut === 'à faire').length,
    'en cours': tasks.filter(t => t.statut === 'en cours').length,
    'terminée': tasks.filter(t => t.statut === 'terminée').length,
  };

  const pCfg = (p: Task['priorite']) => PRIORITE_CFG[p] || PRIORITE_CFG.moyenne;
  const sCfg = (s: Task['statut'])   => STATUT_CFG[s]   || STATUT_CFG['à faire'];

  const nextStatut = (s: Task['statut']): Task['statut'] =>
    s === 'à faire' ? 'en cours' : s === 'en cours' ? 'terminée' : 'à faire';

  // ══════════════════════════════════════════
  // VUE EMPLOYÉ — Cards visuelles
  // ══════════════════════════════════════════
  if (!isAdmin) {
    const total     = tasks.length;
    const terminees = tasks.filter(t => t.statut === 'terminée').length;
    const enCours   = tasks.filter(t => t.statut === 'en cours').length;
    const aFaire    = tasks.filter(t => t.statut === 'à faire').length;
    const progress  = total > 0 ? Math.round((terminees / total) * 100) : 0;

    return (
      <div className="p-6 min-h-full">

        {/* Header personnalisé */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#0066ff] to-[#00d4ff]">
              <CheckSquare size={20} color="white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white m-0">Mes Tâches</h1>
              <p className="text-slate-400 text-xs">Bonjour <span className="text-[#00d4ff] font-semibold">{username}</span> 👋</p>
            </div>
          </div>
        </div>

        {/* Progress global */}
        {total > 0 && (
          <div className="bg-slate-800/50 border border-white/[0.08] rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-sm">Progression globale</span>
              <span className="text-2xl font-bold text-[#00d4ff]">{progress}%</span>
            </div>
            <div className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#0066ff] to-[#00d4ff] transition-all duration-700"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="flex gap-4 mt-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> {aFaire} à faire
              </span>
              <span className="text-xs text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> {enCours} en cours
              </span>
              <span className="text-xs text-green-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> {terminees} terminées
              </span>
            </div>
          </div>
        )}

        {/* Cards tâches */}
        {loading ? (
          <div className="text-center text-slate-400 py-12">Chargement...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/[0.08] flex items-center justify-center text-3xl">📋</div>
            <div className="text-slate-400 text-sm text-center">
              Aucune tâche assignée pour le moment.<br />
              <span className="text-slate-500 text-xs">L'administrateur vous assignera des tâches bientôt.</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {tasks.map(task => {
              const pc = pCfg(task.priorite);
              const sc = sCfg(task.statut);
              const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.statut !== 'terminée';
              const isDone = task.statut === 'terminée';

              return (
                <div key={task._id}
                  className={`rounded-2xl border p-5 transition-all duration-300 ${isDone ? 'bg-slate-800/20 border-white/[0.04] opacity-70' : 'bg-slate-800/50 border-white/[0.08] hover:border-[rgba(0,212,255,0.2)]'}`}>

                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Statut icon cliquable */}
                      <button onClick={() => handleStatut(task._id, nextStatut(task.statut))}
                        title="Changer le statut"
                        className="flex-shrink-0 cursor-pointer bg-transparent border-none p-0 hover:scale-110 transition-transform"
                        style={{ color: sc.color }}>
                        {sc.icon}
                      </button>
                      <span className={`font-semibold text-base ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                        {task.titre}
                      </span>
                    </div>
                    {/* Priorité badge */}
                    <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                      style={{ background: pc.bg, border: `1px solid ${pc.border}`, color: pc.color }}>
                      {pc.label}
                    </span>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-slate-400 text-sm mb-4 leading-relaxed pl-8">{task.description}</p>
                  )}

                  {/* Statut pill + deadline */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pl-8">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Statut pill — cliquable pour changer */}
                      <button onClick={() => handleStatut(task._id, nextStatut(task.statut))}
                        title="Changer le statut"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-none transition-all hover:opacity-80"
                        style={{ background: `${sc.color}18`, border: `1px solid ${sc.color}40`, color: sc.color }}>
                        {sc.icon} {sc.label}
                        <span className="text-[10px] opacity-60 ml-1">→ {nextStatut(task.statut)}</span>
                      </button>
                    </div>

                    {task.deadline && (
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${isOverdue ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-slate-400 bg-slate-700/40 border border-white/[0.06]'}`}>
                        <Calendar size={11} />
                        {isOverdue && '⚠ En retard · '}
                        {new Date(task.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // VUE ADMIN
  // ══════════════════════════════════════════
  return (
    <div className="p-6 min-h-full">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#0066ff] to-[#00d4ff] flex-shrink-0">
          <CheckSquare size={20} color="white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white m-0">Tâches</h1>
          <p className="text-slate-400 text-xs mt-0.5">Gestion et suivi des tâches</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0066ff] to-[#00d4ff] hover:-translate-y-0.5 transition-transform border-none cursor-pointer">
            <Plus size={16} /> Nouvelle tâche
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {([
          { key: 'toutes',     label: 'Total',     color: '#00d4ff' },
          { key: 'à faire',    label: 'À faire',   color: '#94a3b8' },
          { key: 'en cours',   label: 'En cours',  color: '#3b82f6' },
          { key: 'terminée',   label: 'Terminées', color: '#22c55e' },
        ] as const).map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${filter === s.key ? 'border-[rgba(0,212,255,0.3)]' : 'bg-slate-800/50 border-white/[0.08] hover:border-white/20'}`}
            style={filter === s.key ? { background: 'linear-gradient(135deg,rgba(0,102,255,0.15),rgba(0,212,255,0.15))' } : {}}>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{counts[s.key]}</div>
            <div className="text-slate-400 text-xs mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Tasks list */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <div className="text-slate-400 text-sm">Aucune tâche</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(task => {
            const pc = pCfg(task.priorite);
            const sc = sCfg(task.statut);
            const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.statut !== 'terminée';
            return (
              <div key={task._id}
                className={`bg-slate-800/50 border rounded-xl p-4 transition-all hover:border-white/20 ${task.statut === 'terminée' ? 'opacity-60' : 'border-white/[0.08]'}`}>
                <div className="flex items-start gap-3">

                  {/* Statut toggle */}
                  <button onClick={() => handleStatut(task._id, nextStatut(task.statut))}
                    title="Changer le statut"
                    className="mt-0.5 flex-shrink-0 cursor-pointer bg-transparent border-none p-0 transition-transform hover:scale-110"
                    style={{ color: sc.color }}>
                    {sc.icon}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${task.statut === 'terminée' ? 'line-through text-slate-500' : 'text-white'}`}>
                        {task.titre}
                      </span>
                      {/* Priorité */}
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: pc.bg, border: `1px solid ${pc.border}`, color: pc.color }}>
                        {pc.label}
                      </span>
                      {/* Statut */}
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: sc.color, background: `${sc.color}18`, border: `1px solid ${sc.color}40` }}>
                        {sc.label}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{task.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {task.assigneA && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <User size={11} /> {task.assigneA}
                        </span>
                      )}
                      {task.deadline && (
                        <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                          <Calendar size={11} />
                          {isOverdue && '⚠ '}
                          {new Date(task.deadline).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-600">
                        par {task.creePar}
                      </span>
                    </div>
                  </div>

                  {/* Actions admin */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Changer statut dropdown */}
                      <select
                        title="Changer le statut"
                        value={task.statut}
                        onChange={e => handleStatut(task._id, e.target.value as Task['statut'])}
                        className="text-[11px] px-2 py-1 rounded-lg bg-slate-700/50 border border-white/[0.08] text-slate-300 cursor-pointer outline-none">
                        <option value="à faire">À faire</option>
                        <option value="en cours">En cours</option>
                        <option value="terminée">Terminée</option>
                      </select>
                      <button onClick={() => handleDelete(task._id)} title="Supprimer"
                        className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nouvelle task */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <Plus size={18} color="#00d4ff" /> Nouvelle tâche
              </h3>
              <button onClick={() => setShowModal(false)} title="Fermer"
                className="w-8 h-8 rounded-lg bg-slate-700/60 border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Titre */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">📝 Titre *</label>
                <input type="text" placeholder="Ex: Vérifier les capteurs ADXL345"
                  value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">📄 Description</label>
                <textarea placeholder="Détails de la tâche..."
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Priorité */}
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block"><Flag size={11} className="inline mr-1" />Priorité</label>
                  <select title="Priorité" value={form.priorite} onChange={e => setForm(p => ({ ...p, priorite: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors cursor-pointer">
                    <option value="haute">🔴 Haute</option>
                    <option value="moyenne">🟡 Moyenne</option>
                    <option value="basse">🟢 Basse</option>
                  </select>
                </div>

                {/* Deadline */}
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block"><Calendar size={11} className="inline mr-1" />Deadline</label>
                  <input type="date" title="Deadline" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors cursor-pointer" />
                </div>
              </div>

              {/* Assigné à */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block"><User size={11} className="inline mr-1" />Assigner à</label>
                <select title="Assigner à" value={form.assigneA} onChange={e => setForm(p => ({ ...p, assigneA: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors cursor-pointer">
                  <option value="">— Non assigné —</option>
                  {users.map(u => (
                    <option key={u.username} value={u.username}>{u.username} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>

            {formErr && (
              <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">{formErr}</div>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-700/50 border border-white/[0.08] hover:text-white transition-colors cursor-pointer">
                Annuler
              </button>
              <button onClick={handleCreate} disabled={formLoad}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:-translate-y-0.5 transition-transform disabled:opacity-50 bg-gradient-to-r from-[#0066ff] to-[#00d4ff]">
                {formLoad ? 'Création...' : '✅ Créer la tâche'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default TasksPage;