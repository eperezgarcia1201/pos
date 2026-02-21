import { Prisma } from "@prisma/client";
import { sortChainOrders } from "./orderChain.js";

const defaultTimeZone = process.env.POS_TIMEZONE || process.env.TZ;

type OrderWithItems = Prisma.PosOrderGetPayload<{
  include: {
    table: true;
    payments: true;
    items: {
      include: {
        modifiers: { include: { modifier: true } };
        menuItem: { include: { kitchenStation: true; group: { include: { kitchenStation: true } } } };
      };
    };
  };
}>;

export function formatTicketDate(date: Date, timeZone: string | undefined = defaultTimeZone) {
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatTicketTime(date: Date, timeZone: string | undefined = defaultTimeZone) {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  };
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date).replace(",", "");
    }
  } catch {
    // ignore and fall back
  }
  return date.toLocaleString("en-US", options).replace(",", "");
}

type ReceiptMeta = {
  serverName?: string;
  stationName?: string;
};

const RECEIPT_WIDTH = 42;

function padLine(left: string, right: string, width = RECEIPT_WIDTH) {
  const safeLeft = left ?? "";
  const safeRight = right ?? "";
  const space = Math.max(1, width - safeLeft.length - safeRight.length);
  return `${safeLeft}${" ".repeat(space)}${safeRight}`;
}

function center(text: string, width = RECEIPT_WIDTH) {
  const trimmed = text.trim();
  if (trimmed.length >= width) return trimmed;
  const left = Math.floor((width - trimmed.length) / 2);
  return `${" ".repeat(left)}${trimmed}`;
}

function formatPhone(raw?: string | null) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function formatOrderType(orderType: string) {
  if (orderType === "DINE_IN") return "Dine In";
  if (orderType === "TAKEOUT") return "Take Out";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType;
}

function wrapItemLine(qty: number, name: string, amount: string, width = RECEIPT_WIDTH) {
  const leftPrefix = `${qty} `;
  const available = width - amount.length - 1;
  const raw = `${leftPrefix}${name}`;
  if (raw.length <= available) {
    return [padLine(raw, amount, width)];
  }
  const firstLine = raw.slice(0, available);
  const remaining = raw.slice(available).trim();
  const lines = [padLine(firstLine, amount, width)];
  if (remaining) {
    lines.push(remaining);
  }
  return lines;
}

export function buildReceiptText(
  order: OrderWithItems,
  store:
    | { name?: string; address?: string; cityStateZip?: string; phone?: string; stationName?: string }
    | string,
  meta: ReceiptMeta = {}
) {
  const lines: string[] = [];
  const orderNumberValue = order.orderNumber ?? "-";
  const ticketNumberValue = order.ticketNumber ?? "-";
  const storeInfo = typeof store === "string" ? { name: store } : store;
  const storeName = storeInfo.name || "POS Store";
  const storeAddress = storeInfo.address || "";
  const storeCity = storeInfo.cityStateZip || "";
  const stationFallback = storeInfo.stationName;

  lines.push(center(storeName));
  if (storeAddress) lines.push(center(storeAddress));
  if (storeCity) lines.push(center(storeCity));
  const phone = formatPhone(storeInfo.phone || "");
  if (phone) lines.push(center(phone));
  lines.push("");
  const serverLabel = meta.serverName ? `Server: ${meta.serverName}` : "Server:";
  const stationLabel = meta.stationName || stationFallback ? `Station: ${meta.stationName ?? stationFallback}` : "";
  lines.push(padLine(serverLabel, stationLabel));
  lines.push(padLine(`Order #: ${orderNumberValue}`, formatOrderType(order.orderType)));
  if (order.table?.name) lines.push(`Table: ${order.table.name}`);
  lines.push("-".repeat(RECEIPT_WIDTH));
  if (order.status === "PAID") {
    lines.push(center(">> SETTLED <<"));
    lines.push("-".repeat(RECEIPT_WIDTH));
  }

  for (const item of order.items) {
    const amount = Number(item.price) * item.quantity;
    const itemName = item.name || item.menuItem?.name || item.menuItemId;
    wrapItemLine(item.quantity, itemName.toUpperCase(), amount.toFixed(2)).forEach((l) => lines.push(l));
    for (const mod of item.modifiers ?? []) {
      const modLabel = mod.customName || mod.modifier.name;
      const modPrice = Number(mod.price);
      if (modPrice > 0) {
        lines.push(padLine(`  + ${modLabel}`, modPrice.toFixed(2)));
      } else {
        lines.push(`  + ${modLabel}`);
      }
    }
  }

  lines.push("");
  const subtotal = Number(order.subtotalAmount ?? 0);
  const taxAmount = Number(order.taxAmount ?? 0);
  const subtotalWithTax = subtotal + taxAmount;
  lines.push(padLine("Bar Subtotal:", "0.00"));
  lines.push(padLine("Food Subtotal:", subtotalWithTax.toFixed(2)));
  lines.push(padLine("TAX:", taxAmount.toFixed(2)));
  lines.push("");
  lines.push(padLine("TOTAL:", `$${Number(order.totalAmount ?? 0).toFixed(2)}`));
  lines.push("");

  const paid = order.payments
    .filter((p) => p.status !== "VOID" && !p.voided)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const tender = order.payments
    .filter((p) => p.status !== "VOID" && !p.voided)
    .map((p) => ({
      label: p.method.toUpperCase() === "CARD" ? "Visa" : p.method,
      amount: Number(p.tenderAmount ?? p.amount)
    }))[0];
  if (tender) {
    lines.push(padLine(`${tender.label} Tendered:`, tender.amount.toFixed(2)));
  }
  const change = tender ? Math.max(0, tender.amount - Number(order.totalAmount ?? 0)) : 0;
  lines.push(padLine("CHANGE:", change.toFixed(2)));

  lines.push("");
  lines.push(center(`>> Ticket #: ${ticketNumberValue} <<`));
  lines.push(`Created: ${formatTicketTime(order.createdAt)}`);
  const settledAt = order.payments
    .filter((p) => p.status !== "VOID" && !p.voided)
    .map((p) => p.createdAt)
    .sort()
    .at(-1);
  if (settledAt) {
    lines.push(`SETTLED: ${formatTicketTime(new Date(settledAt))}`);
  }
  lines.push("");
  lines.push("*".repeat(RECEIPT_WIDTH));
  lines.push(padLine("15% Gratuity =", `$${(subtotalWithTax * 0.15).toFixed(2)}`));
  lines.push(padLine("20% Gratuity =", `$${(subtotalWithTax * 0.2).toFixed(2)}`));
  lines.push(padLine("25% Gratuity =", `$${(subtotalWithTax * 0.25).toFixed(2)}`));
  lines.push("*".repeat(RECEIPT_WIDTH));
  lines.push("");
  if (order.orderNumber) lines.push(center(`*${order.orderNumber}*`));

  return lines.join("\n");
}

