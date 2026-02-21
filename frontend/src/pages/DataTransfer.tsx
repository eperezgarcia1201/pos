import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function DataTransfer() {
  const [exportStatus, setExportStatus] = useState("");

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Import / Export Data</h2>
          <p>Move legacy data and create portable backups.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Export Snapshot</h3>
          <p className="hint">Creates a JSON snapshot of operational data.</p>
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await apiFetch("/maintenance/backup", { method: "POST" });
                setExportStatus(`Exported to ${result.file}`);
              } catch (err) {
                console.error(err);
                setExportStatus("Export failed. Check server logs.");
              }
            }}
          >
            Export
          </button>
          {exportStatus && <p className="hint">{exportStatus}</p>}
        </section>

        <section className="panel">
          <h3>Legacy Import</h3>
          <p className="hint">
            Use the legacy import scripts to bring data from Derby/MySQL. Drop the exported JSON files into
            the backend `export` folder, then run `npm run legacy:stage` followed by `npm run legacy:transform`.
          </p>
        </section>
      </div>
    </div>
  );
}
