import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import CloudPortalPreferenceControls from "../components/CloudPortalPreferenceControls";
import { useCloudPortalUi } from "../lib/cloudPortalUi";

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

function updateAreaLabel(
  id: string,
  tx: (english: string, spanish: string, params?: Record<string, string | number>) => string
) {
  switch (id) {
    case "services":
      return tx("Services", "Servicios");
    case "taxes":
      return tx("Taxes", "Impuestos");
    case "print":
      return tx("Print", "Impresion");
    case "store":
      return tx("Store Info", "Info de tienda");
    case "custom":
      return tx("Custom", "Personalizado");
    default:
      return id;
  }
}

function templatePresetLabel(
  presetId: string,
  tx: (english: string, spanish: string, params?: Record<string, string | number>) => string
) {
  switch (presetId) {
    case "services":
      return tx("Services", "Servicios");
    case "taxes":
      return tx("Taxes", "Impuestos");
    case "print":
      return tx("Print", "Impresion");
    case "store":
      return tx("Store", "Tienda");
    default:
      return presetId;
  }
}

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
  const { tx } = useCloudPortalUi();

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
    <div className="screen-shell cloud-platform-shell cloud-sync-shell">
      <header className="screen-header cloud-platform-topbar">
        <div>
          <h2>{tx("Cloud Sync Console", "Consola de sincronizacion cloud")}</h2>
          <p>
            {tx(
              "Publish desired state revisions and queue commands for store edge nodes.",
              "Publica revisiones de estado y encola comandos para nodos edge de tienda."
            )}
          </p>
        </div>
        <div className="terminal-actions">
          <CloudPortalPreferenceControls />
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-stores")}>
            {tx("Stores", "Tiendas")}
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            {tx("Back Office", "Back Office")}
          </button>
          <button type="button" className="terminal-btn primary" onClick={() => void refresh(selectedStoreId)} disabled={loading}>
            {loading ? tx("Refreshing...", "Actualizando...") : tx("Refresh", "Actualizar")}
          </button>
        </div>
      </header>

      <section className="panel cloud-sync-store-panel">
        <div className="cloud-sync-store-head">
          <label>
            {tx("Working Store", "Tienda de trabajo")}
            <select
              value={selectedStoreId}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedStoreId(value);
                setParams(value ? { storeId: value } : {});
                if (value) void refresh(value);
              }}
            >
              <option value="">{tx("Select a store", "Selecciona una tienda")}</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </label>
          <div className="cloud-sync-store-meta">
            <div className="cloud-sync-kpi-card">
              <span>{tx("Pending", "Pendientes")}</span>
              <strong>{selectedStore?.pendingCommands ?? 0}</strong>
            </div>
            <div className="cloud-sync-kpi-card">
              <span>{tx("Revisions", "Revisiones")}</span>
              <strong>{selectedStore?.totalRevisions ?? 0}</strong>
            </div>
            <div className="cloud-sync-kpi-card">
              <span>{tx("Nodes", "Nodos")}</span>
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
            <span className="hint">
              {tx(
                "No nodes linked yet. Register onsite node first, then publish revisions.",
                "Aun no hay nodos enlazados. Registra el nodo onsite primero y luego publica revisiones."
              )}
            </span>
          )}
        </div>
      </section>

      <div className="cloud-sync-grid">
        <section className="panel cloud-sync-publish-panel">
          <h3>{tx("Publish Update", "Publicar actualizacion")}</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            {tx(
              "Choose what to update, review values, then send it to store node(s).",
              "Elige que actualizar, revisa valores y luego envialo al/los nodo(s) de tienda."
            )}
          </p>
          <div className="cloud-platform-form-grid">
            <label>
              {tx("Update Area", "Area de actualizacion")}
              <select value={updateArea} onChange={(event) => onUpdateAreaChange(event.target.value)}>
                {UPDATE_AREA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {updateAreaLabel(option.id, tx)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {tx("Settings Key", "Clave de configuracion")}
              <input list="cloud-sync-setting-key-options" value={settingKey} onChange={(event) => setSettingKey(event.target.value)} />
            </label>
            <datalist id="cloud-sync-setting-key-options">
              {SETTINGS_KEY_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <label>
              {tx("Target Node (optional)", "Nodo objetivo (opcional)")}
              <select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
                <option value="">{tx("Any available node", "Cualquier nodo disponible")}</option>
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
              {showAdvanced ? tx("Hide Advanced Options", "Ocultar opciones avanzadas") : tx("Show Advanced Options", "Mostrar opciones avanzadas")}
            </button>
          </div>

          {showAdvanced ? (
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Domain", "Dominio")}
                <input list="cloud-sync-domain-options" value={domain} onChange={(event) => setDomain(event.target.value.toUpperCase())} />
              </label>
              <datalist id="cloud-sync-domain-options">
                {DOMAIN_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>

              <label>
                {tx("Command Type", "Tipo de comando")}
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
                {templatePresetLabel(preset.id, tx)}
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
                {tx("Dine In", "Comer aqui")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.takeOut}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, takeOut: event.target.checked }))}
                />
                {tx("Take Out", "Para llevar")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.delivery}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, delivery: event.target.checked }))}
                />
                {tx("Delivery", "Entrega")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={servicesForm.driveThru}
                  onChange={(event) => setServicesForm((prev) => ({ ...prev, driveThru: event.target.checked }))}
                />
                {tx("Drive Thru", "Auto servicio")}
              </label>
            </div>
          ) : null}

          {updateArea === "taxes" ? (
            <div className="cloud-sync-friendly-grid">
              <label>
                {tx("Tax Alias", "Alias de impuesto")}
                <input value={taxesForm.alias} onChange={(event) => setTaxesForm((prev) => ({ ...prev, alias: event.target.value }))} />
              </label>
              <label>
                {tx("Tax Rate (%)", "Tasa de impuesto (%)")}
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
                {tx("Tax Enabled", "Impuesto habilitado")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={taxesForm.applyTaxOnSurcharge}
                  onChange={(event) => setTaxesForm((prev) => ({ ...prev, applyTaxOnSurcharge: event.target.checked }))}
                />
                {tx("Apply Tax On Surcharge", "Aplicar impuesto al recargo")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={taxesForm.applyTaxOnDeliveryCharge}
                  onChange={(event) => setTaxesForm((prev) => ({ ...prev, applyTaxOnDeliveryCharge: event.target.checked }))}
                />
                {tx("Apply Tax On Delivery Charge", "Aplicar impuesto al cargo de entrega")}
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
                {tx("Print Guest Check On Send", "Imprimir ticket de cliente al enviar")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={printForm.printTwoCopiesOfGuestChecks}
                  onChange={(event) => setPrintForm((prev) => ({ ...prev, printTwoCopiesOfGuestChecks: event.target.checked }))}
                />
                {tx("Print Two Copies", "Imprimir dos copias")}
              </label>
              <label className="cloud-sync-toggle">
                <input
                  type="checkbox"
                  checked={printForm.reprintNeedsManagerOverride}
                  onChange={(event) => setPrintForm((prev) => ({ ...prev, reprintNeedsManagerOverride: event.target.checked }))}
                />
                {tx("Reprint Needs Manager Override", "Reimpresion requiere autorizacion de gerente")}
              </label>
            </div>
          ) : null}

          {updateArea === "store" ? (
            <div className="cloud-sync-friendly-grid">
              <label>
                {tx("Store Name", "Nombre de tienda")}
                <input value={storeForm.name} onChange={(event) => setStoreForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                {tx("Timezone", "Zona horaria")}
                <input value={storeForm.timezone} onChange={(event) => setStoreForm((prev) => ({ ...prev, timezone: event.target.value }))} />
              </label>
              <label>
                {tx("Daily Start Time", "Hora de inicio diario")}
                <input
                  value={storeForm.dailyStartTime}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, dailyStartTime: event.target.value }))}
                />
              </label>
              <label>
                {tx("Lunch Start Time", "Hora de inicio de lunch")}
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
                {showRawJsonEditor ? tx("Hide Raw JSON", "Ocultar JSON crudo") : tx("Edit Raw JSON (Advanced)", "Editar JSON crudo (avanzado)")}
              </button>
            </div>
          ) : null}

          {showRawJsonEditor || updateArea === "custom" ? (
            <label className="cloud-sync-json-field">
              {tx("Raw JSON", "JSON crudo")}
              <textarea value={jsonValue} onChange={(event) => setJsonValue(event.target.value)} rows={12} className="cloud-sync-json-editor" />
            </label>
          ) : null}

          <div className="cloud-sync-publish-footer">
            {showRawJsonEditor || updateArea === "custom" ? (
              <span className={`cloud-sync-json-state ${jsonIsValid ? "is-valid" : "is-invalid"}`}>
                {jsonIsValid ? tx("JSON is valid", "JSON valido") : tx("JSON is invalid", "JSON invalido")}
              </span>
            ) : (
              <span className="cloud-sync-json-state is-neutral">{tx("Simple mode active", "Modo simple activo")}</span>
            )}
            <button type="button" className="terminal-btn primary" onClick={() => void publish()} disabled={publishing || !selectedStoreId}>
              {publishing ? tx("Publishing...", "Publicando...") : tx("Publish Revision", "Publicar revision")}
            </button>
          </div>

          {error ? <p className="cloud-sync-alert cloud-sync-alert-error">{error}</p> : null}
          {message ? <p className="cloud-sync-alert cloud-sync-alert-success">{message}</p> : null}
        </section>

        <section className="panel cloud-sync-activity-panel">
          <div className="cloud-sync-activity-grid">
            <div className="cloud-platform-table-block">
              <h3>{tx("Latest Revisions", "Ultimas revisiones")}</h3>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>{tx("Domain", "Dominio")}</th>
                      <th>{tx("Revision", "Revision")}</th>
                      <th>{tx("Published", "Publicado")}</th>
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
                    {tx("No revisions published yet.", "No hay revisiones publicadas todavia.")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="cloud-platform-table-block">
              <h3>{tx("Command Queue", "Cola de comandos")}</h3>
              <div className="cloud-sync-queue-summary">
                <span className="cloud-node-status pending">{tx("PENDING", "PENDIENTE")} {queueStats.pending}</span>
                <span className="cloud-node-status acked">{tx("ACKED", "CONFIRMADO")} {queueStats.acked}</span>
                <span className="cloud-node-status failed">{tx("FAILED", "FALLIDO")} {queueStats.failed}</span>
              </div>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>{tx("Status", "Estado")}</th>
                      <th>{tx("Type", "Tipo")}</th>
                      <th>{tx("Node", "Nodo")}</th>
                      <th>{tx("Revision", "Revision")}</th>
                      <th>{tx("Issued", "Emitido")}</th>
                      <th>{tx("Action", "Accion")}</th>
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
                          <td>{command.node?.label || tx("Any node", "Cualquier nodo")}</td>
                          <td>{command.revisionRef ? `#${command.revisionRef.revision}` : "-"}</td>
                          <td>{formatDate(command.issuedAt)}</td>
                          <td>
                            <div className="cloud-network-action-row">
                                <button type="button" className="terminal-btn" onClick={() => void inspectCommand(command.id)}>
                                {tx("Logs", "Logs")} ({command._count?.logs || 0})
                                </button>
                                {canRetry ? (
                                  <button
                                    type="button"
                                    className="terminal-btn primary"
                                    onClick={() => void retryCommand(command.id)}
                                    disabled={retryingCommandId === command.id}
                                  >
                                  {retryingCommandId === command.id ? tx("Retrying...", "Reintentando...") : tx("Retry", "Reintentar")}
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
                    {tx("No commands queued yet.", "No hay comandos en cola todavia.")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="cloud-platform-table-block">
            <h3>{tx("Command Detail & Logs", "Detalle de comando y logs")}</h3>
            {selectedCommand ? (
              <div className="cloud-sync-selected-command">
                <div className="hint">
                  {tx("Command", "Comando")}: <code>{selectedCommand.id}</code>
                </div>
                <span className={`cloud-node-status ${String(selectedCommand.status || "").toLowerCase()}`}>{selectedCommand.status}</span>
                <div className="hint">{tx("Issued", "Emitido")}: {formatDate(selectedCommand.issuedAt)}</div>
                <div className="hint">{tx("Acknowledged", "Confirmado")}: {formatDate(selectedCommand.acknowledgedAt)}</div>
              </div>
            ) : (
              <p className="hint">{tx("Select a command from the queue to inspect logs.", "Selecciona un comando de la cola para revisar logs.")}</p>
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
                      <th>{tx("Status", "Estado")}</th>
                      <th>{tx("Node", "Nodo")}</th>
                      <th>{tx("Time", "Hora")}</th>
                      <th>{tx("Detail", "Detalle")}</th>
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
                  {tx("No logs yet for this command.", "Aun no hay logs para este comando.")}
                </p>
              ) : null}
              {loadingLogs ? (
                <p className="hint" style={{ margin: 0, padding: "10px 12px" }}>
                  {tx("Loading logs...", "Cargando logs...")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
