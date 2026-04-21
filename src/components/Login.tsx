import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  BarChart3,
  Building2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Mail,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
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
    {
      label: "Tracabilite documentaire",
      value: "Pieces, plans techniques et historique des passages machine.",
      icon: FileText,
    },
    {
      label: "Pilotage d atelier",
      value: "Production, suivi operateur et indicateurs de supervision en continu.",
      icon: BarChart3,
    },
    {
      label: "Controle d acces",
      value: "Parcours distincts pour administration, validation et espace employe.",
      icon: ShieldCheck,
    },
  ];

  const framework = [
    { label: "Cadre", value: "Projet industriel encadre" },
    { label: "Environnement", value: "Atelier CNC et supervision locale" },
    { label: "Authentification", value: "Acces securise par compte approuve" },
  ];

  const roles = [
    { label: "Administrateur", value: "Gestion des pieces, suivi et supervision globale" },
    { label: "Employe", value: "Preparation, choix machine et execution de production" },
  ];

  const theme = darkMode
    ? {
        root: "bg-[var(--app-bg)] text-[var(--app-text)]",
        background:
          "bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.7),transparent_36%)]",
        grid: "bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:40px_40px] opacity-20",
        heroBadge: "border-[color:var(--app-border)] bg-[rgba(15,23,42,0.8)] text-[var(--app-heading)]",
        brandPanel: "border-[color:var(--app-border)] bg-[rgba(10,18,30,0.88)]",
        brandIcon: "bg-[linear-gradient(135deg,#1e3a8a,#2563eb)] text-white",
        overline: "text-[rgba(255,255,255,0.78)]",
        heroTitle: "text-[var(--app-heading)]",
        heroText: "text-[rgba(255,255,255,0.88)]",
        heroCard: "border-[color:var(--app-border)] bg-[rgba(10,18,30,0.9)]",
        heroIcon: "bg-[rgba(29,78,216,0.16)] text-[#bfdbfe]",
        heroLabel: "text-[var(--app-heading)]",
        heroValue: "text-[rgba(255,255,255,0.82)]",
        infoCard: "border-[color:var(--app-border)] bg-[rgba(10,18,30,0.9)]",
        infoLabel: "text-[rgba(255,255,255,0.7)]",
        infoValue: "text-[var(--app-heading)]",
        roleCard: "border-[color:var(--app-border)] bg-[rgba(15,23,42,0.76)]",
        roleBadge: "border-[color:rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[var(--app-heading)]",
        panel: "border-[color:var(--app-border)] bg-[rgba(10,18,30,0.94)]",
        panelTop: "text-[rgba(255,255,255,0.74)]",
        heading: "text-[var(--app-heading)]",
        muted: "text-[rgba(255,255,255,0.82)]",
        helperCard: "border-[color:var(--app-border)] bg-[rgba(255,255,255,0.04)]",
        helperLabel: "text-[rgba(255,255,255,0.74)]",
        helperValue: "text-[var(--app-heading)]",
        secureChip: "border-[color:rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] text-[var(--app-heading)]",
        themeButton: "border-[color:var(--app-border)] bg-[rgba(255,255,255,0.04)] text-[var(--app-heading)] hover:bg-[rgba(255,255,255,0.08)]",
        tabs: "border-[color:var(--app-border)] bg-[rgba(255,255,255,0.03)]",
        activeTab: "bg-[var(--app-heading)] text-[#08111f]",
        inactiveTab: "text-[rgba(255,255,255,0.78)] hover:text-[var(--app-heading)]",
        label: "text-[rgba(255,255,255,0.82)]",
        input:
          "border-[color:rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] text-[var(--app-heading)] placeholder:text-[rgba(255,255,255,0.55)] focus:border-[#60a5fa] focus:ring-[#60a5fa]/15",
        eyeButton: "text-[rgba(255,255,255,0.74)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--app-heading)]",
        error: "border-red-500/30 bg-red-500/10 text-red-100",
        success: "border-[color:rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.08)] text-[var(--app-heading)]",
        successTitle: "text-[var(--app-heading)]",
        primary: "bg-[var(--app-heading)] text-[#08111f] hover:bg-[#dbe7ff]",
        link: "text-[#bfdbfe] hover:text-white",
        footer: "text-[rgba(255,255,255,0.68)]",
      }
    : {
        root: "bg-[var(--app-bg)] text-[var(--app-text)]",
        background:
          "bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.08),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.1),transparent_32%)]",
        grid: "bg-[linear-gradient(to_right,rgba(8,17,31,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(8,17,31,0.05)_1px,transparent_1px)] [background-size:40px_40px] opacity-15",
        heroBadge: "border-[color:var(--app-border)] bg-white text-[var(--app-heading)]",
        brandPanel: "border-[color:var(--app-border)] bg-white",
        brandIcon: "bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] text-white",
        overline: "text-[rgba(8,17,31,0.72)]",
        heroTitle: "text-[var(--app-heading)]",
        heroText: "text-[rgba(8,17,31,0.82)]",
        heroCard: "border-[color:var(--app-border)] bg-white",
        heroIcon: "bg-[rgba(29,78,216,0.08)] text-[#1d4ed8]",
        heroLabel: "text-[var(--app-heading)]",
        heroValue: "text-[rgba(8,17,31,0.72)]",
        infoCard: "border-[color:var(--app-border)] bg-white",
        infoLabel: "text-[rgba(8,17,31,0.62)]",
        infoValue: "text-[var(--app-heading)]",
        roleCard: "border-[color:var(--app-border)] bg-white",
        roleBadge: "border-[color:rgba(8,17,31,0.1)] bg-[rgba(8,17,31,0.03)] text-[var(--app-heading)]",
        panel: "border-[color:var(--app-border)] bg-white",
        panelTop: "text-[rgba(8,17,31,0.62)]",
        heading: "text-[var(--app-heading)]",
        muted: "text-[rgba(8,17,31,0.72)]",
        helperCard: "border-[color:var(--app-border)] bg-[rgba(8,17,31,0.03)]",
        helperLabel: "text-[rgba(8,17,31,0.62)]",
        helperValue: "text-[var(--app-heading)]",
        secureChip: "border-[color:rgba(8,17,31,0.12)] bg-[rgba(8,17,31,0.03)] text-[var(--app-heading)]",
        themeButton: "border-[color:var(--app-border)] bg-white text-[var(--app-heading)] hover:bg-[rgba(8,17,31,0.04)]",
        tabs: "border-[color:var(--app-border)] bg-[rgba(8,17,31,0.03)]",
        activeTab: "bg-[#08111f] text-white",
        inactiveTab: "text-[rgba(8,17,31,0.72)] hover:text-[var(--app-heading)]",
        label: "text-[rgba(8,17,31,0.82)]",
        input:
          "border-[color:rgba(8,17,31,0.12)] bg-white text-[var(--app-heading)] placeholder:text-[rgba(8,17,31,0.45)] focus:border-[#1d4ed8] focus:ring-[#1d4ed8]/10",
        eyeButton: "text-[rgba(8,17,31,0.62)] hover:bg-[rgba(8,17,31,0.04)] hover:text-[var(--app-heading)]",
        error: "border-red-200 bg-red-50 text-red-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-900",
        successTitle: "text-[var(--app-heading)]",
        primary: "bg-[#08111f] text-white hover:bg-[#1d4ed8]",
        link: "text-[#1d4ed8] hover:text-[#1e3a8a]",
        footer: "text-[rgba(8,17,31,0.58)]",
      };

  const inputClass =
    `w-full rounded-xl border px-3 py-3.5 text-sm font-medium outline-none transition focus:ring-2 ${theme.input}`;
  const fieldIconClass = darkMode ? "text-[var(--app-heading)]" : "text-[var(--app-heading)]";

  return (
    <div className={`relative min-h-screen overflow-hidden ${theme.root}`}>
      <div className={`pointer-events-none absolute inset-0 ${theme.background}`} />
      <div className={`pointer-events-none absolute inset-0 ${theme.grid}`} />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1500px] gap-10 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(420px,500px)] lg:px-12 xl:px-16">
        <section className="hidden lg:flex lg:flex-col lg:justify-between lg:py-6">
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] ${theme.heroBadge}`}>
              <ShieldCheck size={14} />
              Portail academique de supervision
            </div>

            <div className={`mt-7 flex max-w-xl items-center gap-4 rounded-[26px] border px-5 py-4 ${theme.brandPanel}`}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${theme.brandIcon}`}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-[0.28em] ${theme.overline}`}>CNC Pulse</div>
                <div className={`mt-1 text-lg font-bold ${theme.heading}`}>Supervision industrielle et suivi d atelier</div>
              </div>
            </div>

            <h1 className={`mt-10 max-w-3xl text-5xl font-black leading-[1.04] ${theme.heroTitle}`}>
              Plateforme professionnelle pour le pilotage CNC.
            </h1>
            <p className={`mt-6 max-w-2xl text-[17px] leading-8 ${theme.heroText}`}>
              Espace structure pour la production, la tracabilite documentaire et la coordination entre administration et employes dans un cadre academique encadre.
            </p>
          </div>

          <div className="mt-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`rounded-[24px] border p-5 ${theme.heroCard}`}>
                    <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${theme.heroIcon}`}>
                      <Icon size={20} />
                    </div>
                    <div className={`text-sm font-bold leading-6 ${theme.heroLabel}`}>{item.label}</div>
                    <div className={`mt-2 text-sm leading-6 ${theme.heroValue}`}>{item.value}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4">
              <div className={`rounded-[24px] border p-5 ${theme.infoCard}`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${theme.infoLabel}`}>Cadre de projet</div>
                <div className="mt-5 grid gap-4">
                  {framework.map((item) => (
                    <div key={item.label} className="grid gap-1">
                      <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${theme.infoLabel}`}>{item.label}</div>
                      <div className={`text-sm font-semibold leading-6 ${theme.infoValue}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-[24px] border p-5 ${theme.roleCard}`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${theme.infoLabel}`}>Parcours utilisateurs</div>
                <div className="mt-4 grid gap-3">
                  {roles.map((item) => (
                    <div key={item.label} className={`rounded-2xl border px-4 py-3 ${theme.roleBadge}`}>
                      <div className="text-sm font-bold">{item.label}</div>
                      <div className={`mt-1 text-xs leading-5 ${theme.infoLabel}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={`my-auto ml-auto w-full rounded-[30px] border p-6 sm:p-8 ${theme.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-[0.3em] ${theme.panelTop}`}>Acces plateforme</div>
              {view === "success" ? (
                <>
                  <h2 className={`mt-3 text-[32px] font-black leading-tight ${theme.successTitle}`}>Demande enregistree</h2>
                  <p className={`mt-2 text-sm leading-6 ${theme.muted}`}>Votre demande est en attente d approbation administrateur.</p>
                </>
              ) : view === "demande" ? (
                <>
                  <h2 className={`mt-3 text-[32px] font-black leading-tight ${theme.heading}`}>Demande d acces</h2>
                  <p className={`mt-2 text-sm leading-6 ${theme.muted}`}>Renseignez vos informations professionnelles pour demander un compte.</p>
                </>
              ) : (
                <>
                  <h2 className={`mt-3 text-[32px] font-black leading-tight ${theme.heading}`}>Connexion professionnelle</h2>
                  <p className={`mt-2 text-sm leading-6 ${theme.muted}`}>Authentification reservee aux comptes valides pour l administration et les employes.</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-pressed={darkMode}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${theme.themeButton}`}
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              {darkMode ? "Mode clair" : "Mode sombre"}
            </button>
          </div>

          <div className={`mt-6 grid gap-3 rounded-[22px] border p-4 sm:grid-cols-2 ${theme.helperCard}`}>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${theme.helperLabel}`}>Cadre</div>
              <div className={`mt-1 text-sm font-semibold ${theme.helperValue}`}>Projet industriel encadre</div>
            </div>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${theme.helperLabel}`}>Connexion</div>
              <div className={`mt-1 text-sm font-semibold ${theme.helperValue}`}>Serveur local securise CNC Pulse</div>
            </div>
          </div>

          {view !== "success" && (
            <div className={`mt-6 grid grid-cols-2 rounded-2xl border p-1 ${theme.tabs}`}>
              <button
                type="button"
                onClick={() => setView("login")}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${view === "login" ? theme.activeTab : theme.inactiveTab}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setView("demande")}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${view === "demande" ? theme.activeTab : theme.inactiveTab}`}
              >
                Demande
              </button>
            </div>
          )}

          {view === "success" && (
            <div className="mt-6 space-y-5">
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-sm ${theme.success}`}>
                <BadgeCheck size={18} />
                Votre demande a ete transmise. Vous recevrez l acces apres validation.
              </div>
              <button
                onClick={() => setView("login")}
                className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition ${theme.primary}`}
              >
                Retour a la connexion
              </button>
            </div>
          )}

          {view === "demande" && (
            <form className="mt-6 space-y-4" onSubmit={handleDemande}>
              {[
                { key: "nom", label: "Nom complet", placeholder: "Mohamed Ali Ben Salah", type: "text", icon: User },
                { key: "email", label: "Email professionnel", placeholder: "exemple@usine.tn", type: "email", icon: Mail },
                { key: "poste", label: "Fonction", placeholder: "Technicien de maintenance", type: "text", icon: Building2 },
                { key: "telephone", label: "Telephone", placeholder: "+216 XX XXX XXX", type: "tel", icon: Phone },
              ].map((field) => {
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label className={`mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] ${theme.label}`}>{field.label}</label>
                    <div className="relative">
                      <Icon className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${fieldIconClass}`} size={17} />
                      <input
                        type={field.type}
                        className={`${inputClass} pl-10`}
                        placeholder={field.placeholder}
                        value={(form as Record<string, string>)[field.key]}
                        onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                );
              })}

              {formError && <div className={`rounded-2xl border px-3 py-3 text-xs font-medium ${theme.error}`}>{formError}</div>}

              <button
                type="submit"
                disabled={formLoading}
                className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${theme.primary}`}
              >
                {formLoading ? "Envoi en cours..." : "Envoyer la demande"}
              </button>

              <p className={`text-center text-xs leading-6 ${theme.footer}`}>
                Vous avez deja un compte ?{" "}
                <button type="button" onClick={() => setView("login")} className={`font-semibold ${theme.link}`}>
                  Revenir a la connexion
                </button>
              </p>
            </form>
          )}

          {view === "login" && (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className={`rounded-[22px] border px-4 py-3 ${theme.secureChip}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Authentification locale securisee</span>
                  <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${theme.panelTop}`}>Compte approuve</span>
                </div>
              </div>

              <div>
                <label htmlFor="username" className={`mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] ${theme.label}`}>
                  Identifiant
                </label>
                <div className="relative">
                  <User className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${fieldIconClass}`} size={17} />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    className={`${inputClass} pl-10`}
                    placeholder="Saisissez votre identifiant"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className={`mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] ${theme.label}`}>
                  Mot de passe
                </label>
                <div className="relative">
                  <KeyRound className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${fieldIconClass}`} size={17} />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className={`${inputClass} pl-10 pr-11`}
                    placeholder="Saisissez votre mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl transition ${theme.eyeButton}`}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && <div className={`rounded-2xl border px-3 py-3 text-xs font-medium ${theme.error}`}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${theme.primary}`}
              >
                {loading ? "Connexion..." : "Acceder a la plateforme"}
              </button>

              <p className={`text-center text-xs leading-6 ${theme.footer}`}>
                Aucun compte actif ?{" "}
                <button type="button" onClick={() => setView("demande")} className={`font-semibold ${theme.link}`}>
                  Deposer une demande d acces
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
