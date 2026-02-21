import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Provider = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  settings?: Record<string, any> | null;
};

type Store = {
  id: string;
  name: string;
  merchantSuppliedId: string;
  providerStoreId?: string | null;
  active: boolean;
  provider: Provider;
};

export default function OnlineOrdersSettings() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const [newStore, setNewStore] = useState({ name: "", merchantSuppliedId: "", providerStoreId: "" });
  const [settings, setSettings] = useState({
    enabled: false,
    environment: "sandbox",
    developerId: "",
    keyId: "",
    signingSecret: "",
    providerType: "",
    menuReference: "pos-menu",
    menuName: "Main Menu",
    webhookBaseUrl: ""
  });

  const load = async () => {
    const providers = (await apiFetch("/integrations/providers")) as Provider[];
    const dd = providers.find((p) => p.code === "DOORDASH") || providers[0];
    setProvider(dd || null);
    const storeList = (await apiFetch("/integrations/stores")) as Store[];
    setStores(storeList);
    if (dd) {
      const current = dd.settings || {};
      setSettings((prev) => ({
        ...prev,
        enabled: dd.enabled,
        environment: current.environment || "sandbox",
        developerId: current.developerId || "",
        keyId: current.keyId || "",
        signingSecret: current.signingSecret || "",
        providerType: current.providerType || "",
        menuReference: current.menuReference || "pos-menu",
        menuName: current.menuName || "Main Menu",
        webhookBaseUrl: current.webhookBaseUrl || ""
      }));
    }
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load integrations."));
  }, []);

  const save = async () => {
    if (!provider) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/integrations/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: settings.enabled,
          settings: {
            environment: settings.environment,
            developerId: settings.developerId,
            keyId: settings.keyId,
            signingSecret: settings.signingSecret,
            providerType: settings.providerType,
            menuReference: settings.menuReference,
            menuName: settings.menuName,
            webhookBaseUrl: settings.webhookBaseUrl
          }
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save DoorDash settings.");
    } finally {
      setSaving(false);
    }
  };

  const addStore = async () => {
    if (!provider) return;
    if (!newStore.name || !newStore.merchantSuppliedId) return;
    setError("");
    try {
      await apiFetch("/integrations/stores", {
        method: "POST",
        body: JSON.stringify({
          providerId: provider.id,
          name: newStore.name,
          merchantSuppliedId: newStore.merchantSuppliedId,
          providerStoreId: newStore.providerStoreId || undefined
        })
      });
      setNewStore({ name: "", merchantSuppliedId: "", providerStoreId: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add store.");
    }
  };

  const pushMenu = async (storeId: string) => {
    setPushing(storeId);
    setError("");
    try {
      await apiFetch("/integrations/doordash/menus/push", {
        method: "POST",
        body: JSON.stringify({ storeId })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to push menu.");
    } finally {
      setPushing(null);
    }
  };

  const baseUrl = settings.webhookBaseUrl.replace(/\/$/, "");
  const webhookUrl = (path: string) => (baseUrl ? `${baseUrl}${path}` : "");

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Online Order Integrations</h2>
          <p>Configure DoorDash Marketplace and future delivery platforms.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>DoorDash Marketplace</h3>
          <div className="form-row">
            <button
              type="button"
              className={settings.enabled ? "terminal-btn primary" : "terminal-btn"}
              onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
            >
              {settings.enabled ? "Enabled" : "Disabled"}
            </button>
            <select
              value={settings.environment}
              onChange={(event) => setSettings((prev) => ({ ...prev, environment: event.target.value }))}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div className="form-row">
            <input
              value={settings.developerId}
              onChange={(event) => setSettings((prev) => ({ ...prev, developerId: event.target.value }))}
              placeholder="Developer ID"
            />
            <input
              value={settings.keyId}
              onChange={(event) => setSettings((prev) => ({ ...prev, keyId: event.target.value }))}
              placeholder="Key ID"
            />
            <input
              value={settings.signingSecret}
              onChange={(event) => setSettings((prev) => ({ ...prev, signingSecret: event.target.value }))}
              placeholder="Signing Secret"
              type="password"
            />
          </div>
          <div className="form-row">
            <input
              value={settings.providerType}
              onChange={(event) => setSettings((prev) => ({ ...prev, providerType: event.target.value }))}
              placeholder="Provider Type (from DoorDash)"
            />
            <input
              value={settings.menuReference}
              onChange={(event) => setSettings((prev) => ({ ...prev, menuReference: event.target.value }))}
              placeholder="Menu Reference"
            />
            <input
              value={settings.menuName}
              onChange={(event) => setSettings((prev) => ({ ...prev, menuName: event.target.value }))}
              placeholder="Menu Name"
            />
          </div>
          <div className="form-row">
            <input
              value={settings.webhookBaseUrl}
              onChange={(event) => setSettings((prev) => ({ ...prev, webhookBaseUrl: event.target.value }))}
              placeholder="Webhook Base URL (public)"
            />
            <button type="button" className="terminal-btn primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Menu Pull URL: {webhookUrl("/api/integrations/doordash/menu/{merchant_supplied_id}")}
              </div>
            </div>
          )}
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Order Webhook: {webhookUrl("/api/integrations/doordash/webhooks/orders")}
              </div>
            </div>
          )}
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Menu Status: {webhookUrl("/api/integrations/doordash/webhooks/menu-status")}
              </div>
            </div>
          )}
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Order Release: {webhookUrl("/api/integrations/doordash/webhooks/order-release")}
              </div>
            </div>
          )}
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Order Canceled: {webhookUrl("/api/integrations/doordash/webhooks/order-canceled")}
              </div>
            </div>
          )}
          {baseUrl && (
            <div className="form-row">
              <div className="hint">
                Dasher Status: {webhookUrl("/api/integrations/doordash/webhooks/dasher-status")}
              </div>
            </div>
          )}
          {error && <p className="hint">{error}</p>}
        </section>

        <section className="panel">
          <h3>Store Mapping</h3>
          <div className="form-row">
            <input
              value={newStore.name}
              onChange={(event) => setNewStore((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Store name"
            />
            <input
              value={newStore.merchantSuppliedId}
              onChange={(event) => setNewStore((prev) => ({ ...prev, merchantSuppliedId: event.target.value }))}
              placeholder="Merchant Supplied ID"
            />
            <input
              value={newStore.providerStoreId}
              onChange={(event) => setNewStore((prev) => ({ ...prev, providerStoreId: event.target.value }))}
              placeholder="DoorDash Store ID (optional)"
            />
            <button type="button" className="terminal-btn" onClick={addStore}>
              Add Store
            </button>
          </div>

          <div className="list">
            {stores.length === 0 && <p className="hint">No stores mapped yet.</p>}
            {stores.map((store) => (
              <div key={store.id} className="recall-row">
                <div>
                  <strong>{store.name}</strong>
                  <div className="hint">{store.merchantSuppliedId}</div>
                </div>
                <div>{store.provider?.name}</div>
                <div>{store.providerStoreId || "—"}</div>
                <div>{store.active ? "Active" : "Inactive"}</div>
                <div>
                  <button
                    type="button"
                    className="terminal-btn"
                    onClick={() => pushMenu(store.id)}
                    disabled={pushing === store.id}
                  >
                    {pushing === store.id ? "Pushing..." : "Push Menu"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
