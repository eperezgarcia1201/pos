import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../services/prisma.js";
import { sendToKitchen } from "./kitchen.js";

const DOORDASH_PROVIDER_CODE = "DOORDASH";

function normalizeOrderType(value?: string | null) {
  if (!value) return "DELIVERY";
  const upper = String(value).toUpperCase();
  if (upper.includes("PICKUP") || upper.includes("TAKEOUT") || upper.includes("TO_GO")) return "TAKEOUT";
  if (upper.includes("DINE")) return "DINE_IN";
  return "DELIVERY";
}

async function ensureIntegrationProvider() {
  return prisma.integrationProvider.upsert({
    where: { code: DOORDASH_PROVIDER_CODE },
    update: {},
    create: { code: DOORDASH_PROVIDER_CODE, name: "DoorDash", enabled: false, settings: {} }
  });
}

type DoorDashSettings = {
  environment?: string;
  developerId?: string;
  keyId?: string;
  signingSecret?: string;
  providerType?: string;
  menuReference?: string;
  menuName?: string;
  userAgent?: string;
  openHours?: Array<{ day_index: string; start_time: string; end_time: string }>;
  specialHours?: Array<{ date: string; closed: boolean; open_time?: string; close_time?: string }>;
};

async function getDoorDashSettings() {
  const provider = await ensureIntegrationProvider();
  const settings = (provider.settings || {}) as DoorDashSettings;
  return { provider, settings };
}

function buildDoorDashJwt(settings: DoorDashSettings) {
  if (!settings.developerId || !settings.keyId || !settings.signingSecret) {
    throw new Error("DoorDash credentials missing.");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "doordash",
    iss: settings.developerId,
    kid: settings.keyId,
    iat: now,
    exp: now + 60 * 30
  };
  const secret = Buffer.from(settings.signingSecret, "base64");
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    header: ({ alg: "HS256", typ: "JWT", "dd-ver": "DD-JWT-V1" } as unknown) as jwt.JwtHeader
  });
}

async function doordashFetch(path: string, options: RequestInit, settings: DoorDashSettings) {
  const token = buildDoorDashJwt(settings);
  const baseUrl = "https://openapi.doordash.com";
  const headers = {
    Authorization: `Bearer ${token}`,
    "auth-version": "v2",
    "User-Agent": settings.userAgent || "WebsysPOS/1.0",
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

function defaultOpenHours() {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return days.map((day) => ({ day_index: day, start_time: "00:00", end_time: "23:59" }));
}

async function buildDoorDashMenuPayload(merchantSuppliedId: string) {
  const { provider, settings } = await getDoorDashSettings();
  const store = await prisma.integrationStore.findFirst({
    where: { providerId: provider.id, merchantSuppliedId }
  });
  if (!store) throw new Error("Store not mapped.");

  const categories = await prisma.menuCategory.findMany({
    where: { visible: true },
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        where: { visible: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { visible: true },
            orderBy: { name: "asc" },
            include: {
              modifierGroups: {
                include: {
                  group: { include: { modifiers: { where: { active: true }, orderBy: { sortOrder: "asc" } } } }
                },
                orderBy: { sortOrder: "asc" }
              }
            }
          }
        }
      }
    }
  });
  const categoryIds = categories.map((category) => category.id);
  const looseItems = categoryIds.length
    ? await prisma.menuItem.findMany({
        where: { visible: true, categoryId: { in: categoryIds }, groupId: null },
        orderBy: { name: "asc" },
        include: {
          modifierGroups: {
            include: {
              group: { include: { modifiers: { where: { active: true }, orderBy: { sortOrder: "asc" } } } }
            },
            orderBy: { sortOrder: "asc" }
          }
        }
      })
    : [];
  const looseByCategory = new Map<string, typeof looseItems>();
  for (const item of looseItems) {
    if (!item.categoryId) continue;
    const current = looseByCategory.get(item.categoryId) || [];
    current.push(item);
    looseByCategory.set(item.categoryId, current);
  }

  const menuReference = settings.menuReference || "pos-menu";
  const menuName = settings.menuName || "POS Menu";
  const openHours = settings.openHours && settings.openHours.length > 0 ? settings.openHours : defaultOpenHours();
  const specialHours = settings.specialHours || [];

  const mapItem = (item: (typeof looseItems)[number]) => ({
    id: item.id,
    merchant_supplied_id: item.sku || item.barcode || item.id,
    name: item.name,
    description: item.description || "",
    price: Number(item.price),
    active: item.visible,
    option_groups: item.modifierGroups.map((mg) => {
      const groupDef = mg.group;
      return {
        id: groupDef.id,
        merchant_supplied_id: groupDef.id,
        name: groupDef.name,
        min_num_options: mg.minRequired ?? groupDef.minRequired ?? 0,
        max_num_options: mg.maxAllowed ?? groupDef.maxAllowed ?? Math.max(groupDef.modifiers.length, 1),
        options: groupDef.modifiers.map((mod) => ({
          id: mod.id,
          merchant_supplied_id: mod.id,
          name: mod.name,
          price: Number(mod.price),
          active: mod.active
        }))
      };
    })
  });

  const menuCategories = categories.flatMap((category) => {
    const groups = category.groups.map((group) => ({
      id: group.id,
      merchant_supplied_id: group.id,
      name: group.name,
      items: group.items.map(mapItem)
    }));
    const loose = looseByCategory.get(category.id) || [];
    if (loose.length > 0) {
      groups.unshift({
        id: `${category.id}-items`,
        merchant_supplied_id: `${category.id}-items`,
        name: category.name,
        items: loose.map(mapItem)
      });
    }
    return groups;
  });

  const menuId = (store.settings as Record<string, any> | null)?.menuId;

  return {
    store: {
      merchant_supplied_id: store.merchantSuppliedId,
      provider_type: settings.providerType || "merchant"
    },
    menus: [
      {
        id: menuId || undefined,
        reference: menuReference,
        open_hours: openHours,
        special_hours: specialHours,
        menu: {
          name: menuName,
          subtitle: menuName,
          merchant_supplied_id: store.merchantSuppliedId,
          active: true,
          categories: menuCategories
        }
      }
    ]
  };
}

