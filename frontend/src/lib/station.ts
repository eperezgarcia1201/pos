import { apiFetch } from "./api";

export type StationConfig = {
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

const terminalId = import.meta.env.VITE_TERMINAL_ID || "";
const stationId = import.meta.env.VITE_STATION_ID || "";

let cachedStation: StationConfig | null = null;
let inflight: Promise<StationConfig | null> | null = null;
let hasLoaded = false;

export async function loadStation() {
  if (hasLoaded) return cachedStation;
  if (inflight) return inflight;
  if (!stationId && !terminalId) {
    hasLoaded = true;
    return null;
  }

  const params = new URLSearchParams();
  if (stationId) {
    params.set("id", stationId);
  } else if (terminalId) {
    params.set("terminalId", terminalId);
  }

  inflight = apiFetch(`/stations?${params.toString()}`)
    .then((result) => {
      const station = Array.isArray(result) ? (result[0] ?? null) : result;
      cachedStation = station;
      hasLoaded = true;
      return station;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getStationContext(station?: StationConfig | null) {
  if (station?.id) {
    return { stationId: station.id };
  }
  if (stationId) {
    return { stationId };
  }
  if (terminalId) {
    return { terminalId };
  }
  return {};
}
