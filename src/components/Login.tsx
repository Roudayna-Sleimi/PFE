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
  const { darkMode, toggleTheme } = useTheme();

  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ nom: "", email: "", poste: "", telephone: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const openView = (nextView: View) => {
    setView(nextView);
    setError("");
    setFormError("");
  };

  const academicNotes = [
    {
      label: "Tracabilite",
      value: "Pieces, plans et machines.",
      icon: FileText,
    },
    {
      label: "Supervision",
      value: "Production, temps et alertes.",
      icon: BarChart3,
    },
    {
      label: "Acces",
      value: "Profils admin et employe.",
      icon: ShieldCheck,
    },
  ];

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 14% 16%, var(--app-accent-soft-strong), transparent 24%), radial-gradient(circle at 86% 10%, rgba(15,23,42,0.16), transparent 30%), var(--app-bg)",
    color: "var(--app-text)",
  };

  const shellCardStyle: React.CSSProperties = {
    border: "1px solid var(--app-border)",
    background: darkMode
      ? "linear-gradient(180deg, rgba(16, 28, 47, 0.94), rgba(7, 17, 29, 0.96))"
      : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.96))",
    boxShadow: "none",
    backdropFilter: "blur(18px)",
  };

  const cardStyle: React.CSSProperties = {
    background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)",
    border: "1px solid var(--app-border)",
    boxShadow: "none",
  };

  const softCardStyle: React.CSSProperties = {
    background: darkMode ? "rgba(255,255,255,0.04)" : "var(--app-card-alt)",
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
    background: "transparent",
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

      openView("success");
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
    onChange: (nextValue: string) => void,
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
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-[11px] font-bold uppercase tracking-[0.2em]"
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
            className={`w-full rounded-2xl px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[var(--app-focus)] ${
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
      text: "Acces direct a la plateforme CNC Pulse depuis l'atelier.",
    };
  };

  const panelHeader = getPanelHeader();

  return (
    <div style={pageStyle}>
      <div className="mx-auto flex min-h-screen max-w-[1420px] items-center px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,430px)] lg:items-center xl:gap-8">
          <section className="min-w-0 rounded-[34px] p-6 sm:p-8 xl:p-9" style={shellCardStyle}>
            <div
              className="inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em]"
              style={chipStyle}
            >
              <ShieldCheck size={14} style={{ color: "var(--app-accent)" }} />
              Plateforme atelier
            </div>

            <div className="mt-8 max-w-2xl">
              <h1
                className="max-w-[560px] text-4xl font-black leading-[1.04] sm:text-5xl xl:text-[54px]"
                style={{ color: "var(--app-heading)" }}
              >
                Connexion CNC Pulse.
              </h1>
              <p className="mt-4 max-w-[520px] text-sm leading-7 sm:text-[15px]" style={{ color: "var(--app-muted)" }}>
                Plateforme de suivi de production, de pieces et de machines.
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {academicNotes.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="h-full rounded-[22px] p-4" style={cardStyle}>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl"
                      style={{
                        background: "var(--app-accent-soft)",
                        color: "var(--app-accent)",
                      }}
                    >
                      <Icon size={18} />
                    </div>

                    <div className="mt-4 text-[15px] font-bold" style={{ color: "var(--app-heading)" }}>
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm leading-6" style={{ color: "var(--app-muted)" }}>
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>

          </section>

          <section
            className="relative w-full max-w-[430px] justify-self-center overflow-hidden rounded-[30px] p-5 sm:p-6"
            style={shellCardStyle}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-32"
              style={{
                background:
                  "linear-gradient(180deg, var(--app-accent-soft-strong), transparent 78%)",
              }}
            />

            <div className="relative">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={iconTileStyle}>
                    <ShieldCheck size={20} />
                  </div>

                  <div className="min-w-0">
                    <div
                      className="text-[11px] font-bold uppercase tracking-[0.24em]"
                      style={{ color: "var(--app-subtle)" }}
                    >
                      Acces plateforme
                    </div>
                    <h2 className="mt-2 text-[28px] font-black leading-tight" style={{ color: "var(--app-heading)" }}>
                      {panelHeader.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--app-muted)" }}>
                      {panelHeader.text}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-full px-4 py-2 text-xs font-bold transition"
                  style={chipStyle}
                  aria-label={darkMode ? "Activer le mode clair" : "Activer le mode sombre"}
                  title={darkMode ? "Activer le mode clair" : "Activer le mode sombre"}
                >
                  {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                  {darkMode ? "Mode clair" : "Mode sombre"}
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] p-3.5" style={softCardStyle}>
                  <div
                    className="text-[11px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: "var(--app-subtle)" }}
                  >
                    Acces
                  </div>
                  <div className="mt-2 text-sm font-bold" style={{ color: "var(--app-heading)" }}>
                    Securise par role
                  </div>
                </div>

                  <div className="rounded-[20px] p-3.5" style={softCardStyle}>
                  <div
                    className="text-[11px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: "var(--app-subtle)" }}
                  >
                    Serveur
                  </div>
                  <div className="mt-2 text-sm font-bold" style={{ color: "var(--app-heading)" }}>
                    Connexion locale
                  </div>
                </div>
              </div>

              {view !== "success" && (
                <div className="mt-6 grid grid-cols-2 rounded-2xl p-1" style={softCardStyle}>
                  <button
                    type="button"
                    onClick={() => openView("login")}
                    className="rounded-xl px-3 py-2.5 text-sm font-bold transition"
                    style={view === "login" ? activeTabStyle : inactiveTabStyle}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => openView("demande")}
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
                    className="rounded-[24px] p-5"
                    style={{
                      background: "rgba(34,197,94,0.1)",
                      border: "1px solid rgba(34,197,94,0.18)",
                      color: "var(--app-heading)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{
                          background: "rgba(34,197,94,0.18)",
                          color: darkMode ? "#86efac" : "#166534",
                        }}
                      >
                        <BadgeCheck size={18} />
                      </div>
                      <div className="text-sm font-semibold">
                        Votre demande a bien ete transmise pour validation.
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] px-4 py-3" style={softCardStyle}>
                        <div className="text-xs font-bold" style={{ color: "var(--app-heading)" }}>
                          Verification admin
                        </div>
                        <div className="mt-1 text-xs leading-5" style={{ color: "var(--app-muted)" }}>
                          Les informations seront relues avant creation du compte.
                        </div>
                      </div>
                      <div className="rounded-[18px] px-4 py-3" style={softCardStyle}>
                        <div className="text-xs font-bold" style={{ color: "var(--app-heading)" }}>
                          Retour vers connexion
                        </div>
                        <div className="mt-1 text-xs leading-5" style={{ color: "var(--app-muted)" }}>
                          Revenez ensuite avec vos identifiants actives.
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openView("login")}
                    className="w-full rounded-2xl px-4 py-3 text-sm font-bold transition"
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
                      className="rounded-2xl px-3 py-3 text-xs font-medium"
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
                    className="w-full rounded-2xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70"
                    style={primaryButtonStyle}
                  >
                    {loading ? "Connexion..." : "Se connecter"}
                  </button>

                  <p className="text-center text-xs leading-6" style={{ color: "var(--app-muted)" }}>
                    Pas encore de compte ?{" "}
                    <button
                      type="button"
                      onClick={() => openView("demande")}
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
                  {renderField(
                    "email",
                    "Email professionnel",
                    form.email,
                    (value) => setForm((prev) => ({ ...prev, email: value })),
                    Mail,
                    {
                      placeholder: "Email professionnel",
                      type: "email",
                      autoComplete: "email",
                    },
                  )}
                  {renderField("poste", "Fonction", form.poste, (value) => setForm((prev) => ({ ...prev, poste: value })), Building2, {
                    placeholder: "Fonction",
                  })}
                  {renderField(
                    "telephone",
                    "Telephone",
                    form.telephone,
                    (value) => setForm((prev) => ({ ...prev, telephone: value })),
                    Phone,
                    {
                      placeholder: "Telephone",
                      type: "tel",
                      autoComplete: "tel",
                    },
                  )}

                  {formError && (
                    <div
                      className="rounded-2xl px-3 py-3 text-xs font-medium"
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
                    className="w-full rounded-2xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70"
                    style={primaryButtonStyle}
                  >
                    {formLoading ? "Envoi en cours..." : "Envoyer la demande"}
                  </button>

                  <div className="rounded-[22px] p-4 text-xs leading-6" style={softCardStyle}>
                    Les demandes sont centralisees pour validation avant creation du compte.
                  </div>

                  <p className="text-center text-xs leading-6" style={{ color: "var(--app-muted)" }}>
                    Vous avez deja un compte ?{" "}
                    <button
                      type="button"
                      onClick={() => openView("login")}
                      className="font-semibold"
                      style={{ color: "var(--app-accent)" }}
                    >
                      Revenir a la connexion
                    </button>
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
