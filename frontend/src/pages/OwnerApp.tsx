import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type OwnerDashboard = {
  generatedAt: string;
  date: string;
  threshold: number;
  summary: {
    paidOrders: number;
    grossSales: number;
    netSales: number;
    tax: number;
    discounts: number;
    openTickets: number;
    voidCount: number;
    voidTotal: number;
  };
  payments: Record<string, number>;
  byOrderType: Array<{ orderType: string; count: number; total: number }>;
  topItems: Array<{ menuItemId: string; name: string; qty: number; revenue: number }>;
  byCategory: Array<{ category: string; qty: number; revenue: number }>;
  openTickets: Array<{
    id: string;
    ticketNumber?: number | null;
    orderNumber?: number | null;
    status: string;
    orderType: string;
    tableName?: string | null;
    customerName?: string | null;
    serverName?: string | null;
    itemCount: number;
    totalAmount: number;
    updatedAt: string;
  }>;
  voidAlerts: Array<{
    userId: string | null;
    name: string;
    voidCount: number;
    voidTotal: number;
    lastVoidAt: string;
    tickets: Array<{ id: string; label: string; reason: string | null; total: number; at: string }>;
  }>;
};

const PAYMENT_COLORS = [
  "#5a8dff",
  "#3ec9a8",
  "#f5c947",
  "#ef7e3e",
  "#ec5f8d",
  "#9a7bff",
  "#42b9e9",
  "#6dd39a"
];

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return date.toLocaleString();
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "unknown";
  const diffMs = Date.now() - date.valueOf();
  if (diffMs < 45_000) return "just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hr ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function ticketLabel(ticket: { id: string; ticketNumber?: number | null; orderNumber?: number | null }) {
  if (typeof ticket.ticketNumber === "number") return `#${ticket.ticketNumber}`;
  if (typeof ticket.orderNumber === "number") return `Order ${ticket.orderNumber}`;
  return ticket.id.slice(0, 6);
}

function orderTypeLabel(orderType: string) {
  if (orderType === "DINE_IN") return "Dine In";
  if (orderType === "TAKEOUT") return "Takeout";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType;
}

