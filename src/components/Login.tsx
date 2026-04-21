import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, BarChart3, Building2, Eye, EyeOff, FileText, KeyRound, Mail, Moon, Phone, ShieldCheck, Sun, User } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface LoginProps {
  onLogin: () => void;
}

type View = "login" | "demande" | "success";

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const { darkMode, toggleTheme: toggleDarkMode } = useTheme();

  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const highlights = [
    { label: "Tracabilite", value: "Pieces, plans et passages machines", icon: FileText },
    { label: "Supervision", value: "Temps, production et anomalies", icon: BarChart3 },
    { label: "Acces", value: "Parcours admin et employe", icon: ShieldCheck },
  ];

  const theme = darkMode ? {
    root: "bg-[#07111f] text-slate-100",
    background: "bg-[linear-gradient(135deg,rgba(14,165,233,0.16)_0%,rgba(14,165,233,0.04)_34%,#07111f_100%)]",
    grid: "bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:36px_36px] opacity-20",
    topBadge: "border-sky-400/25 bg-sky-500/10 text-sky-100",
    title: "text-white",
    bodyText: "text-slate-300",
    featureCard: "border-sky-300/15 bg-[#0d1a2d]/80 shadow-[0_16px_32px_-26px_rgba(56,189,248,0.9)]",
    featureIcon: "bg-sky-500/15 text-sky-200",
    featureTitle: "text-white",
    featureText: "text-slate-400",
    infoCard: "border-white/10 bg-[#0b1627]/70",
    infoTitle: "text-sky-200",
    infoText: "text-slate-300",
    statusPill: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    panel: "border-sky-300/20 bg-[#0b1627]/92 shadow-[0_24px_70px_-34px_rgba(14,165,233,0.9)] backdrop-blur-md",
    logo: "bg-sky-500 text-white shadow-[0_14px_30px_-18px_rgba(56,189,248,1)]",
    secureBadge: "border-white/10 bg-white/5 text-sky-100",
    themeButton: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    heading: "text-white",
    muted: "text-slate-400",
    tabs: "border-white/10 bg-[#07111f]",
    activeTab: "bg-sky-500 text-white",
    inactiveTab: "text-slate-400 hover:text-white",
    label: "text-slate-400",
    input: "border-slate-700 bg-slate-900/70 text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:ring-sky-500/20",
    eyeButton: "text-slate-500 hover:bg-slate-800 hover:text-slate-100",
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    successTitle: "text-emerald-300",
    primary: "bg-sky-500 text-white hover:bg-sky-400",
    link: "text-sky-300 hover:text-sky-200",
  } : {
    root: "bg-[#f5f8fc] text-slate-950",
    background: "bg-[linear-gradient(135deg,#e8f2ff_0%,#f8fbff_42%,#f5f8fc_100%)]",
    grid: "bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:36px_36px] opacity-30",
    topBadge: "border-blue-200 bg-white text-blue-700 shadow-sm",
    title: "text-slate-950",
    bodyText: "text-slate-600",
    featureCard: "border-slate-200 bg-white shadow-sm",
    featureIcon: "bg-blue-50 text-blue-700",
    featureTitle: "text-slate-950",
    featureText: "text-slate-500",
    infoCard: "border-slate-200 bg-white shadow-sm",
    infoTitle: "text-blue-700",
    infoText: "text-slate-600",
    statusPill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panel: "border-slate-200 bg-white shadow-[0_24px_60px_-38px_rgba(15,23,42,0.7)]",
    logo: "bg-blue-700 text-white shadow-[0_14px_30px_-20px_rgba(29,78,216,1)]",
    secureBadge: "border-slate-200 bg-slate-50 text-blue-700",
    themeButton: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
    heading: "text-slate-950",
    muted: "text-slate-600",
    tabs: "border-slate-200 bg-slate-100",
    activeTab: "bg-white text-blue-700 shadow-sm",
    inactiveTab: "text-slate-500 hover:text-slate-950",
    label: "text-slate-600",
    input: "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/15",
    eyeButton: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    successTitle: "text-emerald-700",
    primary: "bg-blue-700 text-white hover:bg-blue-600",
    link: "text-blue-700 hover:text-blue-600",
  };

  const inputClass =
    `w-full rounded-lg border px-3 py-3 text-sm font-medium outline-none transition focus:ring-2 ${theme.input}`;

  return (
    <div className={`relative min-h-screen overflow-hidden ${theme.root}`}>
      <div className={`pointer-events-none absolute inset-0 ${theme.background}`} />
      <div className={`pointer-events-none absolute inset-0 ${theme.grid}`} />

      <div className="relative z-10 grid min-h-screen w-full items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:px-12 xl:px-20">
        <section className="hidden max-w-2xl lg:block">
          <div className={`mb-5 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${theme.topBadge}`}>
            <ShieldCheck size={14} />
            Projet industriel encadre
          </div>

          <h1 className={`max-w-xl text-5xl font-black leading-tight ${theme.title}`}>
            Plateforme de suivi CNC.
          </h1>
          <p className={`mt-5 max-w-lg text-base leading-7 ${theme.bodyText}`}>
            Pilotage de la production, suivi des machines et gestion des validations dans un environnement structure pour l atelier.
          </p>

          <div className="mt-9 grid max-w-xl grid-cols-3 gap-3">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`rounded-lg border p-4 ${theme.featureCard}`}>
                  <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg ${theme.featureIcon}`}>
                    <Icon size={18} />
                  </div>
                  <div className={`text-sm font-bold ${theme.featureTitle}`}>{item.label}</div>
                  <div className={`mt-2 text-xs leading-5 ${theme.featureText}`}>{item.value}</div>
                </div>
              );
            })}
          </div>

          <div className={`mt-5 max-w-xl rounded-lg border p-5 ${theme.infoCard}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className={`text-xs font-bold uppercase tracking-wide ${theme.infoTitle}`}>Session securisee</div>
                <div className={`mt-1 text-sm ${theme.infoText}`}>Connexion locale vers le serveur CNC Pulse.</div>
              </div>
              <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${theme.statusPill}`}>
                Operationnel
              </div>
            </div>
          </div>
        </section>

        <div className={`relative z-10 ml-auto w-full max-w-[460px] rounded-lg border p-6 sm:p-8 ${theme.panel}`}>
          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${theme.logo}`}>
                <ShieldCheck size={22} />
              </div>
              <div className="flex items-center gap-2">
                <div className={`hidden rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-wide sm:block ${theme.secureBadge}`}>
                  Acces securise
                </div>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  aria-pressed={darkMode}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${theme.themeButton}`}
                >
                  {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                  {darkMode ? "Mode clair" : "Mode sombre"}
                </button>
              </div>
            </div>

            {view === "success" ? (
              <>
                <h2 className={`text-2xl font-bold ${theme.successTitle}`}>Demande envoyee</h2>
                <p className={`mt-1 text-sm ${theme.muted}`}>
                  Votre demande est en attente de validation administrateur.
                </p>
              </>
            ) : view === "demande" ? (
              <>
                <h2 className={`text-2xl font-bold ${theme.heading}`}>Demande d acces</h2>
                <p className={`mt-1 text-sm ${theme.muted}`}>Renseignez vos informations pour creer un compte.</p>
              </>
            ) : (
              <>
                <h2 className={`text-2xl font-bold ${theme.heading}`}>Connexion securisee</h2>
                <p className={`mt-1 text-sm ${theme.muted}`}>Supervision industrielle en temps reel.</p>
              </>
            )}
          </div>

          {view !== "success" && (
            <div className={`mb-5 grid grid-cols-2 rounded-lg border p-1 ${theme.tabs}`}>
              <button
                type="button"
                onClick={() => setView("login")}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition ${view === "login" ? theme.activeTab : theme.inactiveTab}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setView("demande")}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition ${view === "demande" ? theme.activeTab : theme.inactiveTab}`}
              >
                Demande
              </button>
            </div>
          )}

          {view === "success" && (
            <div className="space-y-5">
              <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${theme.success}`}>
                <BadgeCheck size={18} />
                Votre acces sera active apres approbation.
              </div>
              <button
                onClick={() => setView("login")}
                className={`w-full rounded-lg px-4 py-3 text-sm font-bold transition ${theme.primary}`}
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
                    <label className={`mb-1 block text-xs font-bold uppercase tracking-wide ${theme.label}`}>{field.label}</label>
                    <div className="relative">
                      <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
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
                <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${theme.error}`}>{formError}</div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className={`w-full rounded-lg px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${theme.primary}`}
              >
                {formLoading ? "Envoi en cours..." : "Envoyer la demande"}
              </button>

              <p className={`text-center text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Deja un compte ?{" "}
                <button type="button" onClick={() => setView("login")} className={`font-semibold ${theme.link}`}>
                  Se connecter
                </button>
              </p>
            </form>
          )}

          {view === "login" && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="username" className={`mb-1 block text-xs font-bold uppercase tracking-wide ${theme.label}`}>
                  Identifiant
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
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
                <label htmlFor="password" className={`mb-1 block text-xs font-bold uppercase tracking-wide ${theme.label}`}>
                  Mot de passe
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className={`${inputClass} pl-10 pr-11`}
                    placeholder="Entrez votre mot de passe"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition ${theme.eyeButton}`}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${theme.error}`}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-lg px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${theme.primary}`}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <p className={`text-center text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Pas encore de compte ?{" "}
                <button type="button" onClick={() => setView("demande")} className={`font-semibold ${theme.link}`}>
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
