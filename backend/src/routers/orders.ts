import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { resolveStation } from "../services/stations.js";
import { getPrinterRouting } from "../services/printerRouting.js";
import { buildKitchenTicketsForOrders, buildReceiptText } from "../services/ticketing.js";
import { resolveRequestUserId } from "../services/accessControl.js";
import { getLegacyPayloadObject, getOrderChainMeta, withOrderChainMeta } from "../services/orderChain.js";
import { chargeCard } from "../services/paymentGateway.js";

const orderSchema = z.object({
  tableId: z.string().optional(),
  serverId: z.string().optional(),
  orderType: z.enum(["DINE_IN", "TAKEOUT", "DELIVERY"]).default("DINE_IN"),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  numberOfGuests: z.number().int().optional(),
  taxExempt: z.boolean().optional(),
  serviceCharge: z.number().nonnegative().optional(),
  deliveryCharge: z.number().nonnegative().optional()
});

const orderItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative().optional(),
  notes: z.string().optional()
});

const orderItemUpdateSchema = z.object({
  quantity: z.number().int().positive().optional(),
  notes: z.string().optional()
});

const orderUpdateSchema = z.object({
  status: z.enum(["OPEN", "SENT", "PAID", "VOID", "HOLD"]).optional(),
  notes: z.string().optional(),
  tableId: z.string().optional(),
  serverId: z.string().optional(),
  orderType: z.enum(["DINE_IN", "TAKEOUT", "DELIVERY"]).optional(),
  customerName: z.string().optional(),
  numberOfGuests: z.number().int().optional(),
  taxExempt: z.boolean().optional(),
  serviceCharge: z.number().nonnegative().optional(),
  deliveryCharge: z.number().nonnegative().optional()
});

const discountApplySchema = z.object({
  discountId: z.string()
});

const paymentSchema = z.object({
  method: z.string().min(1),
  amount: z.number().positive(),
  tenderAmount: z.number().nonnegative().optional(),
  tipAmount: z.number().nonnegative().optional(),
  status: z.enum(["PENDING", "CAPTURED", "VOID", "PAID"]).optional(),
  gateway: z.enum(["AUTO", "OFFLINE", "PAX", "TSYS_PORTICO"]).optional(),
  clientTransactionId: z.string().min(1).max(64).optional(),
  currency: z.string().min(3).max(3).optional(),
  card: z
    .object({
      number: z.string().min(12).max(25),
      expMonth: z.string().min(1).max(2),
      expYear: z.string().min(2).max(4),
      cvv: z.string().min(3).max(4).optional(),
      cardHolderName: z.string().min(1).max(120).optional()
    })
    .optional()
});

const splitSchema = z.object({
  itemIds: z.array(z.string()).min(1)
});

const voidSchema = z.object({
  reason: z.string().min(2)
});

const serviceSchema = z.object({
  serviceCharge: z.number().nonnegative().optional(),
  deliveryCharge: z.number().nonnegative().optional()
});

const modifierApplySchema = z.object({
  modifierId: z.string().optional(),
  quantity: z.number().int().optional(),
  customName: z.string().min(1).optional(),
  price: z.number().nonnegative().optional()
});

let manualModifierId: string | null = null;

