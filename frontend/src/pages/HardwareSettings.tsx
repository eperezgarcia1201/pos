import { useEffect, useState } from "react";

const deviceBridgeUrl = import.meta.env.VITE_DEVICE_BRIDGE_URL || "http://localhost:7090";

type DeviceData = {
  printers: Array<Record<string, unknown>>;
  cashDrawers: Array<Record<string, unknown>>;
  scanners: Array<Record<string, unknown>>;
  scales: Array<Record<string, unknown>>;
  customerDisplays: Array<Record<string, unknown>>;
  pax: Record<string, unknown> | null;
};

export default function HardwareSettings() {
  const [data, setData] = useState<DeviceData | null>(null);
  const [status, setStatus] = useState<string>("unknown");
  const [lastAction, setLastAction] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const healthRes = await fetch(`${deviceBridgeUrl}/health`).then((r) => r.json());
        setStatus(healthRes.ok ? "online" : "offline");
        const devices = await fetch(`${deviceBridgeUrl}/devices`).then((r) => r.json());
        setData(devices);
      } catch {
        setStatus("offline");
      }
    })();
  }, []);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Hardware Settings</h2>
          <p>Device bridge status and connected hardware.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Status</h3>
          <p>Device Bridge: {status}</p>
          <p>URL: {deviceBridgeUrl}</p>
        </section>

        <section className="panel span-2">
          <h3>Quick Actions</h3>
          <div className="form-row">
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/print/receipt`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: "Receipt Test\\nPOS Elmer\\n---\\nThank you!" })
                }).then((r) => r.json());
                setLastAction(res);
              }}
            >
              Print Receipt
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/print/kitchen`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: "Kitchen Test\\nOrder 123\\n2x Burger\\n1x Fries" })
                }).then((r) => r.json());
                setLastAction(res);
              }}
            >
              Print Kitchen
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/drawer/open`, { method: "POST" }).then((r) => r.json());
                setLastAction(res);
              }}
            >
              Open Drawer
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/scale/read`, { method: "POST" }).then((r) => r.json());
                setLastAction(res);
              }}
            >
              Read Scale
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/display/show`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ line1: "Welcome", line2: "Thanks!" })
                }).then((r) => r.json());
                setLastAction(res);
              }}
            >
              Display Text
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`${deviceBridgeUrl}/pax/status`).then((r) => r.json());
                setLastAction(res);
              }}
            >
              PAX Status
            </button>
          </div>
          {lastAction && (
            <pre>{JSON.stringify(lastAction, null, 2)}</pre>
          )}
        </section>

        <section className="panel span-2">
          <h3>Devices</h3>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}
