import { useNavigate } from "react-router-dom";

export default function Support() {
  const navigate = useNavigate();

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Support</h2>
          <p>Connection checks, device status, and service contacts.</p>
        </div>
        <div className="terminal-actions">
          <button type="button" className="terminal-btn" onClick={() => navigate("/settings/help/server-connection")}>
            Server Connection Guide
          </button>
          <button type="button" className="terminal-btn" onClick={() => navigate("/settings/manual")}>
            Open System Manual
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            Back Office
          </button>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Quick Checks</h3>
          <ul className="list">
            <li>Verify backend service is running.</li>
            <li>Verify device bridge service is running.</li>
            <li>Test receipt and kitchen printers.</li>
            <li>Confirm PAX device connectivity.</li>
          </ul>
        </section>

        <section className="panel">
          <h3>Contact</h3>
          <p className="hint">Add your local support phone/email here.</p>
        </section>
      </div>
    </div>
  );
}
