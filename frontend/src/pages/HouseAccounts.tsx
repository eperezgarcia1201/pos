import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Account = {
  id: string;
  accountNumber: string;
  customerName: string;
  phone?: string | null;
  balance: string;
  active: boolean;
};

export default function HouseAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newAccount, setNewAccount] = useState({ accountNumber: "", customerName: "", phone: "" });
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");

  const load = async () => {
    const data = await apiFetch("/house-accounts");
    setAccounts(data);
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>In House Charge Accounts</h2>
          <p>Charge, payment, and account balance tracking.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Create Account</h3>
          <div className="form-row">
            <input
              value={newAccount.accountNumber}
              onChange={(e) => setNewAccount((prev) => ({ ...prev, accountNumber: e.target.value }))}
              placeholder="Account #"
            />
            <input
              value={newAccount.customerName}
              onChange={(e) => setNewAccount((prev) => ({ ...prev, customerName: e.target.value }))}
              placeholder="Customer name"
            />
            <input
              value={newAccount.phone}
              onChange={(e) => setNewAccount((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Phone"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newAccount.accountNumber || !newAccount.customerName) return;
                await apiFetch("/house-accounts", {
                  method: "POST",
                  body: JSON.stringify(newAccount)
                });
                setNewAccount({ accountNumber: "", customerName: "", phone: "" });
                await load();
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Accounts</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Account</span>
              <span>Name</span>
              <span>Balance</span>
              <span>Phone</span>
            </div>
            {accounts.map((account) => (
              <div key={account.id} className="table-row">
                <span>{account.accountNumber}</span>
                <span>{account.customerName}</span>
                <span>${Number(account.balance).toFixed(2)}</span>
                <span>{account.phone ?? "-"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Post Charge/Payment</h3>
          <div className="form-row">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountNumber} • {account.customerName}
                </option>
              ))}
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
            <button
              type="button"
              onClick={async () => {
                if (!selectedId || !amount) return;
                await apiFetch(`/house-accounts/${selectedId}/charge`, {
                  method: "POST",
                  body: JSON.stringify({ amount: Number(amount) })
                });
                setAmount("");
                await load();
              }}
            >
              Charge
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!selectedId || !amount) return;
                await apiFetch(`/house-accounts/${selectedId}/payment`, {
                  method: "POST",
                  body: JSON.stringify({ amount: Number(amount) })
                });
                setAmount("");
                await load();
              }}
            >
              Payment
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
