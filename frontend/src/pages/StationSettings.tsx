import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import {
  STATION_MODE_EVENT,
  clearStationMode,
  getSavedStationMode,
  getRouteForStationMode,
  saveStationMode,
  stationModeOptions,
  type StationMode
} from "../lib/stationMode";

const deviceBridgeUrl = import.meta.env.VITE_DEVICE_BRIDGE_URL || "http://localhost:7090";

type Station = {
  id: string;
  name: string;
  terminalId?: string | null;
  receiptPrinterId?: string | null;
  kitchenPrinterId?: string | null;
  barPrinterId?: string | null;
  cashDrawerId?: string | null;
  kitchenStationIds?: string[] | null;
  barStationIds?: string[] | null;
  active: boolean;
};

type BridgePrinter = {
  id?: string;
  name?: string;
  type?: string;
  connection?: Record<string, unknown>;
};

type KitchenStation = {
  id: string;
  name: string;
  printerId?: string | null;
};

type StationForm = {
  id: string;
  name: string;
  terminalId: string;
  receiptPrinterId: string;
  kitchenPrinterId: string;
  barPrinterId: string;
  cashDrawerId: string;
  kitchenStationIds: string[];
  barStationIds: string[];
  active: boolean;
};

type PrinterProfile = {
  id: string;
  name: string;
  driverType: string;
  connectionType: "USB" | "ETHERNET" | "BLUETOOTH";
  usbVendorId?: string;
  usbProductId?: string;
  ethernetHost?: string;
  ethernetPort?: number;
  bluetoothAddress?: string;
  notes?: string;
  active?: boolean;
};

type PrinterRouting = {
  customerReceiptPrinterId: string;
  kitchenPrinterId: string;
  barPrinterId: string;
  reportPrinterId: string;
  stationDefaultPrinterId: string;
};

type PrinterOption = {
  id: string;
  name: string;
  source: "profile" | "bridge";
  connectionType: string;
  detail: string;
};

type PrinterProfileForm = {
  id: string;
  name: string;
  driverType: string;
  connectionType: "USB" | "ETHERNET" | "BLUETOOTH";
  usbVendorId: string;
  usbProductId: string;
  ethernetHost: string;
  ethernetPort: string;
  bluetoothAddress: string;
  notes: string;
  active: boolean;
};

const blankStationForm: StationForm = {
  id: "",
  name: "",
  terminalId: "",
  receiptPrinterId: "",
  kitchenPrinterId: "",
  barPrinterId: "",
  cashDrawerId: "",
  kitchenStationIds: [],
  barStationIds: [],
  active: true
};

const blankProfileForm: PrinterProfileForm = {
  id: "",
  name: "",
  driverType: "escpos",
  connectionType: "USB",
  usbVendorId: "",
  usbProductId: "",
  ethernetHost: "",
  ethernetPort: "9100",
  bluetoothAddress: "",
  notes: "",
  active: true
};

const defaultRouting: PrinterRouting = {
  customerReceiptPrinterId: "",
  kitchenPrinterId: "",
  barPrinterId: "",
  reportPrinterId: "",
  stationDefaultPrinterId: ""
};

function normalizeConnectionType(raw?: string) {
  const value = (raw || "").toLowerCase();
  if (value.includes("ethernet") || value.includes("network") || value.includes("tcp")) return "ETHERNET";
  if (value.includes("bluetooth") || value === "bt" || value === "ble") return "BLUETOOTH";
  return "USB";
}

function describeBridgeConnection(printer: BridgePrinter) {
  const connection = (printer.connection || {}) as Record<string, unknown>;
  const type = normalizeConnectionType(String(connection.type || printer.type || ""));
  if (type === "ETHERNET") {
    const host = typeof connection.host === "string" ? connection.host : "";
    const port =
      typeof connection.port === "number"
        ? String(connection.port)
        : typeof connection.port === "string"
        ? connection.port
        : "";
    return { connectionType: type, detail: [host, port ? `:${port}` : ""].join("") || "Ethernet" };
  }
  if (type === "BLUETOOTH") {
    const address =
      typeof connection.address === "string"
        ? connection.address
        : typeof connection.mac === "string"
        ? connection.mac
        : "";
    return { connectionType: type, detail: address || "Bluetooth" };
  }
  const vendorId = typeof connection.vendorId === "string" ? connection.vendorId : "";
  const productId = typeof connection.productId === "string" ? connection.productId : "";
  const usbLabel = [vendorId, productId].filter(Boolean).join(" / ");
  return { connectionType: type, detail: usbLabel || "USB" };
}

