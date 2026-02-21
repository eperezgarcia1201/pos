import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export default function SettlementPage() {
  const [settlement, setSettlement] = useState<{ grossSales: number; payments: Record<string, number> }>({
    grossSales: 0,
    payments: {}
  });

  useEffect(() => {
    (async () => {
      const data = await apiFetch("/reports/settlement");
      setSettlement(data);
    })().catch(console.error);
  }, []);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>End of Day</h2>
          <p>Settlement summary by payment type.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Gross Sales</h3>
          <strong>${Number(settlement.grossSales).toFixed(2)}</strong>
        </section>
        <section className="panel span-2">
          <h3>Payments</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Type</span>
              <span>Amount</span>
              <span></span>
              <span></span>
            </div>
            {Object.entries(settlement.payments).map(([method, amount]) => (
              <div key={method} className="table-row">
                <span>{method}</span>
                <span>${Number(amount).toFixed(2)}</span>
                <span></span>
                <span></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
