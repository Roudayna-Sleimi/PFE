import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import './Login.css';

interface LoginProps {
  onLogin: () => void;
}

type View = 'login' | 'demande' | 'success';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();

  const [view, setView]         = useState<View>('login');
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Formulaire demande
  const [form, setForm] = useState({ nom: '', email: '', poste: '', telephone: '' });
  const [formError, setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // ── Login ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Identifiants incorrects"); return; }
      localStorage.setItem("token",    data.token);
      localStorage.setItem("username", data.username);
      localStorage.setItem("role",     data.role || "user");
      onLogin();
      navigate("/dashboard");
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  // ── Demande d'accès ──
  const handleDemande = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.nom || !form.email || !form.poste || !form.telephone) {
      setFormError('Tous les champs sont requis');
      return;
    }
    setFormLoading(true);
    try {
      const res  = await fetch("http://localhost:5000/api/demandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.message || 'Erreur serveur'); return; }
      setView('success');
    } catch {
      setFormError('Impossible de contacter le serveur.');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Vue: Succès ──
  if (view === 'success') return (
    <div className="login-container">
      <div className="login-form text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-green-400 mb-2">Demande envoyée !</h2>
        <p className="text-slate-400 text-sm mb-6">
          Votre demande a été transmise à l'administrateur.<br />
          Vous recevrez vos identifiants une fois approuvée.
        </p>
        <button onClick={() => setView('login')}>Retour à la connexion</button>
      </div>
    </div>
  );

  // ── Vue: Formulaire demande ──
  if (view === 'demande') return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleDemande}>

        <div className="form-header">
          <div className="badge">CNC Pulse — Système Industriel</div>
          <h2>Demande d'accès</h2>
          <p className="subtitle">Remplissez le formulaire — l'admin validera votre accès</p>
        </div>

        {[
          { key: 'nom',       label: '👤 Nom & Prénom',      placeholder: 'Mohamed Ali Ben Salah', type: 'text' },
          { key: 'email',     label: '📧 Email',              placeholder: 'exemple@usine.tn',      type: 'email' },
          { key: 'poste',     label: '🏭 Poste / Fonction',   placeholder: 'Technicien de maintenance', type: 'text' },
          { key: 'telephone', label: '📞 Numéro de téléphone',placeholder: '+216 XX XXX XXX',       type: 'tel' },
        ].map(f => (
          <div className="input-group" key={f.key}>
            <label>{f.label}</label>
            <div className="input-wrapper">
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={(form as Record<string,string>)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                required
              />
            </div>
          </div>
        ))}

        {formError && <div className="error">{formError}</div>}

        <button type="submit" disabled={formLoading}>
          {formLoading ? 'Envoi en cours...' : 'Envoyer la demande'}
        </button>

        <div className="form-footer">
          <p className="help-text">
            Déjà un compte ?{' '}
            <span className="cursor-pointer text-[#00d4ff]" onClick={() => setView('login')}>
              Se connecter
            </span>
          </p>
        </div>

      </form>
    </div>
  );

  // ── Vue: Login ──
  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>

        <div className="form-header">
          <div className="badge">CNC Pulse — Système Industriel</div>
          <h2>Accès Sécurisé</h2>
          <p className="subtitle">Supervision IoT Industrielle en Temps Réel</p>
        </div>

        <div className="input-group">
          <label htmlFor="username">👤 Identifiant</label>
          <div className="input-wrapper">
            <span className="input-icon">⚙</span>
            <input
              id="username" name="username" type="text"
              placeholder="Entrez votre identifiant"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required autoComplete="username"
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="password">🔒 Mot de passe</label>
          <div className="input-wrapper">
            <span className="input-icon">●</span>
            <input
              id="password" name="password" type="password"
              placeholder="Entrez votre mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password"
            />
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se Connecter"}
        </button>

        <div className="form-footer">
          <p className="help-text">
            Pas encore de compte ?{' '}
            <span className="cursor-pointer text-[#00d4ff]" onClick={() => setView('demande')}>
              Demander un accès
            </span>
          </p>
        </div>

      </form>
    </div>
  );
};

export default Login;