import { useCloudPortalUi } from "../lib/cloudPortalUi";

export default function CloudPortalPreferenceControls() {
  const { language, setLanguage, theme, setTheme, tx } = useCloudPortalUi();

  return (
    <div className="cloud-portal-preference-controls" aria-label={tx("Portal preferences", "Preferencias del portal")}>
      <div className="cloud-portal-segment" role="group" aria-label={tx("Language", "Idioma")}>
        <button
          type="button"
          className={`cloud-portal-segment-btn${language === "en" ? " active" : ""}`}
          onClick={() => setLanguage("en")}
        >
          EN
        </button>
        <button
          type="button"
          className={`cloud-portal-segment-btn${language === "es" ? " active" : ""}`}
          onClick={() => setLanguage("es")}
        >
          ES
        </button>
      </div>

      <div className="cloud-portal-segment" role="group" aria-label={tx("Theme", "Tema")}>
        <button
          type="button"
          className={`cloud-portal-segment-btn${theme === "dark" ? " active" : ""}`}
          onClick={() => setTheme("dark")}
        >
          {tx("Dark", "Oscuro")}
        </button>
        <button
          type="button"
          className={`cloud-portal-segment-btn${theme === "light" ? " active" : ""}`}
          onClick={() => setTheme("light")}
        >
          {tx("Light", "Claro")}
        </button>
      </div>
    </div>
  );
}
