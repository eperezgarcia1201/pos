import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { getLegacyPayloadObject } from "../services/orderChain.js";

const dashboardQuerySchema = z.object({
  date: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  threshold: z.coerce.number().int().min(1).max(20).optional()
});

type Range = {
  start: Date;
  end: Date;
  date: string;
};

function getDayRange(dateParam?: string): Range {
  const now = new Date();
  let start: Date;
  if (dateParam) {
    const parts = dateParam.split("-").map((value) => Number(value));
    if (parts.length === 3 && parts.every((value) => Number.isFinite(value))) {
      const [year, month, day] = parts;
      start = new Date(year, month - 1, day, 0, 0, 0, 0);
    } else {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
    }
  } else {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, date: start.toISOString().slice(0, 10) };
}

function getRangeFromQuery(query: { date?: string; start?: string; end?: string }): Range {
  if (query.start && query.end) {
    const start = new Date(query.start);
    const end = new Date(query.end);
    if (Number.isFinite(start.valueOf()) && Number.isFinite(end.valueOf())) {
      return { start, end, date: start.toISOString().slice(0, 10) };
    }
  }
  return getDayRange(query.date);
}

function readStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCurrency(value: number | null | undefined) {
  return Number(value ?? 0);
}

export async function registerOwnerRoutes(app: FastifyInstance) {
  app.get("/owner/dashboard", async (request) => {
    const query = dashboardQuerySchema.parse(request.query ?? {});
    const range = getRangeFromQuery(query);
    const threshold = query.threshold ?? 2;

    const [paidOrders, openOrders, voidOrders, orderItems] = await Promise.all([
      prisma.posOrder.findMany({
        where: { status: "PAID", createdAt: { gte: range.start, lt: range.end } },
        include: { payments: true }
      }),
      prisma.posOrder.findMany({
        where: { status: { in: ["OPEN", "SENT", "HOLD"] }, createdAt: { gte: range.start, lt: range.end } },
        include: {
          table: { select: { name: true } },
          server: { select: { username: true, displayName: true } },
          _count: { select: { items: true } }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.posOrder.findMany({
        where: { status: "VOID", updatedAt: { gte: range.start, lt: range.end } },
        select: {
          id: true,
          ticketNumber: true,
          orderNumber: true,
          totalAmount: true,
          voidReason: true,
          serverId: true,
          updatedAt: true,
          legacyPayload: true,
          server: { select: { id: true, username: true, displayName: true } }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.posOrderItem.findMany({
        where: { order: { status: "PAID", createdAt: { gte: range.start, lt: range.end } } },
        include: {
          menuItem: { include: { category: true } },
          modifiers: true
        }
      })
    ]);

    const summary = paidOrders.reduce(
      (acc, order) => {
        const gross = normalizeCurrency(order.totalAmount ? Number(order.totalAmount) : 0);
        const tax = normalizeCurrency(order.taxAmount ? Number(order.taxAmount) : 0);
        const discount = normalizeCurrency(order.discountAmount ? Number(order.discountAmount) : 0);
        const subtotal = normalizeCurrency(order.subtotalAmount ? Number(order.subtotalAmount) : 0);
        const service = normalizeCurrency(order.serviceCharge ? Number(order.serviceCharge) : 0);
        const delivery = normalizeCurrency(order.deliveryCharge ? Number(order.deliveryCharge) : 0);

        acc.paidOrders += 1;
        acc.grossSales += gross;
        acc.tax += tax;
        acc.discounts += discount;
        acc.netSales += subtotal > 0 || discount > 0 || service > 0 || delivery > 0
          ? subtotal - discount + service + delivery
          : gross - tax;
        return acc;
      },
      { paidOrders: 0, grossSales: 0, netSales: 0, tax: 0, discounts: 0 }
    );

    const payments: Record<string, number> = {};
    const byOrderTypeMap = new Map<string, { orderType: string; count: number; total: number }>();

    for (const order of paidOrders) {
      const orderType = order.orderType || "UNKNOWN";
      const current = byOrderTypeMap.get(orderType) ?? { orderType, count: 0, total: 0 };
      current.count += 1;
      current.total += Number(order.totalAmount ?? 0);
      byOrderTypeMap.set(orderType, current);

      for (const payment of order.payments) {
        if (payment.status === "VOID" || payment.voided) continue;
        payments[payment.method] = (payments[payment.method] || 0) + Number(payment.amount ?? 0);
      }
    }

    const itemSales = new Map<string, { menuItemId: string; name: string; qty: number; revenue: number }>();
    const categorySales = new Map<string, { category: string; qty: number; revenue: number }>();
    for (const item of orderItems) {
      const baseLine = Number(item.price ?? 0) * item.quantity;
      const modifierTotal = item.modifiers.reduce((sum, mod) => sum + Number(mod.price ?? 0) * mod.quantity, 0);
      const lineTotal = baseLine + modifierTotal;
      const menuItemId = item.menuItemId;
      const itemName = item.menuItem?.name ?? item.name ?? menuItemId;

      const itemCurrent = itemSales.get(menuItemId) ?? { menuItemId, name: itemName, qty: 0, revenue: 0 };
      itemCurrent.qty += item.quantity;
      itemCurrent.revenue += lineTotal;
      itemSales.set(menuItemId, itemCurrent);

      const categoryName = item.menuItem?.category?.name ?? "Uncategorized";
      const categoryCurrent = categorySales.get(categoryName) ?? { category: categoryName, qty: 0, revenue: 0 };
      categoryCurrent.qty += item.quantity;
      categoryCurrent.revenue += lineTotal;
      categorySales.set(categoryName, categoryCurrent);
    }

    const voidByActor = new Map<
      string,
      {
        userId: string | null;
        name: string;
        voidCount: number;
        voidTotal: number;
        lastVoidAt: string;
        tickets: Array<{
          id: string;
          label: string;
          reason: string | null;
          total: number;
          at: string;
        }>;
      }
    >();
    let voidTotal = 0;
    for (const order of voidOrders) {
      const payload = getLegacyPayloadObject(order.legacyPayload) as Record<string, unknown>;
      const payloadUserId = readStringField(payload, "voidedByUserId");
      const payloadName = readStringField(payload, "voidedByName");
      const userId = payloadUserId ?? order.serverId ?? null;
      const name = payloadName ?? order.server?.displayName ?? order.server?.username ?? "Unknown";
      const actorKey = userId ? `user:${userId}` : `name:${name.toLowerCase()}`;
      const at = order.updatedAt.toISOString();
      const amount = Number(order.totalAmount ?? 0);
      const ticketLabel =
        order.ticketNumber !== null && typeof order.ticketNumber !== "undefined"
          ? `#${order.ticketNumber}`
          : order.orderNumber !== null && typeof order.orderNumber !== "undefined"
            ? `Order ${order.orderNumber}`
            : order.id.slice(0, 6);

      voidTotal += amount;
      const aggregate = voidByActor.get(actorKey) ?? {
        userId,
        name,
        voidCount: 0,
        voidTotal: 0,
        lastVoidAt: at,
        tickets: []
      };

      aggregate.voidCount += 1;
      aggregate.voidTotal += amount;
      if (at > aggregate.lastVoidAt) {
        aggregate.lastVoidAt = at;
      }
      if (aggregate.tickets.length < 8) {
        aggregate.tickets.push({
          id: order.id,
          label: ticketLabel,
          reason: order.voidReason ?? null,
          total: amount,
          at
        });
      }
      voidByActor.set(actorKey, aggregate);
    }

    const voidLeaderboard = Array.from(voidByActor.values()).sort((a, b) => {
      if (b.voidCount !== a.voidCount) return b.voidCount - a.voidCount;
      return b.voidTotal - a.voidTotal;
    });

    return {
      generatedAt: new Date().toISOString(),
      date: range.date,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      threshold,
      summary: {
        ...summary,
        openTickets: openOrders.length,
        voidCount: voidOrders.length,
        voidTotal
      },
      payments,
      byOrderType: Array.from(byOrderTypeMap.values()).sort((a, b) => b.total - a.total),
      topItems: Array.from(itemSales.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      byCategory: Array.from(categorySales.values()).sort((a, b) => b.revenue - a.revenue),
      openTickets: openOrders.map((order) => ({
        id: order.id,
        ticketNumber: order.ticketNumber,
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        tableName: order.table?.name ?? null,
        customerName: order.customerName ?? null,
        serverName: order.server?.displayName ?? order.server?.username ?? null,
        itemCount: order._count.items,
        totalAmount: Number(order.totalAmount ?? 0),
        updatedAt: order.updatedAt.toISOString()
      })),
      voidAlerts: voidLeaderboard.filter((entry) => entry.voidCount > threshold),
      voidLeaderboard
    };
  });
}
