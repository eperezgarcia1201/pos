import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { resolveStation, type StationContext } from "../services/stations.js";
import { getPrinterRouting } from "../services/printerRouting.js";
import { getLegacyPayloadObject, getOrderChainMeta, sortChainOrders } from "../services/orderChain.js";
import { buildKitchenTicketsForOrders, formatTicketDate } from "../services/ticketing.js";

const deviceBridgeUrl = process.env.DEVICE_BRIDGE_URL || "http://localhost:7090";

const stationContextSchema = z.object({
  stationId: z.string().optional(),
  terminalId: z.string().optional()
});

const sendKitchenSchema = stationContextSchema.extend({
  itemIds: z.array(z.string().min(1)).optional()
});

const kitchenOrderInclude = {
  table: true,
  server: true,
  payments: true,
  items: {
    include: {
      modifiers: { include: { modifier: true } },
      menuItem: { include: { kitchenStation: true, group: { include: { kitchenStation: true } } } }
    }
  }
} as const;

type KitchenOrder = Prisma.PosOrderGetPayload<{
  include: typeof kitchenOrderInclude;
}>;

function getSentItemIds(
  payload: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
) {
  const base = getLegacyPayloadObject(payload);
  const raw = base.sentItemIds;
  if (!Array.isArray(raw)) return [] as string[];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

async function ensureOrderNumbers(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.posOrder.findUnique({ where: { id: orderId } });
    if (!existing) return null;
    const update: Record<string, number | string> = {};
    if (!existing.orderNumber) {
      const seq = await tx.orderSequence.create({ data: {} });
      update.orderNumber = seq.id;
    }
    if (!existing.ticketNumber) {
      const ticketDate = formatTicketDate(new Date());
      const ticket = await tx.dailyTicketSequence.upsert({
        where: { date: ticketDate },
        update: { lastNumber: { increment: 1 } },
        create: { date: ticketDate, lastNumber: 1 }
      });
      update.ticketNumber = ticket.lastNumber;
      update.ticketDate = ticketDate;
    }
    if (Object.keys(update).length > 0) {
      await tx.posOrder.update({
        where: { id: orderId },
        data: update
      });
    }
    return true;
  });
}

async function loadChainOrdersForSeed(order: KitchenOrder) {
  const chainMeta = getOrderChainMeta(order.legacyPayload);
  if (!chainMeta.chainGroupId) return [order];
  const chainGroupId = chainMeta.chainGroupId;

  try {
    const grouped = await prisma.posOrder.findMany({
      where: {
        status: { notIn: ["VOID", "PAID"] },
        legacyPayload: { path: "$.chainGroupId", equals: chainGroupId }
      },
      include: kitchenOrderInclude
    });
    if (grouped.length > 0) {
      return sortChainOrders(grouped);
    }
  } catch {
    // Fall through to in-memory fallback if JSON path filter is unavailable.
  }

  const fallbackWindowStart = new Date(order.createdAt.getTime() - 48 * 60 * 60 * 1000);
  const candidates = await prisma.posOrder.findMany({
    where: {
      status: { notIn: ["VOID", "PAID"] },
      createdAt: { gte: fallbackWindowStart },
      ...(order.tableId ? { tableId: order.tableId } : {}),
      ...(order.serverId ? { serverId: order.serverId } : {})
    },
    include: kitchenOrderInclude,
    take: 400
  });
  const grouped = candidates.filter(
    (candidate) => getOrderChainMeta(candidate.legacyPayload).chainGroupId === chainGroupId
  );
  if (!grouped.some((candidate) => candidate.id === order.id)) {
    grouped.push(order);
  }
  return sortChainOrders(grouped);
}

function filterItemsForStation(
  orders: KitchenOrder[],
  stationId: string | null
): Array<{
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  modifiers: Array<{ id: string; name: string; quantity: number }>;
}> {
  return orders
    .flatMap((order) => order.items)
    .filter((item) => {
      const itemStation = item.menuItem?.kitchenStationId ?? item.menuItem?.group?.kitchenStationId ?? null;
      if (!stationId) return !itemStation;
      return itemStation === stationId;
    })
    .map((item) => ({
      id: item.id,
      name: item.name || item.menuItem?.name || item.menuItemId,
      quantity: item.quantity,
      notes: item.notes ?? null,
      modifiers: (item.modifiers ?? []).map((mod) => ({
        id: mod.id,
        name: mod.customName || mod.modifier.name,
        quantity: mod.quantity
      }))
    }));
}