function getSentItemIds(
  payload: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
) {
  const base = getLegacyPayloadObject(payload);
  const raw = base.sentItemIds;
  if (!Array.isArray(raw)) return [] as string[];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

async function ensureManualModifierId() {
  if (manualModifierId) return manualModifierId;
  const groupName = "Manual Modifiers";
  let group = await prisma.menuModifierGroup.findFirst({ where: { name: groupName } });
  if (!group) {
    group = await prisma.menuModifierGroup.create({
      data: { name: groupName, minRequired: 0, maxAllowed: 99, sortOrder: 999, active: true }
    });
  }
  let modifier = await prisma.menuModifier.findFirst({
    where: { name: "Manual Modifier", groupId: group.id }
  });
  if (!modifier) {
    modifier = await prisma.menuModifier.create({
      data: { name: "Manual Modifier", price: new Prisma.Decimal(0), groupId: group.id }
    });
  }
  manualModifierId = modifier.id;
  return manualModifierId;
}

const receiptSchema = z.object({
  printerId: z.string().optional(),
  serverName: z.string().optional(),
  stationName: z.string().optional(),
  stationId: z.string().optional(),
  terminalId: z.string().optional()
});

async function recalcOrder(orderId: string) {
  const order = await prisma.posOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: { include: { tax: true } },
          modifiers: { include: { modifier: true } }
        }
      },
      discounts: { include: { discount: true } },
      payments: true
    }
  });

  if (!order) return null;

  let subtotal = 0;
  let taxTotal = 0;

  for (const item of order.items) {
    const baseLine = Number(item.price) * item.quantity;
    const modifierTotal = item.modifiers.reduce(
      (sum, mod) => sum + Number(mod.price) * mod.quantity,
      0
    );
    const line = baseLine + modifierTotal;
    subtotal += line;
    const taxRate = item.menuItem.tax?.rate ? Number(item.menuItem.tax.rate) : 0;
    if (taxRate > 0 && item.menuItem.tax?.active && !order.taxExempt) {
      taxTotal += line * taxRate;
    }
  }

  let discountTotal = 0;
  for (const od of order.discounts) {
    if (od.amount) {
      discountTotal += Number(od.amount);
      continue;
    }
    if (od.discount.type === "PERCENT") {
      discountTotal += subtotal * (Number(od.discount.value) / 100);
    } else {
      discountTotal += Number(od.discount.value);
    }
  }

  const paidTotal = order.payments
    .filter((p) => p.status !== "VOID" && !p.voided)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const serviceCharge = order.serviceCharge ? Number(order.serviceCharge) : 0;
  const deliveryCharge = order.deliveryCharge ? Number(order.deliveryCharge) : 0;
  const total = subtotal - discountTotal + taxTotal + serviceCharge + deliveryCharge;
  const due = total - paidTotal;
  const nextStatus =
    order.status === "VOID"
      ? "VOID"
      : due <= 0 && total > 0
        ? "PAID"
        : order.status === "PAID"
          ? "OPEN"
          : order.status;

  return prisma.posOrder.update({
    where: { id: orderId },
    data: {
      subtotalAmount: subtotal,
      discountAmount: discountTotal,
      taxAmount: taxTotal,
      totalAmount: total,
      paidAmount: paidTotal,
      dueAmount: due,
      status: nextStatus
    }
  });
}

async function resolveMenuItemPrice(menuItemId: string, orderType: string) {
  const typeMap: Record<string, string> = {
    DINE_IN: "DINE_IN",
    TAKEOUT: "TAKEOUT",
    DELIVERY: "DELIVERY",
    BAR: "BAR"
  };
  const priceType = typeMap[orderType] || "DEFAULT";
  const price = await prisma.menuItemPrice.findUnique({
    where: { menuItemId_priceType: { menuItemId, priceType } }
  });
  if (price) return Number(price.price);

  const fallback = await prisma.menuItemPrice.findUnique({
    where: { menuItemId_priceType: { menuItemId, priceType: "DEFAULT" } }
  });
  if (fallback) return Number(fallback.price);

  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  return item ? Number(item.price) : 0;
}

async function getServiceConfig() {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "services" } });
    const value = (setting?.value as { dineIn?: boolean; takeOut?: boolean; delivery?: boolean }) || {};
    return {
      dineIn: value.dineIn !== false,
      takeOut: value.takeOut !== false,
      delivery: value.delivery !== false
    };
  } catch {
    return { dineIn: true, takeOut: true, delivery: true };
  }
}

async function getInventoryConfig() {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "inventory" } });
    const value = (setting?.value as { autoDecrement?: boolean }) || {};
    return { autoDecrement: value.autoDecrement !== false };
  } catch {
    return { autoDecrement: true };
  }
}

function isServiceEnabled(orderType: string, services: { dineIn: boolean; takeOut: boolean; delivery: boolean }) {
  if (orderType === "DINE_IN") return services.dineIn;
  if (orderType === "TAKEOUT") return services.takeOut;
  if (orderType === "DELIVERY") return services.delivery;
  return true;
}

