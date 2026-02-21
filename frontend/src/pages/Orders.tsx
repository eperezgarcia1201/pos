import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getCurrentUser } from "../lib/session";
import { getStationContext, loadStation, type StationConfig } from "../lib/station";

type Order = {
  id: string;
  ticketNumber?: number | null;
  orderNumber?: number | null;
  ticketDate?: string | null;
  status: string;
  orderType: string;
  barTab?: boolean | null;
  totalAmount: string | null;
  dueAmount: string | null;
  createdAt: string;
  table?: { id: string; name: string } | null;
  server?: { id: string; username: string; displayName?: string | null } | null;
};

type TypeFilter = "ALL" | "DINE_IN" | "TAKEOUT" | "BAR_TAB" | "MY";
type GatewayChoice = "AUTO" | "OFFLINE" | "PAX" | "TSYS_PORTICO";

type PaymentDraft = {
  method: "CASH" | "CARD" | "CUSTOM";
  customLabel: string;
  amount: string;
  tenderAmount: string;
  tipAmount: string;
  gateway: GatewayChoice;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  cardHolderName: string;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("OPEN");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [query, setQuery] = useState("");
  const [quickSearch, setQuickSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [actionError, setActionError] = useState("");
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentPrintReceipt, setPaymentPrintReceipt] = useState(true);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({
    method: "CASH",
    customLabel: "",
    amount: "",
    tenderAmount: "",
    tipAmount: "",
    gateway: "AUTO",
    cardNumber: "",
    expMonth: "",
    expYear: "",
    cvv: "",
    cardHolderName: ""
  });
  const [paymentGatewayDefault, setPaymentGatewayDefault] = useState<GatewayChoice>("AUTO");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [paymentTsysEnabled, setPaymentTsysEnabled] = useState(false);
  const [paymentPaxEnabled, setPaymentPaxEnabled] = useState(true);
  const [station, setStation] = useState<StationConfig | null>(null);
  const [stationName, setStationName] = useState("");
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = getCurrentUser();
  const serverName = currentUser?.displayName || currentUser?.username || "";
  const stationContext = useMemo(() => getStationContext(station), [station]);

  const load = async () => {
    const query = currentUser?.id ? `?serverId=${currentUser.id}` : "";
    const data = await apiFetch(`/orders${query}`);
    setOrders(data);
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("filter");
    if (requested) {
      setFilter(requested.toUpperCase());
    }
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        const stationValue = await loadStation();
        if (stationValue) {
          setStation(stationValue);
          if (stationValue.name) {
            setStationName(stationValue.name);
          }
        }
        const setting = await apiFetch("/settings/store");
        if (!stationValue?.name && setting?.value?.stationName) {
          setStationName(setting.value.stationName);
        }
        const [gatewaySetting, paxSetting, tsysSetting] = await Promise.all([
          apiFetch("/settings/payment_gateway").catch(() => null),
          apiFetch("/settings/pax").catch(() => null),
          apiFetch("/settings/tsys_portico").catch(() => null)
        ]);
        if (gatewaySetting?.value?.defaultGateway) {
          setPaymentGatewayDefault(gatewaySetting.value.defaultGateway);
        }
        if (gatewaySetting?.value?.currency) {
          setPaymentCurrency(String(gatewaySetting.value.currency).toUpperCase());
        }
        if (typeof paxSetting?.value?.enabled === "boolean") {
          setPaymentPaxEnabled(Boolean(paxSetting.value.enabled));
        }
        if (typeof tsysSetting?.value?.enabled === "boolean") {
          setPaymentTsysEnabled(Boolean(tsysSetting.value.enabled));
        }
        if (tsysSetting?.value?.currency) {
          setPaymentCurrency(String(tsysSetting.value.currency).toUpperCase());
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setActionError("");
    setVoidReason("");
    setRefundAmount("");
  }, [selectedOrderId]);

  const handleQuickKey = (val: string) => {
    if (val === "back") {
      setQuickSearch((prev) => prev.slice(0, -1));
      return;
    }
    if (val === "clear") {
      setQuickSearch("");
      return;
    }
    setQuickSearch((prev) => `${prev}${val}`);
  };

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus =
        filter === "ALL" ||
        (filter === "OPEN" ? ["OPEN", "SENT", "HOLD"].includes(order.status) : order.status === filter);
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        order.id.toLowerCase().includes(q) ||
        (order.ticketNumber !== null && order.ticketNumber !== undefined && String(order.ticketNumber).includes(q)) ||
        (order.orderNumber !== null && order.orderNumber !== undefined && String(order.orderNumber).includes(q));
      const matchesType =
        typeFilter === "ALL" ||
        (typeFilter === "DINE_IN" && order.orderType === "DINE_IN") ||
        (typeFilter === "TAKEOUT" && order.orderType === "TAKEOUT") ||
        (typeFilter === "BAR_TAB" && order.barTab) ||
        (typeFilter === "MY" && order.server?.id && order.server.id === currentUser?.id);
      return matchesStatus && matchesQuery && matchesType;
    });
  }, [orders, filter, query, typeFilter, currentUser?.id]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const selectedDue = selectedOrder
    ? Math.max(0, Number(selectedOrder.dueAmount ?? selectedOrder.totalAmount ?? 0))
    : 0;
  const paymentAmount = Number(paymentDraft.amount || selectedDue || 0);
  const paymentTender = Number(paymentDraft.tenderAmount || 0);
  const paymentTip = Number(paymentDraft.tipAmount || 0);
  const paymentChange = paymentDraft.method === "CASH" ? Math.max(0, paymentTender - paymentAmount) : 0;
  const cardNeedsManualEntry =
    paymentDraft.method === "CARD" &&
    (paymentDraft.gateway === "TSYS_PORTICO" || (paymentDraft.gateway === "AUTO" && paymentTsysEnabled));

  const openPayBill = () => {
    if (!selectedOrder) return;
    const due = Math.max(0, Number(selectedOrder.dueAmount ?? selectedOrder.totalAmount ?? 0));
    setPaymentDraft({
      method: "CASH",
      customLabel: "",
      amount: due.toFixed(2),
      tenderAmount: due.toFixed(2),
      tipAmount: "",
      gateway: paymentGatewayDefault,
      cardNumber: "",
      expMonth: "",
      expYear: "",
      cvv: "",
      cardHolderName: ""
    });
    setPaymentPrintReceipt(true);
    setActionError("");
    setPaymentOpen(true);
  };

  return (
    <div className="screen-shell recall-order-screen">
      <header className="screen-header">
        <div>
          <h2>Recall Order</h2>
          <p>Recall tickets, void, refund, or print receipts.</p>
        </div>
      </header>

      <div className="recall-grid">
        <section className="panel recall-panel">
          <h3>All Orders</h3>
          <div className="recall-filter-bar">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="OPEN">Open</option>
              <option value="HOLD">Hold</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order ID" />
            <button type="button" onClick={load}>Refresh</button>
          </div>
          <div className="recall-list">
            <div className="recall-list-header">
              <span>Ticket</span>
              <span>Table</span>
              <span>Status</span>
              <span>Total</span>
            </div>
            {filtered.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`recall-row ${selectedOrderId === order.id ? "active" : ""}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <span>{order.ticketNumber ? `#${order.ticketNumber}` : order.id.slice(0, 8)}</span>
                <span>{order.table?.name ?? "-"}</span>
                <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
                <span>${Number(order.totalAmount ?? 0).toFixed(2)}</span>
              </button>
            ))}
          </div>

          <div className="recall-count">TOTAL ORDERS COUNT {filtered.length}</div>
        </section>

        <section className="panel recall-panel recall-side-panel">
          <h3>Quick Search</h3>
          <div className="recall-quick-inputs">
            <input value={quickSearch} readOnly placeholder="Ticket #" />
            <button type="button" className="recall-back" onClick={() => handleQuickKey("back")}>
              ←
            </button>
          </div>
          <div className="recall-keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button key={num} type="button" onClick={() => handleQuickKey(String(num))}>
                {num}
              </button>
            ))}
            <button type="button" className="recall-clear" onClick={() => handleQuickKey("clear")}>
              Clear
            </button>
            <button type="button" onClick={() => handleQuickKey("0")}>
              0
            </button>
          </div>
          <div className="recall-search-note">By Ticket Number</div>
          <button type="button" className="recall-search-btn" onClick={() => setQuery(quickSearch)}>
            Search
          </button>

          <div className="recall-action-dock">
            <h4>Selected Ticket Actions</h4>
            {!selectedOrder && <p className="hint">Select a ticket on the left to manage it from here.</p>}
            {selectedOrder && (
              <div className="recall-details recall-details-dock">
                <div className="recall-detail-line">
                  ORDER #{selectedOrder.orderNumber ?? selectedOrder.id.slice(0, 6)} • Server:{" "}
                  {selectedOrder.server?.displayName || selectedOrder.server?.username || "—"} • Total: $
                  {Number(selectedOrder.totalAmount ?? 0).toFixed(2)} • Ticket #: {selectedOrder.ticketNumber ?? "—"}
                </div>
                <div className="recall-detail-line">
                  {selectedOrder.orderType.replace("_", " ")} • Table: {selectedOrder.table?.name ?? "-"}
                </div>
                {selectedOrder.status === "PAID" && <div className="recall-detail-line settled">$$$ SETTLED $$$</div>}

                <div className="form-row recall-action-row recall-primary-actions">
                  <button
                    type="button"
                    onClick={() => navigate(`/pos/dinein?action=recall&order=${selectedOrder.id}`)}
                  >
                    Recall
                  </button>
                  <button
                    type="button"
                    onClick={openPayBill}
                    disabled={
                      selectedOrder.status === "VOID" ||
                      Math.max(0, Number(selectedOrder.dueAmount ?? selectedOrder.totalAmount ?? 0)) <= 0
                    }
                  >
                    Pay Bill
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      try {
                        const params = new URLSearchParams();
                        if (serverName) params.set("serverName", serverName);
                        if (stationName) params.set("stationName", stationName);
                        const query = params.toString();
                        const result = await apiFetch(
                          `/orders/${selectedOrder.id}/receipt-text${query ? `?${query}` : ""}`
                        );
                        setPreview({ title: "Customer Receipt", text: result.text || "No receipt text." });
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to load receipt.");
                      }
                    }}
                  >
                    View Receipt
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      try {
                        await apiFetch(`/orders/${selectedOrder.id}/print-receipt`, {
                          method: "POST",
                          body: JSON.stringify({
                            serverName: serverName || undefined,
                            stationName: stationName || undefined,
                            ...stationContext
                          })
                        });
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to print receipt.");
                      }
                    }}
                  >
                    Print Receipt
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      try {
                        await apiFetch(`/orders/${selectedOrder.id}/send-kitchen`, {
                          method: "POST",
                          body: JSON.stringify({})
                        });
                        await load();
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to send to kitchen.");
                      }
                    }}
                  >
                    Send to Kitchen
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      try {
                        const result = await apiFetch(`/orders/${selectedOrder.id}/kitchen-text`);
                        setPreview({ title: "Kitchen Ticket", text: result.combined || "No kitchen ticket text." });
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to load kitchen ticket.");
                      }
                    }}
                  >
                    View Kitchen
                  </button>
                </div>
                <div className="form-row recall-action-row recall-void-row">
                  <input
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Void reason"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      if (!voidReason.trim()) {
                        setActionError("Enter a void reason.");
                        return;
                      }
                      try {
                        await apiFetch(`/orders/${selectedOrder.id}/void`, {
                          method: "POST",
                          body: JSON.stringify({ reason: voidReason })
                        });
                        setVoidReason("");
                        await load();
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to void order.");
                      }
                    }}
                  >
                    Void
                  </button>
                </div>
                <div className="form-row recall-action-row recall-refund-row">
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                  <input
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="Refund amount"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError("");
                      const amount = Number(refundAmount);
                      if (!amount) {
                        setActionError("Enter a refund amount.");
                        return;
                      }
                      try {
                        await apiFetch(`/orders/${selectedOrder.id}/refund`, {
                          method: "POST",
                          body: JSON.stringify({ method: refundMethod, amount })
                        });
                        setRefundAmount("");
                        await load();
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to refund order.");
                      }
                    }}
                  >
                    Refund
                  </button>
                </div>
                {actionError && <p className="hint">{actionError}</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="recall-footer">
        <div className="recall-tabs">
          <button type="button" className={typeFilter === "ALL" ? "active" : ""} onClick={() => setTypeFilter("ALL")}>
            All Types
          </button>
          <button type="button" className={typeFilter === "DINE_IN" ? "active" : ""} onClick={() => setTypeFilter("DINE_IN")}>
            Dine In
          </button>
          <button type="button" className={typeFilter === "BAR_TAB" ? "active" : ""} onClick={() => setTypeFilter("BAR_TAB")}>
            Bar Tab
          </button>
          <button type="button" className={typeFilter === "TAKEOUT" ? "active" : ""} onClick={() => setTypeFilter("TAKEOUT")}>
            Take Out
          </button>
          <button type="button" className={typeFilter === "MY" ? "active" : ""} onClick={() => setTypeFilter("MY")}>
            My Orders
          </button>
        </div>
        <div className="recall-station">
          {now.toLocaleString()} {stationName ? `• Station ${stationName}` : ""}
        </div>
      </div>

      {paymentOpen && selectedOrder && (
        <div className="terminal-recall">
          <div className="terminal-recall-card payment-modal">
            <div className="terminal-recall-header">
              <h3>Pay Bill</h3>
              <button type="button" onClick={() => setPaymentOpen(false)}>
                Close
              </button>
            </div>
            <div className="payment-grid">
              <div className="payment-main">
                <div className="form-grid">
                  <label>
                    <span>Method</span>
                    <select
                      value={paymentDraft.method}
                      onChange={(e) =>
                        setPaymentDraft((prev) => {
                          const nextMethod = e.target.value as PaymentDraft["method"];
                          return {
                            ...prev,
                            method: nextMethod,
                            tenderAmount:
                              nextMethod === "CASH" || nextMethod === "CARD"
                                ? prev.amount || prev.tenderAmount
                                : "",
                            gateway: nextMethod === "CARD" ? prev.gateway : paymentGatewayDefault
                          };
                        })
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </label>
                  {paymentDraft.method === "CUSTOM" && (
                    <label>
                      <span>Custom Label</span>
                      <input
                        value={paymentDraft.customLabel}
                        onChange={(e) =>
                          setPaymentDraft((prev) => ({ ...prev, customLabel: e.target.value }))
                        }
                        placeholder="House Account"
                      />
                    </label>
                  )}
                  {paymentDraft.method === "CARD" && (
                    <label>
                      <span>Gateway</span>
                      <select
                        value={paymentDraft.gateway}
                        onChange={(e) =>
                          setPaymentDraft((prev) => ({ ...prev, gateway: e.target.value as GatewayChoice }))
                        }
                      >
                        <option value="AUTO">Auto</option>
                        {paymentTsysEnabled && <option value="TSYS_PORTICO">TSYS Portico</option>}
                        {paymentPaxEnabled && <option value="PAX">PAX</option>}
                        <option value="OFFLINE">Offline</option>
                      </select>
                    </label>
                  )}
                  <label>
                    <span>Amount</span>
                    <input
                      value={paymentDraft.amount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    <span>Tender</span>
                    <input
                      value={paymentDraft.tenderAmount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, tenderAmount: e.target.value }))
                      }
                      placeholder="0.00"
                      disabled={paymentDraft.method !== "CASH"}
                    />
                  </label>
                  <label>
                    <span>Tip</span>
                    <input
                      value={paymentDraft.tipAmount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, tipAmount: e.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                </div>

                {paymentDraft.method === "CASH" && (
                  <div className="quick-tender">
                    <span className="hint">Quick Tender</span>
                    <div className="quick-tender-buttons">
                      {[paymentAmount || selectedDue, 5, 10, 20, 50, 100].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="terminal-btn ghost"
                          onClick={() =>
                            setPaymentDraft((prev) => ({
                              ...prev,
                              tenderAmount: Number(value).toFixed(2)
                            }))
                          }
                        >
                          {value === (paymentAmount || selectedDue) ? "Exact" : `$${Number(value).toFixed(0)}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {cardNeedsManualEntry && (
                  <div className="form-grid">
                    <label>
                      <span>Card Number</span>
                      <input
                        value={paymentDraft.cardNumber}
                        onChange={(e) =>
                          setPaymentDraft((prev) => ({ ...prev, cardNumber: e.target.value }))
                        }
                        placeholder="4111 1111 1111 1111"
                      />
                    </label>
                    <label>
                      <span>Exp Month (MM)</span>
                      <input
                        value={paymentDraft.expMonth}
                        onChange={(e) => setPaymentDraft((prev) => ({ ...prev, expMonth: e.target.value }))}
                        placeholder="12"
                      />
                    </label>
                    <label>
                      <span>Exp Year (YY or YYYY)</span>
                      <input
                        value={paymentDraft.expYear}
                        onChange={(e) => setPaymentDraft((prev) => ({ ...prev, expYear: e.target.value }))}
                        placeholder="2028"
                      />
                    </label>
                    <label>
                      <span>CVV</span>
                      <input
                        value={paymentDraft.cvv}
                        onChange={(e) => setPaymentDraft((prev) => ({ ...prev, cvv: e.target.value }))}
                        placeholder="123"
                      />
                    </label>
                    <label>
                      <span>Card Holder</span>
                      <input
                        value={paymentDraft.cardHolderName}
                        onChange={(e) =>
                          setPaymentDraft((prev) => ({ ...prev, cardHolderName: e.target.value }))
                        }
                        placeholder="Name on card"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="payment-summary">
                <div className="payment-line">
                  <span>Amount Due</span>
                  <strong>${selectedDue.toFixed(2)}</strong>
                </div>
                <div className="payment-line">
                  <span>Payment Amount</span>
                  <strong>${paymentAmount.toFixed(2)}</strong>
                </div>
                <div className="payment-line">
                  <span>Tip</span>
                  <strong>${paymentTip.toFixed(2)}</strong>
                </div>
                <div className="payment-line">
                  <span>Tender</span>
                  <strong>${paymentTender.toFixed(2)}</strong>
                </div>
                <div className="payment-line total">
                  <span>Change Due</span>
                  <strong>${paymentChange.toFixed(2)}</strong>
                </div>
                <label className="payment-checkbox">
                  <input
                    type="checkbox"
                    checked={paymentPrintReceipt}
                    onChange={(e) => setPaymentPrintReceipt(e.target.checked)}
                  />
                  Print receipt after payment
                </label>
                {paymentDraft.method === "CARD" && (
                  <p className="hint">
                    {cardNeedsManualEntry
                      ? "TSYS keyed entry is enabled. Card data is sent only for this charge."
                      : "Card charge will route through selected gateway."}
                  </p>
                )}
              </div>
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                disabled={paymentSubmitting}
                onClick={async () => {
                  const amountValue = Number(paymentDraft.amount || selectedDue);
                  if (!amountValue || amountValue <= 0) {
                    setActionError("Enter a valid payment amount.");
                    return;
                  }
                  if (paymentDraft.method === "CASH" && paymentTender < amountValue) {
                    setActionError("Tender must be at least the payment amount.");
                    return;
                  }
                  if (paymentDraft.method === "CARD" && cardNeedsManualEntry) {
                    if (
                      !paymentDraft.cardNumber.trim() ||
                      !paymentDraft.expMonth.trim() ||
                      !paymentDraft.expYear.trim()
                    ) {
                      setActionError("Card number and expiration are required for TSYS charge.");
                      return;
                    }
                  }

                  const method =
                    paymentDraft.method === "CUSTOM"
                      ? paymentDraft.customLabel.trim() || "CUSTOM"
                      : paymentDraft.method;

                  const payload: Record<string, unknown> = {
                    method,
                    amount: amountValue,
                    tipAmount: paymentDraft.tipAmount ? Number(paymentDraft.tipAmount) : undefined,
                    tenderAmount: paymentDraft.tenderAmount ? Number(paymentDraft.tenderAmount) : undefined
                  };

                  if (paymentDraft.method === "CARD") {
                    payload.gateway = paymentDraft.gateway;
                    payload.currency = paymentCurrency;
                    payload.clientTransactionId = `wspos-${selectedOrder.id}-${Date.now()}`;
                    if (cardNeedsManualEntry) {
                      payload.card = {
                        number: paymentDraft.cardNumber,
                        expMonth: paymentDraft.expMonth,
                        expYear: paymentDraft.expYear,
                        cvv: paymentDraft.cvv || undefined,
                        cardHolderName: paymentDraft.cardHolderName || undefined
                      };
                    }
                  }

                  setActionError("");
                  setPaymentSubmitting(true);
                  try {
                    await apiFetch(`/orders/${selectedOrder.id}/payments`, {
                      method: "POST",
                      body: JSON.stringify(payload)
                    });
                    if (paymentPrintReceipt) {
                      await apiFetch(`/orders/${selectedOrder.id}/print-receipt`, {
                        method: "POST",
                        body: JSON.stringify({
                          serverName: serverName || undefined,
                          stationName: stationName || undefined,
                          ...stationContext
                        })
                      });
                    }
                    await load();
                    setPaymentOpen(false);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Unable to process payment.");
                  } finally {
                    setPaymentSubmitting(false);
                  }
                }}
              >
                {paymentDraft.method === "CARD" ? "Charge Card" : "Submit Payment"}
              </button>
              <button type="button" className="terminal-btn ghost" onClick={() => setPaymentOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="terminal-recall">
          <div className="terminal-recall-card ticket-modal">
            <div className="terminal-recall-header">
              <h3>{preview.title}</h3>
              <div className="ticket-preview-actions">
                {preview.title === "Customer Receipt" && selectedOrder && (
                  <button
                    type="button"
                    className="terminal-btn"
                    onClick={async () => {
                      try {
                        await apiFetch(`/orders/${selectedOrder.id}/print-receipt`, {
                          method: "POST",
                          body: JSON.stringify({
                            serverName: serverName || undefined,
                            stationName: stationName || undefined,
                            ...stationContext
                          })
                        });
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "Unable to print receipt.");
                      }
                    }}
                  >
                    Print
                  </button>
                )}
                <button type="button" className="terminal-btn ghost" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
            <pre className="ticket-preview">{preview.text}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
