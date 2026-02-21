import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getQueueSize, syncOfflineQueue } from "../lib/offlineSync";
import PinGate from "../components/PinGate";
import { AppLanguage, clearCurrentUser, getCurrentUser, setCurrentUserLanguage, subscribeUserChange } from "../lib/session";
import { routeGroup } from "../lib/routeGroups";
import { hasAnyPermission } from "../lib/permissions";
import { apiFetch } from "../lib/api";
import { localeForLanguage, t, useAppLanguage } from "../lib/i18n";

const iconColor = {
  blue: "#8ec5ff",
  green: "#7dffb8",
  red: "#ff7b7b",
  yellow: "#ffd27d",
  steel: "#c7d2fe",
  teal: "#7dd3fc"
};

type Tile = {
  id: string;
  label: string;
  subtitle?: string;
  tone: keyof typeof iconColor;
  icon: "user" | "basket" | "scooter" | "tag" | "search" | "void" | "split" | "cash" | "refund" | "cashier" | "report" | "time" | "backoffice" | "settings" | "tools" | "exit" | "kitchen";
};

type Drawer = {
  id: string;
  status: string;
};

const tiles: Tile[] = [
  { id: "dine-in", label: "Dine In", tone: "blue", icon: "user" },
  { id: "hostess", label: "Hostess", tone: "teal", icon: "user" },
  { id: "take-out", label: "Take Out", tone: "green", icon: "basket" },
  { id: "delivery", label: "Delivery", tone: "teal", icon: "scooter" },
  { id: "recall", label: "Recall", tone: "steel", icon: "search" },
  { id: "online-orders", label: "Online Orders", tone: "yellow", icon: "tag" },
  { id: "void", label: "Void", tone: "red", icon: "void" },
  { id: "refund", label: "Refund", tone: "red", icon: "refund" },
  { id: "cashier-in", label: "Cashier In", tone: "green", icon: "cashier" },
  { id: "kitchen", label: "Kitchen", tone: "teal", icon: "kitchen" },
  { id: "expo", label: "Expo", tone: "yellow", icon: "kitchen" },
  { id: "owner", label: "Owner", tone: "blue", icon: "report" },
  { id: "reports", label: "Operations", tone: "teal", icon: "report" },
  { id: "time-cards", label: "Time Cards", tone: "steel", icon: "time" },
  { id: "back-office", label: "Back Office", tone: "steel", icon: "backoffice" },
  { id: "exit", label: "Exit", tone: "red", icon: "exit" }
];

const tilePermissions: Record<string, string[]> = {
  "dine-in": ["orders"],
  hostess: ["tables", "orders"],
  "take-out": ["orders"],
  delivery: ["orders"],
  recall: ["orders"],
  "online-orders": ["orders", "settings"],
  void: ["orders"],
  refund: ["orders"],
  "cashier-in": ["cash"],
  kitchen: ["orders"],
  expo: ["orders"],
  owner: ["reports"],
  reports: ["reports"],
  "time-cards": ["timeclock"],
  "back-office": ["settings", "menu", "inventory", "users", "reports", "tables", "cash"],
  settings: ["settings"]
};