async function createOrderWithNumbers(data: {
  tableId?: string;
  serverId?: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  customerName?: string;
  notes?: string;
  numberOfGuests?: number;
  taxExempt?: boolean;
  serviceCharge?: number;
  deliveryCharge?: number;
  legacyPayload?: Prisma.InputJsonValue;
  status?: string;
  enforceService?: boolean;
}) {
  const { enforceService, ...orderData } = data;
  if (enforceService !== false) {
    const services = await getServiceConfig();
    if (!isServiceEnabled(orderData.orderType, services)) {
      throw new Error("Service disabled");
    }
  }
  if (orderData.orderType === "DINE_IN" && !orderData.tableId) {
    throw new Error("Table required for dine-in");
  }
  return prisma.posOrder.create({
    data: {
      ...orderData,
      status: orderData.status ?? "OPEN"
    }
  });
}

async function applyInventoryUsage(orderId: string) {
  const order = await prisma.posOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              ingredients: true
            }
          }
        }
      }
    }
  });

  if (!order) return;

  for (const item of order.items) {
    const ingredients = item.menuItem?.ingredients ?? [];
    for (const ingredient of ingredients) {
      const delta = Number(ingredient.quantity) * item.quantity * -1;
      await prisma.inventoryItem.update({
        where: { id: ingredient.inventoryItemId },
        data: { quantity: { increment: delta } }
      });
      await prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: ingredient.inventoryItemId,
          delta,
          reason: `Sale ${order.id}`
        }
      });
    }
  }
}

