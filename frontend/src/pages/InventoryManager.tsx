import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type InventoryItem = { id: string; sku: string; name: string; quantity: string | null; unit?: string | null; reorderLevel?: string | null };

type Vendor = { id: string; name: string; contact?: string | null; phone?: string | null; email?: string | null };

type PurchaseOrder = {
  id: string;
  status: string;
  vendor: Vendor | null;
  items?: Array<{ id: string; inventoryItemId: string; quantity: string; unitCost: string | null }>;
};

type InventoryAdjustment = {
  id: string;
  inventoryItem: { id: string; name: string; sku: string };
  delta: string;
  reason?: string | null;
  createdAt: string;
};

export default function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [inventorySettings, setInventorySettings] = useState({ autoDecrement: true });

  const [newItem, setNewItem] = useState({ sku: "", name: "", quantity: "", unit: "", reorderLevel: "" });
  const [selectedItemId, setSelectedItemId] = useState("");
  const [editItem, setEditItem] = useState({ sku: "", name: "", quantity: "", unit: "", reorderLevel: "" });
  const [inventoryError, setInventoryError] = useState("");
  const [receiveDraft, setReceiveDraft] = useState({ inventoryItemId: "", quantity: "", reason: "" });
  const [newVendor, setNewVendor] = useState({ name: "" });
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [editVendor, setEditVendor] = useState({ name: "", contact: "", phone: "", email: "" });
  const [vendorError, setVendorError] = useState("");
  const [newPO, setNewPO] = useState({ vendorId: "" });
  const [selectedPOId, setSelectedPOId] = useState("");
  const [poItemDraft, setPoItemDraft] = useState({ inventoryItemId: "", quantity: "", unitCost: "" });
  const [poStatus, setPoStatus] = useState("OPEN");
  const [poError, setPoError] = useState("");
  const [adjustDraft, setAdjustDraft] = useState({ inventoryItemId: "", delta: "", reason: "" });

  const load = async () => {
    const [inv, vend, pos, adj, settings] = await Promise.all([
      apiFetch("/inventory"),
      apiFetch("/vendors"),
      apiFetch("/purchase-orders"),
      apiFetch("/inventory/adjustments?limit=25"),
      apiFetch("/settings/inventory").catch(() => null)
    ]);
    setItems(inv);
    setVendors(vend);
    setPurchaseOrders(pos);
    setAdjustments(adj);
    if (settings?.value) {
      setInventorySettings({ autoDecrement: settings.value.autoDecrement !== false });
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  useEffect(() => {
    const selected = items.find((item) => item.id === selectedItemId);
    if (selected) {
      setEditItem({
        sku: selected.sku,
        name: selected.name,
        quantity: selected.quantity ?? "",
        unit: selected.unit ?? "",
        reorderLevel: selected.reorderLevel ?? ""
      });
    }
  }, [selectedItemId, items]);

  useEffect(() => {
    const selected = vendors.find((vendor) => vendor.id === selectedVendorId);
    if (selected) {
      setEditVendor({
        name: selected.name,
        contact: selected.contact ?? "",
        phone: selected.phone ?? "",
        email: selected.email ?? ""
      });
    }
  }, [selectedVendorId, vendors]);

  useEffect(() => {
    if (!selectedPOId) return;
    const selected = purchaseOrders.find((po) => po.id === selectedPOId);
    if (selected) {
      setPoStatus(selected.status);
    }
  }, [selectedPOId, purchaseOrders]);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Inventory</h2>
          <p>Stock levels, vendors, and purchase orders.</p>
        </div>
        <div className="header-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={inventorySettings.autoDecrement}
              onChange={async (e) => {
                const next = e.target.checked;
                setInventorySettings({ autoDecrement: next });
                await apiFetch("/settings/inventory", {
                  method: "PATCH",
                  body: JSON.stringify({ value: { autoDecrement: next } })
                });
              }}
            />
            <span>Auto-decrement on paid orders</span>
          </label>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Inventory Items</h3>
          <div className="form-row">
            <input
              value={newItem.sku}
              onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
              placeholder="SKU"
            />
            <input
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Item name"
            />
            <input
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              placeholder="Qty"
            />
            <input
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              placeholder="Unit"
            />
            <input
              value={newItem.reorderLevel}
              onChange={(e) => setNewItem({ ...newItem, reorderLevel: e.target.value })}
              placeholder="Reorder"
            />
            <button
              type="button"
              onClick={async () => {
                setInventoryError("");
                if (!newItem.sku || !newItem.name) return;
                try {
                  await apiFetch("/inventory", {
                    method: "POST",
                    body: JSON.stringify({
                      sku: newItem.sku,
                      name: newItem.name,
                      quantity: newItem.quantity ? Number(newItem.quantity) : 0,
                      unit: newItem.unit || undefined,
                      reorderLevel: newItem.reorderLevel ? Number(newItem.reorderLevel) : undefined
                    })
                  });
                  setNewItem({ sku: "", name: "", quantity: "", unit: "", reorderLevel: "" });
                  await load();
                } catch (err) {
                  setInventoryError(err instanceof Error ? err.message : "Unable to add item.");
                }
              }}
            >
              Add
            </button>
          </div>
          <div className="table-list">
            <div className="table-header">
              <span>SKU</span>
              <span>Name</span>
              <span>Qty</span>
              <span>Reorder</span>
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`table-row button-row ${selectedItemId === item.id ? "active" : ""}`}
                onClick={() => setSelectedItemId(item.id)}
              >
                <span>{item.sku}</span>
                <span>{item.name}</span>
                <span>{item.quantity ?? "-"}</span>
                <span>{item.reorderLevel ?? "-"}</span>
              </button>
            ))}
          </div>
          {inventoryError && <p className="hint">{inventoryError}</p>}
        </section>

        <section className="panel span-2">
          <h3>Edit Inventory Item</h3>
          {!selectedItemId && <p className="hint">Select an item to edit.</p>}
          {selectedItemId && (
            <div className="form-row">
              <input
                value={editItem.sku}
                onChange={(e) => setEditItem((prev) => ({ ...prev, sku: e.target.value }))}
                placeholder="SKU"
              />
              <input
                value={editItem.name}
                onChange={(e) => setEditItem((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Item name"
              />
              <input
                value={editItem.quantity}
                onChange={(e) => setEditItem((prev) => ({ ...prev, quantity: e.target.value }))}
                placeholder="Qty"
              />
              <input
                value={editItem.unit}
                onChange={(e) => setEditItem((prev) => ({ ...prev, unit: e.target.value }))}
                placeholder="Unit"
              />
              <input
                value={editItem.reorderLevel}
                onChange={(e) => setEditItem((prev) => ({ ...prev, reorderLevel: e.target.value }))}
                placeholder="Reorder"
              />
              <button
                type="button"
                onClick={async () => {
                  setInventoryError("");
                  try {
                    await apiFetch(`/inventory/${selectedItemId}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        sku: editItem.sku,
                        name: editItem.name,
                        quantity: editItem.quantity ? Number(editItem.quantity) : undefined,
                        unit: editItem.unit || undefined,
                        reorderLevel: editItem.reorderLevel ? Number(editItem.reorderLevel) : undefined
                      })
                    });
                    await load();
                  } catch (err) {
                    setInventoryError(err instanceof Error ? err.message : "Unable to update item.");
                  }
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm("Delete this inventory item?");
                  if (!ok) return;
                  setInventoryError("");
                  try {
                    await apiFetch(`/inventory/${selectedItemId}`, { method: "DELETE" });
                    setSelectedItemId("");
                    await load();
                  } catch (err) {
                    setInventoryError(err instanceof Error ? err.message : "Unable to delete item.");
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
        </section>

        <section className="panel span-2">
          <h3>Stock Adjustments</h3>
          <div className="form-row">
            <select
              value={adjustDraft.inventoryItemId}
              onChange={(e) =>
                setAdjustDraft((prev) => ({ ...prev, inventoryItemId: e.target.value }))
              }
            >
              <option value="">Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} • {item.name}
                </option>
              ))}
            </select>
            <input
              value={adjustDraft.delta}
              onChange={(e) => setAdjustDraft((prev) => ({ ...prev, delta: e.target.value }))}
              placeholder="Delta (+/-)"
            />
            <input
              value={adjustDraft.reason}
              onChange={(e) => setAdjustDraft((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason"
            />
            <button
              type="button"
              onClick={async () => {
                if (!adjustDraft.inventoryItemId || !adjustDraft.delta) return;
                await apiFetch(`/inventory/${adjustDraft.inventoryItemId}/adjust`, {
                  method: "POST",
                  body: JSON.stringify({
                    delta: Number(adjustDraft.delta),
                    reason: adjustDraft.reason || undefined
                  })
                });
                setAdjustDraft({ inventoryItemId: "", delta: "", reason: "" });
                await load();
              }}
            >
              Apply
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Receive Inventory</h3>
          <div className="form-row">
            <select
              value={receiveDraft.inventoryItemId}
              onChange={(e) =>
                setReceiveDraft((prev) => ({ ...prev, inventoryItemId: e.target.value }))
              }
            >
              <option value="">Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} • {item.name}
                </option>
              ))}
            </select>
            <input
              value={receiveDraft.quantity}
              onChange={(e) => setReceiveDraft((prev) => ({ ...prev, quantity: e.target.value }))}
              placeholder="Qty received"
            />
            <input
              value={receiveDraft.reason}
              onChange={(e) => setReceiveDraft((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason / PO"
            />
            <button
              type="button"
              onClick={async () => {
                if (!receiveDraft.inventoryItemId || !receiveDraft.quantity) return;
                await apiFetch(`/inventory/${receiveDraft.inventoryItemId}/receive`, {
                  method: "POST",
                  body: JSON.stringify({
                    quantity: Number(receiveDraft.quantity),
                    reason: receiveDraft.reason || undefined
                  })
                });
                setReceiveDraft({ inventoryItemId: "", quantity: "", reason: "" });
                await load();
              }}
            >
              Receive
            </button>
          </div>
        </section>

        <section className="panel">
          <h3>Vendors</h3>
          <div className="form-row">
            <input
              value={newVendor.name}
              onChange={(e) => setNewVendor({ name: e.target.value })}
              placeholder="Vendor name"
            />
            <button
              type="button"
              onClick={async () => {
                setVendorError("");
                if (!newVendor.name) return;
                try {
                  await apiFetch("/vendors", {
                    method: "POST",
                    body: JSON.stringify({ name: newVendor.name })
                  });
                  setNewVendor({ name: "" });
                  await load();
                } catch (err) {
                  setVendorError(err instanceof Error ? err.message : "Unable to add vendor.");
                }
              }}
            >
              Add
            </button>
          </div>
          <div className="list">
            {vendors.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                className={selectedVendorId === vendor.id ? "active" : ""}
                onClick={() => setSelectedVendorId(vendor.id)}
              >
                {vendor.name}
              </button>
            ))}
          </div>
          {vendorError && <p className="hint">{vendorError}</p>}
        </section>

        <section className="panel">
          <h3>Edit Vendor</h3>
          {!selectedVendorId && <p className="hint">Select a vendor to edit.</p>}
          {selectedVendorId && (
            <div className="form-row">
              <input
                value={editVendor.name}
                onChange={(e) => setEditVendor((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name"
              />
              <input
                value={editVendor.contact}
                onChange={(e) => setEditVendor((prev) => ({ ...prev, contact: e.target.value }))}
                placeholder="Contact"
              />
              <input
                value={editVendor.phone}
                onChange={(e) => setEditVendor((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone"
              />
              <input
                value={editVendor.email}
                onChange={(e) => setEditVendor((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
              />
              <button
                type="button"
                onClick={async () => {
                  setVendorError("");
                  try {
                    await apiFetch(`/vendors/${selectedVendorId}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        name: editVendor.name,
                        contact: editVendor.contact || undefined,
                        phone: editVendor.phone || undefined,
                        email: editVendor.email || undefined
                      })
                    });
                    await load();
                  } catch (err) {
                    setVendorError(err instanceof Error ? err.message : "Unable to update vendor.");
                  }
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm("Delete this vendor?");
                  if (!ok) return;
                  setVendorError("");
                  try {
                    await apiFetch(`/vendors/${selectedVendorId}`, { method: "DELETE" });
                    setSelectedVendorId("");
                    await load();
                  } catch (err) {
                    setVendorError(err instanceof Error ? err.message : "Unable to delete vendor.");
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Purchase Orders</h3>
          <div className="form-row">
            <select
              value={newPO.vendorId}
              onChange={(e) => setNewPO({ vendorId: e.target.value })}
            >
              <option value="">Vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                setPoError("");
                if (!newPO.vendorId) return;
                try {
                  await apiFetch("/purchase-orders", {
                    method: "POST",
                    body: JSON.stringify({ vendorId: newPO.vendorId })
                  });
                  setNewPO({ vendorId: "" });
                  await load();
                } catch (err) {
                  setPoError(err instanceof Error ? err.message : "Unable to create PO.");
                }
              }}
            >
              Create
            </button>
          </div>
          <div className="table-list">
            <div className="table-header">
              <span>ID</span>
              <span>Vendor</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {purchaseOrders.map((po) => (
              <div key={po.id} className="table-row">
                <span>{po.id.slice(0, 6)}</span>
                <span>{po.vendor?.name ?? "-"}</span>
                <span>{po.status}</span>
                <span>
                  <button
                    type="button"
                    onClick={async () => {
                      setPoError("");
                      await apiFetch(`/purchase-orders/${po.id}/receive`, { method: "POST" });
                      await load();
                    }}
                  >
                    Receive
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setPoError("");
                      await apiFetch(`/purchase-orders/${po.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "ORDERED" })
                      });
                      await load();
                    }}
                  >
                    Mark Ordered
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setPoError("");
                      await apiFetch(`/purchase-orders/${po.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "CANCELLED" })
                      });
                      await load();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = window.confirm("Delete this purchase order?");
                      if (!ok) return;
                      setPoError("");
                      await apiFetch(`/purchase-orders/${po.id}`, { method: "DELETE" });
                      if (selectedPOId === po.id) {
                        setSelectedPOId("");
                      }
                      await load();
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setSelectedPOId(po.id)}>
                    Items
                  </button>
                </span>
              </div>
            ))}
          </div>
          {poError && <p className="hint">{poError}</p>}
        </section>

        <section className="panel span-2">
          <h3>Purchase Order Items</h3>
          {selectedPOId && <p className="hint">Status: {poStatus}</p>}
          <div className="form-row">
            <select value={selectedPOId} onChange={(e) => setSelectedPOId(e.target.value)}>
              <option value="">Select PO</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.id.slice(0, 6)} • {po.vendor?.name ?? "Vendor"}
                </option>
              ))}
            </select>
            <select
              value={poItemDraft.inventoryItemId}
              onChange={(e) =>
                setPoItemDraft((prev) => ({ ...prev, inventoryItemId: e.target.value }))
              }
            >
              <option value="">Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} • {item.name}
                </option>
              ))}
            </select>
            <input
              value={poItemDraft.quantity}
              onChange={(e) => setPoItemDraft((prev) => ({ ...prev, quantity: e.target.value }))}
              placeholder="Qty"
            />
            <input
              value={poItemDraft.unitCost}
              onChange={(e) => setPoItemDraft((prev) => ({ ...prev, unitCost: e.target.value }))}
              placeholder="Unit Cost"
            />
            <button
              type="button"
              onClick={async () => {
                setPoError("");
                if (!selectedPOId || !poItemDraft.inventoryItemId || !poItemDraft.quantity) return;
                try {
                  await apiFetch(`/purchase-orders/${selectedPOId}/items`, {
                    method: "POST",
                    body: JSON.stringify({
                      inventoryItemId: poItemDraft.inventoryItemId,
                      quantity: Number(poItemDraft.quantity),
                      unitCost: poItemDraft.unitCost ? Number(poItemDraft.unitCost) : undefined
                    })
                  });
                  setPoItemDraft({ inventoryItemId: "", quantity: "", unitCost: "" });
                  await load();
                } catch (err) {
                  setPoError(err instanceof Error ? err.message : "Unable to add PO item.");
                }
              }}
            >
              Add Item
            </button>
          </div>
          <div className="table-list">
            <div className="table-header">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit Cost</span>
              <span>ID</span>
            </div>
            {(purchaseOrders.find((po) => po.id === selectedPOId)?.items || []).map((item) => (
              <div key={item.id} className="table-row">
                <span>{items.find((inv) => inv.id === item.inventoryItemId)?.name ?? item.inventoryItemId}</span>
                <span>{item.quantity}</span>
                <span>{item.unitCost ?? "-"}</span>
                <span>
                  {item.id.slice(0, 6)}
                  <button
                    type="button"
                    onClick={async () => {
                      setPoError("");
                      await apiFetch(`/purchase-orders/${selectedPOId}/items/${item.id}`, {
                        method: "DELETE"
                      });
                      await load();
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
          {poError && <p className="hint">{poError}</p>}
        </section>

        <section className="panel span-2">
          <h3>Recent Inventory Activity</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Item</span>
              <span>Delta</span>
              <span>Reason</span>
              <span>Date</span>
            </div>
            {adjustments.map((adjustment) => (
              <div key={adjustment.id} className="table-row">
                <span>{adjustment.inventoryItem?.name ?? "-"}</span>
                <span>{Number(adjustment.delta).toFixed(2)}</span>
                <span>{adjustment.reason ?? "-"}</span>
                <span>{new Date(adjustment.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
