import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getCurrentUser } from "../lib/session";

type PaxSettings = {
  model: string;
  connection: "ethernet" | "usb" | "serial";
  host?: string;
  port?: string;
  serialPort?: string;
  baudRate?: string;
  enabled: boolean;
};

type PaymentGatewaySettings = {
  defaultGateway: "AUTO" | "OFFLINE" | "PAX" | "TSYS_PORTICO";
  currency: string;
};

type TsysPorticoSettings = {
  enabled: boolean;
  environment: "test" | "production";
  currency: string;
  secretApiKey: string;
  serviceUrl: string;
  siteId: string;
  licenseId: string;
  deviceId: string;
  username: string;
  password: string;
  developerId: string;
  versionNumber: string;
};

export default function PaymentsSettings() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [gateway, setGateway] = useState<PaymentGatewaySettings>({
    defaultGateway: "AUTO",
    currency: "USD"
  });
  const [pax, setPax] = useState<PaxSettings>({
    model: "A35",
    connection: "ethernet",
    host: "192.168.1.70",
    port: "10009",
    serialPort: "",
    baudRate: "",
    enabled: true
  });
  const [tsys, setTsys] = useState<TsysPorticoSettings>({
    enabled: false,
    environment: "test",
    currency: "USD",
    secretApiKey: "",
    serviceUrl: "",
    siteId: "",
    licenseId: "",
    deviceId: "",
    username: "",
    password: "",
    developerId: "",
    versionNumber: ""
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [gatewaySetting, paxSetting, tsysSetting] = await Promise.all([
          apiFetch("/settings/payment_gateway").catch(() => null),
          apiFetch("/settings/pax").catch(() => null),
          apiFetch("/settings/tsys_portico").catch(() => null)
        ]);

        if (gatewaySetting?.value) {
          setGateway({
            defaultGateway: gatewaySetting.value.defaultGateway || "AUTO",
            currency: gatewaySetting.value.currency || "USD"
          });
        }

        if (paxSetting?.value) {
          setPax({
            model: paxSetting.value.model || "A35",
            connection: paxSetting.value.connection || "ethernet",
            host: paxSetting.value.host || "192.168.1.70",
            port: paxSetting.value.port || "10009",
            serialPort: paxSetting.value.serialPort || "",
            baudRate: paxSetting.value.baudRate || "",
            enabled: paxSetting.value.enabled ?? true
          });
        }

        if (tsysSetting?.value) {
          setTsys({
            enabled: tsysSetting.value.enabled ?? false,
            environment: tsysSetting.value.environment === "production" ? "production" : "test",
            currency: tsysSetting.value.currency || "USD",
            secretApiKey: tsysSetting.value.secretApiKey || "",
            serviceUrl: tsysSetting.value.serviceUrl || "",
            siteId: tsysSetting.value.siteId || "",
            licenseId: tsysSetting.value.licenseId || "",
            deviceId: tsysSetting.value.deviceId || "",
            username: tsysSetting.value.username || "",
            password: tsysSetting.value.password || "",
            developerId: tsysSetting.value.developerId || "",
            versionNumber: tsysSetting.value.versionNumber || ""
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load payment settings.");
      }
    })();
  }, []);

  const saveAll = async () => {
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await Promise.all([
        apiFetch("/settings/payment_gateway", {
          method: "PATCH",
          body: JSON.stringify({ value: gateway })
        }),
        apiFetch("/settings/pax", {
          method: "PATCH",
          body: JSON.stringify({ value: pax })
        }),
        apiFetch("/settings/tsys_portico", {
          method: "PATCH",
          body: JSON.stringify({ value: tsys })
        })
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save payment settings.");
    } finally {
      setSaving(false);
    }
  };

  const statusMessage = error || (saved ? "Payment settings updated successfully" : "");

  return (
    <div className="paygw-shell">
      <aside className="paygw-sidebar">
        <div className="paygw-brand">
          <img src="/branding/websys-icon.svg" alt="WebSys icon" />
          <span>WebSys POS</span>
        </div>

        <nav className="paygw-nav">
          <button type="button" className="paygw-nav-btn active" onClick={() => navigate("/settings/payments")}>
            <span className="paygw-nav-icon">$</span>
            <span>Payments & Gateway</span>
          </button>
        </nav>

        <div className="paygw-sidebar-actions">
          <button type="button" className="paygw-sidebar-footer" onClick={() => navigate("/settings/store")}>
            <span className="paygw-nav-icon">⚙</span>
            <span>Store Settings</span>
          </button>
          <button type="button" className="paygw-sidebar-footer" onClick={() => navigate("/back-office")}>
            <span className="paygw-nav-icon">←</span>
            <span>Back Office</span>
          </button>
        </div>
      </aside>

      <section className="paygw-main">
        <header className="paygw-topbar">
          <div>
            <h2>Payments & Gateway</h2>
            <p>Configure payout/risk behavior and Server gateway processing</p>
          </div>
          <button type="button" className="paygw-user" onClick={() => navigate("/settings/store")}>
            <span className="paygw-user-avatar">
              {(currentUser?.displayName || currentUser?.username || "A").slice(0, 1).toUpperCase()}
            </span>
            <span>{currentUser?.displayName || currentUser?.username || "Admin"}</span>
            <span>▾</span>
          </button>
        </header>

        <div className="paygw-grid">
          <section className="panel paygw-card">
          <h3>Gateway Routing</h3>
          <div className="form-grid">
            <label>
              Default Card Gateway
              <select
                value={gateway.defaultGateway}
                onChange={(e) =>
                  setGateway((prev) => ({
                    ...prev,
                    defaultGateway: e.target.value as PaymentGatewaySettings["defaultGateway"]
                  }))
                }
              >
                <option value="AUTO">Auto (prefer enabled TSYS, then PAX)</option>
                <option value="TSYS_PORTICO">TSYS Portico</option>
                <option value="PAX">PAX Device Bridge</option>
                <option value="OFFLINE">Offline (record only)</option>
              </select>
            </label>
            <label>
              Default Currency
              <input
                value={gateway.currency}
                onChange={(e) => setGateway((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                placeholder="USD"
              />
            </label>
          </div>
          <p className="hint">
            Card payments from Recall/Open Bills use this route unless an explicit gateway is picked on the payment modal.
          </p>
          </section>

          <section className="panel paygw-card">
          <h3>TSYS Portico (Global Payments SDK)</h3>
          <div className="form-grid">
            <label className="toggle">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={tsys.enabled}
                onChange={(e) => setTsys((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            </label>
            <label>
              Environment
              <select
                value={tsys.environment}
                onChange={(e) =>
                  setTsys((prev) => ({ ...prev, environment: e.target.value as TsysPorticoSettings["environment"] }))
                }
              >
                <option value="test">Test / Certification</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label>
              Currency
              <input
                value={tsys.currency}
                onChange={(e) => setTsys((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                placeholder="USD"
              />
            </label>
            <label>
              Secret API Key (recommended)
              <input
                type="password"
                value={tsys.secretApiKey}
                onChange={(e) => setTsys((prev) => ({ ...prev, secretApiKey: e.target.value }))}
                placeholder="skapi_..."
              />
            </label>
            <label>
              Service URL (optional)
              <input
                value={tsys.serviceUrl}
                onChange={(e) => setTsys((prev) => ({ ...prev, serviceUrl: e.target.value }))}
                placeholder="https://cert.api2.heartlandportico.com"
              />
            </label>
            <label>
              Developer ID (optional)
              <input
                value={tsys.developerId}
                onChange={(e) => setTsys((prev) => ({ ...prev, developerId: e.target.value }))}
              />
            </label>
            <label>
              Version Number (optional)
              <input
                value={tsys.versionNumber}
                onChange={(e) => setTsys((prev) => ({ ...prev, versionNumber: e.target.value }))}
              />
            </label>
          </div>

          <h4>Legacy Credentials (only if not using Secret API Key)</h4>
          <div className="form-grid">
            <label>
              Site ID
              <input value={tsys.siteId} onChange={(e) => setTsys((prev) => ({ ...prev, siteId: e.target.value }))} />
            </label>
            <label>
              License ID
              <input
                value={tsys.licenseId}
                onChange={(e) => setTsys((prev) => ({ ...prev, licenseId: e.target.value }))}
              />
            </label>
            <label>
              Device ID
              <input
                value={tsys.deviceId}
                onChange={(e) => setTsys((prev) => ({ ...prev, deviceId: e.target.value }))}
              />
            </label>
            <label>
              Username
              <input
                value={tsys.username}
                onChange={(e) => setTsys((prev) => ({ ...prev, username: e.target.value }))}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={tsys.password}
                onChange={(e) => setTsys((prev) => ({ ...prev, password: e.target.value }))}
              />
            </label>
          </div>
          </section>

          <section className="panel paygw-card">
          <h3>PAX (Semi-Integrated)</h3>
          <div className="form-grid">
            <label className="toggle">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={pax.enabled}
                onChange={(e) => setPax((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            </label>
            <label>
              Model
              <input value={pax.model} onChange={(e) => setPax((prev) => ({ ...prev, model: e.target.value }))} />
            </label>
            <label>
              Connection
              <select
                value={pax.connection}
                onChange={(e) =>
                  setPax((prev) => ({ ...prev, connection: e.target.value as PaxSettings["connection"] }))
                }
              >
                <option value="ethernet">Ethernet</option>
                <option value="usb">USB</option>
                <option value="serial">Serial</option>
              </select>
            </label>
            {pax.connection === "ethernet" && (
              <>
                <label>
                  Host
                  <input value={pax.host} onChange={(e) => setPax((prev) => ({ ...prev, host: e.target.value }))} />
                </label>
                <label>
                  Port
                  <input value={pax.port} onChange={(e) => setPax((prev) => ({ ...prev, port: e.target.value }))} />
                </label>
              </>
            )}
            {pax.connection === "serial" && (
              <>
                <label>
                  Serial Port
                  <input
                    value={pax.serialPort}
                    onChange={(e) => setPax((prev) => ({ ...prev, serialPort: e.target.value }))}
                  />
                </label>
                <label>
                  Baud Rate
                  <input
                    value={pax.baudRate}
                    onChange={(e) => setPax((prev) => ({ ...prev, baudRate: e.target.value }))}
                  />
                </label>
              </>
            )}
          </div>
          </section>
        </div>

        <footer className="paygw-footer">
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            Cancel
          </button>
          <button type="button" className="terminal-btn primary" onClick={() => void saveAll()} disabled={saving}>
            {saving ? "Saving..." : "Save Payment Settings"}
          </button>
          {statusMessage ? (
            <div className={`paygw-toast ${error ? "error" : "ok"}`}>
              <span className="paygw-toast-dot">{error ? "!" : "✓"}</span>
              <span>{statusMessage}</span>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
