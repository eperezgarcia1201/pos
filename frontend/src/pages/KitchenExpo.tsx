import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Ticket = {
  id: string;
  status: string;
  stationName?: string | null;
  createdAt: string;
  order: {
    id: string;
    ticketNumber?: number | null;
    orderNumber?: number | null;
    orderType: string;
    table?: { name: string } | null;
    server?: { displayName?: string | null; username: string } | null;
    items: Array<{ id: string; name: string | null; quantity: number; modifiers?: Array<{ id: string; name: string; quantity: number }> }>;
  };
};

const DEFAULT_DISPLAY_SETTINGS = {
  baseFontSize: 24,
  headerFontSize: 36,
  subheaderFontSize: 18,
  columnHeaderFontSize: 18,
  ticketTitleFontSize: 28,
  ticketMetaFontSize: 18,
  timeFontSize: 18,
  itemFontSize: 22,
  modifierFontSize: 20,
  pillFontSize: 16,
  buttonFontSize: 20,
  modifierColor: "#f87171",
  newColor: "#facc15",
  workingColor: "#4ade80",
  doneColor: "#cbd5f5",
  freshColor: "#22c55e",
  warnColor: "#f59e0b",
  urgentColor: "#ef4444"
};

export default function KitchenExpo() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [displaySettings, setDisplaySettings] = useState(DEFAULT_DISPLAY_SETTINGS);
  const [includeDone, setIncludeDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const baseStatuses = ["READY", "SENT", "IN_PROGRESS", "ERROR"];
    const statusList = includeDone ? [...baseStatuses, "DONE"] : baseStatuses;
    const data = await apiFetch(`/kitchen/tickets?status=${encodeURIComponent(statusList.join(","))}`);
    setTickets(data);
    setError(null);
  };

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load expo tickets.");
    });
    const timer = window.setInterval(() => {
      load().catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unable to load expo tickets.");
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [includeDone]);

  useEffect(() => {
    apiFetch("/settings/kitchen_display")
      .then((data) => {
        if (data?.value) {
          setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...data.value });
        }
      })
      .catch(() => setDisplaySettings(DEFAULT_DISPLAY_SETTINGS));
  }, []);

  const groupedOrders = useMemo(() => {
    const map = new Map<string, { order: Ticket["order"]; tickets: Ticket[]; createdAt: string }>();
    tickets.forEach((ticket) => {
      const existing = map.get(ticket.order.id);
      if (existing) {
        existing.tickets.push(ticket);
        if (ticket.createdAt < existing.createdAt) {
          existing.createdAt = ticket.createdAt;
        }
      } else {
        map.set(ticket.order.id, { order: ticket.order, tickets: [ticket], createdAt: ticket.createdAt });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [tickets]);

  const orderTypeLabel = (orderType: string) => orderType.replace(/_/g, " ").toUpperCase();
  const orderTypeClass = (orderType: string) => `order-${orderType.toLowerCase().replace(/_/g, "-")}`;
  const statusLabel = (status: string) => {
    switch (status) {
      case "SENT":
        return "Sent";
      case "IN_PROGRESS":
        return "Working";
      case "READY":
        return "Ready";
      default:
        return status.replace(/_/g, " ").toLowerCase();
    }
  };
  const statusClass = (status: string) => `status-${status.toLowerCase().replace(/_/g, "-")}`;

  return (
    <div
      className="screen-shell kitchen-shell kitchen-shell-main expo-shell"
      style={{
        ["--kitchen-base-font" as string]: `${displaySettings.baseFontSize}px`,
        ["--kitchen-header-font" as string]: `${displaySettings.headerFontSize}px`,
        ["--kitchen-subhead-font" as string]: `${displaySettings.subheaderFontSize}px`,
        ["--kitchen-column-font" as string]: `${displaySettings.columnHeaderFontSize}px`,
        ["--kitchen-ticket-title-font" as string]: `${displaySettings.ticketTitleFontSize}px`,
        ["--kitchen-ticket-meta-font" as string]: `${displaySettings.ticketMetaFontSize}px`,
        ["--kitchen-time-font" as string]: `${displaySettings.timeFontSize ?? 16}px`,
        ["--kitchen-item-font" as string]: `${displaySettings.itemFontSize}px`,
        ["--kitchen-modifier-font" as string]: `${displaySettings.modifierFontSize}px`,
        ["--kitchen-pill-font" as string]: `${displaySettings.pillFontSize}px`,
        ["--kitchen-button-font" as string]: `${displaySettings.buttonFontSize}px`,
        ["--kitchen-modifier-color" as string]: displaySettings.modifierColor,
        ["--kitchen-new-color" as string]: displaySettings.newColor,
        ["--kitchen-working-color" as string]: displaySettings.workingColor,
        ["--kitchen-done-color" as string]: displaySettings.doneColor
      }}
    >
      <div className="kitchen-stage">
        <header className="screen-header kitchen-header">
          <div>
            <h2>Expo Screen</h2>
            <p>Combine ready tickets, verify, and complete orders.</p>
          </div>
          <div className="header-actions kitchen-header-actions">
            <button
              type="button"
              className={`terminal-btn ${includeDone ? "primary" : "ghost"}`}
              onClick={() => setIncludeDone((prev) => !prev)}
            >
              {includeDone ? "Showing Completed" : "Show Completed"}
            </button>
            <button type="button" className="terminal-btn primary" onClick={load}>
              Refresh
            </button>
          </div>
        </header>

        <div className="expo-grid">
          {groupedOrders.map((group) => (
            <article key={group.order.id} className="panel kitchen-ticket expo-ticket">
              <div className="kitchen-ticket-top">
                <div className="kitchen-ticket-id">
                  <strong>
                    {group.order.ticketNumber ? `T#${group.order.ticketNumber}` : `Ticket ${group.order.id.slice(0, 6)}`}
                  </strong>
                  <span className={`pill order-type ${orderTypeClass(group.order.orderType)}`}>
                    {orderTypeLabel(group.order.orderType)}
                  </span>
                </div>
                <span className="kitchen-ticket-time">
                  {new Date(group.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="kitchen-ticket-order">
                <span>{group.order.orderNumber ? `Order #${group.order.orderNumber}` : `Order ${group.order.id.slice(0, 8)}`}</span>
                <span>{group.order.table?.name ?? "-"}</span>
                <span>{group.order.server?.displayName ?? group.order.server?.username ?? "-"}</span>
              </div>
              <div className="expo-ticket-body">
                {group.tickets.map((ticket) => (
                  <div key={ticket.id} className="expo-ticket-station">
                    <div className="expo-ticket-meta">
                      <span className="pill station-pill">{ticket.stationName || "Kitchen"}</span>
                      <span className={`pill status-pill ${statusClass(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                    </div>
                    <ul className="list">
                      {ticket.order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}x {item.name || "Item"}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <ul className="modifier-list">
                              {item.modifiers.map((mod) => (
                                <li key={mod.id}>- {mod.name}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="kitchen-ticket-actions">
                <button
                  type="button"
                  className="terminal-btn ghost"
                  onClick={async () => {
                    await Promise.all(
                      group.tickets.map((ticket) =>
                        apiFetch(`/kitchen/tickets/${ticket.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "IN_PROGRESS" })
                        })
                      )
                    );
                    await load();
                  }}
                >
                  Send Back
                </button>
                <button
                  type="button"
                  className="terminal-btn primary"
                  onClick={async () => {
                    await apiFetch(`/kitchen/orders/${group.order.id}/complete`, { method: "POST" });
                    await load();
                  }}
                >
                  Complete Order
                </button>
              </div>
            </article>
          ))}
          {groupedOrders.length === 0 && (
            <div className="panel kitchen-empty">
              <p className="hint">{error ? error : "No orders in the expo queue."}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