async function ensureOnlinePlaceholderItem() {
  let category = await prisma.menuCategory.findFirst({ where: { name: "Online Orders" } });
  if (!category) {
    category = await prisma.menuCategory.create({ data: { name: "Online Orders", sortOrder: 999, visible: false } });
  } else if (category.visible !== false) {
    await prisma.menuCategory.update({ where: { id: category.id }, data: { visible: false } });
  }

  let group = await prisma.menuGroup.findFirst({ where: { name: "Online Items", categoryId: category.id } });
  if (!group) {
    group = await prisma.menuGroup.create({ data: { name: "Online Items", categoryId: category.id, sortOrder: 1, visible: false } });
  } else if (group.visible !== false) {
    await prisma.menuGroup.update({ where: { id: group.id }, data: { visible: false } });
  }
  const existing = await prisma.menuItem.findFirst({ where: { name: "Online Order Item", groupId: group.id } });
  if (existing) return existing;
  return prisma.menuItem.create({
    data: {
      name: "Online Order Item",
      price: new Prisma.Decimal(0),
      visible: false,
      category: { connect: { id: category.id } },
      group: { connect: { id: group.id } }
    }
  });
}

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

  const status =
    order.status === "VOID"
      ? "VOID"
      : due <= 0 && total > 0
        ? "PAID"
        : order.status === "PAID"
          ? "OPEN"
          : order.status;

  await prisma.posOrder.update({
    where: { id: orderId },
    data: {
      subtotalAmount: subtotal,
      discountAmount: discountTotal,
      taxAmount: taxTotal,
      totalAmount: total,
      paidAmount: paidTotal,
      dueAmount: due,
      status
    }
  });

  return orderId;
}

