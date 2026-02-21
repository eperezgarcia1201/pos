import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type TableArea = { id: string; name: string; sortOrder: number };

type HostessTable = {
  id: string;
  name: string;
  status: string;
  areaId: string | null;
  posX?: number | null;
  posY?: number | null;
  shape?: string | null;
  capacity?: number | null;
  occupancy: {
    isOccupied: boolean;
    occupiedSince: string | null;
    occupiedMinutes: number;
    openTicketCount: number;
  };
};

type HostessServer = {
  id: string;
  username: string;
  displayName?: string | null;
};

type HostessRoster = {
  workingServerIds: string[];
  tableAssignments: Record<string, string>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSince(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function serverLabel(server: HostessServer) {
  const display = server.displayName?.trim();
  return display || server.username;
}

function normalizeRoster(
  value: unknown,
  validServerIds: Set<string>,
  validTableIds: Set<string>
): HostessRoster {
  if (!value || typeof value !== "object") {
    return { workingServerIds: [], tableAssignments: {} };
  }

  const source = value as { workingServerIds?: unknown; tableAssignments?: unknown };
  const workingServerIds = Array.isArray(source.workingServerIds)
    ? Array.from(
        new Set(
          source.workingServerIds.filter(
            (serverId): serverId is string => typeof serverId === "string" && validServerIds.has(serverId)
          )
        )
      )
    : [];

  const workingSet = new Set(workingServerIds);
  const tableAssignments: Record<string, string> = {};
  if (source.tableAssignments && typeof source.tableAssignments === "object") {
    for (const [tableId, serverId] of Object.entries(source.tableAssignments as Record<string, unknown>)) {
      if (!validTableIds.has(tableId)) continue;
      if (typeof serverId !== "string" || !workingSet.has(serverId)) continue;
      tableAssignments[tableId] = serverId;
    }
  }

  return { workingServerIds, tableAssignments };
}

export default function HostessBoard() {
  const [tables, setTables] = useState<HostessTable[]>([]);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [servers, setServers] = useState<HostessServer[]>([]);
  const [workingServerIds, setWorkingServerIds] = useState<string[]>([]);
  const [tableAssignments, setTableAssignments] = useState<Record<string, string>>({});
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [tableList, areaList, serverList, rosterValue] = await Promise.all([
        apiFetch("/tables/hostess"),
        apiFetch("/table-areas"),
        apiFetch("/tables/hostess/servers"),
        apiFetch("/tables/hostess/roster")
      ]);

      const nextTables = tableList as HostessTable[];
      const nextAreas = (areaList as TableArea[]).slice().sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      });
      const nextServers = serverList as HostessServer[];
      const roster = normalizeRoster(
        rosterValue,
        new Set(nextServers.map((server) => server.id)),
        new Set(nextTables.map((table) => table.id))
      );

      setTables(nextTables);
      setAreas(nextAreas);
      setServers(nextServers);
      setWorkingServerIds(roster.workingServerIds);
      setTableAssignments(roster.tableAssignments);
      setActiveAreaId((current) => {
        if (nextAreas.length === 0) return null;
        if (current && nextAreas.some((area) => area.id === current)) return current;
        return nextAreas[0]?.id ?? null;
      });
      setSelectedTableId((current) => {
        if (!current) return current;
        return nextTables.some((table) => table.id === current) ? current : null;
      });
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to load hostess board.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void load(false);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const visibleTables = useMemo(() => {
    if (!activeAreaId || areas.length === 0) return tables;
    return tables.filter((table) => table.areaId === activeAreaId);
  }, [activeAreaId, areas.length, tables]);

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) || null,
    [selectedTableId, tables]
  );

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const workingServers = useMemo(
    () => servers.filter((server) => workingServerIds.includes(server.id)),
    [servers, workingServerIds]
  );
  const workingServerSet = useMemo(() => new Set(workingServerIds), [workingServerIds]);

  const tableNodes = useMemo(() => {
    if (visibleTables.length === 0) return [] as Array<{ table: HostessTable; leftPct: number; topPct: number }>;
    const placed = visibleTables.filter(
      (table) => Number.isFinite(table.posX ?? NaN) && Number.isFinite(table.posY ?? NaN)
    );
    const hasCoordinates = placed.length > 0;
    const maxX = hasCoordinates ? Math.max(...placed.map((table) => Number(table.posX ?? 0)), 1) : 1;
    const maxY = hasCoordinates ? Math.max(...placed.map((table) => Number(table.posY ?? 0)), 1) : 1;
    const rows = Math.max(1, Math.ceil(visibleTables.length / 4));

    return visibleTables.map((table, idx) => {
      if (hasCoordinates && Number.isFinite(table.posX ?? NaN) && Number.isFinite(table.posY ?? NaN)) {
        const leftPct = clamp((Number(table.posX ?? 0) / maxX) * 100, 8, 92);
        const topPct = clamp((Number(table.posY ?? 0) / maxY) * 100, 10, 90);
        return { table, leftPct, topPct };
      }
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const leftPct = clamp(((col + 0.5) / 4) * 100, 8, 92);
      const topPct = clamp(((row + 0.5) / rows) * 100, 10, 90);
      return { table, leftPct, topPct };
    });
  }, [visibleTables]);

  const summary = useMemo(() => {
    let occupied = 0;
    let empty = 0;
    let dirty = 0;
    let reserved = 0;
    for (const table of tables) {
      if (table.status === "DIRTY") {
        dirty += 1;
        continue;
      }
      if (table.status === "RESERVED") {
        reserved += 1;
        continue;
      }
      if (table.occupancy.isOccupied) {
        occupied += 1;
      } else {
        empty += 1;
      }
    }
    return { occupied, empty, dirty, reserved };
  }, [tables]);

  const occupiedList = useMemo(
    () =>
      tables
        .filter((table) => table.occupancy.isOccupied)
        .sort((a, b) => b.occupancy.occupiedMinutes - a.occupancy.occupiedMinutes),
    [tables]
  );

  const availableList = useMemo(
    () => tables.filter((table) => !table.occupancy.isOccupied && table.status === "AVAILABLE"),
    [tables]
  );

  const setTableStatus = useCallback(
    async (tableId: string, status: "SEATED" | "AVAILABLE") => {
      try {
        await apiFetch(`/tables/${tableId}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        await load(false);
        setMessage(status === "SEATED" ? "Table marked as occupied." : "Table marked as available.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to update table.");
      }
    },
    [load]
  );

  const saveRoster = useCallback(
    async (nextWorkingServerIds: string[], nextTableAssignments: Record<string, string>, successMessage: string) => {
      await apiFetch("/tables/hostess/roster", {
        method: "PATCH",
        body: JSON.stringify({
          workingServerIds: nextWorkingServerIds,
          tableAssignments: nextTableAssignments
        })
      });
      setWorkingServerIds(nextWorkingServerIds);
      setTableAssignments(nextTableAssignments);
      setMessage(successMessage);
    },
    []
  );

  const toggleWorkingServer = useCallback(
    async (server: HostessServer) => {
      const currentlyWorking = workingServerSet.has(server.id);
      const nextWorkingServerIds = currentlyWorking
        ? workingServerIds.filter((serverId) => serverId !== server.id)
        : [...workingServerIds, server.id];
      const nextWorkingSet = new Set(nextWorkingServerIds);
      const nextTableAssignments = Object.fromEntries(
        Object.entries(tableAssignments).filter(([, serverId]) => nextWorkingSet.has(serverId))
      );
      try {
        await saveRoster(
          nextWorkingServerIds,
          nextTableAssignments,
          currentlyWorking
            ? `${serverLabel(server)} removed from today's working servers.`
            : `${serverLabel(server)} marked as working today.`
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to update working servers.");
      }
    },
    [saveRoster, tableAssignments, workingServerIds, workingServerSet]
  );

  const assignTableToServer = useCallback(
    async (tableId: string, serverId: string) => {
      if (serverId && !workingServerSet.has(serverId)) {
        setMessage("Pick a server from the working list first.");
        return;
      }
      const nextTableAssignments = { ...tableAssignments };
      if (!serverId) {
        delete nextTableAssignments[tableId];
      } else {
        nextTableAssignments[tableId] = serverId;
      }
      try {
        const assigned = serverId ? serverById.get(serverId) : null;
        await saveRoster(
          workingServerIds,
          nextTableAssignments,
          assigned ? `Table assigned to ${serverLabel(assigned)}.` : "Table assignment cleared."
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to assign table.");
      }
    },
    [saveRoster, serverById, tableAssignments, workingServerIds, workingServerSet]
  );

  const selectedTableAssignedServerId = selectedTable ? tableAssignments[selectedTable.id] ?? "" : "";
  const selectedTableAssignedServer = selectedTableAssignedServerId
    ? serverById.get(selectedTableAssignedServerId) ?? null
    : null;

  return (
    <div className="screen-shell hostess-shell">
      <div className="hostess-background-glow" />

      <header className="hostess-topbar">
        <div>
          <h2>Hostess Board</h2>
          <p>Track empty and occupied tables in real time.</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => void load(true)}>Refresh</button>
        </div>
      </header>

      {message ? <p className="hint">{message}</p> : null}

      <div className="hostess-kpis">
        <article className="hostess-kpi">
          <span>Empty Tables</span>
          <strong>{summary.empty}</strong>
        </article>
        <article className="hostess-kpi occupied">
          <span>Occupied Tables</span>
          <strong>{summary.occupied}</strong>
        </article>
        <article className="hostess-kpi dirty">
          <span>Dirty</span>
          <strong>{summary.dirty}</strong>
        </article>
        <article className="hostess-kpi reserved">
          <span>Reserved</span>
          <strong>{summary.reserved}</strong>
        </article>
      </div>

      <div className="hostess-grid">
        <section className="panel hostess-floor-panel">
          <div className="hostess-floor-toolbar">
            <h3>Table Map</h3>
          </div>
          {areas.length > 0 ? (
            <div className="hostess-area-tabs" role="tablist" aria-label="Dining areas">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  role="tab"
                  aria-selected={activeAreaId === area.id}
                  className={activeAreaId === area.id ? "active" : ""}
                  onClick={() => setActiveAreaId(area.id)}
                >
                  {area.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">No areas configured yet.</p>
          )}

          <div className="floor-plan hostess-floor">
            {loading && tables.length === 0 ? (
              <div className="table-empty"><p>Loading tables...</p></div>
            ) : null}
            {!loading && tableNodes.length === 0 ? (
              <div className="table-empty"><p>No tables in this section.</p></div>
            ) : null}
            {tableNodes.map((node) => {
              const table = node.table;
              const occupied = table.occupancy.isOccupied;
              const assignedServer = serverById.get(tableAssignments[table.id] || "");
              const statusClass =
                table.status === "DIRTY"
                  ? "dirty"
                  : table.status === "RESERVED"
                    ? "reserved"
                    : occupied
                      ? "seated has-open-ticket"
                      : "available";
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`floor-table shape-${table.shape || "rect"} ${statusClass}${selectedTableId === table.id ? " selected" : ""}`}
                  style={{ left: `${node.leftPct}%`, top: `${node.topPct}%`, transform: "translate(-50%, -50%)" }}
                  onClick={() => setSelectedTableId(table.id)}
                >
                  <strong>{table.name}</strong>
                  <span>{occupied ? `${table.occupancy.occupiedMinutes} min` : "Empty"}</span>
                  {assignedServer ? <span className="hostess-table-server">{serverLabel(assignedServer)}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="hint">Green blinking = available. Red blinking = occupied. Tap a table to mark where guests will sit.</p>
        </section>

        <section className="panel hostess-side">
          <div className="hostess-server-setup">
            <div className="hostess-server-head">
              <h3>Working Servers Today</h3>
              <span>{workingServers.length} selected</span>
            </div>
            <div className="hostess-server-grid">
              {servers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  className={workingServerSet.has(server.id) ? "active" : ""}
                  onClick={() => void toggleWorkingServer(server)}
                >
                  {serverLabel(server)}
                </button>
              ))}
              {servers.length === 0 ? <p>No active servers found.</p> : null}
            </div>
          </div>

          <h3>Seat Control</h3>
          {selectedTable ? (
            <div className="hostess-selected">
              <div className="hostess-selected-title">
                <strong>{selectedTable.name}</strong>
                <span>{selectedTable.occupancy.isOccupied ? "Occupied" : selectedTable.status}</span>
              </div>
              <div className="hostess-selected-meta">
                <span>Seats: {selectedTable.capacity ?? "-"}</span>
                <span>Open checks: {selectedTable.occupancy.openTicketCount}</span>
              </div>
              <div className="hostess-selected-meta">
                <span>Occupied time: {selectedTable.occupancy.occupiedMinutes} min</span>
                <span>Since: {formatSince(selectedTable.occupancy.occupiedSince)}</span>
              </div>
              <div className="hostess-assign-row">
                <label>
                  Assigned Server
                  <select
                    value={selectedTableAssignedServerId}
                    onChange={(event) => void assignTableToServer(selectedTable.id, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {workingServers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {serverLabel(server)}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{selectedTableAssignedServer ? serverLabel(selectedTableAssignedServer) : "No server assigned"}</span>
              </div>
              <div className="hostess-actions">
                {!selectedTable.occupancy.isOccupied && selectedTable.status !== "DIRTY" ? (
                  <button
                    type="button"
                    className="terminal-btn primary"
                    onClick={() => void setTableStatus(selectedTable.id, "SEATED")}
                  >
                    Mark This Table For Seating
                  </button>
                ) : null}
                {selectedTable.occupancy.isOccupied ? (
                  <button
                    type="button"
                    className="terminal-btn ghost"
                    onClick={() => void setTableStatus(selectedTable.id, "AVAILABLE")}
                  >
                    Mark Table Available
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="owner-empty">Select a table on the map to mark where guests will sit.</p>
          )}

          <div className="hostess-lists">
            <div className="hostess-list-card">
              <h4>Occupied Tables</h4>
              <div className="hostess-list">
                {occupiedList.slice(0, 8).map((table) => (
                  <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)}>
                    <span>{table.name}</span>
                    <strong>{table.occupancy.occupiedMinutes} min</strong>
                  </button>
                ))}
                {occupiedList.length === 0 ? <p>None</p> : null}
              </div>
            </div>
            <div className="hostess-list-card">
              <h4>Empty Tables</h4>
              <div className="hostess-list">
                {availableList.slice(0, 8).map((table) => (
                  <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)}>
                    <span>{table.name}</span>
                    <strong>Empty</strong>
                  </button>
                ))}
                {availableList.length === 0 ? <p>None</p> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
