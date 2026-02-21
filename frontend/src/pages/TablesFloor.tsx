import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { apiFetch } from "../lib/api";

type TableArea = { id: string; name: string; sortOrder: number };

type Table = {
  id: string;
  name: string;
  capacity: number | null;
  status: string;
  areaId: string | null;
  posX?: number | null;
  posY?: number | null;
  shape?: string | null;
};

type FloorDecoration = {
  id: string;
  areaId: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
  color?: string;
};

type DeleteDialog =
  | { kind: "table"; id: string; label: string }
  | { kind: "decor"; id: string; label: string };

const tableShapes = [
  { value: "rect", label: "Rectangle" },
  { value: "square", label: "Square" },
  { value: "round", label: "Round" },
  { value: "booth", label: "Booth" },
  { value: "bar", label: "Bar" }
];

const decorationTools = [
  { value: "label", label: "Text Label", defaultText: "Section", defaultWidth: 180, defaultHeight: 48 },
  { value: "wall", label: "Wall", defaultText: "Wall", defaultWidth: 220, defaultHeight: 24 },
  { value: "bar", label: "Bar Counter", defaultText: "Bar", defaultWidth: 180, defaultHeight: 56 },
  { value: "service", label: "Service Station", defaultText: "Service", defaultWidth: 130, defaultHeight: 62 },
  { value: "plant", label: "Plant", defaultText: "Plant", defaultWidth: 62, defaultHeight: 62 },
  { value: "door", label: "Door", defaultText: "Door", defaultWidth: 86, defaultHeight: 24 }
];

const statusStyles: Record<string, string> = {
  AVAILABLE: "table-card available",
  SEATED: "table-card seated",
  DIRTY: "table-card dirty",
  RESERVED: "table-card reserved"
};

function toInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function clampPos(value: number) {
  return Math.max(0, Math.round(value));
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function decorationSpec(type: string) {
  return (
    decorationTools.find((tool) => tool.value === type) || {
      value: "label",
      label: "Text Label",
      defaultText: "Section",
      defaultWidth: 180,
      defaultHeight: 48
    }
  );
}

function normalizeDecorations(value: unknown) {
  if (!Array.isArray(value)) return [] as FloorDecoration[];
  return value
    .filter((entry): entry is FloorDecoration => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id || randomId("decor")),
      areaId: String(entry.areaId || ""),
      type: String(entry.type || "label"),
      x: clampPos(typeof entry.x === "number" ? entry.x : 40),
      y: clampPos(typeof entry.y === "number" ? entry.y : 40),
      width: typeof entry.width === "number" ? Math.max(20, Math.round(entry.width)) : undefined,
      height: typeof entry.height === "number" ? Math.max(20, Math.round(entry.height)) : undefined,
      rotation: typeof entry.rotation === "number" ? Math.max(-180, Math.min(180, Math.round(entry.rotation))) : undefined,
      text: typeof entry.text === "string" ? entry.text : undefined,
      color: typeof entry.color === "string" ? entry.color : undefined
    }))
    .filter((entry) => entry.areaId.length > 0);
}

