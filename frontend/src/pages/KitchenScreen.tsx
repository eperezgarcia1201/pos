import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "../lib/api";

type Ticket = {
  id: string;
  status: string;
  stationId?: string | null;
  stationName?: string | null;
  priority?: string | null;
  holdUntil?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  order: {
    id: string;
    ticketNumber?: number | null;
    orderNumber?: number | null;
    orderType: string;
    table?: { name: string } | null;
    server?: { displayName?: string | null; username: string } | null;
    items: Array<{
      id: string;
      name: string | null;
      quantity: number;
      notes?: string | null;
      modifiers?: Array<{ id: string; name: string; quantity: number }>;
    }>;
  };
};

const DEFAULT_DISPLAY_SETTINGS = {
  baseFontSize: 24,
  headerFontSize: 36,
  subheaderFontSize: 18,
  columnHeaderFontSize: 18,
  ticketTitleFontSize: 28,
  ticketMetaFontSize: 18,
  timeFontSize: 18,
  itemFontSize: 22,
  modifierFontSize: 20,
  pillFontSize: 16,
  buttonFontSize: 20,
  modifierColor: "#f87171",
  warnMinutes: 5,
  urgentMinutes: 10,
  soundOnNew: true,
  soundOnUrgent: true,
  soundVolume: 0.5,
  newColor: "#facc15",
  workingColor: "#4ade80",
  doneColor: "#cbd5f5",
  freshColor: "#22c55e",
  warnColor: "#f59e0b",
  urgentColor: "#ef4444"
};

