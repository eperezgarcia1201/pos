import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { buildKitchenTickets, buildReceiptText } from "../services/ticketing.js";
import { getPrinterRouting } from "../services/printerRouting.js";

function getDayRange(dateParam?: string) {
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

function getRangeFromQuery(query: { date?: string; start?: string; end?: string }) {
  if (query.start && query.end) {
    const start = new Date(query.start);
    const end = new Date(query.end);
    if (Number.isFinite(start.valueOf()) && Number.isFinite(end.valueOf())) {
      return { start, end, date: start.toISOString().slice(0, 10) };
    }
  }
  return getDayRange(query.date);
}

async function buildDailyReport(range: { start: Date; end: Date; date: string }) {
  const [orders, voids, orderItems, openingTxns] = await Promise.all([
    prisma.posOrder.findMany({
      where: { status: "PAID", createdAt: { gte: range.start, lt: range.end } },
      include: { payments: true, server: true, table: true }
    }),
    prisma.posOrder.findMany({
      where: { status: "VOID", updatedAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        ticketNumber: true,
        orderNumber: true,
        totalAmount: true,
        voidReason: true,
        updatedAt: true
      }
    }),
    prisma.posOrderItem.findMany({
      where: { order: { status: "PAID", createdAt: { gte: range.start, lt: range.end } } },
      include: { menuItem: { include: { category: true, group: true } }, modifiers: true }
    }),
    prisma.cashTransaction.findMany({
      where: { type: "OPENING", createdAt: { gte: range.start, lt: range.end } }
    })
  ]);

  const openingBank = openingTxns.reduce((sum, txn) => sum + Number(txn.amount), 0);

  const totals = orders.reduce(
    (acc, order) => {
      acc.subtotal += Number(order.subtotalAmount ?? 0);
      acc.tax += Number(order.taxAmount ?? 0);
      acc.discount += Number(order.discountAmount ?? 0);
      acc.service += Number(order.serviceCharge ?? 0);
      acc.delivery += Number(order.deliveryCharge ?? 0);
      acc.gross += Number(order.totalAmount ?? 0);
      acc.count += 1;
      if (order.taxExempt) {
        acc.taxExemptSales += Number(order.subtotalAmount ?? 0);
      }
      return acc;
    },
    {
      subtotal: 0,
      tax: 0,
      discount: 0,
      service: 0,
      delivery: 0,
      gross: 0,
      count: 0,
      taxExemptSales: 0
    }
  );

  const payments: Record<string, number> = {};
  for (const order of orders) {
    for (const payment of order.payments) {
      if (payment.status === "VOID") continue;
      payments[payment.method] = (payments[payment.method] || 0) + Number(payment.amount);
    }
  }

  const byCategory: Record<string, { categoryId: string | null; category: string; qty: number; revenue: number }> = {};
  const byGroup: Record<string, { groupId: string | null; group: string; qty: number; revenue: number }> = {};
  const byItem: Record<string, { menuItemId: string; name: string; qty: number; revenue: number }> = {};
  const byOrderType: Record<string, { orderType: string; count: number; revenue: number }> = {};

  for (const order of orders) {
    if (!byOrderType[order.orderType]) {
      byOrderType[order.orderType] = { orderType: order.orderType, count: 0, revenue: 0 };
    }
    byOrderType[order.orderType].count += 1;
    byOrderType[order.orderType].revenue += Number(order.totalAmount ?? 0);
  }

  for (const item of orderItems) {
    const baseLine = Number(item.price) * item.quantity;
    const modifierTotal = item.modifiers.reduce((sum, mod) => sum + Number(mod.price) * mod.quantity, 0);
    const lineTotal = baseLine + modifierTotal;

    const categoryId = item.menuItem?.category?.id ?? null;
    const categoryName = item.menuItem?.category?.name ?? "Uncategorized";
    const categoryKey = categoryId ?? "uncat";
    if (!byCategory[categoryKey]) {
      byCategory[categoryKey] = { categoryId, category: categoryName, qty: 0, revenue: 0 };
    }
    byCategory[categoryKey].qty += item.quantity;
    byCategory[categoryKey].revenue += lineTotal;

    const groupId = item.menuItem?.group?.id ?? null;
    const groupName = item.menuItem?.group?.name ?? "Ungrouped";
    const groupKey = groupId ?? "ungrouped";
    if (!byGroup[groupKey]) {
      byGroup[groupKey] = { groupId, group: groupName, qty: 0, revenue: 0 };
    }
    byGroup[groupKey].qty += item.quantity;
    byGroup[groupKey].revenue += lineTotal;

    const itemKey = item.menuItemId;
    const itemName = item.menuItem?.name ?? item.name ?? item.menuItemId;
    if (!byItem[itemKey]) {
      byItem[itemKey] = { menuItemId: item.menuItemId, name: itemName, qty: 0, revenue: 0 };
    }
    byItem[itemKey].qty += item.quantity;
    byItem[itemKey].revenue += lineTotal;
  }

  const voidTotal = voids.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

  const taxableSales = totals.subtotal - totals.taxExemptSales;

  return {
    date: range.date,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    openingBank,
    totals: {
      paidOrders: totals.count,
      gross: totals.gross,
      subtotal: totals.subtotal,
      tax: totals.tax,
      discounts: totals.discount,
      serviceCharges: totals.service,
      deliveryCharges: totals.delivery,
      netSales: totals.subtotal - totals.discount + totals.service + totals.delivery,
      averageTicket: totals.count ? totals.gross / totals.count : 0,
      taxExemptSales: totals.taxExemptSales,
      taxableSales,
      voidCount: voids.length,
      voidTotal
    },
    payments,
    byCategory: Object.values(byCategory).sort((a, b) => b.revenue - a.revenue),
    byGroup: Object.values(byGroup).sort((a, b) => b.revenue - a.revenue),
    byItem: Object.values(byItem).sort((a, b) => b.revenue - a.revenue),
    byOrderType: Object.values(byOrderType).sort((a, b) => b.revenue - a.revenue),
    voids,
    orders: orders.map((order) => ({
      id: order.id,
      ticketNumber: order.ticketNumber,
      orderNumber: order.orderNumber,
      table: order.table?.name ?? null,
      server: order.server?.displayName ?? order.server?.username ?? null,
      createdAt: order.createdAt,
      total: Number(order.totalAmount ?? 0),
      tax: Number(order.taxAmount ?? 0),
      discount: Number(order.discountAmount ?? 0),
      orderType: order.orderType
    }))
  };
}

const reportPrintSchema = z.object({
  date: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  printerId: z.string().optional()
});

function formatMoney(amount: number) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function buildDailyReportText(report: Awaited<ReturnType<typeof buildDailyReport>>) {
  const lines: string[] = [];
  lines.push("WEBSYS POS");
  lines.push("DAILY SALES REPORT");
  lines.push(`Date: ${report.date}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("--------------------------------");
  lines.push(`Paid Orders: ${report.totals.paidOrders}`);
  lines.push(`Gross Sales: ${formatMoney(report.totals.gross)}`);
  lines.push(`Net Sales: ${formatMoney(report.totals.netSales)}`);
  lines.push(`Tax: ${formatMoney(report.totals.tax)}`);
  lines.push(`Discounts: ${formatMoney(report.totals.discounts)}`);
  lines.push(`Opening Bank: ${formatMoney(report.openingBank)}`);
  lines.push(`Voids: ${report.totals.voidCount} (${formatMoney(report.totals.voidTotal)})`);
  lines.push("");
  lines.push("PAYMENTS");
  const payments = Object.entries(report.payments).sort(([a], [b]) => a.localeCompare(b));
  if (payments.length === 0) {
    lines.push("(none)");
  } else {
    for (const [method, amount] of payments) {
      lines.push(`${method}: ${formatMoney(amount)}`);
    }
  }
  lines.push("");
  lines.push("TOP CATEGORIES");
  if (report.byCategory.length === 0) {
    lines.push("(none)");
  } else {
    for (const category of report.byCategory.slice(0, 8)) {
      lines.push(`${category.category}: ${category.qty} items, ${formatMoney(category.revenue)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.get("/reports/sales-summary", async () => {
    const orders = await prisma.posOrder.findMany({
      where: { status: "PAID" }
    });

    const gross = orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

    return {
      paidOrders: orders.length,
      grossSales: gross
    };
  });

  app.get("/reports/top-items", async () => {
    const items = await prisma.posOrderItem.groupBy({
      by: ["menuItemId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } }
    });

    return items.slice(0, 20);
  });

  app.get("/reports/voids", async () => {
    const voids = await prisma.posOrder.findMany({
      where: { status: "VOID" },
      select: { id: true, totalAmount: true, voidReason: true, updatedAt: true }
    });
    return voids;
  });

  app.get("/reports/tax-summary", async () => {
    const orders = await prisma.posOrder.findMany({
      where: { status: "PAID" },
      select: { taxAmount: true }
    });
    const totalTax = orders.reduce((sum, o) => sum + Number(o.taxAmount ?? 0), 0);
    return { totalTax };
  });

  app.get("/reports/labor", async () => {
    const entries = await prisma.timeClock.findMany({
      where: { clockOut: { not: null } },
      include: { user: true }
    });
    const report = entries.map((entry) => {
      const hours = (Number(entry.clockOut) - Number(entry.clockIn)) / 36e5;
      return {
        userId: entry.userId,
        name: entry.user.displayName ?? entry.user.username,
        hours: Math.round(hours * 100) / 100
      };
    });
    return report;
  });

  app.get("/reports/item-performance", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const useRange = Boolean(query?.date || query?.start || query?.end);
    const range = useRange ? getRangeFromQuery(query) : null;
    const items = await prisma.posOrderItem.findMany({
      where: useRange ? { order: { status: "PAID", createdAt: { gte: range!.start, lt: range!.end } } } : undefined,
      include: { menuItem: true }
    });
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const item of items) {
      const key = item.menuItemId;
      const name = item.menuItem?.name ?? item.name ?? key;
      const current = map.get(key) || { name, qty: 0, revenue: 0 };
      current.qty += item.quantity;
      current.revenue += Number(item.price) * item.quantity;
      map.set(key, current);
    }
    return Array.from(map.entries()).map(([menuItemId, data]) => ({
      menuItemId,
      ...data
    }));
  });

  app.get("/reports/settlement", async () => {
    const payments = await prisma.payment.findMany({
      where: { status: { not: "VOID" } }
    });
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }
    const orders = await prisma.posOrder.findMany({
      where: { status: "PAID" },
      select: { totalAmount: true }
    });
    const gross = orders.reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0);
    return { grossSales: gross, payments: byMethod };
  });

  app.get("/reports/discounts", async () => {
    const discounts = await prisma.orderDiscount.findMany({
      include: { discount: true }
    });
    const byName: Record<string, number> = {};
    for (const entry of discounts) {
      const name = entry.discount.name;
      const amount = entry.amount ? Number(entry.amount) : Number(entry.discount.value);
      byName[name] = (byName[name] || 0) + amount;
    }
    return byName;
  });

  app.get("/reports/payment-summary", async () => {
    const payments = await prisma.payment.findMany({
      where: { status: { not: "VOID" } }
    });
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }
    return byMethod;
  });

  app.get("/reports/server-gratuity", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const range = getRangeFromQuery(query);
    const orders = await prisma.posOrder.findMany({
      where: { status: "PAID", createdAt: { gte: range.start, lt: range.end } },
      include: { server: true, payments: true }
    });

    const byServer = new Map<string, { serverId: string; name: string; gratuity: number; orders: number }>();
    for (const order of orders) {
      const serverId = order.serverId ?? "unknown";
      const name = order.server?.displayName ?? order.server?.username ?? "Unknown";
      const key = `${serverId}:${name}`;
      const existing = byServer.get(key) ?? { serverId, name, gratuity: 0, orders: 0 };
      const tips = order.payments
        .filter((payment) => payment.status !== "VOID" && !payment.voided)
        .reduce((sum, payment) => sum + Number(payment.tipAmount ?? 0), 0);
      existing.gratuity += tips;
      existing.orders += 1;
      byServer.set(key, existing);
    }

    return Array.from(byServer.values()).sort((a, b) => b.gratuity - a.gratuity);
  });

  app.get("/reports/open-orders", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const range = getRangeFromQuery(query);
    return prisma.posOrder.findMany({
      where: {
        status: { in: ["OPEN", "SENT", "HOLD"] },
        createdAt: { gte: range.start, lt: range.end }
      },
      include: { table: true, server: true, items: true },
      orderBy: { updatedAt: "desc" }
    });
  });

  app.get("/reports/category-sales", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const useRange = Boolean(query?.date || query?.start || query?.end);
    const range = useRange ? getRangeFromQuery(query) : null;
    const items = await prisma.posOrderItem.findMany({
      where: useRange ? { order: { status: "PAID", createdAt: { gte: range!.start, lt: range!.end } } } : undefined,
      include: { menuItem: { include: { category: true } } }
    });
    const byCategory: Record<string, { category: string; revenue: number; qty: number }> = {};
    for (const item of items) {
      const category = item.menuItem?.category?.name || "Uncategorized";
      if (!byCategory[category]) {
        byCategory[category] = { category, revenue: 0, qty: 0 };
      }
      byCategory[category].qty += item.quantity;
      byCategory[category].revenue += Number(item.price) * item.quantity;
    }
    return Object.values(byCategory);
  });

  app.get("/reports/low-stock", async () => {
    const items = await prisma.inventoryItem.findMany({
      where: { reorderLevel: { not: null } },
      orderBy: { name: "asc" }
    });
    return items.filter((item) => {
      if (item.reorderLevel === null || item.quantity === null) return false;
      return Number(item.quantity) <= Number(item.reorderLevel);
    });
  });

  app.get("/reports/daily-sales", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const range = getRangeFromQuery(query);
    return buildDailyReport(range);
  });

  app.post("/reports/daily-sales/print", async (request) => {
    const body = reportPrintSchema.parse(request.body ?? {});
    const range = getRangeFromQuery(body);
    const report = await buildDailyReport(range);
    const printerRouting = await getPrinterRouting();
    const printerId = body.printerId ?? printerRouting.reportPrinterId ?? printerRouting.stationDefaultPrinterId ?? undefined;
    const deviceBridgeUrl = process.env.DEVICE_BRIDGE_URL || "http://localhost:7090";

    await fetch(`${deviceBridgeUrl}/print/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: buildDailyReportText(report), printerId })
    });

    return { ok: true, printerId };
  });

  app.get("/reports/ticket-samples", async () => {
    const store = await prisma.appSetting.findUnique({ where: { key: "store" } });
    const storeValue = (store?.value as { name?: string; address?: string; cityStateZip?: string; phone?: string }) || {};
    const order = await prisma.posOrder.findFirst({
      where: { status: { in: ["OPEN", "PAID"] } },
      include: {
        items: {
          include: { modifiers: { include: { modifier: true } }, menuItem: { include: { kitchenStation: true } } }
        },
        payments: true,
        table: true
      },
      orderBy: { updatedAt: "desc" }
    });

    const customerReceipt = order
      ? buildReceiptText(order, storeValue)
      : `${(storeValue.name || "POS Store")}\nCustomer Receipt\n------------------------\nNo orders yet.`;
    const kitchenReceipt = order
      ? buildKitchenTickets(order).map((t) => t.text).join("\n\n")
      : "Kitchen Ticket\n------------------------\nNo orders yet.";

    return {
      customer: customerReceipt,
      kitchen: kitchenReceipt
    };
  });

  app.get("/reports/daily-report", async (request) => {
    const query = request.query as { date?: string; start?: string; end?: string };
    const range = getRangeFromQuery(query);
    return buildDailyReport(range);
  });
}