export async function registerOrderRoutes(app: FastifyInstance) {
  app.get("/orders", async (request) => {
    const query = request.query as { serverId?: string };
    return prisma.posOrder.findMany({
      where: query.serverId ? { serverId: query.serverId } : undefined,
      include: { items: true, table: true, discounts: true, payments: true, server: true },
      orderBy: { createdAt: "desc" }
    });
  });

  app.get("/orders/open", async (request) => {
    const query = request.query as {
      serverId?: string;
      search?: string;
      searchBy?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    const statusList = query.status
      ? query.status.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    const where: Record<string, unknown> = {
      status: { in: statusList.length ? statusList : ["OPEN", "SENT", "HOLD"] }
    };
    if (query.serverId) {
      where.serverId = query.serverId;
    }
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) {
        const start = new Date(query.dateFrom);
        if (!Number.isNaN(start.getTime())) {
          range.gte = start;
        }
      }
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        if (!Number.isNaN(end.getTime())) {
          if (query.dateTo.length <= 10) {
            end.setHours(23, 59, 59, 999);
          }
          range.lte = end;
        }
      }
      if (Object.keys(range).length > 0) {
        where.createdAt = range;
      }
    }
    if (query.search) {
      const numeric = Number(query.search);
      if (Number.isFinite(numeric)) {
        if (query.searchBy === "order") {
          where.orderNumber = numeric;
        } else if (query.searchBy === "ticket") {
          where.ticketNumber = numeric;
        } else {
          where.OR = [{ ticketNumber: numeric }, { orderNumber: numeric }];
        }
      } else {
        return [];
      }
    }
    return prisma.posOrder.findMany({
      where,
      include: { items: true, table: true, server: true },
      orderBy: { updatedAt: "desc" }
    });
  });

  app.get("/orders/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const order = await prisma.posOrder.findUnique({
      where: { id },
      include: {
        items: { include: { modifiers: { include: { modifier: true } } } },
        table: true,
        discounts: true,
        payments: true,
        server: true
      }
    });
    if (!order) {
      return reply.notFound("Order not found");
    }
    return order;
  });

  app.post("/orders", async (request, reply) => {
    const body = orderSchema.parse(request.body);
    try {
      const order = await createOrderWithNumbers({
        tableId: body.tableId,
        serverId: body.serverId,
        orderType: body.orderType,
        customerName: body.customerName,
        notes: body.notes,
        numberOfGuests: body.numberOfGuests,
        taxExempt: body.taxExempt,
        serviceCharge: body.serviceCharge,
        deliveryCharge: body.deliveryCharge,
        status: "OPEN",
        enforceService: true
      });
      return reply.code(201).send(order);
    } catch (err) {
      request.log.error({ err }, "Order create failed");
      if (err instanceof Error && err.message === "Service disabled") {
        return reply.badRequest("Service disabled");
      }
      const message = err instanceof Error ? err.message : "Unable to create order";
      return reply.badRequest(message);
    }
  });

  app.post("/orders/:id/chain", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const source = await prisma.posOrder.findUnique({ where: { id } });
    if (!source) {
      return reply.notFound("Order not found");
    }
    if (source.status === "VOID") {
      return reply.badRequest("Cannot chain a void order.");
    }
    if (source.status === "PAID") {
      return reply.badRequest("Cannot chain a paid order.");
    }
    if (source.orderType === "DINE_IN" && !source.tableId) {
      return reply.badRequest("Table required for dine-in");
    }

    const sourceMeta = getOrderChainMeta(source.legacyPayload);
    const chainGroupId = sourceMeta.chainGroupId ?? randomUUID();
    const chainRootOrderId = sourceMeta.chainRootOrderId ?? source.id;
    const chainIndex = sourceMeta.chainIndex ?? 1;

    const currentPayload = withOrderChainMeta(source.legacyPayload, {
      chainGroupId,
      chainRootOrderId,
      chainIndex
    });
    const sourceNeedsUpdate =
      sourceMeta.chainGroupId !== chainGroupId ||
      sourceMeta.chainRootOrderId !== chainRootOrderId ||
      sourceMeta.chainIndex !== chainIndex;

    if (sourceNeedsUpdate) {
      await prisma.posOrder.update({
        where: { id: source.id },
        data: { legacyPayload: currentPayload }
      });
    }

    const nextPayload = withOrderChainMeta(source.legacyPayload, {
      chainGroupId,
      chainRootOrderId,
      chainIndex: chainIndex + 1
    });

    const chainedOrder = await createOrderWithNumbers({
      tableId: source.tableId ?? undefined,
      serverId: source.serverId ?? undefined,
      orderType: source.orderType as "DINE_IN" | "TAKEOUT" | "DELIVERY",
      customerName: source.customerName ?? undefined,
      numberOfGuests: source.numberOfGuests ?? undefined,
      taxExempt: source.taxExempt ?? undefined,
      serviceCharge: source.serviceCharge ? Number(source.serviceCharge) : undefined,
      deliveryCharge: source.deliveryCharge ? Number(source.deliveryCharge) : undefined,
      legacyPayload: nextPayload,
      status: "OPEN",
      enforceService: false
    });

    if (chainedOrder.tableId) {
      await prisma.diningTable.update({
        where: { id: chainedOrder.tableId },
        data: { status: "SEATED" }
      });
    }

    return reply.code(201).send({
      previousOrderId: source.id,
      chainGroupId,
      order: chainedOrder
    });
  });

  app.post("/orders/:id/items", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = orderItemSchema.parse(request.body);

    const order = await prisma.posOrder.findUnique({ where: { id } });
    if (!order) return reply.notFound("Order not found");
    const menuItem = await prisma.menuItem.findUnique({ where: { id: body.menuItemId } });
    const price = body.price ?? (await resolveMenuItemPrice(body.menuItemId, order.orderType));

    const item = await prisma.posOrderItem.create({
      data: {
        orderId: id,
        menuItemId: body.menuItemId,
        quantity: body.quantity,
        price,
        notes: body.notes,
        name: menuItem?.name ?? null
      }
    });

    await recalcOrder(id);

    return reply.code(201).send(item);
  });

  app.patch("/orders/:id/items/:itemId", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const itemId = String((request.params as { itemId: string }).itemId);
    const body = orderItemUpdateSchema.parse(request.body);
    const [order, item] = await Promise.all([
      prisma.posOrder.findUnique({ where: { id }, select: { legacyPayload: true } }),
      prisma.posOrderItem.findFirst({ where: { id: itemId, orderId: id } })
    ]);
    if (!order) return reply.notFound("Order not found");
    if (!item) return reply.notFound("Order item not found");

    const sentItemIds = new Set(getSentItemIds(order.legacyPayload));
    if (typeof body.notes !== "undefined" && sentItemIds.has(itemId)) {
      return reply.badRequest("This item was already sent to kitchen. Add a new item to apply modifiers.");
    }

    const updated = await prisma.posOrderItem.update({
      where: { id: itemId },
      data: {
        quantity: body.quantity,
        notes: body.notes
      }
    });
    await recalcOrder(updated.orderId);
    return updated;
  });

  app.delete("/orders/:id/items/:itemId", async (request, reply) => {
    const itemId = String((request.params as { itemId: string }).itemId);
    try {
      const item = await prisma.posOrderItem.delete({
        where: { id: itemId }
      });
      await recalcOrder(item.orderId);
      return item;
    } catch {
      return reply.notFound("Order item not found");
    }
  });

  app.post("/orders/:id/items/:itemId/modifiers", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const itemId = String((request.params as { itemId: string }).itemId);
    const body = modifierApplySchema.parse(request.body);
    const [order, item] = await Promise.all([
      prisma.posOrder.findUnique({ where: { id }, select: { legacyPayload: true } }),
      prisma.posOrderItem.findFirst({ where: { id: itemId, orderId: id } })
    ]);
    if (!order) return reply.notFound("Order not found");
    if (!item) return reply.notFound("Order item not found");

    const sentItemIds = new Set(getSentItemIds(order.legacyPayload));
    if (sentItemIds.has(itemId)) {
      return reply.badRequest("This item was already sent to kitchen. Add a new item to apply modifiers.");
    }

    let modifierId = body.modifierId;
    if (!modifierId && body.customName) {
      modifierId = await ensureManualModifierId();
    }
    if (!modifierId) {
      return reply.badRequest("Modifier id or customName is required.");
    }
    const modifier = await prisma.menuModifier.findUnique({
      where: { id: modifierId }
    });
    if (!modifier) {
      return reply.notFound("Modifier not found");
    }
    const entry = await prisma.orderItemModifier.create({
      data: {
        orderItemId: itemId,
        modifierId,
        quantity: body.quantity ?? 1,
        price: body.price ?? Number(modifier.price),
        customName: body.customName ?? null
      }
    });
    await recalcOrder(item.orderId);
    return reply.code(201).send(entry);
  });

  app.post("/orders/:id/discounts", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = discountApplySchema.parse(request.body);

    const discount = await prisma.discount.findUnique({ where: { id: body.discountId } });
    if (!discount) {
      return reply.notFound("Discount not found");
    }

    const applied = await prisma.orderDiscount.create({
      data: {
        orderId: id,
        discountId: body.discountId
      }
    });

    await recalcOrder(id);

    return reply.code(201).send(applied);
  });

  app.post("/orders/:id/payments", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = paymentSchema.parse(request.body);
    const method = body.method.trim().toUpperCase();

    const before = await prisma.posOrder.findUnique({
      where: { id },
      select: { status: true }
    });

    let gatewayResult:
      | {
          gateway: "OFFLINE" | "PAX" | "TSYS_PORTICO";
          responseCode?: string;
          responseMessage?: string;
          transactionId?: string;
          authorizationCode?: string;
          cardType?: string;
          maskedCardNumber?: string;
        }
      | undefined;
    if (method === "CARD") {
      try {
        gatewayResult = await chargeCard({
          orderId: id,
          amount: body.amount,
          tipAmount: body.tipAmount,
          currency: body.currency,
          gateway: body.gateway,
          clientTransactionId: body.clientTransactionId,
          card: body.card
        });
      } catch (err) {
        request.log.warn({ err }, "Card charge failed");
        return reply.badRequest(err instanceof Error ? err.message : "Card payment failed.");
      }
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: id,
        method: body.method,
        amount: body.amount,
        tenderAmount: body.tenderAmount ?? (method === "CARD" ? body.amount : undefined),
        tipAmount: body.tipAmount,
        status: body.status ?? (method === "CARD" ? "CAPTURED" : "PAID"),
        reference: gatewayResult?.transactionId || gatewayResult?.gateway,
        transactionType: method === "CARD" ? "SALE" : "PAYMENT",
        paymentType: method,
        cardType: gatewayResult?.cardType,
        cardNumberMasked: gatewayResult?.maskedCardNumber,
        cardAuthCode: gatewayResult?.authorizationCode,
        cardTransactionId: gatewayResult?.transactionId,
        cardReader: gatewayResult?.gateway,
        captured: method === "CARD" ? true : undefined
      }
    });

    const updated = await recalcOrder(id);
    if (before?.status !== "PAID" && updated?.status === "PAID") {
      const inventoryConfig = await getInventoryConfig();
      if (inventoryConfig.autoDecrement) {
        await applyInventoryUsage(id);
      }
    }
    if (updated?.status === "PAID" && updated.tableId) {
      await prisma.diningTable.update({
        where: { id: updated.tableId },
        data: { status: "AVAILABLE" }
      });
    }

    return reply.code(201).send(payment);
  });

  app.post("/orders/:id/print-receipt", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = receiptSchema.parse(request.body);
    const order = await prisma.posOrder.findUnique({
      where: { id },
      include: {
        items: { include: { modifiers: { include: { modifier: true } }, menuItem: { include: { kitchenStation: true } } } },
        payments: true,
        table: true
      }
    });
    if (!order) return reply.notFound("Order not found");
    const storeSetting = await prisma.appSetting.findUnique({ where: { key: "store" } });
    const storeValue = (storeSetting?.value as { name?: string; address?: string; cityStateZip?: string; phone?: string }) || {};
    const station = await resolveStation({ stationId: body.stationId, terminalId: body.terminalId });
    const printerRouting = await getPrinterRouting();
    const stationLabel = body.stationName ?? station?.name ?? undefined;
    const printerId =
      body.printerId ??
      station?.receiptPrinterId ??
      printerRouting.customerReceiptPrinterId ??
      printerRouting.stationDefaultPrinterId ??
      undefined;
    const receiptText = buildReceiptText(order, storeValue, {
      serverName: body.serverName,
      stationName: stationLabel
    });

    const deviceBridgeUrl = process.env.DEVICE_BRIDGE_URL || "http://localhost:7090";
    await fetch(`${deviceBridgeUrl}/print/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: receiptText, printerId })
    });

    return { ok: true };
  });

  app.get("/orders/:id/receipt-text", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const query = request.query as { serverName?: string; stationName?: string };
    const order = await prisma.posOrder.findUnique({
      where: { id },
      include: {
        items: { include: { modifiers: { include: { modifier: true } }, menuItem: { include: { kitchenStation: true } } } },
        payments: true,
        table: true
      }
    });
    if (!order) return reply.notFound("Order not found");
    const storeSetting = await prisma.appSetting.findUnique({ where: { key: "store" } });
    const storeValue = (storeSetting?.value as { name?: string; address?: string; cityStateZip?: string; phone?: string }) || {};
    return {
      text: buildReceiptText(order, storeValue, {
        serverName: query?.serverName,
        stationName: query?.stationName
      })
    };
  });

  app.get("/orders/:id/kitchen-text", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const kitchenInclude = {
      items: { include: { modifiers: { include: { modifier: true } }, menuItem: { include: { kitchenStation: true, group: { include: { kitchenStation: true } } } } } },
      payments: true,
      table: true
    } as const;
    const order = await prisma.posOrder.findUnique({
      where: { id },
      include: kitchenInclude
    });
    if (!order) return reply.notFound("Order not found");
    const chainMeta = getOrderChainMeta(order.legacyPayload);
    let ordersForKitchen = [order];
    if (chainMeta.chainGroupId) {
      try {
        const grouped = await prisma.posOrder.findMany({
          where: {
            status: { not: "VOID" },
            legacyPayload: { path: "$.chainGroupId", equals: chainMeta.chainGroupId }
          },
          include: kitchenInclude
        });
        if (grouped.length > 0) {
          ordersForKitchen = grouped;
        }
      } catch {
        // If JSON-path filtering is unavailable for this provider/version, keep single-order behavior.
      }
    }
    const combinedTickets = buildKitchenTicketsForOrders(ordersForKitchen);
    return {
      tickets: combinedTickets,
      combined: combinedTickets.map((t) => t.text).join("\n\n")
    };
  });

  app.post("/orders/:id/hold", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
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

    const order = await prisma.posOrder.update({
      where: { id },
      data: { status: "HOLD" }
    });
    return order;
  });

  app.get("/orders/held", async () => {
    return prisma.posOrder.findMany({
      where: { status: "HOLD" },
      include: { items: true, table: true },
      orderBy: { updatedAt: "desc" }
    });
  });

  app.post("/orders/:id/void", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = voidSchema.parse(request.body);
    const current = await prisma.posOrder.findUnique({
      where: { id },
      select: { id: true, tableId: true, legacyPayload: true }
    });
    if (!current) {
      return reply.notFound("Order not found");
    }

    const actorUserId = resolveRequestUserId(request);
    let actorName: string | null = null;
    if (actorUserId) {
      const actor = await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { username: true, displayName: true }
      });
      actorName = actor?.displayName ?? actor?.username ?? null;
    }

    const legacyPayload = {
      ...(getLegacyPayloadObject(current.legacyPayload) as Prisma.InputJsonObject),
      voidedAt: new Date().toISOString(),
      ...(actorUserId ? { voidedByUserId: actorUserId } : {}),
      ...(actorName ? { voidedByName: actorName } : {})
    };

    const order = await prisma.posOrder.update({
      where: { id },
      data: { status: "VOID", voided: true, voidReason: body.reason, legacyPayload }
    });

    if (order.tableId) {
      await prisma.diningTable.update({
        where: { id: order.tableId },
        data: { status: "AVAILABLE" }
      });
    }
    return order;
  });

  app.post("/orders/:id/refund", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = paymentSchema.parse(request.body);
    const payment = await prisma.payment.create({
      data: {
        orderId: id,
        method: body.method,
        amount: -Math.abs(body.amount),
        tenderAmount: body.tenderAmount,
        tipAmount: body.tipAmount,
        status: body.status ?? "PAID"
      }
    });
    await recalcOrder(id);
    return reply.code(201).send(payment);
  });

  app.post("/orders/:id/split", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = splitSchema.parse(request.body);
    const original = await prisma.posOrder.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!original) {
      return reply.notFound("Order not found");
    }

    const newOrder = await createOrderWithNumbers({
      tableId: original.tableId ?? undefined,
      serverId: original.serverId ?? undefined,
      orderType: original.orderType as "DINE_IN" | "TAKEOUT" | "DELIVERY",
      status: "OPEN",
      enforceService: false
    });

    await prisma.posOrderItem.updateMany({
      where: { id: { in: body.itemIds }, orderId: id },
      data: { orderId: newOrder.id }
    });

    await recalcOrder(id);
    await recalcOrder(newOrder.id);

    return reply.code(201).send({ originalId: id, newOrderId: newOrder.id });
  });

  app.post("/orders/:id/charges", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = serviceSchema.parse(request.body);
    try {
      const order = await prisma.posOrder.update({
        where: { id },
        data: {
          serviceCharge: body.serviceCharge,
          deliveryCharge: body.deliveryCharge
        }
      });
      await recalcOrder(id);
      return order;
    } catch {
      return reply.notFound("Order not found");
    }
  });

  app.post("/orders/:id/table", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = z.object({ tableId: z.string() }).parse(request.body);
    try {
      const order = await prisma.posOrder.update({
        where: { id },
        data: { tableId: body.tableId }
      });
      await prisma.diningTable.update({
        where: { id: body.tableId },
        data: { status: "SEATED" }
      });
      return order;
    } catch {
      return reply.notFound("Order not found");
    }
  });

  app.patch("/orders/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = orderUpdateSchema.parse(request.body);
    try {
      const existing = await prisma.posOrder.findUnique({
        where: { id },
        select: { id: true, orderType: true, tableId: true }
      });
      if (!existing) {
        return reply.notFound("Order not found");
      }
      const nextOrderType = body.orderType ?? existing.orderType;
      const nextTableId =
        typeof body.tableId !== "undefined" ? body.tableId : existing.tableId ?? undefined;
      if (nextOrderType === "DINE_IN" && !nextTableId) {
        return reply.badRequest("Table required for dine-in");
      }
      if (body.orderType) {
        const services = await getServiceConfig();
        if (!isServiceEnabled(body.orderType, services)) {
          return reply.badRequest("Service disabled");
        }
      }
      const order = await prisma.posOrder.update({
        where: { id },
        data: body
      });
      if (body.tableId) {
        await prisma.diningTable.update({
          where: { id: body.tableId },
          data: { status: "SEATED" }
        });
      }
      await recalcOrder(order.id);
      return order;
    } catch {
      return reply.notFound("Order not found");
    }
  });
}
