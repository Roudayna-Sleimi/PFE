import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Building2, KeyRound, Mail, Phone, ShieldCheck, User } from "lucide-react";

interface LoginProps {
  onLogin: () => void;
}

type View = "login" | "demande" | "success";

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();

  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ nom: "", email: "", poste: "", telephone: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

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
      navigate(data.role === "employe" ? "/employe" : "/dashboard");
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemande = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.nom || !form.email || !form.poste || !form.telephone) {
      setFormError("Tous les champs sont requis");
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/demandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Erreur serveur");
        return;
      }
      setView("success");
    } catch {
      setFormError("Impossible de contacter le serveur.");
    } finally {
      setFormLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(34,211,238,0.16),transparent_48%),radial-gradient(circle_at_85%_82%,rgba(37,99,235,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-cyan-400/20 bg-slate-900/70 p-6 shadow-[0_18px_48px_-22px_rgba(8,145,178,0.55)] backdrop-blur-md sm:p-8">
          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
              <ShieldCheck size={12} />
              CNC Pulse Platform
            </div>

            {view === "success" ? (
              <>
                <h2 className="text-2xl font-bold text-emerald-300">Demande envoyee</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Votre demande est en attente de validation administrateur.
                </p>
              </>
            ) : view === "demande" ? (
              <>
                <h2 className="text-2xl font-bold text-white">Demande d acces</h2>
                <p className="mt-1 text-sm text-slate-400">Renseignez vos informations pour creer un compte.</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white">Connexion securisee</h2>
                <p className="mt-1 text-sm text-slate-400">Supervision industrielle en temps reel.</p>
              </>
            )}
          </div>

          {view === "success" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                <BadgeCheck size={18} />
                Votre acces sera active apres approbation.
              </div>
              <button
                onClick={() => setView("login")}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Retour a la connexion
              </button>
            </div>
          )}

          {view === "demande" && (
            <form className="space-y-4" onSubmit={handleDemande}>
              {[
                { key: "nom", label: "Nom complet", placeholder: "Mohamed Ali Ben Salah", type: "text", icon: User },
                { key: "email", label: "Email", placeholder: "exemple@usine.tn", type: "email", icon: Mail },
                { key: "poste", label: "Poste", placeholder: "Technicien de maintenance", type: "text", icon: Building2 },
                { key: "telephone", label: "Telephone", placeholder: "+216 XX XXX XXX", type: "tel", icon: Phone },
              ].map(field => {
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{field.label}</label>
                    <div className="relative">
                      <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input
                        type={field.type}
                        className={`${inputClass} pl-10`}
                        placeholder={field.placeholder}
                        value={(form as Record<string, string>)[field.key]}
                        onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                );
              })}

              {formError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{formError}</div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {formLoading ? "Envoi en cours..." : "Envoyer la demande"}
              </button>

              <p className="text-center text-xs text-slate-400">
                Deja un compte ?{" "}
                <button type="button" onClick={() => setView("login")} className="font-semibold text-cyan-300 hover:text-cyan-200">
                  Se connecter
                </button>
              </p>
            </form>
          )}

          {view === "login" && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="username" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Identifiant
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    className={`${inputClass} pl-10`}
                    placeholder="Entrez votre identifiant"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Mot de passe
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    className={`${inputClass} pl-10`}
                    placeholder="Entrez votre mot de passe"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <p className="text-center text-xs text-slate-400">
                Pas encore de compte ?{" "}
                <button type="button" onClick={() => setView("demande")} className="font-semibold text-cyan-300 hover:text-cyan-200">
                  Demander un acces
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
