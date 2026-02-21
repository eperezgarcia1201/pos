import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { localeForLanguage, t, useAppLanguage } from "../lib/i18n";
import { clearCurrentUser, getCurrentUser, setCurrentUser as persistCurrentUser, type SessionUser } from "../lib/session";

type DashboardTile = {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  icon: string;
  tone: "blue" | "rose" | "violet" | "amber" | "teal" | "slate";
};

type DashboardSection = {
  id: string;
  title: string;
  tiles: DashboardTile[];
};

type MenuLink = { labelKey: string; route?: string; action?: () => void; children?: MenuLink[] };

type UserSummary = {
  id: string;
  active?: boolean;
};

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function DashboardIcon({ type }: { type: string }) {
  switch (type) {
    case "store":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="10" y="16" width="44" height="34" rx="7" />
          <path d="M10 26h44" />
          <path d="M24 34h16v16H24z" />
        </svg>
      );
    case "security":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M32 10l18 6v14c0 12-8 20-18 24-10-4-18-12-18-24V16z" />
          <path d="M24 32l6 6 12-12" />
        </svg>
      );
    case "station":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="14" y="16" width="36" height="24" rx="3" />
          <rect x="24" y="42" width="16" height="6" rx="2" />
        </svg>
      );
    case "tables":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="18" y="16" width="28" height="32" rx="3" />
          <path d="M18 27h28" />
          <path d="M18 38h28" />
          <path d="M32 16v32" />
        </svg>
      );
    case "kitchen":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M18 10v20" />
          <path d="M24 10v20" />
          <path d="M30 10v20" />
          <path d="M42 10v40" />
          <path d="M42 32h6" />
        </svg>
      );
    case "employees":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="24" cy="24" r="7" />
          <circle cx="42" cy="22" r="6" />
          <path d="M12 48c2-8 7-13 12-13s10 5 12 13" />
          <path d="M32 48c1-6 5-10 10-10s9 4 10 10" />
        </svg>
      );
    case "house":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="10" y="18" width="44" height="28" rx="4" />
          <path d="M18 32h10" />
          <path d="M38 32h8" />
        </svg>
      );
    case "inventory":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M32 10l18 10-18 10-18-10z" />
          <path d="M14 20v20l18 10 18-10V20" />
          <path d="M32 30v20" />
        </svg>
      );
    case "data":
      return (
        <svg viewBox="0 0 64 64">
          <ellipse cx="32" cy="18" rx="16" ry="6" />
          <path d="M16 18v22c0 4 7 8 16 8s16-4 16-8V18" />
        </svg>
      );
    case "backup":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M32 14v24" />
          <path d="M24 28l8-8 8 8" />
          <rect x="14" y="36" width="36" height="14" rx="4" />
        </svg>
      );
    case "compact":
      return (
        <svg viewBox="0 0 64 64">
          <ellipse cx="32" cy="18" rx="16" ry="6" />
          <path d="M16 18v18c0 4 7 8 16 8s16-4 16-8V18" />
          <path d="M20 40h24" />
        </svg>
      );
    case "logs":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="16" y="12" width="32" height="40" rx="4" />
          <path d="M24 24h16" />
          <path d="M24 32h16" />
          <path d="M24 40h10" />
        </svg>
      );
    case "money":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="10" y="18" width="44" height="28" rx="4" />
          <circle cx="32" cy="32" r="8" />
          <path d="M20 26h6" />
          <path d="M38 38h6" />
        </svg>
      );
    case "tickets":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M14 18h36a4 4 0 0 1 4 4v8a4 4 0 0 0-4 4 4 4 0 0 0 4 4v8a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-8a4 4 0 0 0 4-4 4 4 0 0 0-4-4v-8a4 4 0 0 1 4-4z" />
          <path d="M26 24h14" />
          <path d="M26 32h14" />
          <path d="M26 40h10" />
        </svg>
      );
    case "online":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="22" cy="28" r="7" />
          <circle cx="42" cy="24" r="6" />
          <path d="M10 48c2-8 7-13 12-13s10 5 12 13" />
          <circle cx="50" cy="44" r="5" />
        </svg>
      );
    case "sync":
      return (
        <svg viewBox="0 0 64 64">
          <ellipse cx="32" cy="18" rx="16" ry="6" />
          <path d="M16 18v20c0 4 7 8 16 8s16-4 16-8V18" />
          <path d="M24 50h16" />
        </svg>
      );
    default:
      return null;
  }
}

