import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  STATION_MODE_EVENT,
  clearStationMode,
  getSavedStationMode,
  getRouteForStationMode,
  saveStationMode,
  stationModeOptions,
  type StationMode
} from "../lib/stationMode";

function modeBadge(mode: StationMode) {
  if (mode === "hostess") return "Hostess";
  if (mode === "kitchen-display") return "Kitchen";
  if (mode === "expo-display") return "Expo";
  return "Full";
}

export default function StationModeSetup() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<StationMode>(() => getSavedStationMode());
  const [status, setStatus] = useState("");

  useEffect(() => {
    const sync = () => setMode(getSavedStationMode());
    window.addEventListener("storage", sync);
    window.addEventListener(STATION_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STATION_MODE_EVENT, sync);
    };
  }, []);

  return (
    <div className="screen-shell station-mode-shell">
      <header className="screen-header station-mode-header">
        <div>
          <h2>Station Mode</h2>
          <p>Lock this computer to one workflow for stable low-end station use.</p>
        </div>
        <div className="station-mode-current">
          <span>Current Mode</span>
          <strong>{modeBadge(mode)}</strong>
        </div>
      </header>

      <section className="station-mode-grid">
        {stationModeOptions.map((option) => {
          const active = option.id === mode;
          return (
            <article key={option.id} className={`station-mode-card ${active ? "active" : ""}`}>
              <h3>{option.label}</h3>
              <p>{option.subtitle}</p>
              <button
                type="button"
                className={`terminal-btn ${active ? "ghost" : "primary"}`}
                onClick={() => {
                  if (option.id === "full") {
                    clearStationMode();
                  } else {
                    saveStationMode(option.id);
                  }
                  setMode(option.id);
                  setStatus(`${option.label} enabled on this device.`);
                  navigate(getRouteForStationMode(option.id), { replace: true });
                }}
              >
                {active ? "Enabled" : "Use This Mode"}
              </button>
            </article>
          );
        })}
      </section>

      <div className="station-mode-actions">
        <button type="button" className="terminal-btn" onClick={() => navigate("/")}>
          Open Main Screen
        </button>
        <button
          type="button"
          className="terminal-btn ghost"
          onClick={() => {
            clearStationMode();
            setMode("full");
            setStatus("Full POS mode enabled on this device.");
            navigate("/", { replace: true });
          }}
        >
          Reset To Full POS
        </button>
      </div>
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
