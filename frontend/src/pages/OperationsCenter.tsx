import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type CategoryId =
  | "receive-payments"
  | "revenue-center"
  | "frequent-diners"
  | "in-house-charge"
  | "inventory-activities"
  | "other-tools";

type Tile = {
  id: string;
  label: string;
  icon?: string;
  route?: string;
  action?: () => void;
  empty?: boolean;
};

const categories: Array<{ id: CategoryId; label: string }> = [
  { id: "receive-payments", label: "Receive Payments" },
  { id: "revenue-center", label: "Revenue Center" },
  { id: "frequent-diners", label: "Frequent Diners" },
  { id: "in-house-charge", label: "In House Charge" },
  { id: "inventory-activities", label: "Inventory Activities" },
  { id: "other-tools", label: "Other Tools" }
];

const icon = (name: string) => `/legacy-icons/${name}`;

const icons = {
  callerLog: icon("callreceive.png"),
  callerSwitch: icon("call.png"),
  calculator: icon("quick_setting.png"),
  training: icon("cooking-instruction.png"),
  assignTable: icon("split.png"),
  addCash: icon("clear_cash.png"),
  incident: icon("notification_on.png"),
  driver: icon("order.png"),
  empWorking: icon("user.png"),
  schedule: icon("clock_out.png"),
  openOrders: icon("new_ticket.png"),
  mediaOpen: icon("next.png"),
  mediaClear: icon("clear.png"),
  mediaOptions: icon("quick_setting.png"),
  mediaClose: icon("minus.png"),
  mediaExit: icon("shutdown.png"),
  menuItemSalesByCategory: icon("menugreat.png"),
  salesByMenuItem: icon("order.png"),
  salesByCategory: icon("print.png"),
  serverGratuity: icon("pay.png"),
  closingReport: icon("print.png"),
  giftCertificates: icon("pay.png"),
  reopenCashier: icon("log_in.png"),
  customerCredit: icon("user.png"),
  reopenDeposit: icon("refresh-16.png"),
  bankReport: icon("order.png"),
  orderPayment: icon("settle_ticket.png"),
  registerReport: icon("other_functions.png"),
  badCheck: icon("notification_on.png"),
  breakMissed: icon("notification_off.png"),
  bankDeposit: icon("clear_cash.png"),
  dailyReceipt: icon("print.png"),
  closeBatch: icon("finish.png"),
  receivePayments: icon("pay.png"),
  frequentDiners: icon("order.png"),
  inHouseCharge: icon("order.png"),
  inventory: icon("order.png")
};

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function OperationsCenter() {
  const navigate = useNavigate();
  const [active, setActive] = useState<CategoryId>("revenue-center");
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState({
    openOrders: 0,
    gratuityServers: 0,
    openDrawers: 0,
    lowStockItems: 0
  });

  useEffect(() => {
    const { start, end } = monthRange();
    (async () => {
      try {
        const [openOrders, gratuity, drawers, lowStock] = await Promise.all([
          apiFetch(`/reports/open-orders?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).catch(
            () => []
          ),
          apiFetch(`/reports/server-gratuity?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).catch(
            () => []
          ),
          apiFetch("/cash/drawers").catch(() => []),
          apiFetch("/reports/low-stock").catch(() => [])
        ]);

        setStats({
          openOrders: Array.isArray(openOrders) ? openOrders.length : 0,
          gratuityServers: Array.isArray(gratuity) ? gratuity.length : 0,
          openDrawers: Array.isArray(drawers)
            ? drawers.filter((drawer: { status?: string }) => drawer.status === "OPEN").length
            : 0,
          lowStockItems: Array.isArray(lowStock) ? lowStock.length : 0
        });
      } catch {
        // keep defaults
      }
    })();
  }, []);

  const launch = (tile: Tile) => {
    if (tile.empty) return;
    setNotice(null);
    if (tile.action) {
      tile.action();
      return;
    }
    if (tile.route) {
      navigate(tile.route);
      return;
    }
    setNotice(`${tile.label} is not fully implemented yet. I routed this tile and can wire the module next.`);
  };

  const byCategory = useMemo<Record<CategoryId, Tile[]>>(
    () => ({
      "receive-payments": [
        { id: "recv-1", label: "Open Orders", icon: icons.receivePayments, route: "/orders?filter=OPEN" },
        { id: "recv-2", label: "Settlement", icon: icons.closeBatch, route: "/settlement" },
        { id: "recv-3", label: `Cash Drawer (${stats.openDrawers})`, icon: icons.addCash, route: "/cash" },
        { id: "recv-4", label: "Cashier Out", icon: icons.reopenCashier, route: "/cash?mode=cashier-out" }
      ],
      "revenue-center": [
        { id: "rev-1", label: "Closing Report", icon: icons.closingReport, route: "/reports?view=daily-sales" },
        { id: "rev-2", label: "Gift Certificate List", icon: icons.giftCertificates, route: "/feature/gift-certificates" },
        { id: "rev-3", label: "Re-Open Cashier", icon: icons.reopenCashier, route: "/cash?mode=cashier-in" },

        { id: "rev-empty-1", label: "", empty: true },
        { id: "rev-4", label: "Cust. Credit List", icon: icons.customerCredit, route: "/settings/house-accounts" },
        { id: "rev-5", label: "Re-Open Deposit", icon: icons.reopenDeposit, route: "/cash" },

        { id: "rev-6", label: "Bank Report", icon: icons.bankReport, route: "/reports?view=daily-sales" },
        { id: "rev-7", label: "Order Pmt List", icon: icons.orderPayment, route: "/reports?view=daily-sales" },
        { id: "rev-empty-2", label: "", empty: true },

        { id: "rev-8", label: "Register Report", icon: icons.registerReport, route: "/reports?view=daily-sales" },
        { id: "rev-9", label: "Bad Check List", icon: icons.badCheck, route: "/feature/bad-check-list" },
        { id: "rev-10", label: "Break Missed Report", icon: icons.breakMissed, route: "/feature/break-missed-report" },

        { id: "rev-11", label: "Bank Deposit", icon: icons.bankDeposit, route: "/cash" },
        { id: "rev-12", label: "Daily Receipt Summary", icon: icons.dailyReceipt, route: "/reports?view=daily-sales" },
        { id: "rev-13", label: "Close EDC Batch", icon: icons.closeBatch, route: "/settlement" }
      ],
      "frequent-diners": [
        { id: "fd-1", label: "Frequent Diner Accounts", icon: icons.frequentDiners, route: "/settings/house-accounts" },
        { id: "fd-2", label: "Customer Activity", icon: icons.customerCredit, route: "/orders" },
        { id: "fd-3", label: `Open Credit Orders (${stats.openOrders})`, icon: icons.openOrders, route: "/orders?filter=OPEN" }
      ],
      "in-house-charge": [
        { id: "ih-1", label: "Charge Accounts", icon: icons.inHouseCharge, route: "/settings/house-accounts" },
        { id: "ih-2", label: "Post Charge Payment", icon: icons.receivePayments, route: "/cash" },
        { id: "ih-3", label: "Charge Order List", icon: icons.orderPayment, route: "/orders" }
      ],
      "inventory-activities": [
        { id: "inv-1", label: "Inventory Dashboard", icon: icons.inventory, route: "/inventory" },
        { id: "inv-2", label: `Low Stock Report (${stats.lowStockItems})`, icon: icons.breakMissed, route: "/inventory?tab=items" },
        { id: "inv-3", label: "Purchase Orders", icon: icons.orderPayment, route: "/inventory?tab=po" }
      ],
      "other-tools": [
        { id: "ot-1", label: "Caller ID Log", icon: icons.callerLog, route: "/feature/caller-id-log" },
        { id: "ot-2", label: "Caller ID Switch", icon: icons.callerSwitch, route: "/feature/caller-id-switch" },
        { id: "ot-3", label: "Calculator", icon: icons.calculator, route: "/feature/calculator" },
        { id: "ot-4", label: "To Training Mode", icon: icons.training, route: "/settings/security" },

        { id: "ot-5", label: "Assign Table", icon: icons.assignTable, route: "/tables" },
        { id: "ot-6", label: "Add Cash To Bank", icon: icons.addCash, route: "/cash" },
        { id: "ot-7", label: "Customer Incidents", icon: icons.incident, route: "/feature/customer-incidents" },
        { id: "ot-8", label: "Driver Summary", icon: icons.driver, route: "/feature/driver-summary" },

        { id: "ot-9", label: "Emp. Still Working", icon: icons.empWorking, route: "/timeclock" },
        { id: "ot-10", label: "Edit Work Schedule", icon: icons.schedule, route: "/settings/payroll" },
        { id: "ot-11", label: "Open Order Report", icon: icons.openOrders, route: "/reports?view=open-orders" },
        { id: "ot-12", label: "Media Open", icon: icons.mediaOpen, route: "/feature/media-open" },

        { id: "ot-13", label: "Media Clear", icon: icons.mediaClear, route: "/feature/media-clear" },
        { id: "ot-14", label: "Media Options", icon: icons.mediaOptions, route: "/feature/media-options" },
        { id: "ot-15", label: "Media Close", icon: icons.mediaClose, route: "/feature/media-close" },
        { id: "ot-16", label: "Media Exit", icon: icons.mediaExit, route: "/feature/media-exit" },

        { id: "ot-17", label: "Menu Item Sales By Category", icon: icons.menuItemSalesByCategory, route: "/reports?view=sales-per-category" },
        { id: "ot-18", label: "Sales By Menu Item Report", icon: icons.salesByMenuItem, route: "/reports?view=sales-per-item" },
        { id: "ot-19", label: "Sales By Category Report", icon: icons.salesByCategory, route: "/reports?view=sales-per-category" },
        { id: "ot-20", label: `Server Gratuity Report (${stats.gratuityServers})`, icon: icons.serverGratuity, route: "/reports?view=server-gratuity" }
      ]
    }),
    [stats]
  );

  const activeTiles = byCategory[active];
  const activeTitle = categories.find((category) => category.id === active)?.label || "Operations";

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Operations Center</h2>
          <p>{activeTitle}</p>
        </div>
      </header>

      <div className="ops-layout">
        <section className="panel ops-main">
          <h3>{activeTitle}</h3>
          {notice && <div className="ops-notice">{notice}</div>}
          <div
            className={`ops-grid ${active === "other-tools" ? "ops-grid-4" : "ops-grid-3"}`}
          >
            {activeTiles.map((tile) =>
              tile.empty ? (
                <div key={tile.id} className="ops-tile ops-tile-empty" aria-hidden="true" />
              ) : (
                <button key={tile.id} type="button" className="ops-tile" onClick={() => launch(tile)}>
                  {tile.icon ? <img className="ops-tile-icon" src={tile.icon} alt="" /> : <div className="ops-tile-icon" />}
                  <div className="ops-tile-label">{tile.label}</div>
                </button>
              )
            )}
          </div>
        </section>

        <aside className="ops-side">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`ops-side-btn ${active === category.id ? "active" : ""}`}
              onClick={() => setActive(category.id)}
            >
              {category.label}
            </button>
          ))}
          <button type="button" className="ops-side-btn done" onClick={() => navigate("/")}>
            Done
          </button>
        </aside>
      </div>
    </div>
  );
}
