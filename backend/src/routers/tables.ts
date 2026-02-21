import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { applyPermissionOverrides } from "../services/permissions.js";

const tableSchema = z.object({
  name: z.string().min(1),
  area: z.string().optional(),
  areaId: z.string().optional(),
  capacity: z.number().int().optional(),
  status: z.enum(["AVAILABLE", "SEATED", "DIRTY", "RESERVED"]).optional(),
  posX: z.number().int().optional(),
  posY: z.number().int().optional(),
  shape: z.string().optional()
});

const hostessRosterSchema = z.object({
  workingServerIds: z.array(z.string()).optional(),
  tableAssignments: z.record(z.string(), z.string()).optional()
});

const hostessRosterSettingKey = "hostess_roster";
const floorDecorSettingKey = "table_floor_decor";

const floorDecorationSchema = z.object({
  id: z.string().min(1),
  areaId: z.string().min(1),
  type: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(20).max(4000).optional(),
  height: z.number().int().min(20).max(4000).optional(),
  rotation: z.number().int().min(-180).max(180).optional(),
  text: z.string().max(120).optional(),
  color: z.string().max(40).optional()
});

const floorDecorPayloadSchema = z.object({
  decorations: z.array(floorDecorationSchema)
});

type ActiveOrderRow = {
  tableId: string | null;
  createdAt: Date;
};

function buildActiveTableIndex(rows: ActiveOrderRow[]) {
  return rows.reduce<Map<string, { count: number; oldest: Date }>>((acc, row) => {
    if (!row.tableId) return acc;
    const current = acc.get(row.tableId);
    if (!current) {
      acc.set(row.tableId, { count: 1, oldest: row.createdAt });
      return acc;
    }
    acc.set(row.tableId, {
      count: current.count + 1,
      oldest: row.createdAt < current.oldest ? row.createdAt : current.oldest
    });
    return acc;
  }, new Map());
}

type HostessRoster = {
  workingServerIds: string[];
  tableAssignments: Record<string, string>;
};

