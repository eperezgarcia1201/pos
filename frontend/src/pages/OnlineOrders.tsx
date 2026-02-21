import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Provider = { id: string; code: string; name: string };

type OnlineOrder = {
  id: string;
  externalId: string;
  displayId?: string | null;
  status: string;
  orderType?: string | null;
  provider: Provider;
  store?: { name: string; merchantSuppliedId: string } | null;
  posOrder?: { id: string; totalAmount?: string | number | null } | null;
  createdAt: string;
};

export default function OnlineOrders() {
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filterProvider, setFilterProvider] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    const [providerList, orderList] = await Promise.all([
      apiFetch("/integrations/providers"),
      apiFetch("/integrations/orders")
    ]);
    setProviders(providerList);
    setOrders(orderList);
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load online orders."));
  }, []);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filterProvider !== "ALL" && order.provider?.code !== filterProvider) return false;
      if (filterStatus !== "ALL" && order.status !== filterStatus) return false;
      return true;
    });
  }, [orders, filterProvider, filterStatus]);

  const statusOptions = Array.from(new Set(orders.map((order) => order.status))).sort();

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Online Orders</h2>
          <p>Marketplace orders from DoorDash and other integrations.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="terminal-btn primary" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      <div className="panel online-orders-panel">
        <div className="form-row">
          <select value={filterProvider} onChange={(event) => setFilterProvider(event.target.value)}>
            <option value="ALL">All Providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.code}>
                {provider.name}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
            <option value="ALL">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          {error && <span className="hint">{error}</span>}
        </div>

        <div className="list">
          {visibleOrders.length === 0 && <p className="hint">No online orders yet.</p>}
          {visibleOrders.map((order) => (
            <div key={order.id} className="recall-row online-order-row">
              <div>
                <strong>{order.displayId || order.externalId}</strong>
                <div className="hint">
                  {order.provider?.name} · {order.store?.name || order.store?.merchantSuppliedId || "Store"}
                </div>
              </div>
              <div>
                <span className="pill">{order.status}</span>
              </div>
              <div>{order.orderType || "—"}</div>
              <div>
                {order.posOrder?.totalAmount ? `$${Number(order.posOrder.totalAmount).toFixed(2)}` : "—"}
              </div>
              <div>
                {new Date(order.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