export async function sendToKitchen(
  orderId: string,
  userId?: string | null,
  stationContext: StationContext = {},
  itemIds?: string[]
) {
  await ensureOrderNumbers(orderId);

  const seedOrder = await prisma.posOrder.findUnique({
    where: { id: orderId },
    include: kitchenOrderInclude
  });
  if (!seedOrder) return null;

  const seedChainMeta = getOrderChainMeta(seedOrder.legacyPayload);
  const chainOrdersInitial = seedChainMeta.chainGroupId
    ? await loadChainOrdersForSeed(seedOrder)
    : [seedOrder];
  const chainOrdersSorted = sortChainOrders(
    chainOrdersInitial.filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index
    )
  );

  for (const order of chainOrdersSorted) {
    await ensureOrderNumbers(order.id);
  }
  const refreshedOrders = await Promise.all(
    chainOrdersSorted.map((order) =>
      prisma.posOrder.findUnique({
        where: { id: order.id },
        include: kitchenOrderInclude
      })
    )
  );
  const chainOrders = sortChainOrders(
    refreshedOrders.filter((order): order is KitchenOrder => Boolean(order))
  );
  if (chainOrders.length === 0) return null;

  const rootOrderId =
    seedChainMeta.chainRootOrderId ??
    getOrderChainMeta(chainOrders[0].legacyPayload).chainRootOrderId ??
    chainOrders[0].id;
  const anchorOrder = chainOrders.find((order) => order.id === rootOrderId) ?? chainOrders[0];

  const station = await resolveStation(stationContext);
  const printerRouting = await getPrinterRouting();
  const stationConfig = (station ?? {}) as {
    kitchenStationIds?: unknown;
    barStationIds?: unknown;
    kitchenPrinterId?: string | null;
    barPrinterId?: string | null;
  };
  const kitchenStationIds = Array.isArray(stationConfig.kitchenStationIds)
    ? stationConfig.kitchenStationIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    : [];
  const barStationIds = Array.isArray(stationConfig.barStationIds)
    ? stationConfig.barStationIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    : [];
  const stationDefaultPrinterId = printerRouting.stationDefaultPrinterId ?? undefined;
  const kitchenPrinterId =
    stationConfig.kitchenPrinterId ??
    printerRouting.kitchenPrinterId ??
    stationDefaultPrinterId ??
    undefined;
  const barPrinterId =
    stationConfig.barPrinterId ??
    printerRouting.barPrinterId ??
    kitchenPrinterId ??
    stationDefaultPrinterId ??
    undefined;
  const kitchenSet = new Set(kitchenStationIds);
  const barSet = new Set(barStationIds);
  const hasFilters = kitchenSet.size > 0 || barSet.size > 0;

  const allowedItemIds = new Set(
    (itemIds ?? []).filter((itemId): itemId is string => typeof itemId === "string" && itemId.length > 0)
  );
  const hasItemFilter = allowedItemIds.size > 0;
  const orderItemsToSend = chainOrders
    .map((order) => {
      const items = order.items.filter((item) => {
        if (hasItemFilter && !allowedItemIds.has(item.id)) return false;
        const itemStationId = item.menuItem?.kitchenStationId ?? item.menuItem?.group?.kitchenStationId ?? null;
        if (!hasFilters) return true;
        if (!itemStationId) return true;
        return kitchenSet.has(itemStationId) || barSet.has(itemStationId);
      });
      return {
        ...order,
        items
      };
    })
    .filter((order) => order.items.length > 0);

  const tickets = buildKitchenTicketsForOrders(orderItemsToSend)
    .map((ticket) => {
      const isBar = !!(ticket.stationId && barSet.has(ticket.stationId));
      const printerId = isBar
        ? barPrinterId ?? ticket.printerId ?? stationDefaultPrinterId
        : kitchenPrinterId ?? ticket.printerId ?? stationDefaultPrinterId;
      return { ...ticket, printerId };
    });
  const createdTickets = [];
  for (const ticket of tickets) {
    let printFailed = false;
    try {
      await fetch(`${deviceBridgeUrl}/print/kitchen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ticket.text, printerId: ticket.printerId })
      });
    } catch {
      printFailed = true;
    }
    const created = await prisma.kitchenTicket.create({
      data: {
        orderId: anchorOrder.id,
        stationId: ticket.stationId,
        stationName: ticket.stationName,
        status: printFailed ? "ERROR" : "SENT",
        sentAt: new Date()
      }
    });
    await prisma.kitchenTicketEvent.create({
      data: {
        ticketId: created.id,
        action: printFailed ? "PRINT_FAILED" : "SENT",
        userId: userId ?? undefined
      }
    });
    createdTickets.push(created);
  }

  if (orderItemsToSend.length > 0) {
    await prisma.posOrder.updateMany({
      where: {
        id: { in: orderItemsToSend.map((order) => order.id) },
        status: { notIn: ["PAID", "VOID"] }
      },
      data: { status: "SENT" }
    });
  }

  await Promise.all(
    orderItemsToSend.map(async (order) => {
      const existingSent = getSentItemIds(order.legacyPayload);
      const nextSent = Array.from(new Set([...existingSent, ...order.items.map((item) => item.id)]));
      const payload = {
        ...(getLegacyPayloadObject(order.legacyPayload) as Prisma.InputJsonObject),
        sentItemIds: nextSent
      } satisfies Prisma.InputJsonObject;
      await prisma.posOrder.update({
        where: { id: order.id },
        data: { legacyPayload: payload }
      });
    })
  );

  return createdTickets;
}

export async function registerKitchenRoutes(app: FastifyInstance) {
  app.post("/orders/:id/send-kitchen", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const userId = request.headers["x-user-id"] ? String(request.headers["x-user-id"]) : null;
    const body = sendKitchenSchema.parse(request.body ?? {});
    const itemIds = Array.from(
      new Set(
        (body.itemIds ?? [])
          .map((itemId) => itemId.trim())
          .filter((itemId) => itemId.length > 0)
      )
    );
    if (typeof body.itemIds !== "undefined" && itemIds.length === 0) {
      return reply.badRequest("Select at least one item to send.");
    }
    const orderWithItemCount = await prisma.posOrder.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });
    if (!orderWithItemCount) {
      return reply.notFound("Order not found");
    }
    if (orderWithItemCount._count.items === 0) {
      return reply.badRequest("You cannot save a ticket without items. Add at least one item first.");
    }
    const ticket = await sendToKitchen(
      id,
      userId,
      { stationId: body.stationId, terminalId: body.terminalId },
      itemIds
    );
    if (!ticket) {
      return reply.notFound("Order not found");
    }
    if (itemIds.length > 0 && ticket.length === 0) {
      return reply.badRequest("No matching unsent items were found for this order.");
    }
    return ticket;
  });

  app.get("/kitchen/tickets", async (request) => {
    const query = request.query as { status?: string; stationId?: string };
    const statusList = query.status ? query.status.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const where: Record<string, unknown> = {};
    if (statusList.length > 0) {
      where.status = { in: statusList };
    }
    if (query.stationId) {
      if (query.stationId === "unassigned") {
        where.stationId = null;
      } else {
        where.stationId = query.stationId;
      }
    }
    const tickets = await prisma.kitchenTicket.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        order: {
          include: kitchenOrderInclude
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const chainSeedByGroup = new Map<string, KitchenOrder>();
    for (const ticket of tickets) {
      const chainMeta = getOrderChainMeta(ticket.order.legacyPayload);
      if (!chainMeta.chainGroupId) continue;
      if (!chainSeedByGroup.has(chainMeta.chainGroupId)) {
        chainSeedByGroup.set(chainMeta.chainGroupId, ticket.order);
      }
    }
    const chainOrdersByGroup = new Map<string, KitchenOrder[]>();
    await Promise.all(
      Array.from(chainSeedByGroup.entries()).map(async ([groupId, seedOrder]) => {
        const orders = await loadChainOrdersForSeed(seedOrder);
        chainOrdersByGroup.set(groupId, orders);
      })
    );

    return tickets.map((ticket) => {
      const stationId = ticket.stationId ?? null;
      const chainMeta = getOrderChainMeta(ticket.order.legacyPayload);
      const sourceOrders =
        chainMeta.chainGroupId && chainOrdersByGroup.has(chainMeta.chainGroupId)
          ? (chainOrdersByGroup.get(chainMeta.chainGroupId) as KitchenOrder[])
          : [ticket.order];
      const items = filterItemsForStation(sourceOrders, stationId);
      return {
        ...ticket,
        chainGroupId: chainMeta.chainGroupId ?? null,
        chainSize: sourceOrders.length,
        order: {
          ...ticket.order,
          items
        }
      };
    });
  });

  app.patch("/kitchen/tickets/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = (request.body as { status?: string; priority?: string; holdUntil?: string | null }) || {};
    if (!body.status && !body.priority && typeof body.holdUntil === "undefined") {
      return reply.badRequest("Update required");
    }
    try {
      const now = new Date();
      const data: Record<string, unknown> = {};
      if (body.status) {
        data.status = body.status;
        if (body.status === "IN_PROGRESS") {
          data.startedAt = now;
        }
        if (body.status === "DONE") {
          data.completedAt = now;
        }
      }
      if (body.priority) {
        data.priority = body.priority;
      }
      if (typeof body.holdUntil !== "undefined") {
        data.holdUntil = body.holdUntil ? new Date(body.holdUntil) : null;
      }
      const ticket = await prisma.kitchenTicket.update({
        where: { id },
        data
      });
      const userId = request.headers["x-user-id"] ? String(request.headers["x-user-id"]) : null;
      if (body.status) {
        const action =
          body.status === "IN_PROGRESS"
            ? "STARTED"
            : body.status === "DONE"
            ? "BUMPED"
            : body.status === "READY"
            ? "READY"
            : body.status === "SENT"
            ? "UNDO"
            : `STATUS_${body.status}`;
        await prisma.kitchenTicketEvent.create({
          data: {
            ticketId: id,
            action,
            userId: userId ?? undefined
          }
        });
      }
      if (body.priority) {
        await prisma.kitchenTicketEvent.create({
          data: {
            ticketId: id,
            action: `PRIORITY_${body.priority}`,
            userId: userId ?? undefined
          }
        });
      }
      if (typeof body.holdUntil !== "undefined") {
        await prisma.kitchenTicketEvent.create({
          data: {
            ticketId: id,
            action: body.holdUntil ? "HOLD_SET" : "HOLD_CLEAR",
            userId: userId ?? undefined,
            note: body.holdUntil ?? undefined
          }
        });
      }
      return ticket;
    } catch {
      return reply.notFound("Ticket not found");
    }
  });

  app.get("/kitchen/tickets/:id/events", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const events = await prisma.kitchenTicketEvent.findMany({
      where: { ticketId: id },
      include: { user: true },
      orderBy: { createdAt: "asc" }
    });
    if (!events) {
      return reply.notFound("Ticket not found");
    }
    return events;
  });

  app.post("/kitchen/tickets/:id/reprint", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const ticket = await prisma.kitchenTicket.findUnique({
      where: { id },
      include: {
        order: {
          include: kitchenOrderInclude
        }
      }
    });
    if (!ticket) return reply.notFound("Ticket not found");
    const ordersForKitchen = await loadChainOrdersForSeed(ticket.order);
    const tickets = buildKitchenTicketsForOrders(ordersForKitchen);
    const target = tickets.find((entry) => entry.stationId === ticket.stationId) ?? tickets[0];
    if (!target) return reply.notFound("Ticket not found");
    try {
      await fetch(`${deviceBridgeUrl}/print/kitchen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: target.text, printerId: target.printerId })
      });
    } catch {
      // ignore print errors for now
    }
    await prisma.kitchenTicket.update({
      where: { id },
      data: { printedAt: new Date() }
    });
    const userId = request.headers["x-user-id"] ? String(request.headers["x-user-id"]) : null;
    await prisma.kitchenTicketEvent.create({
      data: {
        ticketId: id,
        action: "REPRINT",
        userId: userId ?? undefined
      }
    });
    return { ok: true, text: target.text };
  });

  app.post("/kitchen/orders/:orderId/complete", async (request, reply) => {
    const orderId = String((request.params as { orderId: string }).orderId);
    const now = new Date();
    const userId = request.headers["x-user-id"] ? String(request.headers["x-user-id"]) : null;
    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId } });
    if (tickets.length === 0) return reply.notFound("Order not found");
    await prisma.kitchenTicket.updateMany({
      where: { orderId },
      data: { status: "DONE", completedAt: now }
    });
    await prisma.kitchenTicketEvent.createMany({
      data: tickets.map((ticket) => ({
        ticketId: ticket.id,
        action: "EXPO_COMPLETE",
        userId: userId ?? undefined
      }))
    });
    const anchorOrder = await prisma.posOrder.findUnique({
      where: { id: orderId },
      include: kitchenOrderInclude
    });
    if (!anchorOrder) return reply.notFound("Order not found");
    const chainMeta = getOrderChainMeta(anchorOrder.legacyPayload);
    let orderIdsToComplete = [orderId];
    if (chainMeta.chainGroupId) {
      const chainOrders = await loadChainOrdersForSeed(anchorOrder);
      orderIdsToComplete = chainOrders.map((order) => order.id);
    }
    await prisma.posOrder.updateMany({
      where: {
        id: { in: orderIdsToComplete },
        status: { notIn: ["PAID", "VOID"] }
      },
      data: { status: "READY" }
    });
    return { ok: true };
  });
}
