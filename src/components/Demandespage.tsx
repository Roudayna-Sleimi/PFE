import React, { useState, useEffect, useCallback } from 'react';
import { Users, Check, X, Clock, UserPlus, PencilLine, Trash2 } from 'lucide-react';

interface Demande {
  _id: string;
  nom: string;
  email: string;
  poste: string;
  telephone: string;
  statut: string;
  username: string | null;
  createdAt: string;
}

const emptyEditForm = {
  nom: '',
  email: '',
  poste: '',
  telephone: '',
};

const normalizeDemandeStatut = (statut: string) => {
  const normalized = String(statut || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (normalized.includes('approuv')) return 'approuvee';
  if (normalized.includes('refus')) return 'refusee';
  return 'en attente';
};

const DemandesPage: React.FC = () => {
  const [demandes, setDemandes]   = useState<Demande[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Modal approbation
  const [selected, setSelected]   = useState<Demande | null>(null);
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [modalErr, setModalErr]   = useState('');
  const [modalLoad, setModalLoad] = useState(false);
  const [editing, setEditing] = useState<Demande | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editErr, setEditErr] = useState('');
  const [editLoad, setEditLoad] = useState(false);

  const token = localStorage.getItem('token');

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('http://localhost:5000/api/demandes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setDemandes(data);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchDemandes(); }, [fetchDemandes]);

  const handleRefuser = async (id: string) => {
    if (!confirm('Refuser cette demande ?')) return;
    try {
      await fetch(`http://localhost:5000/api/demandes/${id}/refuser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDemandes();
    } catch { alert('Erreur serveur'); }
  };

  const openEdit = (demande: Demande) => {
    setEditing(demande);
    setEditForm({
      nom: demande.nom || '',
      email: demande.email || '',
      poste: demande.poste || '',
      telephone: demande.telephone || '',
    });
    setEditErr('');
  };

  const handleModifier = async () => {
    if (!editing) return;
    if (!editForm.nom || !editForm.email || !editForm.poste || !editForm.telephone) {
      setEditErr('Tous les champs sont requis');
      return;
    }

    setEditLoad(true);
    setEditErr('');
    try {
      const res = await fetch(`http://localhost:5000/api/demandes/${editing._id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditErr(data.message || 'Modification impossible');
        return;
      }
      setEditing(null);
      setEditForm(emptyEditForm);
      fetchDemandes();
    } catch {
      setEditErr('Erreur serveur');
    } finally {
      setEditLoad(false);
    }
  };

  const handleSupprimer = async (id: string) => {
    if (!confirm('Supprimer cette demande ?')) return;
    try {
      await fetch(`http://localhost:5000/api/demandes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDemandes();
    } catch {
      alert('Erreur serveur');
    }
  };

  const handleApprouver = async () => {
    if (!username || !password) { setModalErr('Username et mot de passe requis'); return; }
    setModalLoad(true);
    setModalErr('');
    try {
      const res  = await fetch(`http://localhost:5000/api/demandes/${selected!._id}/approuver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { setModalErr(data.message); return; }
      setSelected(null);
      setUsername('');
      setPassword('');
      fetchDemandes();
    } catch {
      setModalErr('Erreur serveur');
    } finally {
      setModalLoad(false);
    }
  };

  const enAttente  = demandes.filter(d => normalizeDemandeStatut(d.statut) === 'en attente');
  const traitees   = demandes.filter(d => normalizeDemandeStatut(d.statut) !== 'en attente');

  const statutBadge = (statut: Demande['statut']) => {
    const normalized = normalizeDemandeStatut(statut);
    if (normalized === 'approuvee') return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-500/10 border border-green-500/30 text-green-400">
        <Check size={11} /> Approuvee
      </span>
    );
    if (normalized === 'refusee') return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
        <X size={11} /> Refusee
      </span>
    );
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
        <Clock size={11} /> En attente
      </span>
    );
  };

  return (
    <div className="p-6 min-h-full">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#0066ff] to-[#00d4ff]">
          <Users size={20} color="white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white m-0">Demandes d'accès</h1>
          <p className="text-slate-400 text-xs mt-0.5">Gérez les demandes d'accès des employés</p>
        </div>
        <div className="ml-auto flex gap-3">
          <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-semibold">
            {enAttente.length} en attente
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-800/50 border border-white/[0.08] text-slate-400 text-xs font-semibold">
            {demandes.length} total
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-400 py-12">Chargement...</div>
      )}
      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">{error}</div>
      )}

      {/* En attente */}
      {enAttente.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Clock size={14} /> En attente ({enAttente.length})
          </h2>
          <div className="flex flex-col gap-3">
            {enAttente.map(d => (
              <div key={d._id}
                className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 flex items-center gap-4 flex-wrap hover:border-[rgba(0,212,255,0.2)] transition-all">
                <div className="w-10 h-10 rounded-full bg-slate-700/60 border border-white/[0.08] flex items-center justify-center text-slate-300 font-bold text-sm flex-shrink-0">
                  {d.nom.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm">{d.nom}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{d.email} · {d.poste}</div>
                  <div className="text-slate-500 text-xs mt-0.5">Telephone: {d.telephone}</div>
                </div>
                <div className="text-slate-500 text-xs whitespace-nowrap">
                  {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
                    <PencilLine size={13} /> Modifier
                  </button>
                  <button
                    onClick={() => { setSelected(d); setModalErr(''); setUsername(''); setPassword(''); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 transition-all">
                    <UserPlus size={13} /> Approuver
                  </button>
                  <button
                    onClick={() => handleRefuser(d._id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                    <X size={13} /> Refuser
                  </button>
                  <button
                    onClick={() => handleSupprimer(d._id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Traitées */}
      {traitees.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Historique ({traitees.length})
          </h2>
          <div className="flex flex-col gap-2">
            {traitees.map(d => (
              <div key={d._id}
                className="bg-slate-800/30 border border-white/[0.05] rounded-xl p-4 flex items-center gap-4 flex-wrap opacity-70">
                <div className="w-9 h-9 rounded-full bg-slate-700/40 border border-white/[0.06] flex items-center justify-center text-slate-400 font-bold text-sm flex-shrink-0">
                  {d.nom.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300 font-medium text-sm">{d.nom}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{d.email} · {d.poste}</div>
                  {d.username && <div className="text-slate-500 text-xs mt-0.5">Utilisateur: @{d.username}</div>}
                </div>
                {statutBadge(d.statut)}
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
                    <PencilLine size={13} /> Modifier
                  </button>
                  <button
                    onClick={() => handleSupprimer(d._id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && demandes.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 text-slate-500">-</div>
          <div className="text-slate-400 text-sm">Aucune demande pour le moment</div>
        </div>
      )}

      {/* Modal modification */}
      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">Modifier la demande</h3>
              <button onClick={() => setEditing(null)} title="Fermer"
                className="w-8 h-8 rounded-lg bg-slate-700/60 border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              {[
                { key: 'nom', label: 'Nom', placeholder: 'Nom complet' },
                { key: 'email', label: 'Email', placeholder: 'email@exemple.com' },
                { key: 'poste', label: 'Poste', placeholder: 'Poste' },
                { key: 'telephone', label: 'Telephone', placeholder: 'Telephone' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">{field.label}</label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={editForm[field.key as keyof typeof editForm]}
                    onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                  />
                </div>
              ))}
            </div>

            {editErr && (
              <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                {editErr}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-700/50 border border-white/[0.08] hover:text-white transition-colors">
                Annuler
              </button>
              <button onClick={handleModifier} disabled={editLoad}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:-translate-y-0.5 transition-transform disabled:opacity-50 bg-gradient-to-br from-[#0066ff] to-[#00d4ff]">
                {editLoad ? 'Modification...' : 'Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal approbation */}
      {selected && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">Créer le compte</h3>
              <button onClick={() => setSelected(null)} title="Fermer"
                className="w-8 h-8 rounded-lg bg-slate-700/60 border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-800/50 border border-white/[0.06] rounded-xl p-3 mb-5">
              <div className="text-white font-semibold text-sm">{selected.nom}</div>
              <div className="text-slate-400 text-xs mt-0.5">{selected.email} · {selected.poste}</div>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Username</label>
                <input
                  type="text"
                  placeholder="ex: m.ben_salah"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Mot de passe</label>
                <input
                  type="text"
                  placeholder="Choisir un mot de passe"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-700/50 border border-white/[0.08] rounded-lg text-white text-sm placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>
            </div>

            {modalErr && (
              <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                {modalErr}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setSelected(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-700/50 border border-white/[0.08] hover:text-white transition-colors">
                Annuler
              </button>
              <button onClick={handleApprouver} disabled={modalLoad}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:-translate-y-0.5 transition-transform disabled:opacity-50 bg-gradient-to-br from-[#0066ff] to-[#00d4ff]">
                {modalLoad ? 'Creation...' : 'Creer le compte'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DemandesPage;
