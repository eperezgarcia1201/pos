import { useParams } from "react-router-dom";

export default function FeaturePlaceholder() {
  const { feature } = useParams();
  const label = feature ? feature.replace(/-/g, " ") : "Feature";

  return (
    <div className="terminal-shell">
      <header className="terminal-top">
        <div>
          <h2>{label}</h2>
          <p>Feature module is being wired to the POS backend.</p>
        </div>
      </header>
      <div className="terminal-placeholder">
        <div className="terminal-placeholder-card">
          <h3>Next steps</h3>
          <p>We will map this module to the legacy Websys POS workflows and permissions.</p>
          <p>Ready for touchscreen-friendly flows.</p>
        </div>
      </div>
    </div>
  );
}
