import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAppLanguage } from "../lib/i18n";
import { setCurrentUser, type SessionUser } from "../lib/session";

type BilingualText = {
  en: string;
  es: string;
};

type GuideSection = {
  id: string;
  title: BilingualText;
  steps: BilingualText[];
};

type GuideResponse = {
  id: string;
  title: BilingualText;
  summary: BilingualText;
  updatedAt: string;
  sections: GuideSection[];
};

type OnsiteIdentityResponse = {
  serverUid: string;
  label: string;
  updatedAt: string;
  claim?: {
    id: string;
    expiresAt: string;
    active: boolean;
    usedAt?: string | null;
  } | null;
  cloudLink?: {
    cloudStoreCode?: string;
    nodeKey?: string;
    linkedAt?: string;
  } | null;
  storeHints?: {
    storeName?: string | null;
    timezone?: string;
  } | null;
};

type OnsiteClaimResponse = {
  serverUid: string;
  serverLabel: string;
  claimId: string;
  claimCode: string;
  issuedAt: string;
  expiresAt: string;
};

function localized(value: BilingualText, language: "en" | "es") {
  return language === "es" ? value.es : value.en;
}

export default function ServerConnectionGuide() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appLanguage = useAppLanguage();
  const internalMode = searchParams.get("internal") === "1";
  const [language, setLanguage] = useState<"en" | "es">(appLanguage === "es" ? "es" : "en");
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onsiteIdentity, setOnsiteIdentity] = useState<OnsiteIdentityResponse | null>(null);
  const [claimPackage, setClaimPackage] = useState<OnsiteClaimResponse | null>(null);
  const [claimLabel, setClaimLabel] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimAccessCode, setClaimAccessCode] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [showClaimUnlock, setShowClaimUnlock] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    setLanguage(appLanguage === "es" ? "es" : "en");
  }, [appLanguage]);

  useEffect(() => {
    const loadGuide = async () => {
      setLoading(true);
      setError(null);
      try {
        const helpPath = internalMode ? "/help/server-connection?internal=1" : "/help/server-connection";
        const [response, identity] = await Promise.all([
          apiFetch(helpPath),
          apiFetch("/onsite/identity").catch(() => null)
        ]);
        setGuide(response as GuideResponse);
        setOnsiteIdentity(identity as OnsiteIdentityResponse | null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load server connection guide.");
      } finally {
        setLoading(false);
      }
    };

    void loadGuide();
  }, [internalMode]);

  const isAccessCodeError = (message: string) => message.toLowerCase().includes("access code required");

  const generateClaimPackage = async () => {
    setClaimBusy(true);
    setError(null);
    setUnlockError(null);
    try {
      const payload = await apiFetch("/onsite/claim/create", {
        method: "POST",
        body: JSON.stringify({
          label: claimLabel.trim() || undefined
        })
      });
      setClaimPackage(payload as OnsiteClaimResponse);
      setShowClaimUnlock(false);
      const identity = await apiFetch("/onsite/identity").catch(() => null);
      setOnsiteIdentity(identity as OnsiteIdentityResponse | null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate claim package.";
      if (isAccessCodeError(message)) {
        setShowClaimUnlock(true);
        setError(
          language === "es"
            ? "Se requiere codigo de acceso para generar el claim."
            : "Access code is required to generate claim."
        );
      } else {
        setError(message);
      }
    } finally {
      setClaimBusy(false);
    }
  };

  const unlockAndGenerateClaim = async () => {
    const pin = claimAccessCode.trim();
    if (!pin) {
      setUnlockError(language === "es" ? "Ingresa codigo de acceso." : "Enter access code.");
      return;
    }
    setUnlockBusy(true);
    setUnlockError(null);
    setError(null);
    try {
      const result = await apiFetch("/auth/pin", {
        method: "POST",
        body: JSON.stringify({ pin })
      });
      const login = result as { user?: SessionUser; token?: string };
      if (!login.user?.id) {
        throw new Error(language === "es" ? "Respuesta de login invalida." : "Invalid login response.");
      }
      setCurrentUser({ ...login.user, token: typeof login.token === "string" ? login.token : undefined });
      setClaimAccessCode("");
      setShowClaimUnlock(false);
      await generateClaimPackage();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : language === "es" ? "No se pudo desbloquear." : "Unable to unlock.");
    } finally {
      setUnlockBusy(false);
    }
  };

  const title = useMemo(() => {
    if (!guide) return language === "es" ? "Guia De Conexion De Servidores" : "Server Connection Guide";
    return localized(guide.title, language);
  }, [guide, language]);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>{title}</h2>
          <p>
            {guide
              ? localized(guide.summary, language)
              : language === "es"
                ? "Como desplegar sistema en sitio y cloud."
                : "How to deploy onsite and cloud system."}
          </p>
        </div>
        <div className="terminal-actions">
          <div className="manual-language-switch">
            <button
              type="button"
              className={`terminal-btn ${language === "en" ? "primary" : "ghost"}`}
              onClick={() => setLanguage("en")}
            >
              English
            </button>
            <button
              type="button"
              className={`terminal-btn ${language === "es" ? "primary" : "ghost"}`}
              onClick={() => setLanguage("es")}
            >
              Espanol
            </button>
          </div>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/manual")}>
            System Manual
          </button>
          <button
            type="button"
            className={`terminal-btn ${internalMode ? "primary" : "ghost"}`}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (internalMode) next.delete("internal");
              else next.set("internal", "1");
              setSearchParams(next);
            }}
          >
            {internalMode ? "Internal Guide On" : "Internal Guide"}
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-network")}>
            Cloud Store Network
          </button>
          <button type="button" className="terminal-btn" onClick={() => navigate("/back-office")}>
            Back Office
          </button>
        </div>
      </header>

      <div className="screen-grid manual-grid">
        <section className="panel manual-index">
          <h3>{language === "es" ? "Secciones" : "Sections"}</h3>
          <div className="manual-index-list">
            {(guide?.sections || []).map((section, index) => (
              <button
                key={section.id}
                type="button"
                className="manual-index-link"
                onClick={() => {
                  const target = document.getElementById(`server-guide-${section.id}`);
                  if (!target) return;
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>{index + 1}.</span>
                <span>{localized(section.title, language)}</span>
              </button>
            ))}
          </div>
          {guide ? (
            <p className="hint">
              {language === "es" ? "Actualizado: " : "Updated: "}
              {guide.updatedAt}
            </p>
          ) : null}
        </section>

        <section className="panel manual-content">
          <article className="manual-section">
            <h3>{language === "es" ? "Paquete De Claim Del Servidor Local" : "Onsite Server Claim Package"}</h3>
            <p className="hint">
              {language === "es"
                ? "Genera claimId y claimCode para registrar este servidor en dashboard cloud."
                : "Generate claimId and claimCode to register this server in cloud dashboard."}
            </p>
            <div className="form-grid">
              <label>
                {language === "es" ? "Etiqueta Del Servidor (Opcional)" : "Server Label (Optional)"}
                <input
                  value={claimLabel}
                  onChange={(event) => setClaimLabel(event.target.value)}
                  placeholder={onsiteIdentity?.label || "Onsite Store Server"}
                />
              </label>
            </div>
            <div className="terminal-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={() => void generateClaimPackage()}
                disabled={claimBusy}
              >
                {claimBusy
                  ? language === "es"
                    ? "Generando..."
                    : "Generating..."
                  : language === "es"
                    ? "Generar Claim"
                    : "Generate Claim"}
              </button>
            </div>

            {showClaimUnlock ? (
              <div className="manual-access-unlock">
                <p className="hint">
                  {language === "es"
                    ? "Desbloquea con tu codigo PIN para autorizar la generacion del claim."
                    : "Unlock with your PIN code to authorize claim generation."}
                </p>
                <div className="manual-access-row">
                  <input
                    type="password"
                    value={claimAccessCode}
                    onChange={(event) => setClaimAccessCode(event.target.value)}
                    placeholder={language === "es" ? "Codigo de acceso" : "Access code"}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void unlockAndGenerateClaim();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="terminal-btn primary"
                    disabled={unlockBusy}
                    onClick={() => void unlockAndGenerateClaim()}
                  >
                    {unlockBusy ? (language === "es" ? "Validando..." : "Validating...") : language === "es" ? "Desbloquear" : "Unlock"}
                  </button>
                </div>
                {unlockError ? <p style={{ color: "#fca5a5", margin: 0 }}>{unlockError}</p> : null}
              </div>
            ) : null}

            {onsiteIdentity ? (
              <div className="manual-hint-grid">
                <p className="hint">
                  <strong>{language === "es" ? "Server UID:" : "Server UID:"}</strong> {onsiteIdentity.serverUid}
                </p>
                <p className="hint">
                  <strong>{language === "es" ? "Ultima Actualizacion:" : "Last Updated:"}</strong>{" "}
                  {new Date(onsiteIdentity.updatedAt).toLocaleString()}
                </p>
                {onsiteIdentity.cloudLink?.cloudStoreCode ? (
                  <p className="hint">
                    <strong>{language === "es" ? "Store Cloud Vinculada:" : "Linked Cloud Store:"}</strong>{" "}
                    {onsiteIdentity.cloudLink.cloudStoreCode}
                  </p>
                ) : null}
              </div>
            ) : null}

            {claimPackage ? (
              <div className="manual-section" style={{ marginTop: 10 }}>
                <p className="hint" style={{ marginTop: 0 }}>
                  {language === "es"
                    ? "Usa estos valores en Cloud Platform > Claim Onsite Server."
                    : "Use these values in Cloud Platform > Claim Onsite Server."}
                </p>
                <p>
                  <strong>Claim ID:</strong> {claimPackage.claimId}
                </p>
                <p>
                  <strong>Claim Code:</strong> {claimPackage.claimCode}
                </p>
                <p>
                  <strong>{language === "es" ? "Expira:" : "Expires:"}</strong>{" "}
                  {new Date(claimPackage.expiresAt).toLocaleString()}
                </p>
              </div>
            ) : null}
          </article>

          {loading ? <p className="hint">{language === "es" ? "Cargando guia..." : "Loading guide..."}</p> : null}
          {error ? <p style={{ color: "#fca5a5" }}>{error}</p> : null}
          {!loading && !error && guide
            ? guide.sections.map((section, index) => (
                <article key={section.id} id={`server-guide-${section.id}`} className="manual-section">
                  <h3>
                    {index + 1}. {localized(section.title, language)}
                  </h3>
                  <ol className="manual-steps">
                    {section.steps.map((step, stepIndex) => (
                      <li key={`${section.id}-${stepIndex}`}>{localized(step, language)}</li>
                    ))}
                  </ol>
                </article>
              ))
            : null}
        </section>
      </div>
    </div>
  );
}
