import fs from "node:fs";
import path from "node:path";

export type DeviceConfig = {
  printers: Array<{
    id: string;
    name: string;
    type: string;
    connection: Record<string, unknown>;
  }>;
  cashDrawers: Array<{
    id: string;
    name: string;
    printerId?: string;
  }>;
  scanners: Array<Record<string, unknown>>;
  scales: Array<Record<string, unknown>>;
  customerDisplays: Array<Record<string, unknown>>;
  pax?: {
    model: string;
    connection: Record<string, unknown>;
  };
};

const defaultConfig: DeviceConfig = {
  printers: [],
  cashDrawers: [],
  scanners: [],
  scales: [],
  customerDisplays: [],
  pax: undefined
};

export function loadConfig(): DeviceConfig {
  const configPath = process.env.DEVICE_BRIDGE_CONFIG || "./config.json";
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    return defaultConfig;
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as DeviceConfig;

  return {
    printers: parsed.printers ?? [],
    cashDrawers: parsed.cashDrawers ?? [],
    scanners: parsed.scanners ?? [],
    scales: parsed.scales ?? [],
    customerDisplays: parsed.customerDisplays ?? [],
    pax: parsed.pax
  };
}
