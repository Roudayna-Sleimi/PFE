import React, { useCallback, useEffect, useState } from 'react';
import { Users, Check, X, Clock, UserPlus, PencilLine, Trash2 } from 'lucide-react';
import './DemandesPage.css';

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

const editFields = [
  { key: 'nom', label: 'Nom', placeholder: 'Nom complet' },
  { key: 'email', label: 'Email', placeholder: 'email@exemple.com' },
  { key: 'poste', label: 'Poste', placeholder: 'Poste' },
  { key: 'telephone', label: 'Telephone', placeholder: 'Telephone' },
] as const;

const normalizeDemandeStatut = (statut: string) => {
  const normalized = String(statut || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('approuv')) return 'approuvee';
  if (normalized.includes('refus')) return 'refusee';
  return 'en attente';
};

const formatMeta = (...values: Array<string | null | undefined>) => values.filter(Boolean).join(' - ');

const getInitial = (nom: string) => nom.trim().charAt(0).toUpperCase() || '?';

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

      setDemandes(Array.isArray(data) ? data : []);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  const closeEditModal = () => {
    setEditing(null);
    setEditForm(emptyEditForm);
    setEditErr('');
  };

  const closeApprovalModal = () => {
    setSelected(null);
    setUsername('');
    setPassword('');
    setModalErr('');
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

  const openApproval = (demande: Demande) => {
    setSelected(demande);
    setUsername(demande.username || '');
    setPassword('');
    setModalErr('');
  };

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

      closeEditModal();
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
        setModalErr(data.message || 'Creation impossible');
        return;
      }

      closeApprovalModal();
      fetchDemandes();
    } catch {
      setModalErr('Erreur serveur');
    } finally {
      setModalLoad(false);
    }
  };

  const enAttente = demandes.filter((d) => normalizeDemandeStatut(d.statut) === 'en attente');
  const traitees = demandes.filter((d) => normalizeDemandeStatut(d.statut) !== 'en attente');

  const renderStatutBadge = (statut: Demande['statut']) => {
    const normalized = normalizeDemandeStatut(statut);

    if (normalized === 'approuvee') {
      return (
        <span className="demandes-badge demandes-badge--success">
          <Check size={12} />
          Approuvee
        </span>
      );
    }

    if (normalized === 'refusee') {
      return (
        <span className="demandes-badge demandes-badge--danger">
          <X size={12} />
          Refusee
        </span>
      );
    }

    return (
      <span className="demandes-badge demandes-badge--neutral">
        <Clock size={12} />
        En attente
      </span>
    );
  };

  return (
    <div className="demandes-page">
      <header className="demandes-header">
        <div className="demandes-heading-group">
          <div className="demandes-icon-badge">
            <Users size={20} />
          </div>
          <div>
            <p className="demandes-kicker">Administration</p>
            <h1 className="demandes-title">Demandes d'acces</h1>
            <p className="demandes-subtitle">Gerez les demandes d'acces des employes depuis un espace plus propre et lisible.</p>
          </div>
        </div>

        <div className="demandes-stats">
          <div className="demandes-pill">
            <span className="demandes-pill__label">En attente</span>
            <strong>{enAttente.length}</strong>
          </div>
          <div className="demandes-pill demandes-pill--accent">
            <span className="demandes-pill__label">Total</span>
            <strong>{demandes.length}</strong>
          </div>
        </div>
      </header>

      {loading && <div className="demandes-state-card">Chargement des demandes...</div>}

      {error && <div className="demandes-alert demandes-alert--danger">{error}</div>}

      {enAttente.length > 0 && (
        <section className="demandes-section">
          <div className="demandes-section-title">
            <Clock size={14} />
            En attente ({enAttente.length})
          </div>

          <div className="demandes-list">
            {enAttente.map((demande) => (
              <article key={demande._id} className="demandes-card">
                <div className="demandes-avatar">{getInitial(demande.nom)}</div>

                <div className="demandes-card__body">
                  <h2 className="demandes-card__title">{demande.nom}</h2>
                  <p className="demandes-card__meta">{formatMeta(demande.email, demande.poste)}</p>
                  <p className="demandes-card__detail">Telephone: {demande.telephone}</p>
                </div>

                <div className="demandes-card__aside">
                  <span className="demandes-card__date">
                    {new Date(demande.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                <div className="demandes-actions">
                  <button type="button" onClick={() => openEdit(demande)} className="demandes-action demandes-action--accent">
                    <PencilLine size={14} />
                    Modifier
                  </button>

                  <button type="button" onClick={() => openApproval(demande)} className="demandes-action demandes-action--success">
                    <UserPlus size={14} />
                    Approuver
                  </button>

                  <button type="button" onClick={() => handleRefuser(demande._id)} className="demandes-action demandes-action--warning">
                    <X size={14} />
                    Refuser
                  </button>

                  <button type="button" onClick={() => handleSupprimer(demande._id)} className="demandes-action demandes-action--danger">
                    <Trash2 size={14} />
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {traitees.length > 0 && (
        <section className="demandes-section">
          <div className="demandes-section-title">Historique ({traitees.length})</div>

          <div className="demandes-list">
            {traitees.map((demande) => (
              <article key={demande._id} className="demandes-card demandes-card--secondary">
                <div className="demandes-avatar demandes-avatar--muted">{getInitial(demande.nom)}</div>

                <div className="demandes-card__body">
                  <h2 className="demandes-card__title">{demande.nom}</h2>
                  <p className="demandes-card__meta">{formatMeta(demande.email, demande.poste)}</p>
                  {demande.username && <p className="demandes-card__detail">Utilisateur: @{demande.username}</p>}
                </div>

                <div className="demandes-card__aside demandes-card__aside--status">
                  {renderStatutBadge(demande.statut)}
                </div>

                <div className="demandes-actions">
                  <button type="button" onClick={() => openEdit(demande)} className="demandes-action demandes-action--accent">
                    <PencilLine size={14} />
                    Modifier
                  </button>

                  <button type="button" onClick={() => handleSupprimer(demande._id)} className="demandes-action demandes-action--danger">
                    <Trash2 size={14} />
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && demandes.length === 0 && (
        <div className="demandes-state-card demandes-state-card--empty">
          <div className="demandes-state-card__icon">-</div>
          <div className="demandes-state-card__title">Aucune demande pour le moment</div>
          <div className="demandes-state-card__text">Les nouvelles demandes d'acces apparaitront ici.</div>
        </div>
      )}

      {editing && (
        <div className="demandes-modal-backdrop">
          <div className="demandes-modal">
            <div className="demandes-modal__header">
              <div>
                <p className="demandes-kicker">Edition</p>
                <h3 className="demandes-modal__title">Modifier la demande</h3>
              </div>

              <button type="button" onClick={closeEditModal} title="Fermer" className="demandes-icon-button">
                <X size={16} />
              </button>
            </div>

            <div className="demandes-form-grid">
              {editFields.map((field) => (
                <label key={field.key} className="demandes-field-group">
                  <span className="demandes-field-group__label">{field.label}</span>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={editForm[field.key]}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    className="demandes-field"
                  />
                </label>
              ))}
            </div>

            {editErr && <div className="demandes-alert demandes-alert--danger">{editErr}</div>}

            <div className="demandes-modal__actions">
              <button type="button" onClick={closeEditModal} className="demandes-action demandes-action--secondary">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleModifier}
                disabled={editLoad}
                className="demandes-action demandes-action--accent demandes-action--wide"
              >
                {editLoad ? 'Modification...' : 'Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="demandes-modal-backdrop">
          <div className="demandes-modal">
            <div className="demandes-modal__header">
              <div>
                <p className="demandes-kicker">Validation</p>
                <h3 className="demandes-modal__title">Creer le compte</h3>
              </div>

              <button type="button" onClick={closeApprovalModal} title="Fermer" className="demandes-icon-button">
                <X size={16} />
              </button>
            </div>

            <div className="demandes-summary-card">
              <div className="demandes-summary-card__title">{selected.nom}</div>
              <div className="demandes-summary-card__text">{formatMeta(selected.email, selected.poste)}</div>
            </div>

            <div className="demandes-form-grid">
              <label className="demandes-field-group">
                <span className="demandes-field-group__label">Username</span>
                <input
                  type="text"
                  placeholder="ex: m.ben_salah"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="demandes-field"
                />
              </label>

              <label className="demandes-field-group">
                <span className="demandes-field-group__label">Mot de passe</span>
                <input
                  type="password"
                  placeholder="Choisir un mot de passe"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="demandes-field"
                />
              </label>
            </div>

            {modalErr && <div className="demandes-alert demandes-alert--danger">{modalErr}</div>}

            <div className="demandes-modal__actions">
              <button type="button" onClick={closeApprovalModal} className="demandes-action demandes-action--secondary">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApprouver}
                disabled={modalLoad}
                className="demandes-action demandes-action--accent demandes-action--wide"
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