export default function KitchenScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [stationFilter, setStationFilter] = useState("all");
  const [displaySettings, setDisplaySettings] = useState(DEFAULT_DISPLAY_SETTINGS);
  const [includeDone, setIncludeDone] = useState(false);
  const [workingLayout, setWorkingLayout] = useState<"focus" | "board">("focus");
  const [nowTick, setNowTick] = useState(Date.now());
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1600 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight
  }));
  const [focusPage, setFocusPage] = useState(0);
  const [historyTicket, setHistoryTicket] = useState<Ticket | null>(null);
  const [historyEvents, setHistoryEvents] = useState<Array<{ id: string; action: string; note?: string | null; createdAt: string; user?: { username: string; displayName?: string | null } | null }>>([]);
  const seenTicketIds = useRef<Set<string>>(new Set());
  const urgentTicketIds = useRef<Set<string>>(new Set());

  const playBeep = (frequency = 880, duration = 0.12) => {
    try {
      const context = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = Math.min(1, Math.max(0, displaySettings.soundVolume ?? 0.5));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
      oscillator.onended = () => context.close().catch(() => null);
    } catch {
      // ignore audio errors in browsers without audio permissions
    }
  };

  const load = async () => {
    const baseStatuses = ["QUEUED", "SENT", "IN_PROGRESS", "READY", "ERROR"];
    const statusList = includeDone ? [...baseStatuses, "DONE"] : baseStatuses;
    const params: string[] = [`status=${encodeURIComponent(statusList)}`];
    if (stationFilter !== "all") {
      params.push(`stationId=${encodeURIComponent(stationFilter)}`);
    }
    const data = await apiFetch(`/kitchen/tickets?${params.join("&")}`);
    setTickets(data);
  };

  useEffect(() => {
    load().catch(console.error);
    const timer = window.setInterval(() => load().catch(console.error), 1200);
    return () => window.clearInterval(timer);
  }, [stationFilter, includeDone]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        load().catch(console.error);
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [stationFilter, includeDone]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const updateViewport = () =>
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    apiFetch("/kitchen-stations")
      .then(setStations)
      .catch(() => setStations([]));
  }, []);

  useEffect(() => {
    apiFetch("/settings/kitchen_display")
      .then((data) => {
        if (data?.value) {
          setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...data.value });
        }
      })
      .catch(() => setDisplaySettings(DEFAULT_DISPLAY_SETTINGS));
  }, []);

  useEffect(() => {
    if (tickets.length === 0) return;
    const unseen = tickets.filter((ticket) => !seenTicketIds.current.has(ticket.id));
    if (unseen.length > 0 && displaySettings.soundOnNew) {
      playBeep(880, 0.12);
    }
    unseen.forEach((ticket) => seenTicketIds.current.add(ticket.id));

    const urgentThreshold = Number.isFinite(displaySettings.urgentMinutes) ? displaySettings.urgentMinutes : 10;
    tickets.forEach((ticket) => {
      const isUrgent = getAgeMinutes(ticket) >= urgentThreshold && !isHoldActive(ticket) && ticket.status !== "DONE";
      if (isUrgent && !urgentTicketIds.current.has(ticket.id)) {
        if (displaySettings.soundOnUrgent) {
          playBeep(520, 0.18);
        }
        urgentTicketIds.current.add(ticket.id);
      }
      if (!isUrgent && urgentTicketIds.current.has(ticket.id)) {
        urgentTicketIds.current.delete(ticket.id);
      }
    });
  }, [tickets, nowTick, displaySettings]);

  const orderTypeLabel = (orderType: string) => orderType.replace(/_/g, " ").toUpperCase();
  const orderTypeClass = (orderType: string) => `order-${orderType.toLowerCase().replace(/_/g, "-")}`;

  const averageTicketAge = () => {
    const active = tickets.filter((ticket) => ticket.status !== "DONE");
    if (active.length === 0) return "0:00";
    const totalMs = active.reduce((sum, ticket) => {
      const created = Date.parse(ticket.createdAt);
      return sum + (Number.isNaN(created) ? 0 : Date.now() - created);
    }, 0);
    const avgSeconds = Math.max(0, Math.floor(totalMs / active.length / 1000));
    const minutes = Math.floor(avgSeconds / 60);
    const seconds = avgSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const getAgeMinutes = (ticket: Ticket) => {
    const createdAt = Date.parse(ticket.createdAt);
    if (Number.isNaN(createdAt)) return 0;
    return (nowTick - createdAt) / 60000;
  };

  const isHoldActive = (ticket: Ticket) => {
    if (!ticket.holdUntil) return false;
    const holdMs = Date.parse(ticket.holdUntil);
    if (Number.isNaN(holdMs)) return false;
    return holdMs > nowTick;
  };

  const formatCountdown = (target: string | null | undefined) => {
    if (!target) return "";
    const targetMs = Date.parse(target);
    if (Number.isNaN(targetMs)) return "";
    const diff = Math.max(0, targetMs - nowTick);
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const getTicketAgeClass = (ticket: Ticket) => {
    if (ticket.status === "DONE") return "ticket-done";
    if (isHoldActive(ticket)) return "ticket-hold";
    const warnThreshold = Number.isFinite(displaySettings.warnMinutes) ? displaySettings.warnMinutes : 5;
    const urgentThreshold = Number.isFinite(displaySettings.urgentMinutes) ? displaySettings.urgentMinutes : 10;
    const ageMinutes = getAgeMinutes(ticket);
    if (ageMinutes >= urgentThreshold) return "ticket-urgent blink";
    if (ageMinutes >= warnThreshold) return "ticket-warn blink";
    return "ticket-fresh";
  };

  const sortActiveTickets = (list: Ticket[]) =>
    [...list].sort((a, b) => {
      const aHold = isHoldActive(a) ? 1 : 0;
      const bHold = isHoldActive(b) ? 1 : 0;
      if (aHold !== bHold) return aHold - bHold;

      const aRush = a.priority === "RUSH" ? 0 : 1;
      const bRush = b.priority === "RUSH" ? 0 : 1;
      if (aRush !== bRush) return aRush - bRush;

      const aCreated = Date.parse(a.createdAt);
      const bCreated = Date.parse(b.createdAt);
      const aSafe = Number.isNaN(aCreated) ? Number.MAX_SAFE_INTEGER : aCreated;
      const bSafe = Number.isNaN(bCreated) ? Number.MAX_SAFE_INTEGER : bCreated;
      return aSafe - bSafe;
    });

  const sortDoneTickets = (list: Ticket[]) =>
    [...list].sort((a, b) => {
      const aCompleted = Date.parse(a.completedAt || a.createdAt);
      const bCompleted = Date.parse(b.completedAt || b.createdAt);
      const aSafe = Number.isNaN(aCompleted) ? 0 : aCompleted;
      const bSafe = Number.isNaN(bCompleted) ? 0 : bCompleted;
      return bSafe - aSafe;
    });

  const sortFocusTickets = (list: Ticket[]) =>
    [...list].sort((a, b) => {
      const aHold = isHoldActive(a) ? 1 : 0;
      const bHold = isHoldActive(b) ? 1 : 0;
      if (aHold !== bHold) return aHold - bHold;

      const statusRank = (status: string) => {
        if (["QUEUED", "SENT", "ERROR"].includes(status)) return 0;
        if (status === "IN_PROGRESS") return 1;
        if (status === "READY") return 2;
        return 3;
      };
      const aStatus = statusRank(a.status);
      const bStatus = statusRank(b.status);
      if (aStatus !== bStatus) return aStatus - bStatus;

      const aRush = a.priority === "RUSH" ? 0 : 1;
      const bRush = b.priority === "RUSH" ? 0 : 1;
      if (aRush !== bRush) return aRush - bRush;

      const aCreated = Date.parse(a.createdAt);
      const bCreated = Date.parse(b.createdAt);
      const aSafe = Number.isNaN(aCreated) ? 0 : aCreated;
      const bSafe = Number.isNaN(bCreated) ? 0 : bCreated;
      return bSafe - aSafe;
    });

  const resolveFocusGrid = (count: number, maxCols: number, maxRows: number) => {
    if (count <= 0) return { cols: 1, rows: 1 };
    let best = { cols: 1, rows: 1, waste: Number.POSITIVE_INFINITY };
    for (let rows = 1; rows <= maxRows; rows += 1) {
      for (let cols = 1; cols <= maxCols; cols += 1) {
        const capacity = rows * cols;
        if (capacity < count) continue;
        const waste = capacity - count;
        if (
          waste < best.waste ||
          (waste === best.waste && cols > best.cols) ||
          (waste === best.waste && cols === best.cols && rows < best.rows)
        ) {
          best = { cols, rows, waste };
        }
      }
    }
    return { cols: best.cols, rows: best.rows };
  };

  const hideSecondaryLanes = !includeDone && workingLayout === "focus";

  const grouped = useMemo(() => {
    const newTickets = sortActiveTickets(tickets.filter((ticket) => ["QUEUED", "SENT", "ERROR"].includes(ticket.status)));
    const workingTickets = sortActiveTickets(tickets.filter((ticket) => ticket.status === "IN_PROGRESS"));
    const readyTickets = sortActiveTickets(tickets.filter((ticket) => ticket.status === "READY"));
    const doneTickets = sortDoneTickets(tickets.filter((ticket) => ticket.status === "DONE"));

    // In focus mode we intentionally collapse lanes, so include every active ticket
    // to keep newly-sent tickets visible to cooks immediately.
    const focusWorkingTickets = sortFocusTickets(
      tickets.filter((ticket) => ["QUEUED", "SENT", "ERROR", "IN_PROGRESS", "READY"].includes(ticket.status))
    );

    return {
      NEW: newTickets,
      WORKING: hideSecondaryLanes ? focusWorkingTickets : workingTickets,
      READY: readyTickets,
      DONE: doneTickets
    };
  }, [hideSecondaryLanes, tickets, nowTick]);

  const maxFocusCols = viewport.width >= 1700 ? 4 : viewport.width >= 1280 ? 3 : viewport.width >= 920 ? 2 : 1;
  const maxFocusRows = viewport.height >= 940 ? 3 : viewport.height >= 760 ? 2 : 1;
  const focusPageSize = Math.max(1, maxFocusCols * maxFocusRows);
  const focusPageCount = hideSecondaryLanes ? Math.max(1, Math.ceil(grouped.WORKING.length / focusPageSize)) : 1;

  useEffect(() => {
    setFocusPage((prev) => Math.min(prev, Math.max(0, focusPageCount - 1)));
  }, [focusPageCount]);

  useEffect(() => {
    if (!hideSecondaryLanes || focusPageCount <= 1) return;
    const timer = window.setInterval(() => {
      setFocusPage((prev) => (prev + 1) % focusPageCount);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [hideSecondaryLanes, focusPageCount]);

  const focusPageTickets = hideSecondaryLanes
    ? grouped.WORKING.slice(focusPage * focusPageSize, focusPage * focusPageSize + focusPageSize)
    : grouped.WORKING;

  const focusGrid = resolveFocusGrid(focusPageTickets.length, maxFocusCols, maxFocusRows);
  const focusItemLimit = focusPageTickets.length <= 2 ? 8 : focusPageTickets.length <= 4 ? 6 : focusPageTickets.length <= 6 ? 4 : 3;
  const focusModifierLimit = focusPageTickets.length <= 2 ? 4 : 2;

  const lanes: Array<{ key: keyof typeof grouped; label: string; tone: "new" | "working" | "ready" | "done"; glyph: string }> = includeDone
    ? [{ key: "DONE", label: "Done", tone: "done", glyph: "D" }]
    : hideSecondaryLanes
      ? [{ key: "WORKING", label: "Working", tone: "working", glyph: "W" }]
      : [
          { key: "NEW", label: "New", tone: "new", glyph: "N" },
          { key: "WORKING", label: "Working", tone: "working", glyph: "W" },
          { key: "READY", label: "Ready", tone: "ready", glyph: "R" }
        ];

  const updateTicket = async (id: string, payload: Record<string, unknown>) => {
    const now = new Date().toISOString();
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== id) return ticket;
        const nextStatus = typeof payload.status === "string" ? payload.status : ticket.status;
        return {
          ...ticket,
          ...payload,
          status: nextStatus,
          startedAt: nextStatus === "IN_PROGRESS" ? now : ticket.startedAt,
          completedAt: nextStatus === "DONE" ? now : ticket.completedAt
        };
      })
    );
    try {
      await apiFetch(`/kitchen/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error(err);
      await load().catch(console.error);
      return;
    }
    load().catch(console.error);
  };

  const openHistory = async (ticket: Ticket) => {
    const events = await apiFetch(`/kitchen/tickets/${ticket.id}/events`);
    setHistoryEvents(events);
    setHistoryTicket(ticket);
  };

  const closeHistory = () => {
    setHistoryTicket(null);
    setHistoryEvents([]);
  };

  const reprintTicket = async (ticket: Ticket) => {
    await apiFetch(`/kitchen/tickets/${ticket.id}/reprint`, { method: "POST" });
  };

  const togglePriority = async (ticket: Ticket) => {
    const next = ticket.priority === "RUSH" ? "NORMAL" : "RUSH";
    await updateTicket(ticket.id, { priority: next });
  };

  const setHoldMinutes = async (ticket: Ticket, minutes: number) => {
    const holdUntil = new Date(nowTick + minutes * 60_000).toISOString();
    await updateTicket(ticket.id, { holdUntil });
  };

  const clearHold = async (ticket: Ticket) => {
    await updateTicket(ticket.id, { holdUntil: null });
  };

  const completeTicketOrder = async (ticket: Ticket) => {
    const now = new Date().toISOString();
    setTickets((prev) =>
      prev.map((entry) =>
        entry.order.id === ticket.order.id
          ? { ...entry, status: "DONE", completedAt: now }
          : entry
      )
    );
    try {
      await apiFetch(`/kitchen/orders/${ticket.order.id}/complete`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    load().catch(console.error);
  };

  const bumpOldestWorking = async () => {
    const nextTicket = grouped.WORKING.find((ticket) => !isHoldActive(ticket)) ?? grouped.WORKING[0];
    if (!nextTicket) return;
    await completeTicketOrder(nextTicket);
  };

  const startOldestNew = async () => {
    const nextTicket = grouped.NEW.find((ticket) => !isHoldActive(ticket)) ?? grouped.NEW[0];
    if (!nextTicket) return;
    await updateTicket(nextTicket.id, { status: "IN_PROGRESS" });
  };

  const completeOldestReady = async () => {
    const nextTicket = grouped.READY.find((ticket) => !isHoldActive(ticket)) ?? grouped.READY[0];
    if (!nextTicket) return;
    await completeTicketOrder(nextTicket);
  };

  const ticketItemCount = (ticket: Ticket) => ticket.order.items.reduce((sum, item) => sum + item.quantity, 0);

  const ticketModifierCount = (ticket: Ticket) =>
    ticket.order.items.reduce(
      (sum, item) => sum + (item.modifiers?.reduce((inner, mod) => inner + mod.quantity, 0) ?? 0),
      0
    );

  return (
    <div
      className="screen-shell kitchen-shell kitchen-shell-main"
      style={{
        ["--kitchen-base-font" as string]: `${displaySettings.baseFontSize}px`,
        ["--kitchen-header-font" as string]: `${displaySettings.headerFontSize}px`,
        ["--kitchen-subhead-font" as string]: `${displaySettings.subheaderFontSize}px`,
        ["--kitchen-column-font" as string]: `${displaySettings.columnHeaderFontSize}px`,
        ["--kitchen-ticket-title-font" as string]: `${displaySettings.ticketTitleFontSize}px`,
        ["--kitchen-ticket-meta-font" as string]: `${displaySettings.ticketMetaFontSize}px`,
        ["--kitchen-time-font" as string]: `${displaySettings.timeFontSize ?? 16}px`,
        ["--kitchen-item-font" as string]: `${displaySettings.itemFontSize}px`,
        ["--kitchen-modifier-font" as string]: `${displaySettings.modifierFontSize}px`,
        ["--kitchen-pill-font" as string]: `${displaySettings.pillFontSize}px`,
        ["--kitchen-button-font" as string]: `${displaySettings.buttonFontSize}px`,
        ["--kitchen-modifier-color" as string]: displaySettings.modifierColor,
        ["--kitchen-new-color" as string]: displaySettings.newColor,
        ["--kitchen-working-color" as string]: displaySettings.workingColor,
        ["--kitchen-done-color" as string]: displaySettings.doneColor,
        ["--kitchen-fresh-color" as string]: displaySettings.freshColor,
        ["--kitchen-warn-color" as string]: displaySettings.warnColor,
        ["--kitchen-urgent-color" as string]: displaySettings.urgentColor
      }}
    >
      <div className="kitchen-stage">
        <header className="screen-header kitchen-header">
          <div>
            <h2>Kitchen Screen</h2>
            <p>Active kitchen tickets, station routing, and bump workflow.</p>
          </div>
          <div className="header-actions kitchen-header-actions">
            <button
              type="button"
              className={`terminal-btn ${includeDone ? "primary" : "ghost"}`}
              onClick={() => setIncludeDone((prev) => !prev)}
            >
              {includeDone ? "Showing Completed" : "Show Completed"}
            </button>
            {!includeDone && (
              <button
                type="button"
                className={`terminal-btn ${workingLayout === "focus" ? "primary" : "ghost"}`}
                onClick={() => setWorkingLayout((prev) => (prev === "focus" ? "board" : "focus"))}
              >
                {workingLayout === "focus" ? "Working Focus On" : "Working Focus Off"}
              </button>
            )}
            <select
              className="terminal-input"
              value={stationFilter}
              onChange={(event) => setStationFilter(event.target.value)}
            >
              <option value="all">All Stations</option>
              <option value="unassigned">Unassigned</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            <div className="kitchen-avg">
              <span>Average Ticket Time:</span>
              <strong>{averageTicketAge()}</strong>
            </div>
            <button type="button" className="terminal-btn primary" onClick={load}>
              Refresh
            </button>
          </div>
        </header>

        <div className={`kitchen-columns ${includeDone ? "completed-only" : ""} ${hideSecondaryLanes ? "kitchen-columns-focus" : ""}`}>
          {lanes.map((column) => {
            const isWorkingFocus = column.key === "WORKING" && hideSecondaryLanes;
            const ticketsInColumn = isWorkingFocus ? focusPageTickets : grouped[column.key];
            const isCompactWorkingLayout = column.key === "WORKING" && !includeDone && (workingLayout === "board" || hideSecondaryLanes);
            return (
            <section
              key={column.key}
              className={`kitchen-column kitchen-column-${column.tone} ${
                column.key === "WORKING" && hideSecondaryLanes ? "kitchen-column-focus" : ""
              }`}
            >
              <div className="kitchen-column-header">
                <div className="kitchen-column-title">
                  <span className="kitchen-lane-glyph" aria-hidden>
                    {column.glyph}
                  </span>
                  <h3>{column.label}</h3>
                </div>
                <span className="kitchen-column-count">{grouped[column.key].length}</span>
              </div>
              {!(column.key === "WORKING" && hideSecondaryLanes) && (
                <div className="kitchen-column-metric">
                  <strong>{grouped[column.key].length}</strong>
                  <span>{grouped[column.key].length === 1 ? "Ticket" : "Tickets"}</span>
                </div>
              )}
              {column.key === "WORKING" && !includeDone && (
                <div className={`kitchen-lane-tools ${hideSecondaryLanes ? "focus-tools" : ""}`}>
                  <button
                    type="button"
                    className="terminal-btn primary"
                    onClick={() => bumpOldestWorking().catch(console.error)}
                    disabled={grouped.WORKING.length === 0}
                  >
                    Bump Oldest
                  </button>
                  {hideSecondaryLanes && (
                    <>
                      <button
                        type="button"
                        className="terminal-btn ghost"
                        disabled={grouped.NEW.length === 0}
                        onClick={() => startOldestNew().catch(console.error)}
                      >
                        Start Oldest New ({grouped.NEW.length})
                      </button>
                      <button
                        type="button"
                        className="terminal-btn ghost"
                        disabled={grouped.READY.length === 0}
                        onClick={() => completeOldestReady().catch(console.error)}
                      >
                        Complete Oldest Ready ({grouped.READY.length})
                      </button>
                      <button
                        type="button"
                        className="terminal-btn ghost"
                        onClick={() => setWorkingLayout("board")}
                      >
                        Show New + Ready Lanes
                      </button>
                      {focusPageCount > 1 && (
                        <div className="kitchen-page-controls">
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => setFocusPage((prev) => (prev - 1 + focusPageCount) % focusPageCount)}
                          >
                            Prev
                          </button>
                          <span>Page {focusPage + 1} / {focusPageCount}</span>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => setFocusPage((prev) => (prev + 1) % focusPageCount)}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div
                className={`kitchen-list ${
                  column.key === "WORKING" && !includeDone && workingLayout === "focus"
                    ? "kitchen-list-working-focus"
                    : column.key === "WORKING" && !includeDone && workingLayout === "board"
                      ? "kitchen-list-working-grid"
                      : ""
                }`}
                style={
                  column.key === "WORKING" && !includeDone && workingLayout === "focus"
                    ? ({
                        ["--kitchen-focus-rows" as string]: String(focusGrid.rows),
                        ["--kitchen-focus-cols" as string]: String(focusGrid.cols)
                      } as CSSProperties)
                    : undefined
                }
              >
                {ticketsInColumn.map((ticket) => (
                  <article
                    key={ticket.id}
                    className={`panel kitchen-ticket ${
                      column.key === "WORKING" && !includeDone && workingLayout === "focus"
                        ? "kitchen-ticket-focus"
                        : column.key === "WORKING" && !includeDone && workingLayout === "board"
                          ? "kitchen-ticket-compact"
                          : ""
                    } ${getTicketAgeClass(ticket)}`}
                  >
                    <div className="kitchen-ticket-top">
                      <div className="kitchen-ticket-id">
                        <strong>
                          {ticket.order.ticketNumber
                            ? `T#${ticket.order.ticketNumber}`
                            : `Ticket ${ticket.order.id.slice(0, 6)}`}
                        </strong>
                        <span className={`pill order-type ${orderTypeClass(ticket.order.orderType)}`}>
                          {orderTypeLabel(ticket.order.orderType)}
                        </span>
                        {ticket.priority === "RUSH" && <span className="pill priority-pill">Rush</span>}
                        {isHoldActive(ticket) && (
                          <span className="pill hold-pill">Hold {formatCountdown(ticket.holdUntil)}</span>
                        )}
                      </div>
                      <span className="kitchen-ticket-time">
                        {new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="kitchen-ticket-order">
                      <span>
                        {ticket.order.orderNumber
                          ? `Order #${ticket.order.orderNumber}`
                          : `Order ${ticket.order.id.slice(0, 8)}`}
                      </span>
                      <span>{ticket.order.table?.name ?? "—"}</span>
                      <span>{ticket.order.server?.displayName ?? ticket.order.server?.username ?? "—"}</span>
                      <span className="pill station-pill">{ticket.stationName || "Kitchen"}</span>
                    </div>
                    {column.key === "WORKING" && !includeDone && workingLayout === "focus" && (
                      <div className="kitchen-ticket-stats">
                        <span>{ticket.order.items.length} lines</span>
                        <span>{ticketItemCount(ticket)} qty</span>
                        <span>{ticketModifierCount(ticket)} mods</span>
                        <span>{Math.max(0, Math.floor(getAgeMinutes(ticket)))}m</span>
                      </div>
                    )}
                    <ul
                      className={`list kitchen-item-list ${
                        column.key === "WORKING" && !includeDone && workingLayout === "board" ? "compact" : ""
                      }`}
                    >
                      {(isWorkingFocus
                        ? ticket.order.items.slice(0, focusItemLimit)
                        : column.key === "WORKING" && !includeDone && workingLayout === "board"
                          ? ticket.order.items.slice(0, 4)
                          : ticket.order.items
                      ).map((item) => {
                        const modifiers = item.modifiers ?? [];
                        const noteLine = item.notes?.trim() ? [`NOTE: ${item.notes.trim()}`] : [];
                        const modifierLines = modifiers.map((mod) =>
                          `${mod.quantity > 1 ? `${mod.quantity}x ` : ""}${mod.name}`
                        );
                        const prepLines = [...noteLine, ...modifierLines];
                        const shownPrepLines = isWorkingFocus ? prepLines.slice(0, focusModifierLimit) : prepLines;
                        return (
                          <li key={item.id}>
                            <span>
                              {item.quantity}x {item.name || "Item"}
                            </span>
                            {column.key === "WORKING" && !includeDone && workingLayout === "board" ? (
                              prepLines.length > 0 && (
                                <span className="kitchen-item-mod-count">
                                  {prepLines[0]}
                                  {prepLines.length > 1 ? ` +${prepLines.length - 1}` : ""}
                                </span>
                              )
                            ) : (
                              prepLines.length > 0 && (
                                <>
                                  <ul className="modifier-list">
                                    {shownPrepLines.map((line, index) => (
                                      <li key={`${item.id}-prep-${index}`}>- {line}</li>
                                    ))}
                                  </ul>
                                  {isWorkingFocus && prepLines.length > focusModifierLimit && (
                                    <span className="kitchen-item-mod-count">
                                      +{prepLines.length - focusModifierLimit} more prep notes
                                    </span>
                                  )}
                                </>
                              )
                            )}
                          </li>
                        );
                      })}
                      {isWorkingFocus && ticket.order.items.length > focusItemLimit && (
                        <li className="kitchen-item-more">+{ticket.order.items.length - focusItemLimit} more items</li>
                      )}
                      {column.key === "WORKING" &&
                        !includeDone &&
                        workingLayout === "board" &&
                        ticket.order.items.length > 4 && <li className="kitchen-item-more">+{ticket.order.items.length - 4} more items</li>}
                    </ul>
                    <div
                      className={`kitchen-ticket-actions ${
                        isCompactWorkingLayout
                          ? "kitchen-ticket-actions-compact"
                          : ""
                      }`}
                    >
                      <button type="button" className="terminal-btn ghost" onClick={() => openHistory(ticket)}>
                        History
                      </button>
                      {!isCompactWorkingLayout && (
                        <button type="button" className="terminal-btn ghost" onClick={() => reprintTicket(ticket)}>
                          Reprint
                        </button>
                      )}
                      <button type="button" className="terminal-btn ghost" onClick={() => togglePriority(ticket)}>
                        {ticket.priority === "RUSH" ? "Normal" : "Rush"}
                      </button>
                      {isHoldActive(ticket) ? (
                        <button type="button" className="terminal-btn ghost" onClick={() => clearHold(ticket)}>
                          Clear Hold
                        </button>
                      ) : (
                        <>
                          <button type="button" className="terminal-btn ghost" onClick={() => setHoldMinutes(ticket, 5)}>
                            Hold 5m
                          </button>
                          {!isCompactWorkingLayout && (
                            <button type="button" className="terminal-btn ghost" onClick={() => setHoldMinutes(ticket, 10)}>
                              Hold 10m
                            </button>
                          )}
                        </>
                      )}
                      {["QUEUED", "SENT", "ERROR"].includes(ticket.status) && (
                        <button
                          type="button"
                          className="terminal-btn primary"
                          onClick={() => updateTicket(ticket.id, { status: "IN_PROGRESS" })}
                        >
                          Start
                        </button>
                      )}
                      {ticket.status === "IN_PROGRESS" && (
                        <>
                          <button
                            type="button"
                            className="terminal-btn primary"
                            onClick={() => updateTicket(ticket.id, { status: "READY" })}
                          >
                            Ready
                          </button>
                          {column.key === "WORKING" && !includeDone && workingLayout === "focus" && (
                            <button
                              type="button"
                              className="terminal-btn primary kitchen-btn-bump"
                              onClick={() => completeTicketOrder(ticket)}
                            >
                              Bump Done
                            </button>
                          )}
                        </>
                      )}
                      {ticket.status === "READY" && (
                        <>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => updateTicket(ticket.id, { status: "IN_PROGRESS" })}
                          >
                            Send Back
                          </button>
                          <button
                            type="button"
                            className="terminal-btn primary"
                            onClick={() => completeTicketOrder(ticket)}
                          >
                            Complete
                          </button>
                        </>
                      )}
                      {ticket.status === "DONE" && (
                        <button
                          type="button"
                          className="terminal-btn primary"
                          onClick={() => updateTicket(ticket.id, { status: "IN_PROGRESS" })}
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {ticketsInColumn.length === 0 && (
                  <div className="panel kitchen-empty">
                    <p className="hint">No tickets.</p>
                  </div>
                )}
              </div>
            </section>
            );
          })}
        </div>
      </div>

      {historyTicket && (
        <div className="terminal-recall">
          <div className="terminal-recall-card recall-modal">
            <div className="modal-header">
              <div>
                <h3>Ticket History</h3>
                <p>
                  {historyTicket.order.ticketNumber
                    ? `T#${historyTicket.order.ticketNumber}`
                    : `Ticket ${historyTicket.order.id.slice(0, 6)}`}
                </p>
              </div>
              <button type="button" className="terminal-btn ghost" onClick={closeHistory}>
                Close
              </button>
            </div>
            <div className="list">
              {historyEvents.length === 0 && <p className="hint">No events recorded.</p>}
              {historyEvents.map((event) => (
                <div key={event.id} className="recall-row">
                  <span>{event.action}</span>
                  <span>
                    {event.user?.displayName ?? event.user?.username ?? "System"}
                  </span>
                  <span>{event.note ?? ""}</span>
                  <span>
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