function TileIcon({ type, tone }: { type: Tile["icon"]; tone: keyof typeof iconColor }) {
  const color = iconColor[tone];
  const common = {
    stroke: color,
    strokeWidth: 2.5,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (type) {
    case "user":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="22" r="10" fill={color} opacity="0.2" />
          <circle cx="32" cy="22" r="8" {...common} />
          <path d="M14 52c4-10 12-16 18-16s14 6 18 16" {...common} />
          <path d="M24 44h16" {...common} />
        </svg>
      );
    case "basket":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M12 26h40l-4 24H16z" {...common} />
          <path d="M20 26l8-12" {...common} />
          <path d="M44 26l-8-12" {...common} />
          <path d="M24 42h16" {...common} />
          <path d="M34 16l6 6-6 6" {...common} />
        </svg>
      );
    case "scooter":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="20" cy="46" r="6" {...common} />
          <circle cx="48" cy="46" r="6" {...common} />
          <path d="M20 46h16l8-16h8" {...common} />
          <path d="M28 30l-6 12" {...common} />
          <path d="M40 30h10" {...common} />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M10 30l20-20h20v20l-20 20z" {...common} />
          <circle cx="42" cy="22" r="4" {...common} />
          <path d="M28 36l10 10" {...common} />
          <path d="M26 46h8" {...common} />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="28" cy="28" r="12" {...common} />
          <path d="M38 38l12 12" {...common} />
          <path d="M24 28h8" {...common} />
        </svg>
      );
    case "void":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M18 18l28 28" {...common} />
          <path d="M46 18L18 46" {...common} />
        </svg>
      );
    case "split":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M18 12h20l8 8v28H18z" {...common} />
          <path d="M38 12v8h8" {...common} />
          <path d="M32 28v16" {...common} />
          <path d="M24 36l8 8 8-8" {...common} />
        </svg>
      );
    case "cash":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="12" y="18" width="40" height="28" rx="4" {...common} />
          <circle cx="32" cy="32" r="6" {...common} />
          <path d="M18 24h8" {...common} />
          <path d="M38 40h8" {...common} />
        </svg>
      );
    case "refund":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M20 12h20l8 8v28H20z" {...common} />
          <path d="M40 12v8h8" {...common} />
          <path d="M36 44H24l4-4" {...common} />
          <path d="M24 44l4 4" {...common} />
        </svg>
      );
    case "cashier":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="14" y="30" width="36" height="18" rx="2" {...common} />
          <rect x="20" y="18" width="16" height="10" rx="2" {...common} />
          <path d="M42 22h8" {...common} />
          <path d="M44 18l6 4-6 4" {...common} />
        </svg>
      );
    case "kitchen":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M18 10v20" {...common} />
          <path d="M24 10v20" {...common} />
          <path d="M30 10v20" {...common} />
          <path d="M42 10v40" {...common} />
          <path d="M42 32h6" {...common} />
        </svg>
      );
    case "report":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="16" y="12" width="32" height="40" rx="3" {...common} />
          <path d="M22 40v-10" {...common} />
          <path d="M32 40V24" {...common} />
          <path d="M42 40v-6" {...common} />
        </svg>
      );
    case "time":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="18" y="10" width="28" height="40" rx="4" {...common} />
          <path d="M26 10v6" {...common} />
          <path d="M38 10v6" {...common} />
          <circle cx="32" cy="34" r="8" {...common} />
          <path d="M32 34v-4" {...common} />
          <path d="M32 34h4" {...common} />
        </svg>
      );
    case "backoffice":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="12" {...common} />
          <path d="M32 16v-6" {...common} />
          <path d="M32 54v-6" {...common} />
          <path d="M16 32h-6" {...common} />
          <path d="M54 32h-6" {...common} />
          <path d="M44 20l4-4" {...common} />
          <path d="M20 44l-4 4" {...common} />
          <path d="M20 20l-4-4" {...common} />
          <path d="M44 44l4 4" {...common} />
        </svg>
      );
    case "settings":
    case "tools":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M18 46l10-10 10 10" {...common} />
          <path d="M28 36l8-8" {...common} />
          <path d="M40 14l10 10-8 8-10-10z" {...common} />
          <path d="M16 50l8-8" {...common} />
        </svg>
      );
    case "exit":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="12" y="14" width="24" height="36" rx="2" {...common} />
          <path d="M30 32h20" {...common} />
          <path d="M42 24l8 8-8 8" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