export default function BackOfficeHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const language = useAppLanguage();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(() => getCurrentUser());
  const [profileOpen, setProfileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<{ database: string; host: string } | null>(null);
  const [kpis, setKpis] = useState({
    grossSales: 0,
    tickets: 0,
    activeEmployees: 0,
    syncedRecords: 0
  });
  const [locationName, setLocationName] = useState("Downtown Location");
  const [lastSync, setLastSync] = useState(() => new Date());

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const impersonationToken = query.get("impersonationToken");
    if (!impersonationToken) return;

    let cancelled = false;
    const applyImpersonation = async () => {
      setImpersonating(true);
      setImpersonationError(null);
      try {
        const result = (await apiFetch("/auth/cloud-impersonate", {
          method: "POST",
          body: JSON.stringify({ token: impersonationToken })
        })) as { token: string; user: SessionUser };

        if (cancelled) return;
        const sessionUser: SessionUser = { ...result.user, token: result.token };
        persistCurrentUser(sessionUser);
        setCurrentUser(sessionUser);
        sessionStorage.setItem("pos_allowed_group", "back-office");
        navigate("/back-office", { replace: true });
      } catch (err) {
        if (cancelled) return;
        setImpersonationError(err instanceof Error ? err.message : "Unable to impersonate this customer back office.");
      } finally {
        if (!cancelled) setImpersonating(false);
      }
    };

    void applyImpersonation();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setLastSync(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      const range = monthRange();
      const [backup, source, store, sales, openOrders, users] = await Promise.all([
        apiFetch("/settings/last_backup").catch(() => null),
        apiFetch("/maintenance/data-source").catch(() => null),
        apiFetch("/settings/store").catch(() => null),
        apiFetch("/reports/sales-summary").catch(() => null),
        apiFetch(`/reports/open-orders?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`).catch(() => []),
        apiFetch("/users").catch(() => [])
      ]);

      if (backup?.value?.at) {
        setLastBackupAt(new Date(backup.value.at));
      }
      if (source?.database) {
        setDataSource({ database: String(source.database), host: String(source.host || "localhost") });
      }

      const grossSales = Number(sales?.grossSales || 0);
      const tickets = Array.isArray(openOrders) ? openOrders.length : 0;
      const activeEmployees = Array.isArray(users)
        ? users.filter((entry: UserSummary) => entry.active !== false).length
        : 0;
      setKpis({
        grossSales,
        tickets,
        activeEmployees,
        syncedRecords: Math.max(0, tickets + activeEmployees)
      });
      const storeName = String(store?.value?.name || "").trim();
      setLocationName(storeName || "Downtown Location");
    };

    loadDashboard().catch(() => null);
  }, []);

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeForLanguage(language), {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2
      }),
    [language]
  );

  const fileMenu: MenuLink[] = [
    { labelKey: "training_mode", route: "/settings/security" },
    { labelKey: "data_source", route: "/settings/data-source" },
    { labelKey: "import_export_data", route: "/settings/data" },
    { labelKey: "compact_database", route: "/settings/maintenance" },
    { labelKey: "backup_database", route: "/settings/maintenance" },
    { labelKey: "return_to_pos", route: "/" },
    { labelKey: "exit_program", route: "/" }
  ];

  const setupMenu: MenuLink[] = [
    { labelKey: "general_settings", route: "/settings/store" },
    { labelKey: "table_setup", route: "/settings/table-setup" },
    { labelKey: "employee_setup", route: "/staff" },
    {
      labelKey: "menu_setup_item",
      children: [
        { labelKey: "menu_categories", route: "/menu?section=categories" },
        { labelKey: "pizza_builder_setup", route: "/menu?section=modifiers" },
        { labelKey: "modifier_builder_setup", route: "/menu?section=modifiers" },
        { labelKey: "menu_groups", route: "/menu?section=groups" },
        { labelKey: "menu_items", route: "/menu?section=items" },
        { labelKey: "menu_item_auto_prices", route: "/menu?section=prices" },
        { labelKey: "menu_modifiers", route: "/menu?section=modifiers" },
        { labelKey: "forced_modifiers", route: "/menu?section=forced" }
      ]
    },
    { labelKey: "inventory_setup", route: "/inventory" },
    { labelKey: "kitchen_display_menu", route: "/settings/kitchen-display" },
    { labelKey: "expo_screen", route: "/kitchen/expo" }
  ];

  const activitiesMenu: MenuLink[] = [
    { labelKey: "general_activities", route: "/orders" },
    { labelKey: "customer_activities", route: "/settings/house-accounts" },
    { labelKey: "inventory_activities", route: "/inventory" },
    { labelKey: "maintenance_activities", route: "/settings/maintenance" },
    { labelKey: "third_party_add_ins", route: "/settings/payments" }
  ];

  const reportsMenu: MenuLink[] = [
    { labelKey: "daily_sales", route: "/reports?view=daily-sales" },
    { labelKey: "server_gratuity", route: "/reports?view=server-gratuity" },
    { labelKey: "open_orders", route: "/reports?view=open-orders" },
    { labelKey: "sales_per_item", route: "/reports?view=sales-per-item" },
    { labelKey: "sales_per_category", route: "/reports?view=sales-per-category" },
    { labelKey: "filter_by_month", route: "/reports?view=month-filter" }
  ];

  const helpMenu: MenuLink[] = [
    { labelKey: "server_connection_guide", route: "/settings/help/server-connection" },
    { labelKey: "user_manual", route: "/settings/manual" },
    { labelKey: "support", route: "/settings/support" },
    { labelKey: "about", route: "/settings/about" }
  ];

  const onlineOrdersMenu: MenuLink[] = [
    { labelKey: "order_feed", route: "/online-orders" },
    { labelKey: "integration_settings", route: "/settings/online-orders" }
  ];

  const menus = useMemo(
    () => [
      { labelKey: "menu_file", items: fileMenu },
      { labelKey: "menu_setup", items: setupMenu },
      { labelKey: "menu_activities", items: activitiesMenu },
      { labelKey: "menu_reports", items: reportsMenu },
      { labelKey: "menu_help", items: helpMenu },
      { labelKey: "menu_online_orders", items: onlineOrdersMenu }
    ],
    []
  );

  const sections: DashboardSection[] = [
    {
      id: "configuration",
      title: "Configuration",
      tiles: [
        {
          id: "store",
          title: t("store_settings", language),
          subtitle: "Manage location, taxes, receipt setup",
          route: "/settings/store",
          icon: "store",
          tone: "blue"
        },
        {
          id: "security",
          title: t("security_settings", language),
          subtitle: "Manage passwords, users, permissions",
          route: "/settings/security",
          icon: "security",
          tone: "rose"
        },
        {
          id: "station",
          title: t("station_settings", language),
          subtitle: "Configure terminals and printers",
          route: "/settings/stations",
          icon: "station",
          tone: "violet"
        },
        {
          id: "tables",
          title: t("table_setup", language),
          subtitle: "Define tables and dining areas",
          route: "/settings/table-setup",
          icon: "tables",
          tone: "amber"
        }
      ]
    },
    {
      id: "operations",
      title: "Operations",
      tiles: [
        {
          id: "kitchen",
          title: t("kitchen_display", language),
          subtitle: "Manage the kitchen display system",
          route: "/settings/kitchen-display",
          icon: "kitchen",
          tone: "blue"
        },
        {
          id: "employees",
          title: "Employees",
          subtitle: "Add or manage staff profiles, payroll",
          route: "/staff",
          icon: "employees",
          tone: "teal"
        },
        {
          id: "house",
          title: "House Accounts",
          subtitle: "Setup and maintain charge accounts",
          route: "/settings/house-accounts",
          icon: "house",
          tone: "amber"
        },
        {
          id: "inventory",
          title: "Inventory",
          subtitle: "Receive and manage stock items",
          route: "/inventory",
          icon: "inventory",
          tone: "teal"
        }
      ]
    },
    {
      id: "system",
      title: "System",
      tiles: [
        {
          id: "data",
          title: t("data_source", language),
          subtitle: "Manage database connections",
          route: "/settings/data-source",
          icon: "data",
          tone: "violet"
        },
        {
          id: "backup",
          title: t("backup_database", language),
          subtitle: "Backup and restore your database",
          route: "/settings/maintenance",
          icon: "backup",
          tone: "blue"
        },
        {
          id: "compact",
          title: t("compact_database", language),
          subtitle: "Optimize your database for performance",
          route: "/settings/maintenance",
          icon: "compact",
          tone: "teal"
        },
        {
          id: "logs",
          title: "Logs",
          subtitle: "Review system and error logs",
          route: "/feature/logs",
          icon: "logs",
          tone: "violet"
        },
        {
          id: "cloudStores",
          title: "Cloud Platform",
          subtitle: "Manage owner, reseller, tenant, and multi-location hierarchy",
          route: "/settings/cloud-stores",
          icon: "store",
          tone: "blue"
        },
        {
          id: "cloudNetwork",
          title: "Cloud Store Network",
          subtitle: "Dedicated onsite server mapping by tenant, reseller, and node status",
          route: "/settings/cloud-network",
          icon: "sync",
          tone: "violet"
        },
        {
          id: "cloudSync",
          title: "Cloud Sync",
          subtitle: "Publish revisions and monitor command queues",
          route: "/settings/cloud-sync",
          icon: "sync",
          tone: "teal"
        }
      ]
    }
  ];

  return (
    <div
      className="bo-shell bo-dashboard-shell"
      onClick={() => {
        setProfileOpen(false);
        setOpenMenu(null);
        setOpenSubMenu(null);
      }}
    >
      <header className="bo-topbar">
        <div className="bo-top-left">
          <div className="bo-app-brand">
            <img className="bo-app-brand-logo" src="/branding/websys-logo.svg" alt="WebSys POS" />
          </div>
          <button type="button" className="bo-context-btn">
            {t("back_office", language)}
            <span aria-hidden="true">▾</span>
          </button>
        </div>

        <div className="bo-top-right">
          <button type="button" className="bo-settings-shortcut" onClick={() => navigate("/settings/store")}>
            {t("store_settings", language)}
          </button>
          <button type="button" className="bo-settings-shortcut alt" onClick={() => navigate("/settings/payments")}>
            {t("payments_settings", language)}
          </button>
          <button type="button" className="bo-icon-btn" aria-label="Notifications">
            🔔
          </button>
          <button type="button" className="bo-location-btn">
            <span aria-hidden="true">📍</span>
            <span>{locationName}</span>
            <span aria-hidden="true">▾</span>
          </button>
          <div className="bo-profile-wrap">
            <button
              type="button"
              className="bo-profile-trigger"
              onClick={(event) => {
                event.stopPropagation();
                setProfileOpen((prev) => !prev);
              }}
            >
              <span className="bo-profile-avatar">
                {(currentUser?.displayName || currentUser?.username || "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="bo-profile-name">
                {currentUser?.displayName || currentUser?.username || t("no_user", language)}
              </span>
              <span aria-hidden="true">▾</span>
            </button>

            {profileOpen && (
              <div className="bo-profile-menu" onClick={(event) => event.stopPropagation()}>
                <div className="bo-profile-head">
                  <strong>{currentUser?.displayName || currentUser?.username || t("no_user", language)}</strong>
                  <span>{currentUser?.username ? `${currentUser.username}@websyspos.com` : "admin@websyspos.com"}</span>
                </div>
                <button type="button" onClick={() => navigate("/staff")}>Profile</button>
                <button
                  type="button"
                  onClick={() => {
                    clearCurrentUser();
                    sessionStorage.removeItem("pos_allowed_group");
                    navigate("/");
                  }}
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {impersonating ? (
        <div className="screen-note" style={{ margin: "8px 16px 0" }}>
          Signing into customer back office...
        </div>
      ) : null}
      {impersonationError ? (
        <div className="screen-note" style={{ margin: "8px 16px 0", borderColor: "rgba(239, 68, 68, 0.45)", color: "#fca5a5" }}>
          {impersonationError}
        </div>
      ) : null}

      <nav className="bo-menu bo-dashboard-menu" onClick={(event) => event.stopPropagation()}>
        <div className="bo-menu-items bo-dashboard-menu-items">
          {menus.map((menu) => (
            <div
              key={menu.labelKey}
              className="bo-menu-item"
              onMouseEnter={() => {
                setOpenMenu(menu.labelKey);
                setOpenSubMenu(null);
              }}
              onMouseLeave={() => {
                setOpenMenu((prev) => (prev === menu.labelKey ? null : prev));
                setOpenSubMenu(null);
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenu((prev) => (prev === menu.labelKey ? null : menu.labelKey));
                  setOpenSubMenu(null);
                }}
              >
                {t(menu.labelKey, language)}
              </button>
              <div
                className={openMenu === menu.labelKey ? "bo-dropdown open" : "bo-dropdown"}
                onClick={(event) => event.stopPropagation()}
              >
                {menu.items.map((item) =>
                  item.children ? (
                    <div
                      key={item.labelKey}
                      className={`bo-submenu-wrap ${openSubMenu === item.labelKey ? "open" : ""}`}
                      onMouseEnter={() => setOpenSubMenu(item.labelKey)}
                      onMouseLeave={() =>
                        setOpenSubMenu((prev) => (prev === item.labelKey ? null : prev))
                      }
                    >
                      <button
                        type="button"
                        className="bo-submenu-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenSubMenu((prev) => (prev === item.labelKey ? null : item.labelKey));
                        }}
                      >
                        {t(item.labelKey, language)}
                        <span className="bo-submenu-arrow">›</span>
                      </button>
                      <div className="bo-submenu" onClick={(event) => event.stopPropagation()}>
                        {item.children.map((child) => (
                          <button
                            key={child.labelKey}
                            type="button"
                            onClick={() => {
                              if (child.action) child.action();
                              if (child.route) navigate(child.route);
                              setOpenMenu(null);
                              setOpenSubMenu(null);
                            }}
                          >
                            {t(child.labelKey, language)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      key={item.labelKey}
                      type="button"
                      onClick={() => {
                        if (item.action) item.action();
                        if (item.route) navigate(item.route);
                        setOpenMenu(null);
                        setOpenSubMenu(null);
                      }}
                    >
                      {t(item.labelKey, language)}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <main className="bo-dashboard">
        <section className="bo-kpi-grid">
          <article className="bo-kpi-card">
            <div className="bo-kpi-icon tone-blue">
              <DashboardIcon type="money" />
            </div>
            <div>
              <h3>{moneyFormatter.format(kpis.grossSales)}</h3>
              <p>Since yesterday</p>
            </div>
            <span className="bo-kpi-pill">+23%</span>
          </article>
          <article className="bo-kpi-card">
            <div className="bo-kpi-icon tone-violet">
              <DashboardIcon type="tickets" />
            </div>
            <div>
              <h3>{kpis.tickets} Tickets</h3>
              <p>Open in selected range</p>
            </div>
          </article>
          <article className="bo-kpi-card">
            <div className="bo-kpi-icon tone-teal">
              <DashboardIcon type="online" />
            </div>
            <div>
              <h3>Active Employees</h3>
              <p>
                <span className="bo-online-dot" />
                {kpis.activeEmployees} Online
              </p>
            </div>
          </article>
          <article className="bo-kpi-card">
            <div className="bo-kpi-icon tone-amber">
              <DashboardIcon type="sync" />
            </div>
            <div>
              <h3>{kpis.syncedRecords} Synced</h3>
              <p>Records synced locally</p>
            </div>
          </article>
        </section>

        {sections.map((section) => (
          <section key={section.id} className="bo-section">
            <h2>{section.title}</h2>
            <div className="bo-section-grid">
              {section.tiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className="bo-dashboard-card"
                  onClick={() => navigate(tile.route)}
                >
                  <span className={`bo-card-icon tone-${tile.tone}`}>
                    <DashboardIcon type={tile.icon} />
                  </span>
                  <span className="bo-card-copy">
                    <strong>{tile.title}</strong>
                    <small>{tile.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="bo-status">
        <span>
          {lastBackupAt
            ? t("last_backup", language, { value: lastBackupAt.toLocaleString(localeForLanguage(language)) })
            : t("backup_not_performed", language)}
        </span>
        <span>
          {dataSource
            ? t("data_source_label", language, { database: dataSource.database, host: dataSource.host })
            : t("data_source_unavailable", language)}
        </span>
        <span>{t("last_sync", language, { value: lastSync.toLocaleString(localeForLanguage(language)) })}</span>
      </footer>
    </div>
  );
}