export default function TablesFloor() {
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [decorations, setDecorations] = useState<FloorDecoration[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("all");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedDecorationId, setSelectedDecorationId] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newTable, setNewTable] = useState({
    name: "",
    capacity: "",
    areaId: "",
    posX: "",
    posY: "",
    shape: "rect"
  });
  const [tableEditor, setTableEditor] = useState({
    name: "",
    capacity: "",
    areaId: "",
    shape: "rect",
    status: "AVAILABLE"
  });
  const [newDecoration, setNewDecoration] = useState({
    type: "label",
    text: "",
    color: "#7ea4dc"
  });
  const [decorationEditor, setDecorationEditor] = useState({
    type: "label",
    areaId: "",
    text: "",
    color: "#7ea4dc",
    width: "",
    height: "",
    rotation: "0"
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [dragging, setDragging] = useState<{
    kind: "table" | "decor";
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const floorRef = useRef<HTMLDivElement | null>(null);
  const tablesRef = useRef<Table[]>([]);
  const decorationsRef = useRef<FloorDecoration[]>([]);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    decorationsRef.current = decorations;
  }, [decorations]);

  const load = async () => {
    const [areaList, tableList, decorList] = await Promise.all([
      apiFetch("/table-areas"),
      apiFetch("/tables"),
      apiFetch("/tables/floor-decor").catch(() => [])
    ]);
    const sortedAreas = (areaList as TableArea[]).slice().sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
    const nextTables = tableList as Table[];
    const nextDecorations = normalizeDecorations(decorList);

    setAreas(sortedAreas);
    setTables(nextTables);
    setDecorations(nextDecorations);

    setSelectedAreaId((current) => {
      if (sortedAreas.length === 0) return "all";
      if (current === "all") return sortedAreas[0].id;
      return sortedAreas.some((area) => area.id === current) ? current : sortedAreas[0].id;
    });
    setSelectedTableId((current) => (nextTables.some((table) => table.id === current) ? current : ""));
    setSelectedDecorationId((current) => (nextDecorations.some((decor) => decor.id === current) ? current : ""));
  };

  useEffect(() => {
    load().catch((err) => {
      setLayoutMessage(err instanceof Error ? err.message : "Unable to load floor layout.");
    });
  }, []);

  useEffect(() => {
    if (selectedAreaId !== "all") {
      setNewTable((prev) => ({ ...prev, areaId: selectedAreaId }));
    }
  }, [selectedAreaId]);

  const selectedTable = useMemo(() => tables.find((table) => table.id === selectedTableId) || null, [tables, selectedTableId]);
  const selectedDecoration = useMemo(
    () => decorations.find((decor) => decor.id === selectedDecorationId) || null,
    [decorations, selectedDecorationId]
  );

  useEffect(() => {
    if (!selectedTable) return;
    setTableEditor({
      name: selectedTable.name,
      capacity: selectedTable.capacity ? String(selectedTable.capacity) : "",
      areaId: selectedTable.areaId || "",
      shape: selectedTable.shape || "rect",
      status: selectedTable.status || "AVAILABLE"
    });
  }, [selectedTable]);

  useEffect(() => {
    if (!selectedDecoration) return;
    setDecorationEditor({
      type: selectedDecoration.type || "label",
      areaId: selectedDecoration.areaId || "",
      text: selectedDecoration.text || "",
      color: selectedDecoration.color || "#7ea4dc",
      width: selectedDecoration.width ? String(selectedDecoration.width) : "",
      height: selectedDecoration.height ? String(selectedDecoration.height) : "",
      rotation: selectedDecoration.rotation ? String(selectedDecoration.rotation) : "0"
    });
  }, [selectedDecoration]);

  const visibleTables = useMemo(
    () => tables.filter((table) => selectedAreaId === "all" || table.areaId === selectedAreaId),
    [tables, selectedAreaId]
  );

  const visibleDecorations = useMemo(
    () => decorations.filter((decor) => selectedAreaId === "all" || decor.areaId === selectedAreaId),
    [decorations, selectedAreaId]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Table[]>();
    for (const table of tables) {
      const key = table.areaId || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(table);
    }
    return map;
  }, [tables]);

  const persistDecorations = async (nextDecorations: FloorDecoration[]) => {
    const normalized = nextDecorations.map((entry) => ({
      id: entry.id,
      areaId: entry.areaId,
      type: entry.type,
      x: clampPos(entry.x),
      y: clampPos(entry.y),
      width: entry.width ? Math.max(20, Math.round(entry.width)) : undefined,
      height: entry.height ? Math.max(20, Math.round(entry.height)) : undefined,
      rotation:
        typeof entry.rotation === "number"
          ? Math.max(-180, Math.min(180, Math.round(entry.rotation)))
          : undefined,
      text: entry.text || undefined,
      color: entry.color || undefined
    }));
    await apiFetch("/tables/floor-decor", {
      method: "PATCH",
      body: JSON.stringify({ decorations: normalized })
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      const rect = floorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextX = clampPos(event.clientX - rect.left - dragging.offsetX);
      const nextY = clampPos(event.clientY - rect.top - dragging.offsetY);

      if (dragging.kind === "table") {
        setTables((prev) =>
          prev.map((table) => (table.id === dragging.id ? { ...table, posX: nextX, posY: nextY } : table))
        );
      } else {
        setDecorations((prev) =>
          prev.map((decor) => (decor.id === dragging.id ? { ...decor, x: nextX, y: nextY } : decor))
        );
      }
    };

    const handleUp = async () => {
      if (dragging.kind === "table") {
        const table = tablesRef.current.find((entry) => entry.id === dragging.id);
        if (table) {
          await apiFetch(`/tables/${table.id}`, {
            method: "PATCH",
            body: JSON.stringify({ posX: table.posX ?? 0, posY: table.posY ?? 0 })
          });
        }
      } else {
        await persistDecorations(decorationsRef.current);
      }
      setDragging(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging]);

  const startDragTable = (event: ReactPointerEvent<HTMLDivElement>, table: Table) => {
    if (!editMode) return;
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedTableId(table.id);
    setSelectedDecorationId("");
    const currentX = table.posX ?? 40;
    const currentY = table.posY ?? 40;
    const offsetX = event.clientX - rect.left - currentX;
    const offsetY = event.clientY - rect.top - currentY;
    setDragging({ kind: "table", id: table.id, offsetX, offsetY });
  };

  const startDragDecoration = (event: ReactPointerEvent<HTMLDivElement>, decor: FloorDecoration) => {
    if (!editMode) return;
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedDecorationId(decor.id);
    setSelectedTableId("");
    const offsetX = event.clientX - rect.left - decor.x;
    const offsetY = event.clientY - rect.top - decor.y;
    setDragging({ kind: "decor", id: decor.id, offsetX, offsetY });
  };

  const addTable = async () => {
    const name = newTable.name.trim();
    if (!name) {
      setLayoutMessage("Table name is required.");
      return;
    }
    const areaId = newTable.areaId || (selectedAreaId !== "all" ? selectedAreaId : areas[0]?.id || "");
    if (!areaId) {
      setLayoutMessage("Pick an area first.");
      return;
    }
    const rect = floorRef.current?.getBoundingClientRect();
    const created = await apiFetch("/tables", {
      method: "POST",
      body: JSON.stringify({
        name,
        capacity: newTable.capacity ? Number(newTable.capacity) : undefined,
        areaId,
        posX: newTable.posX ? Number(newTable.posX) : rect ? Math.round(rect.width * 0.42) : undefined,
        posY: newTable.posY ? Number(newTable.posY) : rect ? Math.round(rect.height * 0.36) : undefined,
        shape: newTable.shape || undefined
      })
    });
    setNewTable({
      name: "",
      capacity: "",
      areaId: selectedAreaId === "all" ? "" : selectedAreaId,
      posX: "",
      posY: "",
      shape: "rect"
    });
    await load();
    if (created?.id) {
      setSelectedTableId(String(created.id));
      setSelectedDecorationId("");
    }
    setLayoutMessage("Table added.");
  };

  const saveSelectedTable = async () => {
    if (!selectedTable) return;
    const name = tableEditor.name.trim();
    if (!name) {
      setLayoutMessage("Table name is required.");
      return;
    }
    await apiFetch(`/tables/${selectedTable.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        capacity: tableEditor.capacity ? Number(tableEditor.capacity) : undefined,
        areaId: tableEditor.areaId || undefined,
        shape: tableEditor.shape || undefined,
        status: tableEditor.status || undefined
      })
    });
    await load();
    setLayoutMessage("Table updated.");
  };

  const addDecoration = async () => {
    const areaId = selectedAreaId === "all" ? areas[0]?.id || "" : selectedAreaId;
    if (!areaId) {
      setLayoutMessage("Pick an area before adding decoration.");
      return;
    }
    const spec = decorationSpec(newDecoration.type);
    const rect = floorRef.current?.getBoundingClientRect();
    const nextEntry: FloorDecoration = {
      id: randomId("decor"),
      areaId,
      type: spec.value,
      x: rect ? Math.round(rect.width * 0.52) : 260,
      y: rect ? Math.round(rect.height * 0.42) : 220,
      width: spec.defaultWidth,
      height: spec.defaultHeight,
      rotation: 0,
      text: (newDecoration.text || spec.defaultText).trim() || spec.defaultText,
      color: newDecoration.color || "#7ea4dc"
    };
    const nextDecorations = [...decorations, nextEntry];
    setDecorations(nextDecorations);
    setSelectedDecorationId(nextEntry.id);
    setSelectedTableId("");
    await persistDecorations(nextDecorations);
    setLayoutMessage("Decoration added.");
  };

  const saveSelectedDecoration = async () => {
    if (!selectedDecoration) return;
    const nextDecorations = decorations.map((decor) =>
      decor.id === selectedDecoration.id
        ? {
            ...decor,
            type: decorationEditor.type || decor.type,
            areaId: decorationEditor.areaId || decor.areaId,
            text: decorationEditor.text.trim() || decorationSpec(decorationEditor.type || decor.type).defaultText,
            color: decorationEditor.color || decor.color,
            width: Math.max(20, toInt(decorationEditor.width, decor.width || decorationSpec(decor.type).defaultWidth)),
            height: Math.max(20, toInt(decorationEditor.height, decor.height || decorationSpec(decor.type).defaultHeight)),
            rotation: Math.max(-180, Math.min(180, toInt(decorationEditor.rotation, decor.rotation || 0)))
          }
        : decor
    );
    setDecorations(nextDecorations);
    await persistDecorations(nextDecorations);
    setLayoutMessage("Decoration updated.");
  };

  const updateStatus = async (tableId: string, status: string) => {
    await apiFetch(`/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    setTables((prev) => prev.map((entry) => (entry.id === tableId ? { ...entry, status } : entry)));
  };

  const updateShape = async (tableId: string, shape: string) => {
    await apiFetch(`/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ shape })
    });
    setTables((prev) => prev.map((entry) => (entry.id === tableId ? { ...entry, shape } : entry)));
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;
    if (deleteDialog.kind === "table") {
      await apiFetch(`/tables/${deleteDialog.id}`, { method: "DELETE" });
      setSelectedTableId("");
      await load();
      setLayoutMessage("Table deleted.");
    } else {
      const nextDecorations = decorations.filter((decor) => decor.id !== deleteDialog.id);
      setDecorations(nextDecorations);
      setSelectedDecorationId("");
      await persistDecorations(nextDecorations);
      setLayoutMessage("Decoration deleted.");
    }
    setDeleteDialog(null);
  };

  return (
    <div className={`screen-shell table-floor-shell${editMode ? " layout-edit-mode" : ""}`}>
      <header className="screen-header">
        <div>
          <h2>Table Floor</h2>
          <p>Manage seating, reservations, and the floor plan layout.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="terminal-btn"
            onClick={() => {
              setEditMode((prev) => !prev);
              setSelectedTableId("");
              setSelectedDecorationId("");
            }}
          >
            {editMode ? "Exit Layout" : "Edit Layout"}
          </button>
        </div>
      </header>

      {layoutMessage ? <p className="hint">{layoutMessage}</p> : null}

      <div className="screen-content table-floor-content">
        <section className={`panel span-2 table-floor-plan-panel${editMode ? " editing" : ""}`}>
          <div className="table-floor-plan-head">
            <h3>Floor Plan</h3>
            <div className="form-row floor-plan-toolbar">
              <select value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.target.value)}>
                <option value="all">All Areas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            ref={floorRef}
            className={editMode ? "floor-plan table-floor-canvas edit" : "floor-plan table-floor-canvas"}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedTableId("");
                setSelectedDecorationId("");
              }
            }}
          >
            {visibleDecorations.map((decor) => {
              const spec = decorationSpec(decor.type);
              return (
                <div
                  key={decor.id}
                  className={`floor-decor floor-decor-${decor.type}${selectedDecorationId === decor.id ? " selected" : ""}`}
                  style={{
                    left: decor.x,
                    top: decor.y,
                    width: decor.width || spec.defaultWidth,
                    height: decor.height || spec.defaultHeight,
                    transform: `rotate(${decor.rotation || 0}deg)`,
                    ["--decor-color" as string]: decor.color || "#7ea4dc"
                  }}
                  onPointerDown={(event) => startDragDecoration(event, decor)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedDecorationId(decor.id);
                    setSelectedTableId("");
                  }}
                >
                  <span>{decor.text || spec.defaultText}</span>
                </div>
              );
            })}

            {visibleTables.map((table) => (
              <div
                key={table.id}
                className={`floor-table ${table.status.toLowerCase()} shape-${table.shape || "rect"}${selectedTableId === table.id ? " selected-layout" : ""}`}
                style={{ left: table.posX ?? 40, top: table.posY ?? 40 }}
                onPointerDown={(event) => startDragTable(event, table)}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedTableId(table.id);
                  setSelectedDecorationId("");
                }}
              >
                <strong>{table.name}</strong>
                <span>Seats {table.capacity ?? "-"}</span>
              </div>
            ))}
          </div>

          {editMode && (
            <aside className="table-floor-toolbox">
              <section className="table-floor-toolbox-card">
                <h4>Add Table</h4>
                <div className="table-floor-toolbox-grid">
                  <input
                    value={newTable.name}
                    onChange={(event) => setNewTable((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Table name"
                  />
                  <input
                    value={newTable.capacity}
                    onChange={(event) => setNewTable((prev) => ({ ...prev, capacity: event.target.value }))}
                    placeholder="Seats"
                  />
                  <select
                    value={newTable.areaId}
                    onChange={(event) => setNewTable((prev) => ({ ...prev, areaId: event.target.value }))}
                  >
                    <option value="">Area</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newTable.shape}
                    onChange={(event) => setNewTable((prev) => ({ ...prev, shape: event.target.value }))}
                  >
                    {tableShapes.map((shape) => (
                      <option key={shape.value} value={shape.value}>
                        {shape.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="terminal-btn primary" onClick={() => void addTable()}>
                    Add
                  </button>
                </div>
              </section>

              <section className="table-floor-toolbox-card">
                <h4>Selected Table</h4>
                {!selectedTable ? (
                  <p>Select a table on the map.</p>
                ) : (
                  <div className="table-floor-toolbox-grid">
                    <input
                      value={tableEditor.name}
                      onChange={(event) => setTableEditor((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Table name"
                    />
                    <input
                      value={tableEditor.capacity}
                      onChange={(event) => setTableEditor((prev) => ({ ...prev, capacity: event.target.value }))}
                      placeholder="Seats"
                    />
                    <select
                      value={tableEditor.areaId}
                      onChange={(event) => setTableEditor((prev) => ({ ...prev, areaId: event.target.value }))}
                    >
                      <option value="">Area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tableEditor.shape}
                      onChange={(event) => setTableEditor((prev) => ({ ...prev, shape: event.target.value }))}
                    >
                      {tableShapes.map((shape) => (
                        <option key={shape.value} value={shape.value}>
                          {shape.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tableEditor.status}
                      onChange={(event) => setTableEditor((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="SEATED">Seated</option>
                      <option value="DIRTY">Dirty</option>
                      <option value="RESERVED">Reserved</option>
                    </select>
                    <div className="table-floor-toolbox-actions">
                      <button type="button" className="terminal-btn primary" onClick={() => void saveSelectedTable()}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="terminal-btn ghost"
                        onClick={() =>
                          setDeleteDialog({
                            kind: "table",
                            id: selectedTable.id,
                            label: selectedTable.name
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="table-floor-toolbox-card">
                <h4>Decoration Tools</h4>
                <div className="table-floor-toolbox-grid">
                  <select
                    value={newDecoration.type}
                    onChange={(event) => setNewDecoration((prev) => ({ ...prev, type: event.target.value }))}
                  >
                    {decorationTools.map((tool) => (
                      <option key={tool.value} value={tool.value}>
                        {tool.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newDecoration.text}
                    onChange={(event) => setNewDecoration((prev) => ({ ...prev, text: event.target.value }))}
                    placeholder="Label text"
                  />
                  <label className="table-floor-color-field">
                    Color
                    <input
                      type="color"
                      value={newDecoration.color}
                      onChange={(event) => setNewDecoration((prev) => ({ ...prev, color: event.target.value }))}
                    />
                  </label>
                  <button type="button" className="terminal-btn primary" onClick={() => void addDecoration()}>
                    Add Decor
                  </button>
                </div>
              </section>

              <section className="table-floor-toolbox-card">
                <h4>Selected Decoration</h4>
                {!selectedDecoration ? (
                  <p>Select a decoration on the map.</p>
                ) : (
                  <div className="table-floor-toolbox-grid">
                    <select
                      value={decorationEditor.type}
                      onChange={(event) => setDecorationEditor((prev) => ({ ...prev, type: event.target.value }))}
                    >
                      {decorationTools.map((tool) => (
                        <option key={tool.value} value={tool.value}>
                          {tool.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={decorationEditor.areaId}
                      onChange={(event) => setDecorationEditor((prev) => ({ ...prev, areaId: event.target.value }))}
                    >
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={decorationEditor.text}
                      onChange={(event) => setDecorationEditor((prev) => ({ ...prev, text: event.target.value }))}
                      placeholder="Display text"
                    />
                    <div className="table-floor-toolbox-grid split">
                      <input
                        value={decorationEditor.width}
                        onChange={(event) => setDecorationEditor((prev) => ({ ...prev, width: event.target.value }))}
                        placeholder="Width"
                      />
                      <input
                        value={decorationEditor.height}
                        onChange={(event) => setDecorationEditor((prev) => ({ ...prev, height: event.target.value }))}
                        placeholder="Height"
                      />
                    </div>
                    <input
                      value={decorationEditor.rotation}
                      onChange={(event) => setDecorationEditor((prev) => ({ ...prev, rotation: event.target.value }))}
                      placeholder="Rotation (-180 to 180)"
                    />
                    <label className="table-floor-color-field">
                      Color
                      <input
                        type="color"
                        value={decorationEditor.color}
                        onChange={(event) => setDecorationEditor((prev) => ({ ...prev, color: event.target.value }))}
                      />
                    </label>
                    <div className="table-floor-toolbox-actions">
                      <button type="button" className="terminal-btn primary" onClick={() => void saveSelectedDecoration()}>
                        Save Decor
                      </button>
                      <button
                        type="button"
                        className="terminal-btn ghost"
                        onClick={() =>
                          setDeleteDialog({
                            kind: "decor",
                            id: selectedDecoration.id,
                            label: selectedDecoration.text || decorationSpec(selectedDecoration.type).label
                          })
                        }
                      >
                        Delete Decor
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </aside>
          )}

          {editMode ? (
            <p className="hint">Drag tables and decorations to set positions. Changes save automatically.</p>
          ) : null}
        </section>

        {!editMode && (
          <>
            <section className="panel">
              <h3>Areas</h3>
              <div className="form-row">
                <input value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Area name" />
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
              <ul className="list">
                {areas.map((area) => (
                  <li key={area.id}>
                    <button
                      type="button"
                      className={selectedAreaId === area.id ? "area-pill active" : "area-pill"}
                      onClick={() => setSelectedAreaId(area.id)}
                    >
                      {area.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h3>Add Table</h3>
              <div className="form-row">
                <input
                  value={newTable.name}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Table name"
                />
                <input
                  value={newTable.capacity}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, capacity: event.target.value }))}
                  placeholder="Capacity"
                />
                <select
                  value={newTable.areaId}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, areaId: event.target.value }))}
                >
                  <option value="">Area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTable.shape}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, shape: event.target.value }))}
                >
                  {tableShapes.map((shape) => (
                    <option key={shape.value} value={shape.value}>
                      {shape.label}
                    </option>
                  ))}
                </select>
                <input
                  value={newTable.posX}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, posX: event.target.value }))}
                  placeholder="X"
                />
                <input
                  value={newTable.posY}
                  onChange={(event) => setNewTable((prev) => ({ ...prev, posY: event.target.value }))}
                  placeholder="Y"
                />
                <button type="button" onClick={() => void addTable()}>
                  Add
                </button>
              </div>
            </section>

            {areas.map((area) => (
              <section key={area.id} className="panel span-2">
                <h3>{area.name}</h3>
                <div className="table-grid">
                  {(grouped.get(area.id) || []).map((table) => (
                    <div key={table.id} className={statusStyles[table.status] || "table-card"}>
                      <div className="table-name">{table.name}</div>
                      <div className="table-meta">Seats: {table.capacity ?? "-"}</div>
                      <div className="table-actions">
                        <select value={table.shape || "rect"} onChange={(event) => void updateShape(table.id, event.target.value)}>
                          {tableShapes.map((shape) => (
                            <option key={shape.value} value={shape.value}>
                              {shape.label}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => void updateStatus(table.id, "SEATED")}>
                          Seat
                        </button>
                        <button type="button" onClick={() => void updateStatus(table.id, "AVAILABLE")}>
                          Clear
                        </button>
                        <button type="button" onClick={() => void updateStatus(table.id, "DIRTY")}>
                          Dirty
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="panel span-2">
              <h3>Unassigned</h3>
              <div className="table-grid">
                {(grouped.get("unassigned") || []).map((table) => (
                  <div key={table.id} className={statusStyles[table.status] || "table-card"}>
                    <div className="table-name">{table.name}</div>
                    <div className="table-meta">Seats: {table.capacity ?? "-"}</div>
                    <div className="table-actions">
                      <select value={table.shape || "rect"} onChange={(event) => void updateShape(table.id, event.target.value)}>
                        {tableShapes.map((shape) => (
                          <option key={shape.value} value={shape.value}>
                            {shape.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void updateStatus(table.id, "SEATED")}>
                        Seat
                      </button>
                      <button type="button" onClick={() => void updateStatus(table.id, "AVAILABLE")}>
                        Clear
                      </button>
                      <button type="button" onClick={() => void updateStatus(table.id, "DIRTY")}>
                        Dirty
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {deleteDialog ? (
        <div className="terminal-recall">
          <div className="terminal-recall-card table-floor-dialog">
            <div className="modal-header">
              <h3>{deleteDialog.kind === "table" ? "Delete Table" : "Delete Decoration"}</h3>
            </div>
            <p>
              {deleteDialog.kind === "table"
                ? `Delete table "${deleteDialog.label}"?`
                : `Delete decoration "${deleteDialog.label}"?`}
            </p>
            <div className="table-setup-dialog-actions">
              <button type="button" className="terminal-btn ghost" onClick={() => setDeleteDialog(null)}>
                Cancel
              </button>
              <button type="button" className="terminal-btn primary" onClick={() => void confirmDelete()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
