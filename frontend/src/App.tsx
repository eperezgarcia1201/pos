import { useCallback, useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { flushQueue } from "./lib/offlineQueue";
import { routeGroup } from "./lib/routeGroups";
import { goBackOrHome } from "./lib/navigation";
import Home from "./pages/Home";
import PosTerminal from "./pages/PosTerminal";
import FeaturePlaceholder from "./pages/FeaturePlaceholder";
import TablesFloor from "./pages/TablesFloor";
import MenuManager from "./pages/MenuManager";
import InventoryManager from "./pages/InventoryManager";
import ReportsDashboard from "./pages/ReportsDashboard";
import OwnerApp from "./pages/OwnerApp";
import HostessBoard from "./pages/HostessBoard";
import OperationsCenter from "./pages/OperationsCenter";
import TimeClockPage from "./pages/TimeClockPage";
import CashManager from "./pages/CashManager";
import StaffManager from "./pages/StaffManager";
import HardwareSettings from "./pages/HardwareSettings";
import SettlementPage from "./pages/SettlementPage";
import Orders from "./pages/Orders";
import KitchenScreen from "./pages/KitchenScreen";
import KitchenExpo from "./pages/KitchenExpo";
import OnlineOrders from "./pages/OnlineOrders";
import StationModeSetup from "./pages/StationModeSetup";
import OnlineOrdersSettings from "./pages/OnlineOrdersSettings";
import BackOfficeHome from "./pages/BackOfficeHome";
import StoreSettings from "./pages/StoreSettings";
import SecuritySettings from "./pages/SecuritySettings";
import StationSettings from "./pages/StationSettings";
import KitchenDisplaySettings from "./pages/KitchenDisplaySettings";
import TableSetup from "./pages/TableSetup";
import HouseAccounts from "./pages/HouseAccounts";
import Maintenance from "./pages/Maintenance";
import DataSource from "./pages/DataSource";
import PaymentsSettings from "./pages/PaymentsSettings";
import CloudStores from "./pages/CloudStores";
import CloudStoreNetwork from "./pages/CloudStoreNetwork";
import CloudStoreSync from "./pages/CloudStoreSync";
import DataTransfer from "./pages/DataTransfer";
import Payroll from "./pages/Payroll";
import Support from "./pages/Support";
import About from "./pages/About";
import SystemManual from "./pages/SystemManual";
import ServerConnectionGuide from "./pages/ServerConnectionGuide";
import PinGate from "./components/PinGate";
import { t, useAppLanguage } from "./lib/i18n";
import { clearCurrentUser } from "./lib/session";
import {
  STATION_MODE_EVENT,
  getRouteForStationMode,
  getSavedStationMode,
  isRouteAllowedInStationMode,
  type StationMode
} from "./lib/stationMode";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const language = useAppLanguage();
  const isCloudPlatformRoute =
    location.pathname.startsWith("/cloud/platform") || location.pathname.startsWith("/settings/cloud-");
  const [allowedGroup, setAllowedGroup] = useState<string | null>(() => sessionStorage.getItem("pos_allowed_group"));
  const [stationMode, setStationMode] = useState<StationMode>(() => getSavedStationMode());
  const [stationModePinOpen, setStationModePinOpen] = useState(false);
  const stationModeRouteUnlockedRef = useRef(false);
  const isHome = location.pathname === "/";
  const isKitchen = location.pathname.startsWith("/kitchen");
  const isStationModeRoute = location.pathname === "/station-mode";
  const hasCloudImpersonationToken =
    location.pathname === "/back-office" && new URLSearchParams(location.search).has("impersonationToken");
  const stationModeLocked = stationMode !== "full";
  const routeAllowedByStationMode = isRouteAllowedInStationMode(stationMode, location.pathname);
  const bypassPinForStationMode = stationModeLocked && routeAllowedByStationMode && !isStationModeRoute;
  const currentGroup = routeGroup(location.pathname);
  const needsGate =
    !isHome &&
    !isKitchen &&
    !isStationModeRoute &&
    !isCloudPlatformRoute &&
    !bypassPinForStationMode &&
    !hasCloudImpersonationToken &&
    currentGroup !== allowedGroup;

  useEffect(() => {
    const interval = window.setInterval(() => {
      flushQueue(async (req) => {
        await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body
        });
      }).catch(() => null);
    }, 8000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncMode = () => setStationMode(getSavedStationMode());
    window.addEventListener("storage", syncMode);
    window.addEventListener(STATION_MODE_EVENT, syncMode);
    return () => {
      window.removeEventListener("storage", syncMode);
      window.removeEventListener(STATION_MODE_EVENT, syncMode);
    };
  }, []);

  useEffect(() => {
    if (isStationModeRoute || isCloudPlatformRoute || !stationModeLocked) return;
    if (routeAllowedByStationMode) return;
    navigate(getRouteForStationMode(stationMode), { replace: true });
  }, [isStationModeRoute, isCloudPlatformRoute, stationModeLocked, routeAllowedByStationMode, stationMode, navigate]);

  useEffect(() => {
    if (isStationModeRoute) {
      if (!stationModeRouteUnlockedRef.current) {
        setStationModePinOpen(true);
      }
      return;
    }
    stationModeRouteUnlockedRef.current = false;
    setStationModePinOpen(false);
  }, [isStationModeRoute]);

  useEffect(() => {
    if (isHome) {
      setAllowedGroup(null);
      sessionStorage.removeItem("pos_allowed_group");
      clearCurrentUser();
    }
  }, [isHome]);

  useEffect(() => {
    const stored = sessionStorage.getItem("pos_allowed_group");
    if (stored && stored !== allowedGroup) {
      setAllowedGroup(stored);
    }
  }, [location.pathname, allowedGroup]);

  return (
    <>
      {needsGate ? (
        <PinGate
          open
          language={language}
          title={t("enter_access_code", language)}
          onSuccess={() => {
            setAllowedGroup(currentGroup);
            sessionStorage.setItem("pos_allowed_group", currentGroup);
          }}
          onCancel={() => goBackOrHome(navigate)}
        />
      ) : (
        <>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/station-mode" element={<StationModeSetup />} />
            <Route path="/pos/:mode" element={<PosTerminal />} />
            <Route path="/tables" element={<TablesFloor />} />
            <Route path="/menu" element={<MenuManager />} />
            <Route path="/inventory" element={<InventoryManager />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/kitchen" element={<KitchenScreen />} />
            <Route path="/kitchen/expo" element={<KitchenExpo />} />
            <Route path="/online-orders" element={<OnlineOrders />} />
            <Route path="/reports" element={<ReportsDashboard />} />
            <Route path="/owner" element={<OwnerApp />} />
            <Route path="/hostess" element={<HostessBoard />} />
            <Route path="/operations" element={<OperationsCenter />} />
            <Route path="/settlement" element={<SettlementPage />} />
            <Route path="/timeclock" element={<TimeClockPage />} />
            <Route path="/cash" element={<CashManager />} />
            <Route path="/staff" element={<StaffManager />} />
            <Route path="/settings/hardware" element={<HardwareSettings />} />
            <Route path="/back-office" element={<BackOfficeHome />} />
            <Route path="/settings/store" element={<StoreSettings />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/settings/stations" element={<StationSettings />} />
            <Route path="/settings/kitchen-display" element={<KitchenDisplaySettings />} />
            <Route path="/settings/table-setup" element={<TableSetup />} />
            <Route path="/settings/house-accounts" element={<HouseAccounts />} />
            <Route path="/settings/maintenance" element={<Maintenance />} />
            <Route path="/settings/data-source" element={<DataSource />} />
            <Route path="/settings/payments" element={<PaymentsSettings />} />
            <Route path="/settings/cloud-stores" element={<CloudStores />} />
            <Route path="/cloud/platform" element={<CloudStores />} />
            <Route path="/cloud/platform/hierarchy" element={<CloudStores />} />
            <Route path="/settings/cloud-network" element={<CloudStoreNetwork />} />
            <Route path="/cloud/platform/network" element={<CloudStoreNetwork />} />
            <Route path="/settings/cloud-sync" element={<CloudStoreSync />} />
            <Route path="/cloud/platform/sync" element={<CloudStoreSync />} />
            <Route path="/settings/data" element={<DataTransfer />} />
            <Route path="/settings/payroll" element={<Payroll />} />
            <Route path="/settings/support" element={<Support />} />
            <Route path="/settings/manual" element={<SystemManual />} />
            <Route path="/settings/help/server-connection" element={<ServerConnectionGuide />} />
            <Route path="/settings/about" element={<About />} />
            <Route path="/settings/online-orders" element={<OnlineOrdersSettings />} />
            <Route path="/settings" element={<FeaturePlaceholder />} />
            <Route path="/feature/:feature" element={<FeaturePlaceholder />} />
          </Routes>
          <StationTypeFloat />
          <HomeFloat stationMode={stationMode} />
          <PinGate
            open={stationModePinOpen}
            language={language}
            title={t("manager_pin_change_station_type", language)}
            onSuccess={() => {
              stationModeRouteUnlockedRef.current = true;
              setStationModePinOpen(false);
            }}
            onCancel={() => {
              stationModeRouteUnlockedRef.current = false;
              setStationModePinOpen(false);
              goBackOrHome(navigate);
            }}
          />
        </>
      )}
    </>
  );
}

function StationTypeFloat() {
  const navigate = useNavigate();
  const location = useLocation();
  const language = useAppLanguage();
  const isCloudPlatformRoute =
    location.pathname.startsWith("/cloud/platform") || location.pathname.startsWith("/settings/cloud-");

  if (location.pathname === "/station-mode" || isCloudPlatformRoute) return null;

  return (
    <button
      type="button"
      className="station-type-float"
      onClick={() => navigate("/station-mode")}
      aria-label={t("change_station_type", language)}
    >
      {t("change_station_type", language)}
    </button>
  );
}

function HomeFloat({ stationMode }: { stationMode: StationMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const language = useAppLanguage();
  const isCloudPlatformRoute =
    location.pathname.startsWith("/cloud/platform") || location.pathname.startsWith("/settings/cloud-");
  const hideMainForScreen =
    location.pathname === "/hostess" ||
    location.pathname === "/kitchen" ||
    location.pathname === "/kitchen/expo";
  const hideForRoute =
    location.pathname === "/" ||
    isCloudPlatformRoute ||
    location.pathname.startsWith("/pos/") ||
    hideMainForScreen ||
    (stationMode !== "full" && location.pathname !== "/station-mode");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [dock, setDock] = useState<{ top?: number; right?: number; bottom?: number; left?: number }>({
    right: 20,
    bottom: 20
  });

  const updateDock = useCallback(() => {
    if (hideForRoute) return;
    const button = buttonRef.current;
    if (!button) return;

    const overlayOpen = Boolean(document.querySelector(".terminal-recall"));
    setHidden(overlayOpen);
    if (overlayOpen) return;

    const rect = button.getBoundingClientRect();
    const width = Math.max(120, Math.round(rect.width || button.offsetWidth || 0));
    const height = Math.max(48, Math.round(rect.height || button.offsetHeight || 0));
    const mobile = window.innerWidth <= 600;
    const edge = mobile ? 12 : 20;
    const topOffset = mobile ? 80 : 88;
    const candidates: Array<{ top?: number; right?: number; bottom?: number; left?: number }> = [
      { right: edge, top: topOffset },
      { left: edge, top: topOffset },
      { right: edge, bottom: edge },
      { left: edge, bottom: edge },
      { right: edge, top: Math.max(topOffset, Math.round(window.innerHeight * 0.36)) },
      { left: edge, top: Math.max(topOffset, Math.round(window.innerHeight * 0.36)) }
    ];

    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input, select, textarea')
    ).filter((element) => {
      if (element === button || button.contains(element)) return false;
      if (element.closest(".home-float")) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
      const r = element.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
      return true;
    });

    let best = candidates[0];
    let bestOverlap = Number.POSITIVE_INFINITY;
    let bestDistance = -1;

    for (const candidate of candidates) {
      const left = typeof candidate.left === "number" ? candidate.left : window.innerWidth - (candidate.right ?? edge) - width;
      const top = typeof candidate.top === "number" ? candidate.top : window.innerHeight - (candidate.bottom ?? edge) - height;
      const right = left + width;
      const bottom = top + height;
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      let overlap = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const control of controls) {
        const r = control.getBoundingClientRect();
        const overlapW = Math.max(0, Math.min(right, r.right) - Math.max(left, r.left));
        const overlapH = Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top));
        overlap += overlapW * overlapH;

        const dx =
          centerX < r.left ? r.left - centerX : centerX > r.right ? centerX - r.right : 0;
        const dy =
          centerY < r.top ? r.top - centerY : centerY > r.bottom ? centerY - r.bottom : 0;
        const distance = Math.hypot(dx, dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
        }
      }
      if (!Number.isFinite(nearestDistance)) {
        nearestDistance = Number.MAX_SAFE_INTEGER;
      }

      if (
        overlap < bestOverlap ||
        (overlap === bestOverlap && nearestDistance > bestDistance)
      ) {
        bestOverlap = overlap;
        bestDistance = nearestDistance;
        best = candidate;
      }
    }

    setDock(best);
  }, [hideForRoute]);

  const scheduleDock = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateDock();
    });
  }, [updateDock]);

  useEffect(() => {
    if (hideForRoute) return;
    scheduleDock();
    const late = window.setTimeout(scheduleDock, 180);
    window.addEventListener("resize", scheduleDock);
    window.addEventListener("scroll", scheduleDock, true);
    const observer = new MutationObserver(() => scheduleDock());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("resize", scheduleDock);
      window.removeEventListener("scroll", scheduleDock, true);
      observer.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [hideForRoute, location.pathname, scheduleDock]);

  if (hideForRoute || hidden) return null;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="home-float"
      style={{
        top: typeof dock.top === "number" ? `${dock.top}px` : undefined,
        right: typeof dock.right === "number" ? `${dock.right}px` : undefined,
        bottom: typeof dock.bottom === "number" ? `${dock.bottom}px` : undefined,
        left: typeof dock.left === "number" ? `${dock.left}px` : undefined
      }}
      onClick={() => goBackOrHome(navigate)}
      aria-label={t("back_to_previous_screen", language)}
    >
      {t("main_screen", language)}
    </button>
  );
}