function formatTime(date: Date, language: AppLanguage) {
  return date.toLocaleString(localeForLanguage(language), {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function homeTileLabel(id: string, language: AppLanguage, hasOpenDrawer: boolean) {
  switch (id) {
    case "dine-in":
      return t("tile_dine_in", language);
    case "take-out":
      return t("tile_take_out", language);
    case "hostess":
      return t("tile_hostess", language);
    case "delivery":
      return t("tile_delivery", language);
    case "recall":
      return t("tile_recall", language);
    case "online-orders":
      return t("tile_online_orders", language);
    case "void":
      return t("tile_void", language);
    case "refund":
      return t("tile_refund", language);
    case "cashier-in":
      return hasOpenDrawer ? t("cashier_out", language) : t("cashier_in", language);
    case "kitchen":
      return t("tile_kitchen", language);
    case "expo":
      return t("tile_expo", language);
    case "reports":
      return t("tile_operations", language);
    case "owner":
      return t("tile_owner", language);
    case "time-cards":
      return t("tile_time_cards", language);
    case "back-office":
      return t("tile_back_office", language);
    case "exit":
      return t("exit", language);
    default:
      return id;
  }
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [services, setServices] = useState({ dineIn: true, takeOut: true, delivery: true });
  const [hasOpenDrawer, setHasOpenDrawer] = useState(false);
  const language = useAppLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const showAdminStatus = hasAnyPermission(currentUser, ["settings"]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return subscribeUserChange((user) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    const refreshQueue = async () => {
      try {
        const count = await getQueueSize();
        setQueueCount(count);
      } catch {
        setQueueCount(0);
      }
    };

    const updateOnline = () => setOnline(navigator.onLine);

    refreshQueue().catch(console.error);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    (async () => {
      try {
        const setting = await apiFetch("/settings/services");
        if (setting?.value) {
          setServices({
            dineIn: setting.value.dineIn !== false,
            takeOut: setting.value.takeOut !== false,
            delivery: setting.value.delivery !== false
          });
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) {
      setHasOpenDrawer(false);
      return;
    }
    (async () => {
      try {
        const drawers = (await apiFetch("/cash/drawers")) as Drawer[];
        setHasOpenDrawer(drawers.some((drawer) => drawer.status === "OPEN"));
      } catch {
        setHasOpenDrawer(false);
      }
    })();
  }, [currentUser?.id, location.pathname]);

  const gridTiles = useMemo(() => {
    return tiles
      .filter((tile) => {
      if (tile.id === "dine-in" && !services.dineIn) return false;
      if (tile.id === "take-out" && !services.takeOut) return false;
      if (tile.id === "delivery" && !services.delivery) return false;
      if (currentUser?.permissions) {
        const required = tilePermissions[tile.id];
        if (required && !hasAnyPermission(currentUser, required)) return false;
      }
      return true;
      });
  }, [services, currentUser]);

  const routeForTile = (id: string) => {
    switch (id) {
      case "dine-in":
        return "/pos/dinein";
      case "hostess":
        return "/hostess";
      case "take-out":
        return "/pos/takeout";
      case "delivery":
        return "/pos/delivery";
      case "reports":
        return "/operations";
      case "owner":
        return "/owner";
      case "cashier-in":
        return hasOpenDrawer ? "/cash?mode=cashier-out" : "/cash?mode=cashier-in";
      case "kitchen":
        return "/kitchen";
      case "expo":
        return "/kitchen/expo";
      case "recall":
        return "/orders?filter=OPEN";
      case "online-orders":
        return "/online-orders";
      case "void":
      case "refund":
        return "/orders";
      case "back-office":
        return "/back-office";
      case "settings":
        return "/back-office";
      case "time-cards":
        return "/timeclock";
      default:
        return `/feature/${id}`;
    }
  };

  const requiresPin = (id: string) => !["exit", "kitchen", "expo"].includes(id);

  const handleTile = (id: string) => {
    const route = routeForTile(id);
    if (requiresPin(id)) {
      setPendingRoute(route);
      setPinOpen(true);
      return;
    }
    navigate(route);
  };

  return (
    <div className="pos-shell">
      <div className="pos-surface">
        <header className="pos-topbar">
          <div className="pos-brand">
            <img className="pos-brand-logo" src="/branding/websys-logo.svg" alt="WebSys POS" />
          </div>
          <div className="pos-user">
            <span>{currentUser?.displayName || currentUser?.username || t("no_user", language)}</span>
            {currentUser && (
              <select
                className="terminal-select compact language-select"
                value={language}
                onChange={async (event) => {
                  const nextLanguage = event.target.value === "es" ? "es" : "en";
                  setCurrentUserLanguage(nextLanguage);
                  setCurrentUser((prev) => (prev ? { ...prev, language: nextLanguage } : prev));
                  if (currentUser.id) {
                    await apiFetch("/auth/language", {
                      method: "PATCH",
                      body: JSON.stringify({ language: nextLanguage })
                    }).catch(() => null);
                  }
                }}
              >
                <option value="en">{t("english", language)}</option>
                <option value="es">{t("spanish", language)}</option>
              </select>
            )}
            {currentUser && (
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => {
                  clearCurrentUser();
                  setCurrentUser(null);
                  sessionStorage.removeItem("pos_allowed_group");
                  setPendingRoute(null);
                  setPinOpen(true);
                }}
              >
                {t("switch", language)}
              </button>
            )}
          </div>
          {showAdminStatus && (
            <button
              className="pos-sync"
              type="button"
              aria-label="Sync"
              onClick={async () => {
                try {
                  await syncOfflineQueue();
                } catch (err) {
                  console.error(err);
                }
                const count = await getQueueSize();
                setQueueCount(count);
              }}
            >
              <span className="pos-sync-icon">⟲</span>
              <span className="pos-sync-status">{online ? t("online", language) : t("offline", language)}</span>
              {queueCount > 0 && <span className="pos-sync-badge">{queueCount}</span>}
            </button>
          )}
        </header>

        <div className="pos-body">
          <aside className="pos-wood" />
          <main className="pos-main">
            <div className="pos-grid">
              {gridTiles.map((tile) => (
                <button
                  key={tile.id}
                  className="pos-tile"
                  type="button"
                  onClick={() => handleTile(tile.id)}
                >
                  <div className="pos-tile-icon" data-tone={tile.tone}>
                    <TileIcon type={tile.icon} tone={tile.tone} />
                  </div>
                  <div className="pos-tile-label">{homeTileLabel(tile.id, language, hasOpenDrawer)}</div>
                </button>
              ))}
            </div>
          </main>
        </div>

        <footer className="pos-footer">
          <div className="pos-footer-left">
            <span>{formatTime(now, language)}</span>
            <span className="pos-divider" />
            <span>{t("station", language, { value: 3 })}</span>
          </div>
          <button className="pos-exit" type="button">
            {t("exit", language)}
            <span className="pos-exit-icon">➜</span>
          </button>
        </footer>
      </div>

      <PinGate
        open={pinOpen}
        language={language}
        title={t("enter_access_code", language)}
        onSuccess={(user) => {
          setCurrentUser(user);
          setPinOpen(false);
          if (pendingRoute) {
            sessionStorage.setItem("pos_allowed_group", routeGroup(pendingRoute));
            navigate(pendingRoute);
          }
          setPendingRoute(null);
        }}
        onCancel={() => {
          setPinOpen(false);
          setPendingRoute(null);
        }}
      />
    </div>
  );
}
