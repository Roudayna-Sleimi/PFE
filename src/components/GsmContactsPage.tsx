import React, { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE_URL = 'http://localhost:5000';

interface GsmContact {
  _id: string;
  role?: string;
  name: string;
  phonePrimary: string;
  phoneBackup?: string | null;
  isActive: boolean;
  createdAt?: string;
}

interface AlertSummary {
  _id: string;
  message: string;
  node: string;
  severity: 'critical' | 'warning';
  status: 'new' | 'seen' | 'notified' | 'resolved';
  callAttempts?: number;
  createdAt: string;
}

interface CallLogApi {
  _id: string;
  alertId: string;
  phoneNumber: string;
  attemptNo: number;
  callStatus: string;
  calledAt: string;
  durationSec?: number | null;
  errorMessage?: string | null;
  providerRef?: string | null;
}

interface CallLogRow extends CallLogApi {
  alertMessage: string;
  node: string;
  severity: 'critical' | 'warning';
}

interface ContactFormState {
  role: string;
  name: string;
  phonePrimary: string;
  phoneBackup: string;
}

const EMPTY_FORM: ContactFormState = {
  role: 'responsable',
  name: '',
  phonePrimary: '',
  phoneBackup: '',
};

const GsmContactsPage: React.FC = () => {
  const token = localStorage.getItem('token') || '';
  const role = localStorage.getItem('role') || '';
  const isAdmin = role === 'admin';

  const [contacts, setContacts] = useState<GsmContact[]>([]);
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [callLogs, setCallLogs] = useState<CallLogRow[]>([]);

  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const headers: HeadersInit = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const clearMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Impossible de charger les contacts GSM.');
      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erreur serveur.');
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [headers]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const alertsRes = await fetch(`${API_BASE_URL}/api/alerts?limit=25`, { headers });
      const alertsData = await alertsRes.json();
      if (!alertsRes.ok) throw new Error(alertsData?.message || 'Impossible de charger les alertes.');

      const alerts: AlertSummary[] = Array.isArray(alertsData) ? alertsData : [];
      const candidates = alerts
        .filter(a => (a.callAttempts || 0) > 0 || a.status === 'notified' || a.status === 'resolved')
        .slice(0, 12);

      if (candidates.length === 0) {
        setCallLogs([]);
        return;
      }

      const settled = await Promise.allSettled(
        candidates.map(async (alert) => {
          const res = await fetch(`${API_BASE_URL}/api/call-logs/${alert._id}`, { headers });
          if (!res.ok) return [] as CallLogRow[];
          const logs = await res.json();
          if (!Array.isArray(logs)) return [] as CallLogRow[];
          return (logs as CallLogApi[]).map(log => ({
            ...log,
            alertMessage: alert.message,
            node: alert.node,
            severity: alert.severity,
          }));
        })
      );

      const merged: CallLogRow[] = [];
      settled.forEach(result => {
        if (result.status === 'fulfilled') merged.push(...result.value);
      });

      merged.sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime());
      setCallLogs(merged.slice(0, 60));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erreur serveur.');
      setCallLogs([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [headers]);

  useEffect(() => {
    loadContacts();
    loadHistory();
  }, [loadContacts, loadHistory]);

  const activeContact = useMemo(
    () => contacts.find(c => c.isActive) || null,
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phonePrimary.toLowerCase().includes(q) ||
      (c.phoneBackup || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const patchContact = async (id: string, payload: Partial<GsmContact>) => {
    const res = await fetch(`${API_BASE_URL}/api/contacts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || 'Mise a jour impossible.');
    return data as GsmContact;
  };

  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    if (!form.name.trim() || !form.phonePrimary.trim()) {
      setErrorMsg('Le nom et le numero principal sont obligatoires.');
      return;
    }

    setSaving(true);
    clearMessages();

    const payload = {
      role: form.role.trim() || 'responsable',
      name: form.name.trim(),
      phonePrimary: form.phonePrimary.trim(),
      phoneBackup: form.phoneBackup.trim() || null,
      isActive: activeContact ? false : true,
    };

    try {
      if (editingId) {
        await patchContact(editingId, payload);
        setSuccessMsg('Contact mis a jour avec succes.');
      } else {
        const res = await fetch(`${API_BASE_URL}/api/contacts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Ajout impossible.');
        setSuccessMsg('Contact ajoute avec succes.');
      }
      resetForm();
      await loadContacts();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erreur serveur.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (contact: GsmContact) => {
    setEditingId(contact._id);
    setForm({
      role: contact.role || 'responsable',
      name: contact.name,
      phonePrimary: contact.phonePrimary,
      phoneBackup: contact.phoneBackup || '',
    });
    clearMessages();
  };

  const setAsPrimary = async (targetId: string) => {
    if (!isAdmin) return;
    setSaving(true);
    clearMessages();
    try {
      for (const contact of contacts) {
        const shouldBeActive = contact._id === targetId;
        if (contact.isActive !== shouldBeActive) {
          await patchContact(contact._id, { isActive: shouldBeActive });
        }
      }
      setSuccessMsg('Contact principal GSM mis a jour.');
      await loadContacts();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Impossible de changer le contact principal.');
    } finally {
      setSaving(false);
    }
  };

  const disableContact = async (targetId: string) => {
    if (!isAdmin) return;
    setSaving(true);
    clearMessages();
    try {
      await patchContact(targetId, { isActive: false });
      setSuccessMsg('Contact desactive.');
      await loadContacts();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Impossible de desactiver ce contact.');
    } finally {
      setSaving(false);
    }
  };

  const createTestAlert = async () => {
    if (!isAdmin) return;
    setSaving(true);
    clearMessages();
    try {
      const now = new Date().toLocaleString('fr-FR');
      const res = await fetch(`${API_BASE_URL}/api/alerts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          machineId: 'GSM-TEST',
          node: 'gsm-test',
          type: 'manual-test',
          severity: 'critical',
          message: `Alerte test GSM (${now})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Creation test impossible.');
      setSuccessMsg('Alerte test creee. Le superviseur GSM la traitera apres delai de non-vision.');
      await loadHistory();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erreur serveur.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full" style={{ background: 'transparent' }}>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Gestion GSM</h2>
          <p className="text-sm text-slate-500">Contacts d'appel, contact actif et historique des tentatives.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadContacts(); loadHistory(); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)' }}
          >
            Actualiser
          </button>
          {isAdmin && (
            <button
              onClick={createTestAlert}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}
            >
              Alerte test GSM
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{successMsg}</div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <div className="text-xs text-slate-400 mb-1">Contact actif</div>
          {activeContact ? (
            <>
              <div className="text-base font-bold text-white">{activeContact.name}</div>
              <div className="text-xs text-slate-400 mt-1">{activeContact.role || 'responsable'}</div>
              <div className="text-sm text-cyan-300 mt-3">{activeContact.phonePrimary}</div>
              <div className="text-xs text-slate-500 mt-1">{activeContact.phoneBackup || 'Aucun backup'}</div>
            </>
          ) : (
            <div className="text-sm text-amber-300">Aucun contact GSM actif.</div>
          )}
        </div>

        <form onSubmit={saveContact} className="col-span-2 rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <div className="text-sm font-bold text-white mb-3">{editingId ? 'Modifier contact' : 'Ajouter contact'}</div>
          <div className="grid grid-cols-4 gap-2">
            <input
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nom"
              disabled={!isAdmin}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
            />
            <input
              value={form.role}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
              placeholder="Role"
              disabled={!isAdmin}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
            />
            <input
              value={form.phonePrimary}
              onChange={e => setForm(prev => ({ ...prev, phonePrimary: e.target.value }))}
              placeholder="Numero principal"
              disabled={!isAdmin}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
            />
            <input
              value={form.phoneBackup}
              onChange={e => setForm(prev => ({ ...prev, phoneBackup: e.target.value }))}
              placeholder="Numero backup"
              disabled={!isAdmin}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="submit"
              disabled={!isAdmin || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
            >
              {editingId ? 'Mettre a jour' : 'Ajouter'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-200 border border-slate-600 bg-slate-800 cursor-pointer"
              >
                Annuler
              </button>
            )}
            {!isAdmin && <span className="text-xs text-amber-300">Mode lecture seule (admin requis pour modifier).</span>}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-sm font-bold text-white">Contacts GSM ({contacts.length})</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Recherche nom, role ou numero..."
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none w-72 max-w-full"
          />
        </div>
        {loadingContacts ? (
          <div className="text-sm text-slate-500 py-4">Chargement des contacts...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-sm text-slate-500 py-4">Aucun contact trouve.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredContacts.map(contact => (
              <div key={contact._id} className="rounded-lg border border-white/10 bg-slate-800/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-white">{contact.name}</div>
                    <div className="text-[11px] text-slate-400">{contact.role || 'responsable'}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${contact.isActive ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30' : 'text-slate-300 bg-slate-700/50 border border-slate-600'}`}>
                    {contact.isActive ? 'ACTIF' : 'INACTIF'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-300">Principal: {contact.phonePrimary}</div>
                <div className="text-xs text-slate-500 mt-1">Backup: {contact.phoneBackup || '-'}</div>
                <div className="text-[10px] text-slate-600 mt-1">Ajoute: {formatDate(contact.createdAt)}</div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => startEdit(contact)}
                    disabled={!isAdmin}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-200 border border-slate-600 bg-slate-700/50 cursor-pointer disabled:opacity-50"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => setAsPrimary(contact._id)}
                    disabled={!isAdmin || saving || contact.isActive}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-cyan-300 border border-cyan-500/35 bg-cyan-500/10 cursor-pointer disabled:opacity-50"
                  >
                    Contact principal
                  </button>
                  {contact.isActive && (
                    <button
                      onClick={() => disableContact(contact._id)}
                      disabled={!isAdmin || saving}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-300 border border-red-500/35 bg-red-500/10 cursor-pointer disabled:opacity-50"
                    >
                      Desactiver
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">Historique appels GSM</div>
          <span className="text-xs text-slate-500">{callLogs.length} tentative(s)</span>
        </div>
        {loadingHistory ? (
          <div className="text-sm text-slate-500 py-4">Chargement historique GSM...</div>
        ) : callLogs.length === 0 ? (
          <div className="text-sm text-slate-500 py-4">Aucune tentative d'appel enregistree.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2 px-2 font-semibold">Date</th>
                  <th className="text-left py-2 px-2 font-semibold">Alerte</th>
                  <th className="text-left py-2 px-2 font-semibold">Numero</th>
                  <th className="text-left py-2 px-2 font-semibold">Tentative</th>
                  <th className="text-left py-2 px-2 font-semibold">Statut</th>
                  <th className="text-left py-2 px-2 font-semibold">Duree</th>
                </tr>
              </thead>
              <tbody>
                {callLogs.map(log => (
                  <tr key={log._id} className="border-b border-slate-800/70">
                    <td className="py-2 px-2 text-slate-300">{formatDate(log.calledAt)}</td>
                    <td className="py-2 px-2">
                      <div className="text-slate-200">{log.alertMessage}</div>
                      <div className="text-[10px] text-slate-500">{log.node}</div>
                    </td>
                    <td className="py-2 px-2 text-cyan-300">{log.phoneNumber}</td>
                    <td className="py-2 px-2 text-slate-300">#{log.attemptNo}</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.callStatus === 'success'
                          ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                          : log.callStatus === 'queued'
                          ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                          : 'text-red-300 bg-red-500/15 border border-red-500/30'
                      }`}
                      >
                        {log.callStatus}
                      </span>
                      {log.errorMessage && <div className="text-[10px] text-red-300 mt-1">{log.errorMessage}</div>}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {typeof log.durationSec === 'number' && log.durationSec >= 0 ? `${log.durationSec}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GsmContactsPage;