function describeProfile(profile: PrinterProfile) {
  if (profile.connectionType === "ETHERNET") {
    const host = profile.ethernetHost || "";
    const port = profile.ethernetPort ? `:${profile.ethernetPort}` : "";
    return host ? `${host}${port}` : "Ethernet";
  }
  if (profile.connectionType === "BLUETOOTH") {
    return profile.bluetoothAddress || "Bluetooth";
  }
  const usbLabel = [profile.usbVendorId, profile.usbProductId].filter(Boolean).join(" / ");
  return usbLabel || "USB";
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const setting = await apiFetch(`/settings/${key}`);
    return (setting?.value as T) ?? fallback;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
      return fallback;
    }
    throw err;
  }
}

export default function StationSettings() {
  const navigate = useNavigate();
  const [stations, setStations] = useState<Station[]>([]);
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);
  const [bridgePrinters, setBridgePrinters] = useState<BridgePrinter[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [routing, setRouting] = useState<PrinterRouting>(defaultRouting);
  const [statusMessage, setStatusMessage] = useState("");
  const [deviceMode, setDeviceMode] = useState<StationMode>(() => getSavedStationMode());

  const [newStation, setNewStation] = useState({
    name: "",
    terminalId: "",
    receiptPrinterId: "",
    kitchenPrinterId: "",
    barPrinterId: "",
    cashDrawerId: ""
  });
  const [selectedStationId, setSelectedStationId] = useState("");
  const [editStation, setEditStation] = useState<StationForm>(blankStationForm);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileForm, setProfileForm] = useState<PrinterProfileForm>(blankProfileForm);

  const loadStationData = async () => {
    const [stationData, kitchenData] = await Promise.all([apiFetch("/stations"), apiFetch("/kitchen-stations")]);
    setStations(stationData);
    setKitchenStations(kitchenData);
  };

  useEffect(() => {
    (async () => {
      const [savedProfiles, savedRouting] = await Promise.all([
        readSetting<PrinterProfile[]>("printer_profiles", []),
        readSetting<PrinterRouting>("printer_routing", defaultRouting)
      ]);
      setProfiles(Array.isArray(savedProfiles) ? savedProfiles : []);
      setRouting({ ...defaultRouting, ...(savedRouting || {}) });
      await loadStationData();
    })().catch((err) => {
      setStatusMessage(err instanceof Error ? err.message : "Unable to load station settings.");
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const devices = await fetch(`${deviceBridgeUrl}/devices`).then((res) => res.json());
        setBridgePrinters(Array.isArray(devices.printers) ? devices.printers : []);
      } catch {
        setBridgePrinters([]);
      }
    })();
  }, []);

  useEffect(() => {
    const syncMode = () => setDeviceMode(getSavedStationMode());
    window.addEventListener("storage", syncMode);
    window.addEventListener(STATION_MODE_EVENT, syncMode);
    return () => {
      window.removeEventListener("storage", syncMode);
      window.removeEventListener(STATION_MODE_EVENT, syncMode);
    };
  }, []);

  useEffect(() => {
    if (!selectedStationId) {
      setEditStation(blankStationForm);
      return;
    }
    const selected = stations.find((station) => station.id === selectedStationId);
    if (!selected) return;
    const normalizeIds = (value: unknown) =>
      Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    setEditStation({
      id: selected.id,
      name: selected.name || "",
      terminalId: selected.terminalId ?? "",
      receiptPrinterId: selected.receiptPrinterId ?? "",
      kitchenPrinterId: selected.kitchenPrinterId ?? "",
      barPrinterId: selected.barPrinterId ?? "",
      cashDrawerId: selected.cashDrawerId ?? "",
      kitchenStationIds: normalizeIds(selected.kitchenStationIds),
      barStationIds: normalizeIds(selected.barStationIds),
      active: selected.active
    });
  }, [selectedStationId, stations]);

  useEffect(() => {
    if (!selectedProfileId) {
      setProfileForm(blankProfileForm);
      return;
    }
    const selected = profiles.find((profile) => profile.id === selectedProfileId);
    if (!selected) return;
    setProfileForm({
      id: selected.id,
      name: selected.name,
      driverType: selected.driverType || "escpos",
      connectionType: selected.connectionType || "USB",
      usbVendorId: selected.usbVendorId || "",
      usbProductId: selected.usbProductId || "",
      ethernetHost: selected.ethernetHost || "",
      ethernetPort: selected.ethernetPort ? String(selected.ethernetPort) : "9100",
      bluetoothAddress: selected.bluetoothAddress || "",
      notes: selected.notes || "",
      active: selected.active !== false
    });
  }, [selectedProfileId, profiles]);

  const printerOptions = useMemo(() => {
    const optionMap = new Map<string, PrinterOption>();
    for (const profile of profiles) {
      if (profile.active === false) continue;
      if (!profile.id) continue;
      optionMap.set(profile.id, {
        id: profile.id,
        name: profile.name,
        source: "profile",
        connectionType: profile.connectionType,
        detail: describeProfile(profile)
      });
    }
    for (const printer of bridgePrinters) {
      if (!printer.id) continue;
      if (optionMap.has(printer.id)) continue;
      const info = describeBridgeConnection(printer);
      optionMap.set(printer.id, {
        id: printer.id,
        name: printer.name || printer.id,
        source: "bridge",
        connectionType: info.connectionType,
        detail: info.detail
      });
    }
    return Array.from(optionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, bridgePrinters]);

  useEffect(() => {
    if (newStation.receiptPrinterId) return;
    setNewStation((prev) => ({
      ...prev,
      receiptPrinterId: routing.customerReceiptPrinterId || "",
      kitchenPrinterId: routing.kitchenPrinterId || "",
      barPrinterId: routing.barPrinterId || ""
    }));
  }, [routing, newStation.receiptPrinterId]);

  const renderPrinterLabel = (option: PrinterOption) => {
    const sourceLabel = option.source === "profile" ? "saved" : "bridge";
    return `${option.name} [${option.connectionType}] • ${option.detail} (${sourceLabel})`;
  };

  const readMultiSelect = (event: ChangeEvent<HTMLSelectElement>) =>
    Array.from(event.target.selectedOptions).map((option) => option.value);

  const saveProfiles = async (nextProfiles: PrinterProfile[]) => {
    await apiFetch("/settings/printer_profiles", {
      method: "PATCH",
      body: JSON.stringify({ value: nextProfiles })
    });
    setProfiles(nextProfiles);
  };

  const upsertProfile = async () => {
    if (!profileForm.id.trim() || !profileForm.name.trim()) {
      setStatusMessage("Printer ID and printer name are required.");
      return;
    }
    const connectionType = profileForm.connectionType;
    const profile: PrinterProfile = {
      id: profileForm.id.trim(),
      name: profileForm.name.trim(),
      driverType: profileForm.driverType.trim() || "escpos",
      connectionType,
      notes: profileForm.notes.trim() || undefined,
      active: profileForm.active
    };
    if (connectionType === "USB") {
      profile.usbVendorId = profileForm.usbVendorId.trim() || undefined;
      profile.usbProductId = profileForm.usbProductId.trim() || undefined;
    }
    if (connectionType === "ETHERNET") {
      profile.ethernetHost = profileForm.ethernetHost.trim() || undefined;
      profile.ethernetPort = profileForm.ethernetPort.trim() ? Number(profileForm.ethernetPort) : undefined;
    }
    if (connectionType === "BLUETOOTH") {
      profile.bluetoothAddress = profileForm.bluetoothAddress.trim() || undefined;
    }

    const existingIndex = profiles.findIndex((entry) => entry.id === profile.id);
    const nextProfiles =
      existingIndex >= 0
        ? profiles.map((entry, index) => (index === existingIndex ? profile : entry))
        : [...profiles, profile];
    await saveProfiles(nextProfiles);
    setSelectedProfileId(profile.id);
    setStatusMessage("Printer profile saved.");
  };

  const deleteProfile = async () => {
    if (!selectedProfileId) return;
    const nextProfiles = profiles.filter((entry) => entry.id !== selectedProfileId);
    await saveProfiles(nextProfiles);
    setSelectedProfileId("");
    setProfileForm(blankProfileForm);
    setStatusMessage("Printer profile deleted.");
  };

  const saveRouting = async () => {
    await apiFetch("/settings/printer_routing", {
      method: "PATCH",
      body: JSON.stringify({ value: routing })
    });
    setStatusMessage("Default printer routing saved.");
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Station Settings</h2>
          <p>Printer transport options, routing defaults, and station assignments.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2 station-mode-inline-panel">
          <h3>Device Station Mode</h3>
          <p className="hint">
            Use this to lock a low-level computer to one screen (Hostess, Kitchen Display, or Expo Display).
          </p>
          <div className="form-row">
            <select value={deviceMode} onChange={(e) => setDeviceMode(e.target.value as StationMode)}>
              {stationModeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (deviceMode === "full") {
                  clearStationMode();
                } else {
                  saveStationMode(deviceMode);
                }
                setStatusMessage("Device station mode saved.");
                navigate(getRouteForStationMode(deviceMode), { replace: true });
              }}
            >
              Save Device Mode
            </button>
            <button type="button" onClick={() => navigate("/station-mode")}>
              Open Station Mode Screen
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Printer Profiles</h3>
          <div className="form-grid">
            <label>
              Printer ID
              <input
                value={profileForm.id}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, id: e.target.value }))}
                placeholder="receipt-usb-1"
              />
            </label>
            <label>
              Printer Name
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Front Receipt Printer"
              />
            </label>
            <label>
              Driver Type
              <input
                value={profileForm.driverType}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, driverType: e.target.value }))}
                placeholder="escpos"
              />
            </label>
            <label>
              Connection
              <select
                value={profileForm.connectionType}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    connectionType: e.target.value as PrinterProfileForm["connectionType"]
                  }))
                }
              >
                <option value="USB">USB</option>
                <option value="ETHERNET">Ethernet (Network)</option>
                <option value="BLUETOOTH">Bluetooth</option>
              </select>
            </label>

            {profileForm.connectionType === "USB" && (
              <>
                <label>
                  USB Vendor ID
                  <input
                    value={profileForm.usbVendorId}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, usbVendorId: e.target.value }))}
                    placeholder="0x04b8"
                  />
                </label>
                <label>
                  USB Product ID
                  <input
                    value={profileForm.usbProductId}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, usbProductId: e.target.value }))}
                    placeholder="0x0202"
                  />
                </label>
              </>
            )}

            {profileForm.connectionType === "ETHERNET" && (
              <>
                <label>
                  Host / IP
                  <input
                    value={profileForm.ethernetHost}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, ethernetHost: e.target.value }))}
                    placeholder="192.168.1.50"
                  />
                </label>
                <label>
                  Port
                  <input
                    value={profileForm.ethernetPort}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, ethernetPort: e.target.value }))}
                    placeholder="9100"
                  />
                </label>
              </>
            )}

            {profileForm.connectionType === "BLUETOOTH" && (
              <label>
                Bluetooth Address
                <input
                  value={profileForm.bluetoothAddress}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, bluetoothAddress: e.target.value }))}
                  placeholder="AA:BB:CC:DD:EE:FF"
                />
              </label>
            )}
          </div>
          <div className="form-row">
            <button type="button" onClick={upsertProfile}>Save Printer</button>
            <button type="button" onClick={deleteProfile} disabled={!selectedProfileId}>
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedProfileId("");
                setProfileForm(blankProfileForm);
              }}
            >
              New
            </button>
          </div>
          <div className="table-list">
            <div className="table-header">
              <span>ID</span>
              <span>Name</span>
              <span>Connection</span>
              <span>Source</span>
              <span>Action</span>
            </div>
            {printerOptions.map((printer) => (
              <div key={printer.id} className="table-row">
                <span>{printer.id}</span>
                <span>{printer.name}</span>
                <span>{printer.connectionType} • {printer.detail}</span>
                <span>{printer.source === "profile" ? "Saved" : "Bridge"}</span>
                <button
                  type="button"
                  disabled={printer.source !== "profile"}
                  onClick={() => {
                    if (printer.source !== "profile") return;
                    setSelectedProfileId(printer.id);
                  }}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-2">
          <h3>Default Printer Routing</h3>
          <div className="form-grid">
            <label>
              Customer Receipts
              <select
                value={routing.customerReceiptPrinterId}
                onChange={(e) => setRouting((prev) => ({ ...prev, customerReceiptPrinterId: e.target.value }))}
              >
                <option value="">None</option>
                {printerOptions.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {renderPrinterLabel(printer)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kitchen
              <select
                value={routing.kitchenPrinterId}
                onChange={(e) => setRouting((prev) => ({ ...prev, kitchenPrinterId: e.target.value }))}
              >
                <option value="">None</option>
                {printerOptions.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {renderPrinterLabel(printer)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bar
              <select
                value={routing.barPrinterId}
                onChange={(e) => setRouting((prev) => ({ ...prev, barPrinterId: e.target.value }))}
              >
                <option value="">None</option>
                {printerOptions.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {renderPrinterLabel(printer)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reports (Standard Printer)
              <select
                value={routing.reportPrinterId}
                onChange={(e) => setRouting((prev) => ({ ...prev, reportPrinterId: e.target.value }))}
              >
                <option value="">None</option>
                {printerOptions.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {renderPrinterLabel(printer)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Other Stations (Default Fallback)
              <select
                value={routing.stationDefaultPrinterId}
                onChange={(e) => setRouting((prev) => ({ ...prev, stationDefaultPrinterId: e.target.value }))}
              >
                <option value="">None</option>
                {printerOptions.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {renderPrinterLabel(printer)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <button type="button" onClick={saveRouting}>Save Defaults</button>
          </div>
          <p className="hint">
            Station-specific printer assignments override these defaults. Use report routing for office-size report printers.
          </p>
        </section>

        <section className="panel span-2">
          <h3>Add Station</h3>
          <div className="form-row">
            <input
              value={newStation.name}
              onChange={(e) => setNewStation((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Station name"
            />
            <input
              value={newStation.terminalId}
              onChange={(e) => setNewStation((prev) => ({ ...prev, terminalId: e.target.value }))}
              placeholder="Terminal ID"
            />
            <select
              value={newStation.receiptPrinterId}
              onChange={(e) => setNewStation((prev) => ({ ...prev, receiptPrinterId: e.target.value }))}
            >
              <option value="">Receipt printer</option>
              {printerOptions.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {renderPrinterLabel(printer)}
                </option>
              ))}
            </select>
            <select
              value={newStation.kitchenPrinterId}
              onChange={(e) => setNewStation((prev) => ({ ...prev, kitchenPrinterId: e.target.value }))}
            >
              <option value="">Kitchen printer</option>
              {printerOptions.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {renderPrinterLabel(printer)}
                </option>
              ))}
            </select>
            <select
              value={newStation.barPrinterId}
              onChange={(e) => setNewStation((prev) => ({ ...prev, barPrinterId: e.target.value }))}
            >
              <option value="">Bar printer</option>
              {printerOptions.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {renderPrinterLabel(printer)}
                </option>
              ))}
            </select>
            <input
              value={newStation.cashDrawerId}
              onChange={(e) => setNewStation((prev) => ({ ...prev, cashDrawerId: e.target.value }))}
              placeholder="Cash drawer ID"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newStation.name) return;
                await apiFetch("/stations", {
                  method: "POST",
                  body: JSON.stringify({
                    name: newStation.name,
                    terminalId: newStation.terminalId || undefined,
                    receiptPrinterId: newStation.receiptPrinterId || routing.customerReceiptPrinterId || undefined,
                    kitchenPrinterId: newStation.kitchenPrinterId || routing.kitchenPrinterId || undefined,
                    barPrinterId: newStation.barPrinterId || routing.barPrinterId || undefined,
                    cashDrawerId: newStation.cashDrawerId || undefined
                  })
                });
                setNewStation({
                  name: "",
                  terminalId: "",
                  receiptPrinterId: "",
                  kitchenPrinterId: "",
                  barPrinterId: "",
                  cashDrawerId: ""
                });
                await loadStationData();
                setStatusMessage("Station added.");
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Stations</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Name</span>
              <span>Terminal</span>
              <span>Receipt</span>
              <span>Kitchen</span>
              <span>Bar</span>
              <span>Actions</span>
            </div>
            {stations.map((station) => (
              <div key={station.id} className="table-row">
                <span>{station.name}</span>
                <span>{station.terminalId ?? "-"}</span>
                <span>{station.receiptPrinterId ?? "-"}</span>
                <span>{station.kitchenPrinterId ?? "-"}</span>
                <span>{station.barPrinterId ?? "-"}</span>
                <button type="button" onClick={() => setSelectedStationId(station.id)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        {selectedStationId && (
          <section className="panel span-2">
            <h3>Edit Station</h3>
            <div className="form-grid">
              <label>
                Station name
                <input
                  value={editStation.name}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Station name"
                />
              </label>
              <label>
                Terminal ID
                <input
                  value={editStation.terminalId}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, terminalId: e.target.value }))}
                  placeholder="Terminal ID"
                />
              </label>
              <label>
                Receipt printer
                <select
                  value={editStation.receiptPrinterId}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, receiptPrinterId: e.target.value }))}
                >
                  <option value="">No receipt printer</option>
                  {printerOptions.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {renderPrinterLabel(printer)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kitchen printer
                <select
                  value={editStation.kitchenPrinterId}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, kitchenPrinterId: e.target.value }))}
                >
                  <option value="">No kitchen printer</option>
                  {printerOptions.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {renderPrinterLabel(printer)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bar printer
                <select
                  value={editStation.barPrinterId}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, barPrinterId: e.target.value }))}
                >
                  <option value="">No bar printer</option>
                  {printerOptions.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {renderPrinterLabel(printer)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cash drawer ID
                <input
                  value={editStation.cashDrawerId}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, cashDrawerId: e.target.value }))}
                  placeholder="Cash drawer ID"
                />
              </label>
              <label>
                Kitchen stations
                <select
                  multiple
                  value={editStation.kitchenStationIds}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, kitchenStationIds: readMultiSelect(e) }))}
                >
                  {kitchenStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} {station.printerId ? `• ${station.printerId}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bar stations
                <select
                  multiple
                  value={editStation.barStationIds}
                  onChange={(e) => setEditStation((prev) => ({ ...prev, barStationIds: readMultiSelect(e) }))}
                >
                  {kitchenStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} {station.printerId ? `• ${station.printerId}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedStationId) return;
                  await apiFetch(`/stations/${selectedStationId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: editStation.name,
                      terminalId: editStation.terminalId || undefined,
                      receiptPrinterId: editStation.receiptPrinterId || undefined,
                      kitchenPrinterId: editStation.kitchenPrinterId || undefined,
                      barPrinterId: editStation.barPrinterId || undefined,
                      cashDrawerId: editStation.cashDrawerId || undefined,
                      kitchenStationIds: editStation.kitchenStationIds,
                      barStationIds: editStation.barStationIds
                    })
                  });
                  await loadStationData();
                  setStatusMessage("Station saved.");
                }}
              >
                Save
              </button>
              <button type="button" onClick={() => setSelectedStationId("")}>
                Cancel
              </button>
            </div>
            <p className="hint">
              Per-station assignments override default routing.
            </p>
          </section>
        )}
      </div>
      {statusMessage && <p className="hint">{statusMessage}</p>}
    </div>
  );
}
