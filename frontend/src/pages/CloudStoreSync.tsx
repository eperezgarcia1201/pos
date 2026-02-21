import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";

type StoreSummary = {
  id: string;
  name: string;
  code: string;
  pendingCommands: number;
  totalRevisions: number;
  nodes: Array<{ id: string; label: string; status: string }>;
};

type RevisionRecord = {
  id: string;
  domain: string;
  revision: number;
  createdAt: string;
  publishedBy?: string | null;
};

type CommandRecord = {
  id: string;
  status: string;
  domain: string;
  commandType: string;
  issuedAt: string;
  acknowledgedAt?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  node?: { id: string; label: string; nodeKey: string } | null;
  revisionRef?: { id: string; domain: string; revision: number; createdAt: string } | null;
  _count?: { logs?: number };
};

type CommandLogRecord = {
  id: string;
  status: string;
  errorCode?: string | null;
  errorDetail?: string | null;
  output?: unknown;
  createdAt: string;
  node?: { id: string; label: string; nodeKey: string } | null;
};

type ServicesForm = {
  dineIn: boolean;
  takeOut: boolean;
  delivery: boolean;
  driveThru: boolean;
};

type TaxesForm = {
  alias: string;
  rate: number;
  enabled: boolean;
  applyTaxOnSurcharge: boolean;
  applyTaxOnDeliveryCharge: boolean;
};

type PrintForm = {
  printGuestCheckOnSend: boolean;
  printTwoCopiesOfGuestChecks: boolean;
  reprintNeedsManagerOverride: boolean;
};

type StoreForm = {
  name: string;
  timezone: string;
  dailyStartTime: string;
  lunchStartTime: string;
};

const DOMAIN_OPTIONS = [
  "SETTINGS",
  "MENU",
  "INVENTORY",
  "PRINTER",
  "TAX",
  "SECURITY",
  "INTEGRATIONS",
  "STAFF"
];

const COMMAND_TYPE_OPTIONS = [
  "SETTINGS_PATCH",
  "MENU_PATCH",
  "INVENTORY_PATCH",
  "PRINTER_PATCH",
  "TAX_PATCH",
  "SECURITY_PATCH",
  "INTEGRATIONS_PATCH",
  "STAFF_PATCH"
];

const SETTINGS_KEY_OPTIONS = [
  "services",
  "taxes",
  "store",
  "print",
  "products",
  "orderEntry",
  "revenue",
  "receipts",
  "staffCrm",
  "other",
  "security"
];

type TemplatePreset = {
  id: string;
  label: string;
  domain: string;
  commandType: string;
  settingKey: string;
  jsonValue: string;
};

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "services",
    label: "Services",
    domain: "SETTINGS",
    commandType: "SETTINGS_PATCH",
    settingKey: "services",
    jsonValue: '{\n  "dineIn": true,\n  "takeOut": true,\n  "delivery": true,\n  "driveThru": false\n}'
  },
  {
    id: "taxes",
    label: "Taxes",
    domain: "SETTINGS",
    commandType: "SETTINGS_PATCH",
    settingKey: "taxes",
    jsonValue:
      '{\n  "tax1": { "alias": "TAX", "rate": 5.5, "enabled": true },\n  "applyTaxOnSurcharge": true,\n  "applyTaxOnDeliveryCharge": false\n}'
  },
  {
    id: "print",
    label: "Print",
    domain: "SETTINGS",
    commandType: "SETTINGS_PATCH",
    settingKey: "print",
    jsonValue:
      '{\n  "printGuestCheckOnSend": false,\n  "printTwoCopiesOfGuestChecks": false,\n  "reprintNeedsManagerOverride": true\n}'
  },
  {
    id: "store",
    label: "Store",
    domain: "SETTINGS",
    commandType: "SETTINGS_PATCH",
    settingKey: "store",
    jsonValue:
      '{\n  "name": "Primary Store",\n  "timezone": "America/Chicago",\n  "dailyStartTime": "03:00:00",\n  "lunchStartTime": "10:00:00"\n}'
  }
];

