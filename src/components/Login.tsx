import React, { useEffect, useState } from "react";
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
  const { darkMode, toggleTheme } = useTheme();
  const [wideLayout, setWideLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1180 : true,
  );

  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ nom: "", email: "", poste: "", telephone: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const updateLayout = () => {
      setWideLayout(window.innerWidth >= 1180);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const highlights = [
    {
      label: "Tracabilite",
      value: "Pieces, plans et passages machine.",
      icon: FileText,
    },
    {
      label: "Supervision",
      value: "Temps, production et anomalies.",
      icon: BarChart3,
    },
    {
      label: "Acces",
      value: "Parcours admin et employe.",
      icon: ShieldCheck,
    },
  ];

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, var(--app-accent-soft), transparent 28%), var(--app-bg)",
    color: "var(--app-text)",
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--app-card)",
    border: "1px solid var(--app-border)",
    boxShadow: "none",
  };

  const softCardStyle: React.CSSProperties = {
    background: "var(--app-card-alt)",
    border: "1px solid var(--app-border)",
    boxShadow: "none",
  };

  const iconTileStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-strong))",
    color: "#ffffff",
    boxShadow: "none",
  };

  const chipStyle: React.CSSProperties = {
    background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(8,17,31,0.03)",
    border: "1px solid var(--app-border)",
    color: "var(--app-heading)",
    boxShadow: "none",
  };

  const fieldStyle: React.CSSProperties = {
    background: "var(--app-surface-strong)",
    border: "1px solid var(--app-border)",
    color: "var(--app-heading)",
    boxShadow: "none",
  };

  const primaryButtonStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-strong))",
    color: "#ffffff",
    border: "none",
    boxShadow: "none",
  };

  const activeTabStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-strong))",
    color: "#ffffff",
    boxShadow: "none",
  };

  const inactiveTabStyle: React.CSSProperties = {
    color: "var(--app-muted)",
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
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

  const handleDemande = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (!form.nom || !form.email || !form.poste || !form.telephone) {
      setFormError("Tous les champs sont requis");
      return;
    }

    setFormLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/demandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
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

  const renderField = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    icon: React.ElementType,
    options?: {
      placeholder?: string;
      type?: string;
      autoComplete?: string;
      trailing?: React.ReactNode;
    },
  ) => {
    const Icon = icon;

    return (
      <div>
        <label
          htmlFor={id}
          className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--app-muted)" }}
        >
          {label}
        </label>

        <div className="relative">
          <Icon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--app-subtle)" }}
          />

          <input
            id={id}
            name={id}
            type={options?.type || "text"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={options?.placeholder}
            autoComplete={options?.autoComplete}
            className={`w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[var(--app-focus)] ${
              options?.trailing ? "pl-10 pr-10" : "pl-10"
            }`}
            style={fieldStyle}
            required
          />

          {options?.trailing}
        </div>
      </div>
    );
  };

  const getPanelHeader = () => {
    if (view === "success") {
      return {
        title: "Demande enregistree",
        text: "Votre demande a ete transmise et reste en attente de validation.",
      };
    }

    if (view === "demande") {
      return {
        title: "Demande d'acces",
        text: "Renseignez vos informations professionnelles pour demander un compte.",
      };
    }

    return {
      title: "Connexion securisee",
      text: "Supervision industrielle en temps reel.",
    };
  };

  const panelHeader = getPanelHeader();

  const shellLayoutStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: wideLayout ? "minmax(0, 1fr) 420px" : "1fr",
    alignItems: "center",
    gap: wideLayout ? "3rem" : "2rem",
    width: "100%",
  };

  const leftColumnStyle: React.CSSProperties = {
    maxWidth: wideLayout ? "760px" : "100%",
  };

  const highlightsGridStyle: React.CSSProperties = {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: wideLayout ? "repeat(3, minmax(0, 1fr))" : "1fr",
    maxWidth: wideLayout ? "720px" : "100%",
  };

  const sessionCardLayoutStyle: React.CSSProperties = {
    maxWidth: wideLayout ? "720px" : "100%",
  };

  return (
    <div style={pageStyle}>
      <div className="mx-auto flex min-h-screen max-w-[1380px] items-center px-4 py-8 sm:px-8 lg:px-12 xl:px-16">
        <div style={shellLayoutStyle}>
        <section className="flex min-w-0 flex-col justify-center py-4" style={leftColumnStyle}>
          <div
            className="inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em]"
            style={softCardStyle}
          >
            <ShieldCheck size={14} style={{ color: "var(--app-accent)" }} />
            Projet industriel encadre
          </div>

          <div className="mt-10 max-w-3xl">
            <h1
              className="max-w-[580px] text-4xl font-black leading-[1.04] sm:text-5xl xl:text-[66px]"
              style={{ color: "var(--app-heading)" }}
            >
              Plateforme de suivi CNC.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-8" style={{ color: "var(--app-muted)" }}>
              Pilotage de la production, suivi des machines et gestion des validations dans un
              environnement structure pour l'atelier.
            </p>
          </div>

          <div className="mt-10" style={highlightsGridStyle}>
            {highlights.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.label} className="rounded-[22px] p-5" style={cardStyle}>
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{
                      background: "var(--app-accent-soft)",
                      color: "var(--app-accent)",
                    }}
                  >
                    <Icon size={18} />
                  </div>

                  <div className="mt-5 text-base font-bold" style={{ color: "var(--app-heading)" }}>
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm leading-6" style={{ color: "var(--app-muted)" }}>
                    {item.value}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[22px] p-5"
            style={{ ...cardStyle, ...sessionCardLayoutStyle }}
          >
            <div>
              <div
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--app-subtle)" }}
              >
                Session securisee
              </div>
              <div className="mt-2 text-sm leading-6" style={{ color: "var(--app-muted)" }}>
                Connexion locale vers le serveur CNC Pulse.
              </div>
            </div>

            <div
              className="rounded-full px-4 py-2 text-xs font-semibold"
              style={{
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.18)",
                color: darkMode ? "#86efac" : "#166534",
              }}
            >
              Operationnel
            </div>
          </div>
        </section>

        <section className="w-full max-w-[420px] rounded-[28px] p-6 sm:p-7" style={cardStyle}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={iconTileStyle}>
                <ShieldCheck size={20} />
              </div>

              <div>
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: "var(--app-subtle)" }}
                >
                  Acces plateforme
                </div>
                <h2 className="mt-2 text-[32px] font-black leading-tight" style={{ color: "var(--app-heading)" }}>
                  {panelHeader.title}
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--app-muted)" }}>
                  {panelHeader.text}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <div
                className="hidden items-center rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] sm:inline-flex"
                style={chipStyle}
              >
                Acces securise
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition"
                style={chipStyle}
                aria-pressed={darkMode}
              >
                {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                {darkMode ? "Mode clair" : "Mode sombre"}
              </button>
            </div>
          </div>

          {view !== "success" && (
            <div className="mt-6 grid grid-cols-2 rounded-2xl p-1" style={softCardStyle}>
              <button
                type="button"
                onClick={() => setView("login")}
                className="rounded-xl px-3 py-2.5 text-sm font-bold transition"
                style={view === "login" ? activeTabStyle : inactiveTabStyle}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setView("demande")}
                className="rounded-xl px-3 py-2.5 text-sm font-bold transition"
                style={view === "demande" ? activeTabStyle : inactiveTabStyle}
              >
                Demande
              </button>
            </div>
          )}

          {view === "success" && (
            <div className="mt-6 space-y-5">
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-4 text-sm"
                style={{
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  color: "var(--app-heading)",
                }}
              >
                <BadgeCheck size={18} />
                Votre demande a ete transmise. Vous recevrez l'acces apres validation.
              </div>

              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold transition"
                style={primaryButtonStyle}
              >
                Retour a la connexion
              </button>
            </div>
          )}

          {view === "login" && (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {renderField("username", "Identifiant", username, setUsername, User, {
                placeholder: "Entrez votre identifiant",
                autoComplete: "username",
              })}

              {renderField("password", "Mot de passe", password, setPassword, KeyRound, {
                placeholder: "Entrez votre mot de passe",
                type: showPassword ? "text" : "password",
                autoComplete: "current-password",
                trailing: (
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition"
                    style={{ color: "var(--app-subtle)" }}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                ),
              })}

              {error && (
                <div
                  className="rounded-xl px-3 py-3 text-xs font-medium"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    color: "var(--app-danger)",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70"
                style={primaryButtonStyle}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <p className="text-center text-xs leading-6" style={{ color: "var(--app-muted)" }}>
                Pas encore de compte ?{" "}
                <button
                  type="button"
                  onClick={() => setView("demande")}
                  className="font-semibold"
                  style={{ color: "var(--app-accent)" }}
                >
                  Demander un acces
                </button>
              </p>
            </form>
          )}

          {view === "demande" && (
            <form className="mt-6 space-y-4" onSubmit={handleDemande}>
              {renderField("nom", "Nom complet", form.nom, (value) => setForm((prev) => ({ ...prev, nom: value })), User, {
                placeholder: "Nom complet",
                autoComplete: "name",
              })}
              {renderField("email", "Email professionnel", form.email, (value) => setForm((prev) => ({ ...prev, email: value })), Mail, {
                placeholder: "Email professionnel",
                type: "email",
                autoComplete: "email",
              })}
              {renderField("poste", "Fonction", form.poste, (value) => setForm((prev) => ({ ...prev, poste: value })), Building2, {
                placeholder: "Fonction",
              })}
              {renderField("telephone", "Telephone", form.telephone, (value) => setForm((prev) => ({ ...prev, telephone: value })), Phone, {
                placeholder: "Telephone",
                type: "tel",
                autoComplete: "tel",
              })}

              {formError && (
                <div
                  className="rounded-xl px-3 py-3 text-xs font-medium"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    color: "var(--app-danger)",
                  }}
                >
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70"
                style={primaryButtonStyle}
              >
                {formLoading ? "Envoi en cours..." : "Envoyer la demande"}
              </button>

              <p className="text-center text-xs leading-6" style={{ color: "var(--app-muted)" }}>
                Vous avez deja un compte ?{" "}
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="font-semibold"
                  style={{ color: "var(--app-accent)" }}
                >
                  Revenir a la connexion
                </button>
              </p>
            </form>
          )}
        </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
