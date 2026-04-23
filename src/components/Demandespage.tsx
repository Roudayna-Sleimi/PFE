import React, { useCallback, useEffect, useState } from 'react';
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

const iconBadgeStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, var(--app-accent), var(--app-accent-strong))',
  color: '#ffffff',
};

const pillStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--app-border)',
  background: 'var(--app-card-alt)',
  color: 'var(--app-heading)',
  fontSize: 12,
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--app-card)',
  border: '1px solid var(--app-border)',
  borderRadius: 14,
  padding: 16,
};

const secondaryCardStyle: React.CSSProperties = {
  ...cardStyle,
  background: 'var(--app-card-alt)',
};

const avatarStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '999px',
  background: 'var(--app-surface-strong)',
  border: '1px solid var(--app-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-heading)',
  fontWeight: 800,
  fontSize: 14,
  flexShrink: 0,
};

const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  border: '1px solid transparent',
};

const actionButtonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid transparent',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--app-border)',
  background: 'var(--app-surface-strong)',
  color: 'var(--app-heading)',
  fontSize: 14,
  outline: 'none',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--app-card)',
  border: '1px solid var(--app-border)',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 420,
  margin: '0 16px',
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--app-border)',
  background: 'var(--app-card-alt)',
  color: 'var(--app-heading)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--app-accent)',
  background: 'var(--app-accent)',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const DemandesPage: React.FC = () => {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Demande | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [modalErr, setModalErr] = useState('');
  const [modalLoad, setModalLoad] = useState(false);

  const [editing, setEditing] = useState<Demande | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editErr, setEditErr] = useState('');
  const [editLoad, setEditLoad] = useState(false);

  const token = localStorage.getItem('token');

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:5000/api/demandes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Impossible de charger les demandes');
        return;
      }
      setDemandes(data);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  const handleRefuser = async (id: string) => {
    if (!confirm('Refuser cette demande ?')) return;
    try {
      await fetch(`http://localhost:5000/api/demandes/${id}/refuser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDemandes();
    } catch {
      alert('Erreur serveur');
    }
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
    if (!selected) return;
    if (!username || !password) {
      setModalErr('Username et mot de passe requis');
      return;
    }

    setModalLoad(true);
    setModalErr('');

    try {
      const res = await fetch(`http://localhost:5000/api/demandes/${selected._id}/approuver`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalErr(data.message);
        return;
      }
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

  const enAttente = demandes.filter((d) => normalizeDemandeStatut(d.statut) === 'en attente');
  const traitees = demandes.filter((d) => normalizeDemandeStatut(d.statut) !== 'en attente');

  const statutBadge = (statut: Demande['statut']) => {
    const normalized = normalizeDemandeStatut(statut);
    if (normalized === 'approuvee') {
      return (
        <span
          style={{
            ...badgeBaseStyle,
            background: 'rgba(34,197,94,0.12)',
            borderColor: 'rgba(34,197,94,0.28)',
            color: 'var(--app-success)',
          }}
        >
          <Check size={11} /> Approuvee
        </span>
      );
    }
    if (normalized === 'refusee') {
      return (
        <span
          style={{
            ...badgeBaseStyle,
            background: 'rgba(239,68,68,0.12)',
            borderColor: 'rgba(239,68,68,0.28)',
            color: 'var(--app-danger)',
          }}
        >
          <X size={11} /> Refusee
        </span>
      );
    }
    return (
      <span
        style={{
          ...badgeBaseStyle,
          background: 'var(--app-neutral-soft)',
          borderColor: 'var(--app-neutral-border)',
          color: 'var(--app-muted)',
        }}
      >
        <Clock size={11} /> En attente
      </span>
    );
  };

  return (
    <div className="p-6 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <div style={iconBadgeStyle}>
          <Users size={20} color="white" />
        </div>
        <div>
          <h1 className="text-xl font-bold m-0" style={{ color: 'var(--app-heading)' }}>
            Demandes d'acces
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--app-muted)' }}>
            Gerez les demandes d'acces des employes
          </p>
        </div>
        <div className="ml-auto flex gap-3">
          <div style={pillStyle}>{enAttente.length} en attente</div>
          <div style={{ ...pillStyle, background: 'var(--app-accent)', borderColor: 'var(--app-accent)', color: '#ffffff' }}>
            {demandes.length} total
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12" style={{ color: 'var(--app-muted)' }}>
          Chargement...
        </div>
      )}

      {error && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            color: 'var(--app-danger)',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          {error}
        </div>
      )}

      {enAttente.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--app-muted)' }}>
            <Clock size={14} /> En attente ({enAttente.length})
          </h2>
          <div className="flex flex-col gap-3">
            {enAttente.map((d) => (
              <div key={d._id} className="flex items-center gap-4 flex-wrap" style={cardStyle}>
                <div style={avatarStyle}>{d.nom.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: 'var(--app-heading)' }}>
                    {d.nom}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--app-muted)' }}>
                    {d.email} · {d.poste}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--app-subtle)' }}>
                    Telephone: {d.telephone}
                  </div>
                </div>
                <div className="text-xs whitespace-nowrap" style={{ color: 'var(--app-subtle)' }}>
                  {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => openEdit(d)} style={{ ...actionButtonBase, background: 'var(--app-accent)', borderColor: 'var(--app-accent)', color: '#ffffff' }}>
                    <PencilLine size={13} /> Modifier
                  </button>
                  <button
                    onClick={() => {
                      setSelected(d);
                      setModalErr('');
                      setUsername('');
                      setPassword('');
                    }}
                    style={{ ...actionButtonBase, background: 'var(--app-success)', borderColor: 'var(--app-success)', color: '#ffffff' }}
                  >
                    <UserPlus size={13} /> Approuver
                  </button>
                  <button onClick={() => handleRefuser(d._id)} style={{ ...actionButtonBase, background: '#b45309', borderColor: '#b45309', color: '#ffffff' }}>
                    <X size={13} /> Refuser
                  </button>
                  <button onClick={() => handleSupprimer(d._id)} style={{ ...actionButtonBase, background: 'var(--app-danger)', borderColor: 'var(--app-danger)', color: '#ffffff' }}>
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {traitees.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--app-muted)' }}>
            Historique ({traitees.length})
          </h2>
          <div className="flex flex-col gap-2">
            {traitees.map((d) => (
              <div key={d._id} className="flex items-center gap-4 flex-wrap" style={secondaryCardStyle}>
                <div style={{ ...avatarStyle, width: 36, height: 36, color: 'var(--app-muted)' }}>
                  {d.nom.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm" style={{ color: 'var(--app-heading)' }}>
                    {d.nom}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--app-muted)' }}>
                    {d.email} · {d.poste}
                  </div>
                  {d.username && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--app-subtle)' }}>
                      Utilisateur: @{d.username}
                    </div>
                  )}
                </div>
                {statutBadge(d.statut)}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => openEdit(d)} style={{ ...actionButtonBase, background: 'var(--app-accent)', borderColor: 'var(--app-accent)', color: '#ffffff' }}>
                    <PencilLine size={13} /> Modifier
                  </button>
                  <button onClick={() => handleSupprimer(d._id)} style={{ ...actionButtonBase, background: 'var(--app-danger)', borderColor: 'var(--app-danger)', color: '#ffffff' }}>
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
          <div className="text-5xl mb-4" style={{ color: 'var(--app-subtle)' }}>
            -
          </div>
          <div className="text-sm" style={{ color: 'var(--app-muted)' }}>
            Aucune demande pour le moment
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(2,6,23,0.52)' }}>
          <div style={modalStyle}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base" style={{ color: 'var(--app-heading)' }}>
                Modifier la demande
              </h3>
              <button
                onClick={() => setEditing(null)}
                title="Fermer"
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)', color: 'var(--app-subtle)' }}
              >
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
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--app-muted)' }}>
                    {field.label}
                  </label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={editForm[field.key as keyof typeof editForm]}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    style={fieldStyle}
                  />
                </div>
              ))}
            </div>

            {editErr && (
              <div
                className="text-xs rounded-lg px-3 py-2 mb-4"
                style={{ color: 'var(--app-danger)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {editErr}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} style={secondaryButtonStyle}>
                Annuler
              </button>
              <button
                onClick={handleModifier}
                disabled={editLoad}
                style={{ ...primaryButtonStyle, opacity: editLoad ? 0.6 : 1, cursor: editLoad ? 'not-allowed' : 'pointer' }}
              >
                {editLoad ? 'Modification...' : 'Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(2,6,23,0.52)' }}>
          <div style={modalStyle}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base" style={{ color: 'var(--app-heading)' }}>
                Creer le compte
              </h3>
              <button
                onClick={() => setSelected(null)}
                title="Fermer"
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)', color: 'var(--app-subtle)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl p-3 mb-5" style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)' }}>
              <div className="font-semibold text-sm" style={{ color: 'var(--app-heading)' }}>
                {selected.nom}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--app-muted)' }}>
                {selected.email} · {selected.poste}
              </div>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--app-muted)' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="ex: m.ben_salah"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--app-muted)' }}>
                  Mot de passe
                </label>
                <input
                  type="text"
                  placeholder="Choisir un mot de passe"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={fieldStyle}
                />
              </div>
            </div>

            {modalErr && (
              <div
                className="text-xs rounded-lg px-3 py-2 mb-4"
                style={{ color: 'var(--app-danger)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {modalErr}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} style={secondaryButtonStyle}>
                Annuler
              </button>
              <button
                onClick={handleApprouver}
                disabled={modalLoad}
                style={{ ...primaryButtonStyle, opacity: modalLoad ? 0.6 : 1, cursor: modalLoad ? 'not-allowed' : 'pointer' }}
              >
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