export function buildKitchenTickets(order: OrderWithItems) {
  return buildKitchenTicketsForOrders([order]);
}

export function buildKitchenTicketsForOrders(orders: OrderWithItems[]) {
  if (orders.length === 0) return [];
  const sortedOrders = sortChainOrders(orders);
  const primaryOrder = sortedOrders[0];
  const grouped = new Map<
    string,
    { stationId?: string; stationName: string; printerId?: string; lines: string[] }
  >();
  const ticketNumberValue =
    sortedOrders.find((entry) => entry.ticketNumber)?.ticketNumber ?? primaryOrder.ticketNumber ?? null;
  const orderNumberValue =
    sortedOrders.find((entry) => entry.orderNumber)?.orderNumber ?? primaryOrder.orderNumber ?? null;
  const ticketNumber = ticketNumberValue ? `Ticket #${ticketNumberValue}` : "Ticket #—";
  const orderNumber = orderNumberValue ? `Order #${orderNumberValue}` : "Order #—";
  const tableName = primaryOrder.table?.name ?? sortedOrders.find((entry) => entry.table?.name)?.table?.name;
  const combinedCheckCount = sortedOrders.length;

  for (const order of sortedOrders) {
    for (const item of order.items) {
      const stationId = item.menuItem?.kitchenStationId ?? item.menuItem?.group?.kitchenStationId ?? "default";
      const existing = grouped.get(stationId);
      const stationName =
        item.menuItem?.kitchenStation?.name ??
        item.menuItem?.group?.kitchenStation?.name ??
        "Kitchen";
      const printerId =
        item.menuItem?.kitchenStation?.printerId ??
        item.menuItem?.group?.kitchenStation?.printerId ??
        undefined;
      const entry =
        existing ??
        {
          stationId: stationId === "default" ? undefined : stationId,
          stationName,
          printerId,
          lines: []
        };
      if (!existing) {
        grouped.set(stationId, entry);
      }
      const itemName = item.name || item.menuItem?.name || item.menuItemId;
      entry.lines.push(`${item.quantity}x ${itemName}`);
      for (const mod of item.modifiers ?? []) {
        const modLabel = mod.customName || mod.modifier.name;
        entry.lines.push(`  - ${modLabel}`);
      }
    }
  }

  return Array.from(grouped.values()).map((entry) => {
    const lines: string[] = [];
    lines.push(`${primaryOrder.orderType} Ticket`);
    lines.push(ticketNumber);
    lines.push(orderNumber);
    if (combinedCheckCount > 1) {
      lines.push(`Checks: ${combinedCheckCount}`);
    }
    if (tableName) {
      lines.push(`Table: ${tableName}`);
    }
    lines.push(`Station: ${entry.stationName}`);
    lines.push(formatTicketTime(primaryOrder.createdAt));
    lines.push("");
    lines.push(...entry.lines);
    return {
      stationId: entry.stationId,
      stationName: entry.stationName,
      printerId: entry.printerId,
      text: lines.join("\n")
    };
  });
}