export default function OwnerApp() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue);
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (date: string, showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      setError(null);
      const data = (await apiFetch(`/owner/dashboard?date=${encodeURIComponent(date)}`)) as OwnerDashboard;
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load owner dashboard.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard(selectedDate, true);
  }, [loadDashboard, selectedDate]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDashboard(selectedDate, false);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadDashboard, selectedDate]);

  const paymentEntries = useMemo(
    () => Object.entries(dashboard?.payments ?? {}).sort((a, b) => b[1] - a[1]),
    [dashboard]
  );

  const paymentTotal = useMemo(
    () => paymentEntries.reduce((sum, [, amount]) => sum + amount, 0),
    [paymentEntries]
  );

  const paymentSegments = useMemo(() => {
    if (paymentTotal <= 0) return [] as Array<{ method: string; amount: number; color: string; start: number; end: number }>;
    let cursor = 0;
    return paymentEntries.map(([method, amount], index) => {
      const percent = (amount / paymentTotal) * 100;
      const segment = {
        method,
        amount,
        color: PAYMENT_COLORS[index % PAYMENT_COLORS.length],
        start: cursor,
        end: cursor + percent
      };
      cursor += percent;
      return segment;
    });
  }, [paymentEntries, paymentTotal]);

  const paymentDonutBackground = useMemo(() => {
    if (paymentSegments.length === 0) {
      return "conic-gradient(from 0deg, rgba(86, 106, 145, 0.4), rgba(44, 58, 89, 0.4))";
    }
    return `conic-gradient(${paymentSegments
      .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
      .join(", ")})`;
  }, [paymentSegments]);

  const maxOrderTypeTotal = useMemo(
    () => Math.max(1, ...((dashboard?.byOrderType || []).map((entry) => entry.total))),
    [dashboard]
  );
  const maxCategoryTotal = useMemo(
    () => Math.max(1, ...((dashboard?.byCategory || []).map((entry) => entry.revenue))),
    [dashboard]
  );

  return (
    <div className="screen-shell owner-shell">
      <div className="owner-background-glow" />

      <header className="owner-topbar">
        <div>
          <h2>Owner Dashboard</h2>
          <p>Open tickets, reporting, and void abuse control.</p>
        </div>
        <div className="owner-topbar-actions">
          <label htmlFor="owner-date">Date</label>
          <input
            id="owner-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button type="button" onClick={() => void loadDashboard(selectedDate, true)}>
            Refresh
          </button>
          <button type="button" onClick={() => navigate("/reports")}>
            View Full Reports
          </button>
        </div>
      </header>

      {error ? <div className="ops-notice">{error}</div> : null}

      {loading && !dashboard ? (
        <section className="owner-card owner-loading-card">
          <p>Loading owner dashboard...</p>
        </section>
      ) : dashboard ? (
        <>
          <section className="owner-kpi-strip">
            <article className="owner-kpi-card tone-teal">
              <div className="owner-kpi-label"><span>$</span>Gross Sales</div>
              <div className="owner-kpi-value">{formatMoney(dashboard.summary.grossSales)}</div>
            </article>
            <article className="owner-kpi-card tone-green">
              <div className="owner-kpi-label"><span>$</span>Net Sales</div>
              <div className="owner-kpi-value">{formatMoney(dashboard.summary.netSales)}</div>
            </article>
            <article className="owner-kpi-card tone-amber">
              <div className="owner-kpi-label"><span>$</span>Tax</div>
              <div className="owner-kpi-value">{formatMoney(dashboard.summary.tax)}</div>
            </article>
            <article className="owner-kpi-card tone-rose">
              <div className="owner-kpi-label"><span>$</span>Discounts</div>
              <div className="owner-kpi-value">{formatMoney(dashboard.summary.discounts)}</div>
            </article>
            <article className="owner-kpi-card tone-blue owner-open-tickets-kpi">
              <div className="owner-kpi-label"><span>◈</span>Open Tickets</div>
              <div className="owner-kpi-value">{dashboard.summary.openTickets}</div>
              <div className="owner-kpi-meta">Last updated {formatRelative(dashboard.generatedAt)}</div>
            </article>
          </section>

          <div className="owner-main-grid">
            <section className="owner-card owner-open-card">
              <header className="owner-card-header">
                <h3>Open Tickets</h3>
                <span>Last updated {formatRelative(dashboard.generatedAt)}</span>
              </header>

              <div className="owner-open-table">
                <div className="owner-open-head">
                  <span>Ticket</span>
                  <span>Table</span>
                  <span>Server</span>
                  <span>Status</span>
                  <span>Items</span>
                  <span>Total</span>
                  <span></span>
                </div>
                {dashboard.openTickets.length === 0 ? (
                  <div className="owner-empty">No open tickets for this date.</div>
                ) : (
                  dashboard.openTickets.slice(0, 10).map((ticket) => (
                    <div key={ticket.id} className="owner-open-row">
                      <span>{ticketLabel(ticket)}</span>
                      <span>{ticket.tableName ?? "-"}</span>
                      <span>{ticket.serverName ?? "-"}</span>
                      <span>
                        <em className={`owner-status owner-status-${ticket.status.toLowerCase()}`}>{ticket.status}</em>
                      </span>
                      <span>{ticket.itemCount}</span>
                      <span>{formatMoney(ticket.totalAmount)}</span>
                      <span className="owner-row-arrow">›</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="owner-side-stack">
              <section className={`owner-card owner-alert-card-wrap ${dashboard.voidAlerts.length > 0 ? "warn" : ""}`}>
                <header className="owner-card-header">
                  <h3>Void Alerts</h3>
                </header>
                <p className="owner-note">Alert triggers when a person voids more than {dashboard.threshold} tickets in a day.</p>
                {dashboard.voidAlerts.length === 0 ? (
                  <div className="owner-empty">No void abuse alerts for this day.</div>
                ) : (
                  <div className="owner-alert-list">
                    {dashboard.voidAlerts.map((alert) => (
                      <article key={`${alert.userId || alert.name}-${alert.lastVoidAt}`} className="owner-alert-entry">
                        <div className="owner-alert-title">
                          <strong>{alert.name}</strong>
                          <span>{alert.voidCount} voids</span>
                        </div>
                        <div className="owner-alert-meta">
                          <span>{formatMoney(alert.voidTotal)}</span>
                          <span>{formatDateTime(alert.lastVoidAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="owner-card owner-mix-card">
                <header className="owner-card-header">
                  <h3>Payment Mix</h3>
                </header>
                <div className="owner-mix-wrap">
                  <div className="owner-mix-text">
                    {paymentEntries.length === 0 ? (
                      <>
                        <p>No captured payments.</p>
                        <small>No payments recorded yet.</small>
                      </>
                    ) : (
                      <>
                        <p>Total {formatMoney(paymentTotal)}</p>
                        <ul>
                          {paymentSegments.slice(0, 5).map((entry) => (
                            <li key={entry.method}>
                              <i style={{ background: entry.color }} />
                              <span>{entry.method}</span>
                              <strong>{formatMoney(entry.amount)}</strong>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <div className="owner-mix-donut" style={{ background: paymentDonutBackground }}>
                    <div className="owner-mix-core" />
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="owner-bottom-grid">
            <section className="owner-card">
              <header className="owner-card-header">
                <h3>Sales By Order Type</h3>
              </header>
              <div className="owner-bars">
                {dashboard.byOrderType.length === 0 ? (
                  <div className="owner-empty">No paid orders in range.</div>
                ) : (
                  dashboard.byOrderType.map((entry) => (
                    <div key={entry.orderType} className="owner-bar-row">
                      <span>{orderTypeLabel(entry.orderType)}</span>
                      <div className="owner-bar-track">
                        <div
                          className="owner-bar-fill"
                          style={{ width: `${Math.max(6, (entry.total / maxOrderTypeTotal) * 100)}%` }}
                        />
                      </div>
                      <strong>{formatMoney(entry.total)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="owner-card">
              <header className="owner-card-header">
                <h3>Top Items</h3>
              </header>
              <div className="owner-mini-table">
                <div className="owner-mini-head">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Revenue</span>
                </div>
                {dashboard.topItems.length === 0 ? (
                  <div className="owner-empty">No item sales in range.</div>
                ) : (
                  dashboard.topItems.slice(0, 7).map((item) => (
                    <div key={item.menuItemId} className="owner-mini-row">
                      <span>{item.name}</span>
                      <span>{item.qty}</span>
                      <span>{formatMoney(item.revenue)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="owner-card">
              <header className="owner-card-header">
                <h3>Sales By Category</h3>
              </header>
              <div className="owner-bars">
                {dashboard.byCategory.length === 0 ? (
                  <div className="owner-empty">No category sales in range.</div>
                ) : (
                  dashboard.byCategory.slice(0, 6).map((category) => (
                    <div key={category.category} className="owner-bar-row">
                      <span>{category.category}</span>
                      <div className="owner-bar-track">
                        <div
                          className="owner-bar-fill alt"
                          style={{ width: `${Math.max(6, (category.revenue / maxCategoryTotal) * 100)}%` }}
                        />
                      </div>
                      <strong>{formatMoney(category.revenue)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="owner-card owner-loading-card">
          <p>Owner dashboard is unavailable.</p>
        </section>
      )}
    </div>
  );
}