export async function registerIntegrationRoutes(app: FastifyInstance) {
  app.get("/integrations/providers", async () => {
    return prisma.integrationProvider.findMany({ include: { stores: true } });
  });

  app.post("/integrations/providers", async (request, reply) => {
    const body = (request.body as { code?: string; name?: string; enabled?: boolean; settings?: unknown }) || {};
    if (!body.code || !body.name) return reply.badRequest("code and name required");
    const created = await prisma.integrationProvider.create({
      data: {
        code: body.code.toUpperCase(),
        name: body.name,
        enabled: body.enabled ?? false,
        settings: body.settings ?? {}
      }
    });
    return created;
  });

  app.patch("/integrations/providers/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = (request.body as { enabled?: boolean; settings?: unknown; name?: string }) || {};
    try {
      const updated = await prisma.integrationProvider.update({
        where: { id },
        data: {
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          settings:
            typeof body.settings === "undefined"
              ? undefined
              : (body.settings as Prisma.InputJsonValue),
          name: body.name
        }
      });
      return updated;
    } catch {
      return reply.notFound("Provider not found");
    }
  });

  app.get("/integrations/stores", async () => {
    return prisma.integrationStore.findMany({ include: { provider: true } });
  });

  app.post("/integrations/stores", async (request, reply) => {
    const body =
      (request.body as {
        providerId?: string;
        name?: string;
        merchantSuppliedId?: string;
        providerStoreId?: string | null;
        active?: boolean;
        settings?: unknown;
      }) || {};
    if (!body.providerId || !body.name || !body.merchantSuppliedId) {
      return reply.badRequest("providerId, name, and merchantSuppliedId required");
    }
    const created = await prisma.integrationStore.create({
      data: {
        providerId: body.providerId,
        name: body.name,
        merchantSuppliedId: body.merchantSuppliedId,
        providerStoreId: body.providerStoreId ?? undefined,
        active: body.active ?? true,
        settings: body.settings ?? {}
      }
    });
    return created;
  });

  app.patch("/integrations/stores/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body =
      (request.body as {
        name?: string;
        merchantSuppliedId?: string;
        providerStoreId?: string | null;
        active?: boolean;
        settings?: unknown;
      }) || {};
    try {
      const updated = await prisma.integrationStore.update({
        where: { id },
        data: {
          name: body.name,
          merchantSuppliedId: body.merchantSuppliedId,
          providerStoreId: body.providerStoreId ?? undefined,
          active: typeof body.active === "boolean" ? body.active : undefined,
          settings:
            typeof body.settings === "undefined"
              ? undefined
              : (body.settings as Prisma.InputJsonValue)
        }
      });
      return updated;
    } catch {
      return reply.notFound("Store not found");
    }
  });

  app.get("/integrations/orders", async (request) => {
    const query = request.query as { provider?: string; status?: string; limit?: string };
    const where: Record<string, unknown> = {};
    if (query.provider) {
      where.provider = { code: String(query.provider).toUpperCase() };
    }
    if (query.status) {
      const list = String(query.status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length > 0) {
        where.status = { in: list };
      }
    }
    const take = query.limit ? Math.min(Number(query.limit) || 50, 200) : 100;
    return prisma.integrationOrder.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: { provider: true, store: true, posOrder: true },
      orderBy: { createdAt: "desc" },
      take
    });
  });

  app.get("/integrations/doordash/menu/:merchantSuppliedId", async (request, reply) => {
    const merchantSuppliedId = String((request.params as { merchantSuppliedId: string }).merchantSuppliedId);
    try {
      const payload = await buildDoorDashMenuPayload(merchantSuppliedId);
      const ids = (request.query as { ids?: string }).ids;
      if (ids) {
        const requested = ids
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const menuId = (payload.menus?.[0] as { id?: string } | undefined)?.id;
        if (requested.length > 0 && menuId && !requested.includes(menuId)) {
          return reply.notFound("Menu id not found.");
        }
      }
      return payload;
    } catch (err) {
      return reply.badRequest(err instanceof Error ? err.message : "Unable to build menu.");
    }
  });

  app.post("/integrations/doordash/menus/push", async (request, reply) => {
    const body = (request.body as { storeId?: string; merchantSuppliedId?: string }) || {};
    const { provider, settings } = await getDoorDashSettings();
    if (!provider.enabled) {
      return reply.badRequest("DoorDash integration is disabled.");
    }
    if (!body.storeId && !body.merchantSuppliedId) {
      return reply.badRequest("storeId or merchantSuppliedId required.");
    }
    const store = await prisma.integrationStore.findFirst({
      where: body.storeId
        ? { id: body.storeId, providerId: provider.id }
        : { providerId: provider.id, merchantSuppliedId: String(body.merchantSuppliedId) }
    });
    if (!store) return reply.notFound("Store not found.");
    const payload = await buildDoorDashMenuPayload(store.merchantSuppliedId);
    const response = await doordashFetch(
      "/marketplace/api/v1/menus",
      { method: "POST", body: JSON.stringify(payload) },
      settings
    );
    const data = await response.json();
    if (!response.ok) {
      return reply.status(response.status).send(data);
    }
    const menuId = data?.menu_id || data?.menuId;
    if (menuId) {
      const existingSettings = (store.settings || {}) as Record<string, any>;
      await prisma.integrationStore.update({
        where: { id: store.id },
        data: { settings: { ...existingSettings, menuId } }
      });
    }
    return data;
  });

  app.post("/integrations/doordash/webhooks/menu-status", async (request) => {
    const { provider } = await getDoorDashSettings();
    const payload = (request.body as Record<string, any>) || {};
    const merchantSuppliedId =
      payload.store?.merchant_supplied_id ||
      payload.merchant_supplied_id ||
      payload.merchantSuppliedId ||
      payload.store_id;
    if (!merchantSuppliedId) return { ok: true };
    const store = await prisma.integrationStore.findFirst({
      where: { providerId: provider.id, merchantSuppliedId: String(merchantSuppliedId) }
    });
    if (!store) return { ok: true };
    const menuId = payload.menu?.id || payload.menu_id || payload.menuId;
    const existingSettings = (store.settings || {}) as Record<string, any>;
    await prisma.integrationStore.update({
      where: { id: store.id },
      data: {
        settings: {
          ...existingSettings,
          menuId: menuId || existingSettings.menuId,
          lastMenuStatus: payload.event?.status || payload.status,
          lastMenuEvent: payload.event?.type || payload.event_type,
          lastMenuAt: new Date().toISOString()
        }
      }
    });
    return { ok: true };
  });

  app.post("/integrations/doordash/webhooks/order-release", async (request) => {
    const { provider } = await getDoorDashSettings();
    const payload = (request.body as Record<string, any>) || {};
    const externalId =
      payload.external_order_id || payload.order_id || payload.id || payload.order?.external_order_id || payload.order?.id;
    if (!externalId) return { ok: true };
    const integrationOrder = await prisma.integrationOrder.findUnique({
      where: { providerId_externalId: { providerId: provider.id, externalId: String(externalId) } }
    });
    if (integrationOrder?.posOrderId) {
      const existingTicket = await prisma.kitchenTicket.findFirst({
        where: { orderId: integrationOrder.posOrderId }
      });
      if (!existingTicket) {
        await sendToKitchen(integrationOrder.posOrderId, null);
      }
    }
    if (integrationOrder) {
      await prisma.integrationOrder.update({
        where: { id: integrationOrder.id },
        data: { status: "RELEASED", payload }
      });
    }
    return { ok: true };
  });

  app.post("/integrations/doordash/webhooks/order-canceled", async (request) => {
    const { provider } = await getDoorDashSettings();
    const payload = (request.body as Record<string, any>) || {};
    const externalId =
      payload.external_order_id || payload.order_id || payload.id || payload.order?.external_order_id || payload.order?.id;
    if (!externalId) return { ok: true };
    const integrationOrder = await prisma.integrationOrder.findUnique({
      where: { providerId_externalId: { providerId: provider.id, externalId: String(externalId) } }
    });
    if (integrationOrder?.posOrderId) {
      await prisma.posOrder.update({
        where: { id: integrationOrder.posOrderId },
        data: { status: "VOID" }
      });
    }
    if (integrationOrder) {
      await prisma.integrationOrder.update({
        where: { id: integrationOrder.id },
        data: { status: "CANCELLED", payload }
      });
    }
    return { ok: true };
  });

  app.post("/integrations/doordash/webhooks/dasher-status", async (request) => {
    const { provider } = await getDoorDashSettings();
    const payload = (request.body as Record<string, any>) || {};
    const externalId =
      payload.external_order_id || payload.order_id || payload.id || payload.order?.external_order_id || payload.order?.id;
    if (!externalId) return { ok: true };
    const integrationOrder = await prisma.integrationOrder.findUnique({
      where: { providerId_externalId: { providerId: provider.id, externalId: String(externalId) } }
    });
    if (integrationOrder) {
      await prisma.integrationOrder.update({
        where: { id: integrationOrder.id },
        data: { payload }
      });
    }
    return { ok: true };
  });

  // DoorDash webhook - order events
  app.post("/integrations/doordash/webhooks/orders", async (request) => {
    const provider = await ensureIntegrationProvider();
    const payload = (request.body as Record<string, any>) || {};
    const orderPayload = payload.order ?? payload;
    const externalId =
      orderPayload.external_order_id ||
      orderPayload.order_id ||
      orderPayload.id ||
      payload.external_order_id ||
      payload.order_id ||
      payload.id ||
      `${Date.now()}`;
    const displayId = orderPayload.display_id || orderPayload.order_reference_id || null;
    const rawStatus = orderPayload.status || payload.status || "NEW";
    const status = String(rawStatus).toUpperCase();
    const orderType = normalizeOrderType(orderPayload.order_type || orderPayload.orderType || payload.order_type);
    const storeMerchantId =
      orderPayload.store?.merchant_supplied_id ||
      orderPayload.store?.merchantSuppliedId ||
      orderPayload.merchant_supplied_id ||
      payload.store?.merchant_supplied_id ||
      payload.store_id ||
      null;

    let store = null;
    if (storeMerchantId) {
      store = await prisma.integrationStore.findFirst({
        where: { providerId: provider.id, merchantSuppliedId: String(storeMerchantId) }
      });
    }

    const existing = await prisma.integrationOrder.findUnique({
      where: { providerId_externalId: { providerId: provider.id, externalId: String(externalId) } }
    });

    let posOrderId: string | null = existing?.posOrderId ?? null;

    if (!posOrderId) {
      const placeholder = await ensureOnlinePlaceholderItem();
      const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];
      const createdOrder = await prisma.posOrder.create({
        data: {
          orderType,
          status: "OPEN",
          customerName: orderPayload.consumer?.name || orderPayload.customer?.name || orderPayload.customer_name || undefined,
          notes: orderPayload.instructions || orderPayload.delivery_instructions || undefined,
          deliveryCharge: orderPayload.delivery_fee ? new Prisma.Decimal(orderPayload.delivery_fee) : undefined,
          serviceCharge: orderPayload.service_fee ? new Prisma.Decimal(orderPayload.service_fee) : undefined
        }
      });
      posOrderId = createdOrder.id;

      if (items.length > 0) {
        const menuItems = await prisma.menuItem.findMany({});
        const mapById = new Map(menuItems.map((item) => [item.id, item]));
        const mapBySku = new Map(menuItems.filter((item) => item.sku).map((item) => [item.sku as string, item]));
        const mapByBarcode = new Map(
          menuItems.filter((item) => item.barcode).map((item) => [item.barcode as string, item])
        );
        const mapByName = new Map(menuItems.map((item) => [item.name.toLowerCase(), item]));

        for (const entry of items) {
          const qty = Number(entry.quantity || entry.qty || 1);
          const externalItemId = entry.merchant_supplied_id || entry.merchantSuppliedId || entry.id || entry.external_id;
          const name = entry.name || entry.title || entry.item_name || "Online Item";
          const priceValue = entry.price || entry.unit_price || entry.base_price || entry.item_price || 0;
          const menuItem =
            (externalItemId && mapById.get(String(externalItemId))) ||
            (externalItemId && mapBySku.get(String(externalItemId))) ||
            (externalItemId && mapByBarcode.get(String(externalItemId))) ||
            mapByName.get(String(name).toLowerCase()) ||
            placeholder;

          await prisma.posOrderItem.create({
            data: {
              orderId: createdOrder.id,
              menuItemId: menuItem.id,
              quantity: Number.isFinite(qty) ? qty : 1,
              price: new Prisma.Decimal(priceValue || menuItem.price),
              name
            }
          });
        }
      } else {
        await prisma.posOrderItem.create({
          data: {
            orderId: createdOrder.id,
            menuItemId: placeholder.id,
            quantity: 1,
            price: new Prisma.Decimal(0),
            name: "Online order"
          }
        });
      }

      await recalcOrder(createdOrder.id);
    }

    const data = {
      providerId: provider.id,
      storeId: store?.id ?? null,
      externalId: String(externalId),
      displayId: displayId ? String(displayId) : null,
      status,
      orderType,
      payload,
      posOrderId
    };

    if (existing) {
      await prisma.integrationOrder.update({
        where: { id: existing.id },
        data
      });
    } else {
      await prisma.integrationOrder.create({ data });
    }

    return { ok: true };
  });
}
