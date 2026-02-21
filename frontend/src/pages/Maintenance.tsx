import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function Maintenance() {
  const [backupResult, setBackupResult] = useState("");
  const [compactResult, setCompactResult] = useState("");
  const [working, setWorking] = useState(false);

  const runBackup = async () => {
    setWorking(true);
    try {
      const result = await apiFetch("/maintenance/backup", { method: "POST" });
      setBackupResult(`Backup created: ${result.file}`);
    } catch (err) {
      console.error(err);
      setBackupResult("Backup failed. Check server logs.");
    } finally {
      setWorking(false);
    }
  };

  const runCompact = async () => {
    setWorking(true);
    try {
      const result = await apiFetch("/maintenance/compact", { method: "POST" });
      setCompactResult(`Compacted ${result.tables} tables.`);
    } catch (err) {
      console.error(err);
      setCompactResult("Compact failed. Check server logs.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Maintenance</h2>
          <p>Database backup, compact, and housekeeping.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Backup Database</h3>
          <p className="hint">Creates a JSON snapshot in the backend backup folder.</p>
          <button type="button" disabled={working} onClick={runBackup}>
            {working ? "Working..." : "Run Backup"}
          </button>
          {backupResult && <p className="hint">{backupResult}</p>}
        </section>

        <section className="panel">
          <h3>Compact Database</h3>
          <p className="hint">Optimizes tables to reclaim space and improve performance.</p>
          <button type="button" disabled={working} onClick={runCompact}>
            {working ? "Working..." : "Compact Now"}
          </button>
          {compactResult && <p className="hint">{compactResult}</p>}
        </section>
      </div>
    </div>
  );
}