function normalizeHostessRoster(value: unknown): HostessRoster {
  if (!value || typeof value !== "object") {
    return { workingServerIds: [], tableAssignments: {} };
  }
  const source = value as { workingServerIds?: unknown; tableAssignments?: unknown };
  const workingServerIds = Array.isArray(source.workingServerIds)
    ? Array.from(new Set(source.workingServerIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
  const tableAssignments: Record<string, string> = {};
  if (source.tableAssignments && typeof source.tableAssignments === "object") {
    for (const [tableId, serverId] of Object.entries(source.tableAssignments as Record<string, unknown>)) {
      if (typeof tableId !== "string" || tableId.length === 0) continue;
      if (typeof serverId !== "string" || serverId.length === 0) continue;
      tableAssignments[tableId] = serverId;
    }
  }
  return { workingServerIds, tableAssignments };
}

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

function normalizeFloorDecor(value: unknown) {
  if (!Array.isArray(value)) return [] as FloorDecoration[];
  const next: FloorDecoration[] = [];
  for (const entry of value) {
    const parsed = floorDecorationSchema.safeParse(entry);
    if (!parsed.success) continue;
    next.push(parsed.data);
  }
  return next;
}

export async function registerTableRoutes(app: FastifyInstance) {
  app.get("/tables", async () => {
    const [tables, activeOrders] = await Promise.all([
      prisma.diningTable.findMany({ orderBy: { name: "asc" } }),
      prisma.posOrder.findMany({
        where: {
          tableId: { not: null },
          status: { in: ["OPEN", "SENT", "HOLD"] },
          items: { some: {} }
        },
        select: { tableId: true, createdAt: true }
      })
    ]);
    const activeByTable = buildActiveTableIndex(activeOrders);
    return tables.map((table) => {
      if (table.status === "DIRTY" || table.status === "RESERVED") {
        return table;
      }
      return {
        ...table,
        status: activeByTable.has(table.id) ? "SEATED" : "AVAILABLE"
      };
    });
  });

  app.get("/tables/hostess", async () => {
    const [tables, activeOrders] = await Promise.all([
      prisma.diningTable.findMany({
        orderBy: [{ areaId: "asc" }, { name: "asc" }]
      }),
      prisma.posOrder.findMany({
        where: {
          tableId: { not: null },
          status: { in: ["OPEN", "SENT", "HOLD"] },
          items: { some: {} }
        },
        select: { tableId: true, createdAt: true }
      })
    ]);

    const nowMs = Date.now();
    const activeByTable = buildActiveTableIndex(activeOrders);

    return tables.map((table) => {
      const active = activeByTable.get(table.id);
      const occupiedByTicket = Boolean(active);
      const manuallyOccupied = !occupiedByTicket && table.status === "SEATED";
      const occupied = occupiedByTicket || manuallyOccupied;
      const occupiedSince = occupiedByTicket
        ? active?.oldest ?? null
        : manuallyOccupied
          ? table.updatedAt
          : null;
      const occupiedMinutes = occupiedSince
        ? Math.max(0, Math.floor((nowMs - occupiedSince.valueOf()) / 60_000))
        : 0;

      return {
        ...table,
        status:
          table.status === "DIRTY" || table.status === "RESERVED"
            ? table.status
            : occupied
              ? "SEATED"
              : "AVAILABLE",
        occupancy: {
          isOccupied: occupied,
          occupiedSince: occupiedSince ? occupiedSince.toISOString() : null,
          occupiedMinutes,
          openTicketCount: active?.count ?? 0
        }
      };
    });
  });

  app.get("/tables/hostess/servers", async () => {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        username: true,
        displayName: true,
        permissionOverrides: true,
        role: { select: { permissions: true } }
      },
      orderBy: [{ displayName: "asc" }, { username: "asc" }]
    });

    return users
      .filter((user) => {
        const permissions = applyPermissionOverrides(user.role?.permissions, user.permissionOverrides);
        return Boolean(permissions.all || permissions.orders || permissions.tables);
      })
      .map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }));
  });

  app.get("/tables/hostess/roster", async () => {
    const setting = await prisma.appSetting.findUnique({ where: { key: hostessRosterSettingKey } });
    return normalizeHostessRoster(setting?.value);
  });

  app.patch("/tables/hostess/roster", async (request) => {
    const body = hostessRosterSchema.parse(request.body);
    const existing = await prisma.appSetting.findUnique({ where: { key: hostessRosterSettingKey } });
    const current = normalizeHostessRoster(existing?.value);

    const nextWorkingServerIds = body.workingServerIds
      ? Array.from(new Set(body.workingServerIds.filter((id) => id.length > 0)))
      : current.workingServerIds;

    const nextAssignmentsSource = body.tableAssignments ?? current.tableAssignments;
    const workingSet = new Set(nextWorkingServerIds);
    const nextTableAssignments: Record<string, string> = {};
    for (const [tableId, serverId] of Object.entries(nextAssignmentsSource)) {
      if (!workingSet.has(serverId)) continue;
      nextTableAssignments[tableId] = serverId;
    }

    const value: HostessRoster = {
      workingServerIds: nextWorkingServerIds,
      tableAssignments: nextTableAssignments
    };

    await prisma.appSetting.upsert({
      where: { key: hostessRosterSettingKey },
      update: { value },
      create: { key: hostessRosterSettingKey, value }
    });

    return value;
  });

  app.get("/tables/floor-decor", async (request) => {
    const query = request.query as { areaId?: string };
    const setting = await prisma.appSetting.findUnique({ where: { key: floorDecorSettingKey } });
    const decorations = normalizeFloorDecor(setting?.value);
    if (query?.areaId) {
      return decorations.filter((entry) => entry.areaId === query.areaId);
    }
    return decorations;
  });

  app.patch("/tables/floor-decor", async (request) => {
    const body = floorDecorPayloadSchema.parse(request.body);
    const decorations = normalizeFloorDecor(body.decorations);
    await prisma.appSetting.upsert({
      where: { key: floorDecorSettingKey },
      update: { value: decorations },
      create: { key: floorDecorSettingKey, value: decorations }
    });
    return decorations;
  });

  app.post("/tables", async (request, reply) => {
    const body = tableSchema.parse(request.body);
    const table = await prisma.diningTable.create({ data: body });
    return reply.code(201).send(table);
  });

  app.patch("/tables/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = tableSchema.partial().parse(request.body);
    try {
      const table = await prisma.diningTable.update({ where: { id }, data: body });
      return table;
    } catch {
      return reply.notFound("Table not found");
    }
  });

  app.delete("/tables/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    try {
      await prisma.diningTable.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Table not found");
    }
  });
}
