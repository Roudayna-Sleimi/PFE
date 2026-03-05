import React, { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
//import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
//const navigate = useNavigate();

  const handleLogin = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    
    console.log("Login attempt:", email, password);

    if (email.trim() === "admin@cnc.com" && password === "123456") {
      console.log("Success! Redirecting to /dashboard");
      setError("");
      // Solution 1: Navigation standard
      window.location.href = "/dashboard";

      // Solution 2 (décommentez si la 1 ne marche pas):
      // window.location.href = "/dashboard";
    } else {
      console.log("Failed: Invalid credentials");
      setError("Email ou mot de passe incorrect");
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleLogin} noValidate>
        <div className="form-header">
          <span className="badge">Système Actif</span>
          <h2>CNC-PULSE</h2>
          <p className="subtitle">Interface de contrôle machine</p>
        </div>

        <div className="input-group">
          <label htmlFor="email">Identifiant</label>
          <div className="input-wrapper">
            <span className="input-icon">✉</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@cnc.com"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="password">Mot de passe</label>
          <div className="input-wrapper">
            <span className="input-icon">🔒</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <div className="error">
            <span>⚠</span>
            {error}
          </div>
        )}

        <button type="submit">Se connecter</button>

        <div className="form-footer">
          <p className="help-text">
            Problème de connexion ? <a href="#">Contactez le support</a>
          </p>
        </div>
      </form>
    </div>
  );
};

export default Login;