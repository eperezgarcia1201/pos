export type StationMode = "full" | "hostess" | "kitchen-display" | "expo-display";

export type StationModeOption = {
  id: StationMode;
  label: string;
  subtitle: string;
  route: string;
};

export const STATION_MODE_STORAGE_KEY = "websys_pos_station_mode_v1";
export const STATION_MODE_EVENT = "websys:station-mode-changed";

const modeFromEnv = normalizeMode(import.meta.env.VITE_STATION_MODE as string | undefined);

export const stationModeOptions: StationModeOption[] = [
  {
    id: "full",
    label: "Full POS",
    subtitle: "Default station with all screens and workflows.",
    route: "/"
  },
  {
    id: "hostess",
    label: "Hostess Station",
    subtitle: "Dedicated host stand for seating and table flow.",
    route: "/hostess"
  },
  {
    id: "kitchen-display",
    label: "Kitchen Display",
    subtitle: "Dedicated kitchen ticket screen for prep workflow.",
    route: "/kitchen"
  },
  {
    id: "expo-display",
    label: "Expo Display",
    subtitle: "Dedicated expo view for pass and pickup coordination.",
    route: "/kitchen/expo"
  }
];

export function normalizeMode(value: unknown): StationMode {
  if (typeof value !== "string") return "full";
  const normalized = value.trim().toLowerCase();
  if (normalized === "hostess") return "hostess";
  if (normalized === "kitchen-display" || normalized === "kitchen_display" || normalized === "kitchen") {
    return "kitchen-display";
  }
  if (normalized === "expo-display" || normalized === "expo_display" || normalized === "expo") {
    return "expo-display";
  }
  return "full";
}

export function getSavedStationMode(): StationMode {
  if (typeof window === "undefined") return modeFromEnv;
  const raw = window.localStorage.getItem(STATION_MODE_STORAGE_KEY);
  if (!raw) return modeFromEnv;
  return normalizeMode(raw);
}

export function saveStationMode(mode: StationMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATION_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(STATION_MODE_EVENT, { detail: mode }));
}

export function clearStationMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STATION_MODE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(STATION_MODE_EVENT, { detail: "full" }));
}

export function getRouteForStationMode(mode: StationMode) {
  return stationModeOptions.find((option) => option.id === mode)?.route ?? "/";
}

function normalizePath(pathname: string) {
  const clean = pathname.split("?")[0].replace(/\/+$/, "");
  return clean || "/";
}

export function isRouteAllowedInStationMode(mode: StationMode, pathname: string) {
  const path = normalizePath(pathname);
  if (path === "/station-mode") return true;
  if (mode === "full") return true;
  if (mode === "hostess") return path === "/hostess";
  if (mode === "kitchen-display") return path === "/kitchen";
  if (mode === "expo-display") return path === "/kitchen/expo";
  return true;
}
