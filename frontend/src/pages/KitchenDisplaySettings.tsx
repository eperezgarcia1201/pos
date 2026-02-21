import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type KitchenDisplaySettings = {
  baseFontSize: number;
  headerFontSize: number;
  subheaderFontSize: number;
  columnHeaderFontSize: number;
  ticketTitleFontSize: number;
  ticketMetaFontSize: number;
  timeFontSize: number;
  itemFontSize: number;
  modifierFontSize: number;
  pillFontSize: number;
  buttonFontSize: number;
  modifierColor: string;
  warnMinutes: number;
  urgentMinutes: number;
  soundOnNew: boolean;
  soundOnUrgent: boolean;
  soundVolume: number;
  newColor: string;
  workingColor: string;
  doneColor: string;
  freshColor: string;
  warnColor: string;
  urgentColor: string;
};

const DEFAULT_SETTINGS: KitchenDisplaySettings = {
  baseFontSize: 24,
  headerFontSize: 36,
  subheaderFontSize: 18,
  columnHeaderFontSize: 18,
  ticketTitleFontSize: 28,
  ticketMetaFontSize: 18,
  timeFontSize: 18,
  itemFontSize: 22,
  modifierFontSize: 20,
  pillFontSize: 16,
  buttonFontSize: 20,
  modifierColor: "#f87171",
  warnMinutes: 5,
  urgentMinutes: 10,
  soundOnNew: true,
  soundOnUrgent: true,
  soundVolume: 0.5,
  newColor: "#facc15",
  workingColor: "#4ade80",
  doneColor: "#cbd5f5",
  freshColor: "#22c55e",
  warnColor: "#f59e0b",
  urgentColor: "#ef4444"
};

export default function KitchenDisplaySettings() {
  const [settings, setSettings] = useState<KitchenDisplaySettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/settings/kitchen_display");
        if (data?.value) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.value });
        }
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    })();
  }, []);

  const save = async () => {
    setStatus("");
    await apiFetch("/settings/kitchen_display", {
      method: "PATCH",
      body: JSON.stringify({ value: settings })
    });
    setStatus("Saved.");
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Kitchen Display Settings</h2>
          <p>Adjust font sizes, colors, and visual emphasis for the kitchen screen.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Font Sizes</h3>
          <div className="form-row">
            <label className="field">
              Base
              <input
                type="number"
                min={14}
                max={30}
                value={settings.baseFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, baseFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Header
              <input
                type="number"
                min={18}
                max={40}
                value={settings.headerFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, headerFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Subheader
              <input
                type="number"
                min={12}
                max={26}
                value={settings.subheaderFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, subheaderFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Column Header
              <input
                type="number"
                min={12}
                max={24}
                value={settings.columnHeaderFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, columnHeaderFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Ticket Title
              <input
                type="number"
                min={16}
                max={36}
                value={settings.ticketTitleFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, ticketTitleFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Ticket Meta
              <input
                type="number"
                min={12}
                max={30}
                value={settings.ticketMetaFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, ticketMetaFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Time
              <input
                type="number"
                min={12}
                max={28}
                value={settings.timeFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, timeFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Item Lines
              <input
                type="number"
                min={14}
                max={34}
                value={settings.itemFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, itemFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Modifier Lines
              <input
                type="number"
                min={12}
                max={30}
                value={settings.modifierFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, modifierFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Pill Text
              <input
                type="number"
                min={10}
                max={24}
                value={settings.pillFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, pillFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Button Text
              <input
                type="number"
                min={12}
                max={26}
                value={settings.buttonFontSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, buttonFontSize: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Warn Minutes
              <input
                type="number"
                min={1}
                max={60}
                value={settings.warnMinutes}
                onChange={(e) => setSettings((prev) => ({ ...prev, warnMinutes: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Urgent Minutes
              <input
                type="number"
                min={1}
                max={120}
                value={settings.urgentMinutes}
                onChange={(e) => setSettings((prev) => ({ ...prev, urgentMinutes: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Sound Volume
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={settings.soundVolume}
                onChange={(e) => setSettings((prev) => ({ ...prev, soundVolume: Number(e.target.value) }))}
              />
            </label>
            <label className="field">
              Sound New
              <select
                value={settings.soundOnNew ? "yes" : "no"}
                onChange={(e) => setSettings((prev) => ({ ...prev, soundOnNew: e.target.value === "yes" }))}
              >
                <option value="yes">On</option>
                <option value="no">Off</option>
              </select>
            </label>
            <label className="field">
              Sound Urgent
              <select
                value={settings.soundOnUrgent ? "yes" : "no"}
                onChange={(e) => setSettings((prev) => ({ ...prev, soundOnUrgent: e.target.value === "yes" }))}
              >
                <option value="yes">On</option>
                <option value="no">Off</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <h3>Status Colors</h3>
          <div className="form-row">
            <label className="field">
              Modifier Text
              <input
                type="color"
                className="color-input"
                value={settings.modifierColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, modifierColor: e.target.value }))}
              />
            </label>
            <label className="field">
              New Column
              <input
                type="color"
                className="color-input"
                value={settings.newColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, newColor: e.target.value }))}
              />
            </label>
            <label className="field">
              Working Column
              <input
                type="color"
                className="color-input"
                value={settings.workingColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, workingColor: e.target.value }))}
              />
            </label>
            <label className="field">
              Done Column
              <input
                type="color"
                className="color-input"
                value={settings.doneColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, doneColor: e.target.value }))}
              />
            </label>
            <label className="field">
              Fresh Ticket
              <input
                type="color"
                className="color-input"
                value={settings.freshColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, freshColor: e.target.value }))}
              />
            </label>
            <label className="field">
              Warning Ticket
              <input
                type="color"
                className="color-input"
                value={settings.warnColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, warnColor: e.target.value }))}
              />
            </label>
            <label className="field">
              Urgent Ticket
              <input
                type="color"
                className="color-input"
                value={settings.urgentColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, urgentColor: e.target.value }))}
              />
            </label>
          </div>
        </section>
      </div>

      <div className="header-actions">
        <button type="button" className="terminal-btn ghost" onClick={() => setSettings(DEFAULT_SETTINGS)}>
          Reset Defaults
        </button>
        <button type="button" className="terminal-btn primary" onClick={save}>
          Save Settings
        </button>
        {status && <span className="hint">{status}</span>}
      </div>
    </div>
  );
}
