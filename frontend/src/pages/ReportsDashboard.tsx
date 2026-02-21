import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";

type OpenOrder = {
  id: string;
  ticketNumber?: number | null;
  orderNumber?: number | null;
  totalAmount?: number | null;
  orderType: string;
  table?: { name?: string | null } | null;
};

type ServerGratuity = {
  serverId: string;
  name: string;
  gratuity: number;
  orders: number;
};

type ItemPerformance = { menuItemId: string; name: string; qty: number; revenue: number };
type CategorySales = { category: string; revenue: number; qty: number };

function toMonthStartEnd(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getDefaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const viewTitle: Record<string, string> = {
  "daily-sales": "Daily Sales",
  "server-gratuity": "Server Gratuity",
  "open-orders": "Open Orders",
  "sales-per-item": "Sales Per Item",
  "sales-per-category": "Sales Per Category",
  "month-filter": "Filter by Month"
};

function formatMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function ticketLabel(order: OpenOrder) {
  if (typeof order.ticketNumber === "number") return `#${order.ticketNumber}`;
  if (typeof order.orderNumber === "number") return `Order ${order.orderNumber}`;
  return order.id.slice(0, 6);
}

function orderTypeLabel(orderType: string) {
  if (orderType === "DINE_IN") return "DINE_IN";
  if (orderType === "TAKEOUT") return "TAKE_OUT";
  if (orderType === "DELIVERY") return "DELIVERY";
  return orderType;
}

export default function ReportsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusView = searchParams.get("view") || "daily-sales";
  const monthFromQuery = searchParams.get("month") || getDefaultMonthValue();

  const [selectedMonth, setSelectedMonth] = useState(monthFromQuery);

  const [summary, setSummary] = useState({ paidOrders: 0, grossSales: 0 });
  const [taxSummary, setTaxSummary] = useState({ totalTax: 0 });
  const [performance, setPerformance] = useState<ItemPerformance[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [dailySales, setDailySales] = useState<{
    openingBank: number;
    totals: {
      gross: number;
      tax: number;
      discount?: number;
      discounts?: number;
      count?: number;
      paidOrders?: number;
    };
    orders: Array<{ id: string; ticketNumber?: number | null; orderNumber?: number | null; table: string | null; createdAt: string; total: number; orderType: string }>;
  }>({ openingBank: 0, totals: { gross: 0, tax: 0, discount: 0, count: 0 }, orders: [] });
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [serverGratuity, setServerGratuity] = useState<ServerGratuity[]>([]);
  const [printStatus, setPrintStatus] = useState("");

  const range = useMemo(() => toMonthStartEnd(selectedMonth), [selectedMonth]);
  const selectedMonthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, 1);
    if (!Number.isFinite(date.valueOf())) return selectedMonth;
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [selectedMonth]);
  const topCategories = useMemo(() => categorySales.slice(0, 3), [categorySales]);
  const maxCategoryRevenue = useMemo(
    () => Math.max(1, ...topCategories.map((entry) => Number(entry.revenue || 0))),
    [topCategories]
  );

  useEffect(() => {
    setSelectedMonth(monthFromQuery);
  }, [monthFromQuery]);

  useEffect(() => {
    (async () => {
      const [sales, tax, perf, categorySummary, daily, gratuity, open] = await Promise.all([
        apiFetch("/reports/sales-summary"),
        apiFetch("/reports/tax-summary"),
        apiFetch(`/reports/item-performance?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`),
        apiFetch(`/reports/category-sales?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`),
        apiFetch(`/reports/daily-sales?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`),
        apiFetch(`/reports/server-gratuity?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`),
        apiFetch(`/reports/open-orders?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`)
      ]);
      setSummary(sales);
      setTaxSummary(tax);
      setPerformance(perf);
      setCategorySales(categorySummary);
      setDailySales(daily);
      setServerGratuity(gratuity);
      setOpenOrders(open);
    })().catch(console.error);
  }, [range.start, range.end]);

  return (
    <div className="screen-shell reports-shell">
      <div className="reports-background-glow" />

      <header className="reports-topbar">
        <div>
          <h2>Reports</h2>
          <p>{viewTitle[focusView] || "Daily Sales"}</p>
        </div>
        <div className="reports-topbar-actions">
          <label htmlFor="report-month">Month</label>
          <div className="reports-month-wrap">
            <input
            id="report-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => {
              const month = event.target.value;
              setSelectedMonth(month);
              const next = new URLSearchParams(searchParams);
              next.set("month", month);
              setSearchParams(next);
            }}
          />
            <span>{selectedMonthLabel}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await apiFetch("/reports/daily-sales/print", {
                  method: "POST",
                  body: JSON.stringify({ start: range.start, end: range.end })
                });
                setPrintStatus("Report print job sent.");
              } catch (err) {
                setPrintStatus(err instanceof Error ? err.message : "Unable to print report.");
              }
            }}
          >
            Print Report
          </button>
        </div>
      </header>
      {printStatus ? <p className="reports-status">{printStatus}</p> : null}

      <div className="reports-grid">
        <section className="reports-card reports-summary">
          <h3>Sales Summary</h3>
          <div className="reports-summary-rows">
            <article>
              <span>Paid Orders</span>
              <strong>{summary.paidOrders}</strong>
            </article>
            <article>
              <span>Gross Sales</span>
              <strong>{formatMoney(summary.grossSales)}</strong>
            </article>
            <article>
              <span>Total Tax</span>
              <strong>{formatMoney(taxSummary.totalTax)}</strong>
            </article>
          </div>
        </section>

        <section className="reports-card reports-daily">
          <h3>Daily Sales</h3>
          <div className="reports-daily-cards">
            <article className="reports-chip tone-blue">
              <span>Orders</span>
              <strong>{dailySales.totals.paidOrders ?? dailySales.totals.count ?? 0}</strong>
            </article>
            <article className="reports-chip tone-green">
              <span>Gross</span>
              <strong>{formatMoney(Number(dailySales.totals.gross || 0))}</strong>
            </article>
            <article className="reports-chip tone-amber">
              <span>Tax</span>
              <strong>{formatMoney(Number(dailySales.totals.tax || 0))}</strong>
            </article>
          </div>
        </section>

        <section className="reports-card reports-gratuity">
          <h3>Server Gratuity</h3>
          <div className="reports-table compact">
            <div className="reports-table-head">
              <span>Server</span>
              <span>Orders</span>
              <span>Gratuity</span>
            </div>
            {serverGratuity.length === 0 ? (
              <div className="reports-empty">No gratuities recorded.</div>
            ) : (
              serverGratuity.slice(0, 7).map((entry) => (
                <div key={entry.serverId} className="reports-table-row">
                  <span>{entry.name}</span>
                  <span>{entry.orders}</span>
                  <span>{formatMoney(Number(entry.gratuity || 0))}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="reports-card reports-open-tickets">
          <h3>Open Tickets</h3>
          <div className="reports-table">
            <div className="reports-table-head">
              <span>Ticket</span>
              <span>Table</span>
              <span>Type</span>
              <span>Total</span>
            </div>
            {openOrders.length === 0 ? (
              <div className="reports-empty">No open tickets in range.</div>
            ) : (
              openOrders.slice(0, 10).map((order) => (
                <div key={order.id} className="reports-table-row">
                  <span>{ticketLabel(order)}</span>
                  <span>{order.table?.name ?? "-"}</span>
                  <span>{orderTypeLabel(order.orderType)}</span>
                  <span>{formatMoney(Number(order.totalAmount ?? 0))}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="reports-card reports-item-sales">
          <h3>Sales Per Item</h3>
          <div className="reports-table compact">
            <div className="reports-table-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Revenue</span>
            </div>
            {performance.length === 0 ? (
              <div className="reports-empty">No item sales in range.</div>
            ) : (
              performance.slice(0, 7).map((entry) => (
                <div key={entry.menuItemId} className="reports-table-row">
                  <span>{entry.name}</span>
                  <span>{entry.qty}</span>
                  <span>{formatMoney(entry.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="reports-card reports-category-bars">
          <h3>Sales Per Category</h3>
          {topCategories.length === 0 ? (
            <div className="reports-empty">No category sales in range.</div>
          ) : (
            <div className="reports-bars">
              {topCategories.map((entry) => (
                <div key={entry.category} className="reports-bar-row">
                  <span>{entry.category}</span>
                  <div className="reports-bar-track">
                    <div
                      className="reports-bar-fill"
                      style={{ width: `${Math.max(10, (Number(entry.revenue || 0) / maxCategoryRevenue) * 100)}%` }}
                    />
                  </div>
                  <strong>{formatMoney(Number(entry.revenue || 0))}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="reports-card reports-wide-details">
          <h3>Sales Per Category Details</h3>
          <div className="reports-table">
            <div className="reports-table-head">
              <span>Category</span>
              <span>Qty</span>
              <span>Revenue</span>
            </div>
            {categorySales.length === 0 ? (
              <div className="reports-empty">No category sales in range.</div>
            ) : (
              categorySales.map((entry) => (
                <div key={entry.category} className="reports-table-row">
                  <span>{entry.category}</span>
                  <span>{entry.qty}</span>
                  <span>{formatMoney(Number(entry.revenue || 0))}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
