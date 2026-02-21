import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type TableArea = { id: string; name: string; sortOrder: number };
type Table = {
  id: string;
  name: string;
  capacity: number | null;
  areaId: string | null;
  status: string;
};

type ConfirmDialog =
  | { kind: "delete-area"; id: string; name: string }
  | { kind: "delete-table"; id: string; name: string };

export default function TableSetup() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [newArea, setNewArea] = useState("");
  const [newTable, setNewTable] = useState({ name: "", capacity: "", areaId: "" });
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [editTable, setEditTable] = useState({ name: "", capacity: "", areaId: "" });
  const [renameAreaDialog, setRenameAreaDialog] = useState<{ id: string; originalName: string; value: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const load = async () => {
    const [areaList, tableList] = await Promise.all([
      apiFetch("/table-areas"),
      apiFetch("/tables")
    ]);
    setAreas(areaList);
    setTables(tableList);
    if (!selectedAreaId && areaList.length > 0) {
      setSelectedAreaId(areaList[0].id);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  useEffect(() => {
    const table = tables.find((t) => t.id === selectedTableId);
    if (table) {
      setEditTable({
        name: table.name,
        capacity: table.capacity ? String(table.capacity) : "",
        areaId: table.areaId || ""
      });
    }
  }, [selectedTableId, tables]);

  const filteredTables = useMemo(() => {
    if (!selectedAreaId) return tables;
    return tables.filter((table) => table.areaId === selectedAreaId);
  }, [tables, selectedAreaId]);

  const selectedTable = useMemo(() => tables.find((table) => table.id === selectedTableId) || null, [tables, selectedTableId]);

  const closeDialogs = () => {
    if (dialogBusy) return;
    setRenameAreaDialog(null);
    setConfirmDialog(null);
    setDialogError("");
  };

  const submitRenameArea = async () => {
    if (!renameAreaDialog) return;
    const next = renameAreaDialog.value.trim();
    if (!next) {
      setDialogError("Group name is required.");
      return;
    }
    if (next === renameAreaDialog.originalName.trim()) {
      closeDialogs();
      return;
    }
    setDialogBusy(true);
    setDialogError("");
    try {
      await apiFetch(`/table-areas/${renameAreaDialog.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next })
      });
      await load();
      setRenameAreaDialog(null);
      setDialogError("");
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Unable to rename group.");
    } finally {
      setDialogBusy(false);
    }
  };

  const submitConfirm = async () => {
    if (!confirmDialog) return;
    setDialogBusy(true);
    setDialogError("");
    try {
      if (confirmDialog.kind === "delete-area") {
        await apiFetch(`/table-areas/${confirmDialog.id}`, { method: "DELETE" });
        if (selectedAreaId === confirmDialog.id) {
          setSelectedAreaId("");
        }
      } else {
        await apiFetch(`/tables/${confirmDialog.id}`, { method: "DELETE" });
        if (selectedTableId === confirmDialog.id) {
          setSelectedTableId("");
        }
      }
      await load();
      setConfirmDialog(null);
      setDialogError("");
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Unable to complete action.");
    } finally {
      setDialogBusy(false);
    }
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Table Setup</h2>
          <p>Dine in table groups and floor table list.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/tables")}>
            Open Floor Map
          </button>
        </div>
      </header>

      <div className="table-setup">
        <section className="panel table-setup-groups">
          <h3>Dine In Table Groups</h3>
          <div className="form-row">
            <input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder="New group name"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newArea.trim()) return;
                await apiFetch("/table-areas", {
                  method: "POST",
                  body: JSON.stringify({ name: newArea.trim() })
                });
                setNewArea("");
                await load();
              }}
            >
              Add
            </button>
          </div>
          <div className="table-group-list">
            {areas.map((area) => (
              <div key={area.id} className="table-group-row">
                <button
                  type="button"
                  className={selectedAreaId === area.id ? "active" : ""}
                  onClick={() => setSelectedAreaId(area.id)}
                >
                  {area.name}
                </button>
                <div className="table-group-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setDialogError("");
                      setRenameAreaDialog({ id: area.id, originalName: area.name, value: area.name });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDialogError("");
                      setConfirmDialog({ kind: "delete-area", id: area.id, name: area.name });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hint">Select a group to filter tables.</div>
        </section>

        <section className="panel table-setup-tables">
          <div className="table-setup-header">
            <h3>Dine In Tables</h3>
            <div className="table-setup-actions">
              <select value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)}>
                <option value="">All Groups</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-setup-grid">
            {filteredTables.map((table) => (
              <button
                key={table.id}
                type="button"
                className={selectedTableId === table.id ? "table-setup-tile active" : "table-setup-tile"}
                onClick={() => setSelectedTableId(table.id)}
              >
                <span className="table-setup-name">{table.name}</span>
                <span className="table-setup-meta">Seats {table.capacity ?? "-"}</span>
              </button>
            ))}
          </div>

          <div className="table-setup-forms">
            <div className="table-setup-form">
              <h4>Add Table</h4>
              <div className="form-row">
                <input
                  value={newTable.name}
                  onChange={(e) => setNewTable((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Table name"
                />
                <input
                  value={newTable.capacity}
                  onChange={(e) => setNewTable((prev) => ({ ...prev, capacity: e.target.value }))}
                  placeholder="Capacity"
                />
                <select
                  value={newTable.areaId}
                  onChange={(e) => setNewTable((prev) => ({ ...prev, areaId: e.target.value }))}
                >
                  <option value="">Group</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newTable.name.trim()) return;
                    await apiFetch("/tables", {
                      method: "POST",
                      body: JSON.stringify({
                        name: newTable.name.trim(),
                        capacity: newTable.capacity ? Number(newTable.capacity) : undefined,
                        areaId: newTable.areaId || undefined
                      })
                    });
                    setNewTable({ name: "", capacity: "", areaId: "" });
                    await load();
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="table-setup-form">
              <h4>Edit Table</h4>
              {!selectedTableId && <p className="hint">Select a table to edit details.</p>}
              {selectedTableId && (
                <div className="form-row">
                  <input
                    value={editTable.name}
                    onChange={(e) => setEditTable((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Table name"
                  />
                  <input
                    value={editTable.capacity}
                    onChange={(e) => setEditTable((prev) => ({ ...prev, capacity: e.target.value }))}
                    placeholder="Capacity"
                  />
                  <select
                    value={editTable.areaId}
                    onChange={(e) => setEditTable((prev) => ({ ...prev, areaId: e.target.value }))}
                  >
                    <option value="">Group</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/tables/${selectedTableId}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          name: editTable.name,
                          capacity: editTable.capacity ? Number(editTable.capacity) : undefined,
                          areaId: editTable.areaId || undefined
                        })
                      });
                      await load();
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTableId) return;
                      setDialogError("");
                      setConfirmDialog({
                        kind: "delete-table",
                        id: selectedTableId,
                        name: selectedTable?.name || "this table"
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {renameAreaDialog ? (
        <div className="terminal-recall">
          <div className="terminal-recall-card table-setup-dialog">
            <div className="modal-header">
              <h3>Rename Group</h3>
            </div>
            <p>Update the dining group name.</p>
            <input
              value={renameAreaDialog.value}
              autoFocus
              disabled={dialogBusy}
              onChange={(event) => setRenameAreaDialog((prev) => (prev ? { ...prev, value: event.target.value } : prev))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitRenameArea();
                }
              }}
            />
            {dialogError ? <p className="table-setup-dialog-error">{dialogError}</p> : null}
            <div className="table-setup-dialog-actions">
              <button type="button" className="terminal-btn ghost" onClick={closeDialogs} disabled={dialogBusy}>
                Cancel
              </button>
              <button type="button" className="terminal-btn primary" onClick={() => void submitRenameArea()} disabled={dialogBusy}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="terminal-recall">
          <div className="terminal-recall-card table-setup-dialog">
            <div className="modal-header">
              <h3>{confirmDialog.kind === "delete-area" ? "Delete Group" : "Delete Table"}</h3>
            </div>
            <p>
              {confirmDialog.kind === "delete-area"
                ? `Delete "${confirmDialog.name}"? Tables in this group will become unassigned.`
                : `Delete table "${confirmDialog.name}"?`}
            </p>
            {dialogError ? <p className="table-setup-dialog-error">{dialogError}</p> : null}
            <div className="table-setup-dialog-actions">
              <button type="button" className="terminal-btn ghost" onClick={closeDialogs} disabled={dialogBusy}>
                Cancel
              </button>
              <button type="button" className="terminal-btn primary" onClick={() => void submitConfirm()} disabled={dialogBusy}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
