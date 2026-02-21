import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type DataSourceInfo = {
  provider: string;
  host: string;
  port: number;
  database: string;
  user: string;
};

export default function DataSource() {
  const [info, setInfo] = useState<DataSourceInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiFetch("/maintenance/data-source");
        setInfo(payload);
      } catch (err) {
        setError("Unable to load data source settings.");
        console.error(err);
      }
    })();
  }, []);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Data Source</h2>
          <p>Current database connection used by the POS backend.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Connection</h3>
          {error && <p className="hint">{error}</p>}
          {!error && !info && <p className="hint">Loading data source...</p>}
          {info && (
            <div className="form-grid">
              <label>
                Provider
                <input value={info.provider} readOnly />
              </label>
              <label>
                Host
                <input value={info.host} readOnly />
              </label>
              <label>
                Port
                <input value={String(info.port)} readOnly />
              </label>
              <label>
                Database
                <input value={info.database} readOnly />
              </label>
              <label>
                User
                <input value={info.user} readOnly />
              </label>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Notes</h3>
          <p className="hint">
            For on-prem installs, update the backend `.env` file and restart the service if the database
            server changes.
          </p>
        </section>
      </div>
    </div>
  );
}
