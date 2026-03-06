import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import './Login.css';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Identifiants incorrects");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      localStorage.setItem("role", data.role || "user");

      onLogin();
      navigate("/dashboard");

    } catch  {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

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
              id="username"
              name="username"
              type="text"
              placeholder="Entrez votre identifiant"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="password">🔒 Mot de passe</label>
          <div className="input-wrapper">
            <span className="input-icon">●</span>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Entrez votre mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se Connecter"}
        </button>

        <div className="form-footer">
          <p className="help-text">
            Problème d'accès ? <a href="#">Contacter l'administrateur</a>
          </p>
        </div>

      </form>
    </div>
  );
};

export default Login;