const UPDATE_AREA_OPTIONS = [
  { id: "services", label: "Services" },
  { id: "taxes", label: "Taxes" },
  { id: "print", label: "Print" },
  { id: "store", label: "Store Info" },
  { id: "custom", label: "Custom" }
];

const DEFAULT_SERVICES_FORM: ServicesForm = {
  dineIn: true,
  takeOut: true,
  delivery: true,
  driveThru: false
};

const DEFAULT_TAXES_FORM: TaxesForm = {
  alias: "TAX",
  rate: 5.5,
  enabled: true,
  applyTaxOnSurcharge: true,
  applyTaxOnDeliveryCharge: false
};

const DEFAULT_PRINT_FORM: PrintForm = {
  printGuestCheckOnSend: false,
  printTwoCopiesOfGuestChecks: false,
  reprintNeedsManagerOverride: true
};

const DEFAULT_STORE_FORM: StoreForm = {
  name: "Primary Store",
  timezone: "America/Chicago",
  dailyStartTime: "03:00:00",
  lunchStartTime: "10:00:00"
};

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export default function CloudStoreSync() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(params.get("storeId") || "");
  const [domain, setDomain] = useState("SETTINGS");
  const [commandType, setCommandType] = useState("SETTINGS_PATCH");
  const [updateArea, setUpdateArea] = useState("services");
  const [settingKey, setSettingKey] = useState("services");
  const [nodeId, setNodeId] = useState("");
  const [jsonValue, setJsonValue] = useState(toJson(DEFAULT_SERVICES_FORM));
  const [showRawJsonEditor, setShowRawJsonEditor] = useState(false);
  const [servicesForm, setServicesForm] = useState<ServicesForm>(DEFAULT_SERVICES_FORM);
  const [taxesForm, setTaxesForm] = useState<TaxesForm>(DEFAULT_TAXES_FORM);
  const [printForm, setPrintForm] = useState<PrintForm>(DEFAULT_PRINT_FORM);
  const [storeForm, setStoreForm] = useState<StoreForm>(DEFAULT_STORE_FORM);

  const [latestRevisions, setLatestRevisions] = useState<RevisionRecord[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState("");
  const [commandLogs, setCommandLogs] = useState<CommandLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [retryingCommandId, setRetryingCommandId] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedStore = useMemo(
    () => stores.find((entry) => entry.id === selectedStoreId) || null,
    [stores, selectedStoreId]
  );
  const selectedCommand = useMemo(
    () => commands.find((entry) => entry.id === selectedCommandId) || null,
    [commands, selectedCommandId]
  );
  const queueStats = useMemo(() => {
    return commands.reduce(
      (acc, command) => {
        const status = String(command.status || "").toUpperCase();
        if (status === "PENDING") acc.pending += 1;
        if (status === "ACKED") acc.acked += 1;
        if (status === "FAILED") acc.failed += 1;
        return acc;
      },
      { pending: 0, acked: 0, failed: 0 }
    );
  }, [commands]);
  const jsonIsValid = useMemo(() => {
    try {
      JSON.parse(jsonValue);
      return true;
    } catch {
      return false;
    }
  }, [jsonValue]);

  const loadStores = async () => {
    const data = await apiFetch("/cloud/stores");
    return Array.isArray(data) ? (data as StoreSummary[]) : [];
  };

  const loadRevisions = async (storeId: string) => {
    const result = await apiFetch(`/cloud/stores/${encodeURIComponent(storeId)}/revisions/latest`);
    const revisionsRaw = (result as { revisions?: unknown[] })?.revisions;
    return Array.isArray(revisionsRaw) ? (revisionsRaw as RevisionRecord[]) : [];
  };

  const loadCommands = async (storeId: string) => {
    const result = await apiFetch(
      `/cloud/stores/${encodeURIComponent(storeId)}/commands?status=PENDING,FAILED,ACKED&limit=80`
    );
    const commandsRaw = (result as { commands?: unknown[] })?.commands;
    return Array.isArray(commandsRaw) ? (commandsRaw as CommandRecord[]) : [];
  };

  const loadCommandLogs = async (commandId: string) => {
    setLoadingLogs(true);
    try {
      const result = await apiFetch(`/cloud/commands/${encodeURIComponent(commandId)}/logs?limit=20`);
      const logsRaw = (result as { logs?: unknown[] })?.logs;
      setCommandLogs(Array.isArray(logsRaw) ? (logsRaw as CommandLogRecord[]) : []);
    } finally {
      setLoadingLogs(false);
    }
  };

  const refresh = async (targetStoreId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadStores();
      setStores(list);
      const resolvedStoreId = targetStoreId || selectedStoreId || list[0]?.id || "";
      if (resolvedStoreId) {
        setSelectedStoreId(resolvedStoreId);
        setParams({ storeId: resolvedStoreId });
        const [revisions, storeCommands] = await Promise.all([
          loadRevisions(resolvedStoreId),
          loadCommands(resolvedStoreId)
        ]);
        setLatestRevisions(revisions);
        setCommands(storeCommands);
        if (storeCommands.length === 0) {
          setSelectedCommandId("");
          setCommandLogs([]);
        } else {
          const fallbackCommandId = storeCommands[0]?.id || "";
          const nextCommandId =
            selectedCommandId && storeCommands.some((entry) => entry.id === selectedCommandId)
              ? selectedCommandId
              : fallbackCommandId;
          setSelectedCommandId(nextCommandId);
          if (nextCommandId) {
            await loadCommandLogs(nextCommandId);
          }
        }
      } else {
        setLatestRevisions([]);
        setCommands([]);
        setSelectedCommandId("");
        setCommandLogs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cloud sync data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(params.get("storeId") || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const matched = TEMPLATE_PRESETS.find((preset) => preset.settingKey === settingKey);
    if (matched && updateArea !== matched.id) {
      setUpdateArea(matched.id);
      return;
    }
    if (!matched && updateArea !== "custom") {
      setUpdateArea("custom");
    }
  }, [settingKey, updateArea]);

  useEffect(() => {
    if (showRawJsonEditor) return;
    if (updateArea === "services") {
      setJsonValue(toJson(servicesForm));
    }
  }, [servicesForm, showRawJsonEditor, updateArea]);

  useEffect(() => {
    if (showRawJsonEditor) return;
    if (updateArea === "taxes") {
      setJsonValue(
        toJson({
          tax1: {
            alias: taxesForm.alias,
            rate: taxesForm.rate,
            enabled: taxesForm.enabled
          },
          applyTaxOnSurcharge: taxesForm.applyTaxOnSurcharge,
          applyTaxOnDeliveryCharge: taxesForm.applyTaxOnDeliveryCharge
        })
      );
    }
  }, [taxesForm, showRawJsonEditor, updateArea]);

  useEffect(() => {
    if (showRawJsonEditor) return;
    if (updateArea === "print") {
      setJsonValue(toJson(printForm));
    }
  }, [printForm, showRawJsonEditor, updateArea]);

  useEffect(() => {
    if (showRawJsonEditor) return;
    if (updateArea === "store") {
      setJsonValue(toJson(storeForm));
    }
  }, [showRawJsonEditor, storeForm, updateArea]);

  const inspectCommand = async (commandId: string) => {
    setSelectedCommandId(commandId);
    await loadCommandLogs(commandId);
  };

  const hydrateFriendlyFormFromJson = (area: string, text: string) => {
    const record = parseRecord(text);
    if (!record) return;
    if (area === "services") {
      setServicesForm({
        dineIn: boolValue(record.dineIn, DEFAULT_SERVICES_FORM.dineIn),
        takeOut: boolValue(record.takeOut, DEFAULT_SERVICES_FORM.takeOut),
        delivery: boolValue(record.delivery, DEFAULT_SERVICES_FORM.delivery),
        driveThru: boolValue(record.driveThru, DEFAULT_SERVICES_FORM.driveThru)
      });
      return;
    }
    if (area === "taxes") {
      const tax1 = record.tax1 && typeof record.tax1 === "object" && !Array.isArray(record.tax1) ? (record.tax1 as Record<string, unknown>) : null;
      setTaxesForm({
        alias: stringValue(tax1?.alias, DEFAULT_TAXES_FORM.alias),
        rate: numberValue(tax1?.rate, DEFAULT_TAXES_FORM.rate),
        enabled: boolValue(tax1?.enabled, DEFAULT_TAXES_FORM.enabled),
        applyTaxOnSurcharge: boolValue(record.applyTaxOnSurcharge, DEFAULT_TAXES_FORM.applyTaxOnSurcharge),
        applyTaxOnDeliveryCharge: boolValue(record.applyTaxOnDeliveryCharge, DEFAULT_TAXES_FORM.applyTaxOnDeliveryCharge)
      });
      return;
    }
    if (area === "print") {
      setPrintForm({
        printGuestCheckOnSend: boolValue(record.printGuestCheckOnSend, DEFAULT_PRINT_FORM.printGuestCheckOnSend),
        printTwoCopiesOfGuestChecks: boolValue(record.printTwoCopiesOfGuestChecks, DEFAULT_PRINT_FORM.printTwoCopiesOfGuestChecks),
        reprintNeedsManagerOverride: boolValue(record.reprintNeedsManagerOverride, DEFAULT_PRINT_FORM.reprintNeedsManagerOverride)
      });
      return;
    }
    if (area === "store") {
      setStoreForm({
        name: stringValue(record.name, DEFAULT_STORE_FORM.name),
        timezone: stringValue(record.timezone, DEFAULT_STORE_FORM.timezone),
        dailyStartTime: stringValue(record.dailyStartTime, DEFAULT_STORE_FORM.dailyStartTime),
        lunchStartTime: stringValue(record.lunchStartTime, DEFAULT_STORE_FORM.lunchStartTime)
      });
    }
  };

  const applyTemplate = (preset: TemplatePreset, announce = true) => {
    setUpdateArea(preset.id);
    setDomain(preset.domain);
    setCommandType(preset.commandType);
    setSettingKey(preset.settingKey);
    setShowRawJsonEditor(false);
    hydrateFriendlyFormFromJson(preset.id, preset.jsonValue);
    setJsonValue(preset.jsonValue);
    setError(null);
    if (announce) {
      setMessage(`Loaded ${preset.label} template.`);
    }
  };

  const onUpdateAreaChange = (value: string) => {
    setUpdateArea(value);
    if (value === "custom") {
      setShowRawJsonEditor(true);
      return;
    }
    const preset = TEMPLATE_PRESETS.find((entry) => entry.id === value);
    if (!preset) return;
    applyTemplate(preset, false);
  };

  const publish = async () => {
    if (!selectedStoreId) {
      setError("Select a store first.");
      return;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(jsonValue);
    } catch {
      setError("Value must be valid JSON.");
      return;
    }

    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        key: settingKey.trim(),
        value: parsedValue
      };

      const result = await apiFetch(`/cloud/stores/${encodeURIComponent(selectedStoreId)}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          domain,
          commandType,
          nodeId: nodeId.trim() || undefined,
          payload
        })
      });

      const revision = (result as { revision?: { revision?: number } })?.revision?.revision;
      setMessage(`Published revision ${revision || "(created)"}.`);
      await refresh(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to publish revision.");
    } finally {
      setPublishing(false);
    }
  };

  const retryCommand = async (commandId: string) => {
    if (!selectedStoreId) return;
    setRetryingCommandId(commandId);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/cloud/commands/${encodeURIComponent(commandId)}/retry`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Command re-queued.");
      await refresh(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retry command.");
    } finally {
      setRetryingCommandId("");
    }
  };

  return (
    <div className="screen-shell cloud-sync-shell">
      <header className="screen-header">
        <div>
          <h2>Cloud Sync Console</h2>
          <p>Publish desired state revisions and queue commands for store edge nodes.</p>
        </div>
        <div className="terminal-actions">
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-stores")}>
            Stores
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            Back Office
          </button>
          <button type="button" className="terminal-btn primary" onClick={() => void refresh(selectedStoreId)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="panel cloud-sync-store-panel">
        <div className="cloud-sync-store-head">
          <label>
            Working Store
            <select
              value={selectedStoreId}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedStoreId(value);
                setParams(value ? { storeId: value } : {});
                if (value) void refresh(value);
              }}
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </label>
          <div className="cloud-sync-store-meta">
            <div className="cloud-sync-kpi-card">
              <span>Pending</span>
              <strong>{selectedStore?.pendingCommands ?? 0}</strong>
            </div>
            <div className="cloud-sync-kpi-card">
              <span>Revisions</span>
              <strong>{selectedStore?.totalRevisions ?? 0}</strong>
            </div>
            <div className="cloud-sync-kpi-card">
              <span>Nodes</span>
              <strong>{selectedStore?.nodes.length ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="cloud-sync-node-strip">
          {selectedStore?.nodes?.length ? (
            selectedStore.nodes.map((node) => (
              <span key={node.id} className={`cloud-node-status ${String(node.status || "").toLowerCase()}`}>
                {node.label} ({node.status})
              </span>
            ))
          ) : (
            <span className="hint">No nodes linked yet. Register onsite node first, then publish revisions.</span>
          )}
        </div>
      </section>

      <div className="cloud-sync-grid">
        <section className="panel cloud-sync-publish-panel">
          <h3>Publish Update</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Choose what to update, review values, then send it to store node(s).
          </p>
          <div className="cloud-platform-form-grid">
            <label>
              Update Area
              <select value={updateArea} onChange={(event) => onUpdateAreaChange(event.target.value)}>
                {UPDATE_AREA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Settings Key
              <input list="cloud-sync-setting-key-options" value={settingKey} onChange={(event) => setSettingKey(event.target.value)} />
            </label>
            <datalist id="cloud-sync-setting-key-options">
              {SETTINGS_KEY_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <label>
              Target Node (optional)
              <select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
                <option value="">Any available node</option>
                {(selectedStore?.nodes || []).map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label} ({node.status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="cloud-sync-advanced-toggle">
            <button type="button" className="terminal-btn ghost" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? "Hide Advanced Options" : "Show Advanced Options"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="cloud-platform-form-grid">
              <label>
                Domain
                <input list="cloud-sync-domain-options" value={domain} onChange={(event) => setDomain(event.target.value.toUpperCase())} />
              </label>
              <datalist id="cloud-sync-domain-options">
                {DOMAIN_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>

              <label>
                Command Type
                <input
                  list="cloud-sync-command-type-options"
                  value={commandType}
                  onChange={(event) => setCommandType(event.target.value.toUpperCase())}
                />
              </label>
              <datalist id="cloud-sync-command-type-options">
                {COMMAND_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          ) : null}

          <div className="cloud-sync-template-row">
            {TEMPLATE_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className="terminal-btn ghost" onClick={() => applyTemplate(preset)}>
                {preset.label}
              </button>
            ))}
          </div>

          {updateArea === "services" ? (
            <div className="cloud-sync-friendly-grid">
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.dineIn}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, dineIn: event.target.checked }))}
                />
                Dine In
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.takeOut}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, takeOut: event.target.checked }))}
                />
                Take Out
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.delivery}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, delivery: event.target.checked }))}
                />
                Delivery
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.driveThru}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, driveThru: event.target.checked }))}
                />
                Drive Thru
              </label>
            </div>
          ) : null}

          {updateArea === "taxes" ? (
            <div className="cloud-sync-friendly-grid">
              <label>
                Tax Alias
                <input value={taxesForm.alias} onChange={(event) => setTaxesForm((prev) => ({ ...prev, alias: event.target.value }))} />
              </label>
              <label>
                Tax Rate (%)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxesForm.rate}
                  onChange={(event) =>
                    setTaxesForm((prev) => ({
                      ...prev,
                      rate: Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0
                    }))
                  }
                />
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={taxesForm.enabled}
                  onChange={(event) => setTaxesForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                Tax Enabled
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={taxesForm.applyTaxOnSurcharge}
                  onChange={(event) => setTaxesForm((prev) => ({ ...prev, applyTaxOnSurcharge: event.target.checked }))}
                />
                Apply Tax On Surcharge
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={taxesForm.applyTaxOnDeliveryCharge}
                  onChange={(event) => setTaxesForm((prev) => ({ ...prev, applyTaxOnDeliveryCharge: event.target.checked }))}
                />
                Apply Tax On Delivery Charge
              </label>
            </div>
          ) : null}

          {updateArea === "print" ? (
            <div className="cloud-sync-friendly-grid">
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={printForm.printGuestCheckOnSend}
                  onChange={(event) => setPrintForm((prev) => ({ ...prev, printGuestCheckOnSend: event.target.checked }))}
                />
                Print Guest Check On Send
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={printForm.printTwoCopiesOfGuestChecks}
                  onChange={(event) => setPrintForm((prev) => ({ ...prev, printTwoCopiesOfGuestChecks: event.target.checked }))}
                />
                Print Two Copies
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={printForm.reprintNeedsManagerOverride}
                  onChange={(event) => setPrintForm((prev) => ({ ...prev, reprintNeedsManagerOverride: event.target.checked }))}
                />
                Reprint Needs Manager Override
              </label>
            </div>
          ) : null}

          {updateArea === "store" ? (
            <div className="cloud-sync-friendly-grid">
              <label>
                Store Name
                <input value={storeForm.name} onChange={(event) => setStoreForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                Timezone
                <input value={storeForm.timezone} onChange={(event) => setStoreForm((prev) => ({ ...prev, timezone: event.target.value }))} />
              </label>
              <label>
                Daily Start Time
                <input
                  value={storeForm.dailyStartTime}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, dailyStartTime: event.target.value }))}
                />
              </label>
              <label>
                Lunch Start Time
                <input
                  value={storeForm.lunchStartTime}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, lunchStartTime: event.target.value }))}
                />
              </label>
            </div>
          ) : null}

          {updateArea !== "custom" ? (
            <div className="cloud-sync-advanced-toggle">
              <button type="button" className="terminal-btn ghost" onClick={() => setShowRawJsonEditor((prev) => !prev)}>
                {showRawJsonEditor ? "Hide Raw JSON" : "Edit Raw JSON (Advanced)"}
              </button>
            </div>
          ) : null}

          {showRawJsonEditor || updateArea === "custom" ? (
            <label className="cloud-sync-json-field">
              Raw JSON
              <textarea value={jsonValue} onChange={(event) => setJsonValue(event.target.value)} rows={12} className="cloud-sync-json-editor" />
            </label>
          ) : null}

          <div className="cloud-sync-publish-footer">
            {showRawJsonEditor || updateArea === "custom" ? (
              <span className={`cloud-sync-json-state ${jsonIsValid ? "is-valid" : "is-invalid"}`}>
                {jsonIsValid ? "JSON is valid" : "JSON is invalid"}
              </span>
            ) : (
              <span className="cloud-sync-json-state is-neutral">Simple mode active</span>
            )}
            <button type="button" className="terminal-btn primary" onClick={() => void publish()} disabled={publishing || !selectedStoreId}>
              {publishing ? "Publishing..." : "Publish Revision"}
            </button>
          </div>

          {error ? <p className="cloud-sync-alert cloud-sync-alert-error">{error}</p> : null}
          {message ? <p className="cloud-sync-alert cloud-sync-alert-success">{message}</p> : null}
        </section>

        <section className="panel cloud-sync-activity-panel">
          <div className="cloud-sync-activity-grid">
            <div className="cloud-platform-table-block">
              <h3>Latest Revisions</h3>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Revision</th>
                      <th>Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRevisions.map((revision) => (
                      <tr key={revision.id}>
                        <td>{revision.domain}</td>
                        <td>#{revision.revision}</td>
                        <td>{formatDate(revision.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && latestRevisions.length === 0 ? (
                  <p className="hint" style={{ margin: 0, padding: "10px 12px" }}>
                    No revisions published yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="cloud-platform-table-block">
              <h3>Command Queue</h3>
              <div className="cloud-sync-queue-summary">
                <span className="cloud-node-status pending">PENDING {queueStats.pending}</span>
                <span className="cloud-node-status acked">ACKED {queueStats.acked}</span>
                <span className="cloud-node-status failed">FAILED {queueStats.failed}</span>
              </div>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Type</th>
                      <th>Node</th>
                      <th>Revision</th>
                      <th>Issued</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commands.map((command) => {
                      const selected = selectedCommandId === command.id;
                      const canRetry = command.status === "FAILED";
                      return (
                        <tr key={command.id} className={selected ? "cloud-sync-command-row is-selected" : "cloud-sync-command-row"}>
                          <td>
                            <span className={`cloud-node-status ${String(command.status || "").toLowerCase()}`}>{command.status}</span>
                          </td>
                          <td>
                            <div>{command.commandType}</div>
                            <div className="hint">{command.domain}</div>
                          </td>
                          <td>{command.node?.label || "Any node"}</td>
                          <td>{command.revisionRef ? `#${command.revisionRef.revision}` : "-"}</td>
                          <td>{formatDate(command.issuedAt)}</td>
                          <td>
                            <div className="cloud-network-action-row">
                              <button type="button" className="terminal-btn" onClick={() => void inspectCommand(command.id)}>
                                Logs ({command._count?.logs || 0})
                              </button>
                              {canRetry ? (
                                <button
                                  type="button"
                                  className="terminal-btn primary"
                                  onClick={() => void retryCommand(command.id)}
                                  disabled={retryingCommandId === command.id}
                                >
                                  {retryingCommandId === command.id ? "Retrying..." : "Retry"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loading && commands.length === 0 ? (
                  <p className="hint" style={{ margin: 0, padding: "10px 12px" }}>
                    No commands queued yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="cloud-platform-table-block">
            <h3>Command Detail & Logs</h3>
            {selectedCommand ? (
              <div className="cloud-sync-selected-command">
                <div className="hint">
                  Command: <code>{selectedCommand.id}</code>
                </div>
                <span className={`cloud-node-status ${String(selectedCommand.status || "").toLowerCase()}`}>{selectedCommand.status}</span>
                <div className="hint">Issued: {formatDate(selectedCommand.issuedAt)}</div>
                <div className="hint">Acknowledged: {formatDate(selectedCommand.acknowledgedAt)}</div>
              </div>
            ) : (
              <p className="hint">Select a command from the queue to inspect logs.</p>
            )}
            {selectedCommand?.errorDetail ? (
              <pre className="ticket-preview">
                {selectedCommand.errorCode ? `${selectedCommand.errorCode}: ` : ""}
                {selectedCommand.errorDetail}
              </pre>
            ) : null}
            <div className="cloud-platform-table-wrap">
              <table className="cloud-platform-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Node</th>
                    <th>Time</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {commandLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className={`cloud-node-status ${String(log.status || "").toLowerCase()}`}>{log.status}</span>
                      </td>
                      <td>{log.node?.label || "-"}</td>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>
                        {log.errorCode ? `${log.errorCode}: ` : ""}
                        {log.errorDetail || (log.output ? JSON.stringify(log.output) : "-")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loadingLogs && selectedCommandId && commandLogs.length === 0 ? (
                <p className="hint" style={{ margin: 0, padding: "10px 12px" }}>
                  No logs yet for this command.
                </p>
              ) : null}
              {loadingLogs ? (
                <p className="hint" style={{ margin: 0, padding: "10px 12px" }}>
                  Loading logs...
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
