import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { goBackOrHome } from "../lib/navigation";
import { getCurrentUser } from "../lib/session";

type Drawer = { id: string; name: string; status: string };

type Transaction = { id: string; type: string; amount: string; note: string | null };

export default function CashManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const mode = new URLSearchParams(location.search).get("mode");
  const isCashierIn = mode === "cashier-in";
  const isCashierOut = mode === "cashier-out";
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [newDrawer, setNewDrawer] = useState("");
  const [txn, setTxn] = useState({ type: "IN", amount: "", note: "" });
  const [selectedDrawer, setSelectedDrawer] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [checksTotal, setChecksTotal] = useState("");
  const [chargesTotal, setChargesTotal] = useState("");
  const [refundTotal, setRefundTotal] = useState("");
  const [activeField, setActiveField] = useState<{ type: "denom" | "checks" | "charges" | "refund"; key?: string } | null>(null);
  const [entry, setEntry] = useState("");
  const [cashierError, setCashierError] = useState("");

  const denominations = useMemo(
    () => [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
    []
  );

  const load = async () => {
    const [drawerList, txnList] = await Promise.all([
      apiFetch("/cash/drawers"),
      apiFetch("/cash/transactions")
    ]);
    setDrawers(drawerList);
    setTransactions(txnList);
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const totalCash = useMemo(() => {
    return denominations.reduce((sum, denom) => {
      const qty = counts[String(denom)] || 0;
      return sum + denom * qty;
    }, 0);
  }, [counts, denominations]);

  const totalChecks = Number(checksTotal || 0);
  const totalCharges = Number(chargesTotal || 0);
  const totalRefund = Number(refundTotal || 0);
  const totalAmount = totalCash + totalChecks + totalCharges - totalRefund;

  const setFocusField = (
    field: { type: "denom" | "checks" | "charges" | "refund"; key?: string },
    value: string
  ) => {
    setActiveField(field);
    setEntry(value);
  };

  const updateActiveValue = (nextValue: string) => {
    if (!activeField) return;
    if (activeField.type === "denom" && activeField.key) {
      const sanitized = nextValue.replace(/[^\d]/g, "");
      setEntry(sanitized);
      const qty = Number(sanitized || 0);
      setCounts((prev) => ({ ...prev, [activeField.key!]: Number.isFinite(qty) ? qty : 0 }));
      return;
    } else if (activeField.type === "checks") {
      setEntry(nextValue);
      setChecksTotal(nextValue);
    } else if (activeField.type === "charges") {
      setEntry(nextValue);
      setChargesTotal(nextValue);
    } else if (activeField.type === "refund") {
      setEntry(nextValue);
      setRefundTotal(nextValue);
    }
  };

  const handleKeypad = (val: string) => {
    if (!activeField) return;
    if (val === "clear") {
      updateActiveValue("");
      return;
    }
    if (val === "enter") {
      setEntry("");
      setActiveField(null);
      return;
    }
    const nextValue = entry === "0" ? val : entry + val;
    updateActiveValue(nextValue);
  };

  if (isCashierIn || isCashierOut) {
    const availableDrawers = isCashierOut
      ? drawers.filter((drawer) => drawer.status === "OPEN")
      : drawers;
    return (
      <div className="screen-shell cashier-shell">
        <header className="screen-header">
          <div>
            <h2>{isCashierOut ? "Cashier Out" : "Cashier In"}</h2>
            <p>
              {isCashierOut
                ? "Select open cash drawer, then count ending money."
                : "Select cash drawer, then count opening money."}
            </p>
          </div>
          <div className="header-actions">
            <button type="button" className="terminal-btn ghost" onClick={() => goBackOrHome(navigate)}>
              Main Screen
            </button>
          </div>
        </header>

        {!selectedDrawer && (
          <div className="cashier-drawers">
            {availableDrawers.map((drawer) => (
              <button
                key={drawer.id}
                type="button"
                className="cashier-drawer-tile"
                onClick={() => setSelectedDrawer(drawer.id)}
              >
                {drawer.name}
              </button>
            ))}
            {availableDrawers.length === 0 && (
              <p className="hint">
                {isCashierOut ? "No open drawers available." : "Create drawers first."}
              </p>
            )}
          </div>
        )}

        {selectedDrawer && (
          <div className="cashier-aldelo">
            <div className="aldelo-count-grid">
              <div className="aldelo-col-title">Cash</div>
              <div className="aldelo-col-title">Checks</div>
              <div className="aldelo-col-title">Charges</div>
              <div className="aldelo-col-title">Touch Pad</div>

              <section className="aldelo-col cash-col">
                <div className="aldelo-inline-title">Cash</div>
                <div className="aldelo-cash-header">
                  <span />
                  <span>Qty</span>
                  <span>Total</span>
                </div>
                <div className="aldelo-cash-rows">
                  {denominations.map((denom) => {
                    const key = String(denom);
                    const qty = counts[key] || 0;
                    const rowTotal = denom * qty;
                    const isActive = activeField?.type === "denom" && activeField.key === key;
                    return (
                      <div key={key} className={`aldelo-cash-row ${isActive ? "active" : ""}`}>
                        <span className="denom-label">${denom.toFixed(denom < 1 ? 2 : 0)}</span>
                        <input
                          value={isActive ? entry : qty === 0 ? "" : String(qty)}
                          onFocus={() => setFocusField({ type: "denom", key }, qty ? String(qty) : "")}
                          onChange={(e) => updateActiveValue(e.target.value)}
                        />
                        <span className="denom-total">${rowTotal.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="aldelo-cash-total">
                  <span>Cash</span>
                  <input readOnly value={totalCash.toFixed(2)} />
                </div>
              </section>

              <section className="aldelo-col checks-col">
                <div className="aldelo-inline-title">Checks</div>
                <div className="aldelo-entry">
                  <input
                    value={activeField?.type === "checks" ? entry : checksTotal}
                    placeholder="Amount"
                    onFocus={() => setFocusField({ type: "checks" }, checksTotal || "")}
                    onChange={(e) => updateActiveValue(e.target.value)}
                  />
                  <button type="button" className="aldelo-add">Add</button>
                </div>
                <div className="aldelo-side-body">
                  <div className="aldelo-list" />
                  <div className="aldelo-actions">
                    <button type="button" className="aldelo-action">All</button>
                    <button type="button" className="aldelo-action danger">Delete</button>
                    <button type="button" className="aldelo-action success">Verified</button>
                  </div>
                </div>
              </section>

              <section className="aldelo-col charges-col">
                <div className="aldelo-inline-title">Charges</div>
                <div className="aldelo-entry">
                  <input
                    value={activeField?.type === "charges" ? entry : chargesTotal}
                    placeholder="Amount"
                    onFocus={() => setFocusField({ type: "charges" }, chargesTotal || "")}
                    onChange={(e) => updateActiveValue(e.target.value)}
                  />
                  <button type="button" className="aldelo-add">Add</button>
                </div>
                <div className="aldelo-side-body">
                  <div className="aldelo-list" />
                  <div className="aldelo-actions">
                    <button type="button" className="aldelo-action">All</button>
                    <button type="button" className="aldelo-action danger">Delete</button>
                    <button type="button" className="aldelo-action success">Verified</button>
                  </div>
                </div>
              </section>

              <section className="aldelo-col keypad-col">
                <div className="aldelo-inline-title">Touch Pad</div>
                <div className="aldelo-keypad">
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
                    <button key={num} type="button" onClick={() => handleKeypad(String(num))}>
                      {num}
                    </button>
                  ))}
                  <button type="button" className="clear" onClick={() => handleKeypad("clear")}>Clear</button>
                  <button type="button" onClick={() => handleKeypad("0")}>0</button>
                  <button type="button" className="confirm" onClick={() => handleKeypad("enter")}>Enter</button>
                </div>
                <div className="aldelo-summary">
                  <div className="summary-row">
                    <span>Total Cash</span>
                    <strong>${totalCash.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Total Checks</span>
                    <strong>${totalChecks.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Total Charge</span>
                    <strong>${totalCharges.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row refund">
                    <span>Refund</span>
                    <input
                      value={activeField?.type === "refund" ? entry : refundTotal}
                      onFocus={() => setFocusField({ type: "refund" }, refundTotal || "")}
                      onChange={(e) => updateActiveValue(e.target.value)}
                    />
                  </div>
                  <div className="summary-row total">
                    <span>Total Amount</span>
                    <strong>${totalAmount.toFixed(2)}</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="aldelo-footer">
              <div className="aldelo-nav-actions">
                <button type="button" className="aldelo-nav">Move Up</button>
                <button type="button" className="aldelo-nav">Move Down</button>
                <button type="button" className="aldelo-nav">+ Cash</button>
              </div>
              <div className="aldelo-right-actions">
                <button
                  type="button"
                  className="aldelo-cancel"
                  onClick={() => {
                    setSelectedDrawer("");
                    setCounts({});
                    setChecksTotal("");
                    setChargesTotal("");
                    setRefundTotal("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="aldelo-finish"
                  onClick={async () => {
                    setCashierError("");
                    if (!selectedDrawer) {
                      setCashierError("Select a cash drawer.");
                      return;
                    }
                    if (isCashierIn && totalAmount <= 0) {
                      setCashierError("Enter a valid opening amount.");
                      return;
                    }
                    if (isCashierOut && totalAmount < 0) {
                      setCashierError("Enter a valid closing amount.");
                      return;
                    }
                    try {
                      if (isCashierOut) {
                        const openOrders = (await apiFetch("/orders/open?status=OPEN,SENT,HOLD")) as Array<unknown>;
                        if (openOrders.length > 0) {
                          setCashierError(
                            `You still have ${openOrders.length} open order(s). Close open orders before cashier out.`
                          );
                          return;
                        }
                      }

                      const user = getCurrentUser();
                      if (isCashierIn) {
                        await apiFetch(`/cash/drawers/${selectedDrawer}/open`, { method: "POST" });
                      }
                      await apiFetch("/cash/transactions", {
                        method: "POST",
                        body: JSON.stringify({
                          drawerId: selectedDrawer,
                          userId: user?.id,
                          type: isCashierIn ? "OPENING" : "OUT",
                          amount: Number(totalAmount.toFixed(2)),
                          note: isCashierIn ? "Opening Bank" : "Closing Count",
                          details: {
                            denominations: counts,
                            checks: totalChecks,
                            charges: totalCharges,
                            refund: totalRefund
                          }
                        })
                      });
                      if (isCashierOut) {
                        await apiFetch(`/cash/drawers/${selectedDrawer}/close`, { method: "POST" });
                      }
                      navigate("/");
                    } catch (err) {
                      const message = err instanceof Error ? err.message : "";
                      if (message) {
                        setCashierError(message);
                        return;
                      }
                      setCashierError(
                        isCashierIn
                          ? "Could not save cashier in. Check backend and try again."
                          : "Could not save cashier out. Check backend and try again."
                      );
                      console.error(err);
                    }
                  }}
                >
                  Finish
                </button>
              </div>
            </div>
            {cashierError && <p className="hint">{cashierError}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Cash Drawer</h2>
          <p>Cash in/out, payouts, and drawer control.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Drawers</h3>
          <div className="form-row">
            <input
              value={newDrawer}
              onChange={(e) => setNewDrawer(e.target.value)}
              placeholder="Drawer name"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newDrawer) return;
                await apiFetch("/cash/drawers", {
                  method: "POST",
                  body: JSON.stringify({ name: newDrawer })
                });
                setNewDrawer("");
                await load();
              }}
            >
              Add
            </button>
          </div>
          <ul className="list">
            {drawers.map((drawer) => (
              <li key={drawer.id}>
                {drawer.name} • {drawer.status}
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/cash/drawers/${drawer.id}/open`, { method: "POST" });
                    await load();
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/cash/drawers/${drawer.id}/close`, { method: "POST" });
                    await load();
                  }}
                >
                  Close
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>Cash Transaction</h3>
          <div className="form-row">
            <select value={selectedDrawer} onChange={(e) => setSelectedDrawer(e.target.value)}>
              <option value="">Drawer</option>
              {drawers.map((drawer) => (
                <option key={drawer.id} value={drawer.id}>
                  {drawer.name}
                </option>
              ))}
            </select>
            <select value={txn.type} onChange={(e) => setTxn({ ...txn, type: e.target.value })}>
              <option value="IN">Cash In</option>
              <option value="OUT">Cash Out</option>
              <option value="PAYOUT">Payout</option>
              <option value="DROP">Drop</option>
            </select>
            <input
              value={txn.amount}
              onChange={(e) => setTxn({ ...txn, amount: e.target.value })}
              placeholder="Amount"
            />
            <input
              value={txn.note}
              onChange={(e) => setTxn({ ...txn, note: e.target.value })}
              placeholder="Note"
            />
            <button
              type="button"
              onClick={async () => {
                if (!txn.amount) return;
                await apiFetch("/cash/transactions", {
                  method: "POST",
                  body: JSON.stringify({
                    drawerId: selectedDrawer || undefined,
                    type: txn.type,
                    amount: Number(txn.amount),
                    note: txn.note || undefined
                  })
                });
                setTxn({ type: "IN", amount: "", note: "" });
                await load();
              }}
            >
              Record
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Recent Transactions</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Type</span>
              <span>Amount</span>
              <span>Note</span>
              <span>ID</span>
            </div>
            {transactions.map((t) => (
              <div key={t.id} className="table-row">
                <span>{t.type}</span>
                <span>${Number(t.amount).toFixed(2)}</span>
                <span>{t.note ?? "-"}</span>
                <span>{t.id.slice(0, 6)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
