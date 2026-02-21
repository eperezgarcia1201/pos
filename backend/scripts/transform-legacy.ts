import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/services/prisma.js";

const envDir = process.env.LEGACY_EXPORT_DIR;
const dirArg = process.argv.find((arg) => arg.startsWith("--dir="));
const dir = envDir || (dirArg ? dirArg.split("=")[1] : "./export");

const toKey = (name: string) => name.toLowerCase();

const readTable = (baseDir: string, table: string) => {
  const file = path.join(baseDir, `${table.toLowerCase()}.json`);
  if (!fs.existsSync(file)) {
    return [] as Record<string, unknown>[];
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
};

const getValue = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (key in row && row[key] !== null && row[key] !== undefined) {
      return row[key];
    }
  }
  return undefined;
};

const toInt = (value: unknown) => {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : Math.trunc(num);
};

const toBool = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return undefined;
};

const toString = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

const toDecimal = (value: unknown) => {
  if (value === null || value === undefined || value === "") return undefined;
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
};

const toDate = (value: unknown) => {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

const maskCard = (value: unknown) => {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  return `**** **** **** ${digits.slice(-4)}`;
};

async function ensureLegacyCategory(name: string) {
  const existing = await prisma.menuCategory.findFirst({
    where: { name }
  });
  if (existing) return existing.id;
  const created = await prisma.menuCategory.create({
    data: { name, visible: false, legacySource: "LEGACY" }
  });
  return created.id;
}

async function main() {
  const baseDir = path.resolve(dir);

  const placeholderHash = await bcrypt.hash("legacy-reset-required", 10);

  const menuCategories = readTable(baseDir, "menu_category");
  const menuGroups = readTable(baseDir, "menu_group");
  const menuItems = readTable(baseDir, "menu_item");
  const shopTables = readTable(baseDir, "shop_table");
  const userTypes = readTable(baseDir, "user_type");
  const users = readTable(baseDir, "users");
  const tickets = readTable(baseDir, "ticket");
  const ticketItems = readTable(baseDir, "ticket_item");
  const ticketTableNums = readTable(baseDir, "ticket_table_num");
  const transactions = readTable(baseDir, "transactions");

  const roleMap = new Map<number, string>();
  for (const row of userTypes) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    const name = toString(getValue(row, "P_NAME", "p_name", "NAME", "name")) || `Role-${legacyId ?? "unknown"}`;
    if (legacyId === undefined) continue;

    const existing = await prisma.role.findFirst({ where: { legacyId, legacySource: "USER_TYPE" } });
    const role = existing
      ? existing
      : await prisma.role.create({
          data: {
            name,
            permissions: {},
            legacyId,
            legacySource: "USER_TYPE"
          }
        });
    roleMap.set(legacyId, role.id);
  }

  let defaultRoleId = (await prisma.role.findFirst({ where: { name: "Staff" } }))?.id;
  if (!defaultRoleId) {
    const role = await prisma.role.create({ data: { name: "Staff", permissions: {} } });
    defaultRoleId = role.id;
  }

  const userMap = new Map<number, string>();
  for (const row of users) {
    const legacyId = toInt(getValue(row, "AUTO_ID", "auto_id"));
    const userId = toString(getValue(row, "USER_ID", "user_id"));
    const firstName = toString(getValue(row, "FIRST_NAME", "first_name")) || "";
    const lastName = toString(getValue(row, "LAST_NAME", "last_name")) || "";
    const usernameBase = userId || `${firstName}.${lastName}`.replace(/\.+/g, ".").toLowerCase() || `user-${legacyId}`;
    if (!legacyId) continue;

    let username = usernameBase;
    let suffix = 1;
    while (await prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      username = `${usernameBase}-${suffix}`;
    }

    const displayName = `${firstName} ${lastName}`.trim() || username;
    const roleId = roleMap.get(toInt(getValue(row, "N_USER_TYPE", "n_user_type")) ?? -1) || defaultRoleId!;

    const passwordHash = placeholderHash;

    const created = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName,
        active: toBool(getValue(row, "ACTIVE", "active")) ?? true,
        roleId,
        legacyId,
        legacySource: "USERS"
      }
    });

    userMap.set(legacyId, created.id);
  }

  const categoryMap = new Map<number, string>();
  const categoryNameById = new Map<number, string>();

  for (const row of menuCategories) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    if (legacyId === undefined) continue;
    const name = toString(getValue(row, "NAME", "name")) || `Category-${legacyId}`;

    const category = await prisma.menuCategory.create({
      data: {
        name,
        sortOrder: toInt(getValue(row, "SORT_ORDER", "sort_order")) ?? 0,
        visible: toBool(getValue(row, "VISIBLE", "visible")) ?? true,
        legacyId,
        legacySource: "MENU_CATEGORY"
      }
    });
    categoryMap.set(legacyId, category.id);
    categoryNameById.set(legacyId, name);
  }

  const groupMap = new Map<number, string>();
  for (const row of menuGroups) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    if (legacyId === undefined) continue;
    const groupName = toString(getValue(row, "NAME", "name")) || `Group-${legacyId}`;
    const parentId = toInt(getValue(row, "CATEGORY_ID", "category_id"));
    const parentName = parentId ? categoryNameById.get(parentId) : undefined;
    const name = parentName ? `${parentName} / ${groupName}` : groupName;

    const category = await prisma.menuCategory.create({
      data: {
        name,
        sortOrder: toInt(getValue(row, "SORT_ORDER", "sort_order")) ?? 0,
        visible: toBool(getValue(row, "VISIBLE", "visible")) ?? true,
        legacyId,
        legacySource: "MENU_GROUP"
      }
    });
    groupMap.set(legacyId, category.id);
  }

  const legacyFallbackCategory = await ensureLegacyCategory("Legacy Imports");

  const menuItemMap = new Map<number, string>();
  for (const row of menuItems) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    if (legacyId === undefined) continue;
    const name = toString(getValue(row, "NAME", "name")) || `Item-${legacyId}`;
    const groupId = toInt(getValue(row, "GROUP_ID", "group_id"));
    const categoryId = groupId ? groupMap.get(groupId) : legacyFallbackCategory;

    const item = await prisma.menuItem.create({
      data: {
        name,
        description: toString(getValue(row, "DESCRIPTION", "description")),
        barcode: toString(getValue(row, "BARCODE", "barcode")),
        price: toDecimal(getValue(row, "PRICE", "price")) ?? new Prisma.Decimal(0),
        cost: toDecimal(getValue(row, "BUY_PRICE", "buy_price")),
        taxable: toBool(getValue(row, "IS_TAX_EXEMPT", "is_tax_exempt")) ? false : true,
        visible: toBool(getValue(row, "VISIBLE", "visible")) ?? true,
        categoryId,
        legacyId,
        legacyGroupId: groupId,
        legacyCategoryId: toInt(getValue(row, "CATEGORY_ID", "category_id")),
        legacyPayload: row
      }
    });

    menuItemMap.set(legacyId, item.id);
  }

  const tableMap = new Map<number, string>();
  for (const row of shopTables) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    if (legacyId === undefined) continue;
    const name = toString(getValue(row, "NAME", "name")) || `Table-${legacyId}`;

    const table = await prisma.diningTable.create({
      data: {
        name,
        capacity: toInt(getValue(row, "CAPACITY", "capacity")),
        posX: toInt(getValue(row, "X", "x")),
        posY: toInt(getValue(row, "Y", "y")),
        legacyId,
        legacySource: "SHOP_TABLE"
      }
    });
    tableMap.set(legacyId, table.id);
  }

  const ticketTableMap = new Map<number, number>();
  for (const row of ticketTableNums) {
    const ticketId = toInt(getValue(row, "TICKET_ID", "ticket_id"));
    const tableId = toInt(getValue(row, "TABLE_ID", "table_id"));
    if (ticketId && tableId) {
      ticketTableMap.set(ticketId, tableId);
    }
  }

  const orderMap = new Map<number, string>();
  for (const row of tickets) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    if (legacyId === undefined) continue;

    const orderType = (() => {
      const ticketType = toString(getValue(row, "TICKET_TYPE", "ticket_type"));
      const pickup = toBool(getValue(row, "CUSTOMER_PICKEUP", "customer_pickup"));
      const delivery = toDate(getValue(row, "DELIVEERY_DATE", "delivery_date"));
      if (delivery) return "DELIVERY";
      if (pickup) return "TAKEOUT";
      if (ticketType) return ticketType.toUpperCase();
      return "DINE_IN";
    })();

    const legacyTableId = ticketTableMap.get(legacyId);
    const tableId = legacyTableId ? tableMap.get(legacyTableId) : undefined;

    const order = await prisma.posOrder.create({
      data: {
        tableId,
        status: toString(getValue(row, "STATUS", "status")) || "OPEN",
        orderType,
        customerName: toString(getValue(row, "CUSTOMER_ID", "customer_id")),
        notes: toString(getValue(row, "DELIVERY_EXTRA_INFO", "delivery_extra_info")),
        createdAtLegacy: toDate(getValue(row, "CREATE_DATE", "create_date")),
        closedAtLegacy: toDate(getValue(row, "CLOSING_DATE", "closing_date")),
        activeAtLegacy: toDate(getValue(row, "ACTIVE_DATE", "active_date")),
        deliveryAtLegacy: toDate(getValue(row, "DELIVEERY_DATE", "deliveery_date", "delivery_date")),
        paid: toBool(getValue(row, "PAID", "paid")),
        voided: toBool(getValue(row, "VOIDED", "voided")),
        voidReason: toString(getValue(row, "VOID_REASON", "void_reason")),
        subtotalAmount: toDecimal(getValue(row, "SUB_TOTAL", "sub_total")),
        discountAmount: toDecimal(getValue(row, "TOTAL_DISCOUNT", "total_discount")),
        taxAmount: toDecimal(getValue(row, "TOTAL_TAX", "total_tax")),
        totalAmount: toDecimal(getValue(row, "TOTAL_PRICE", "total_price")),
        paidAmount: toDecimal(getValue(row, "PAID_AMOUNT", "paid_amount")),
        dueAmount: toDecimal(getValue(row, "DUE_AMOUNT", "due_amount")),
        advanceAmount: toDecimal(getValue(row, "ADVANCE_AMOUNT", "advance_amount")),
        adjustmentAmount: toDecimal(getValue(row, "ADJUSTMENT_AMOUNT", "adjustment_amount")),
        numberOfGuests: toInt(getValue(row, "NUMBER_OF_GUESTS", "number_of_guests")),
        barTab: toBool(getValue(row, "BAR_TAB", "bar_tab")),
        taxExempt: toBool(getValue(row, "IS_TAX_EXEMPT", "is_tax_exempt")),
        reOpened: toBool(getValue(row, "IS_RE_OPENED", "is_re_opened")),
        serviceCharge: toDecimal(getValue(row, "SERVICE_CHARGE", "service_charge")),
        deliveryCharge: toDecimal(getValue(row, "DELIVERY_CHARGE", "delivery_charge")),
        ticketType: toString(getValue(row, "TICKET_TYPE", "ticket_type")),
        legacyId,
        legacySource: "TICKET",
        legacyPayload: row
      }
    });

    orderMap.set(legacyId, order.id);
  }

  for (const row of ticketItems) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    const ticketId = toInt(getValue(row, "TICKET_ID", "ticket_id"));
    if (!ticketId) continue;

    const orderId = orderMap.get(ticketId);
    if (!orderId) continue;

    const itemLegacyId = toInt(getValue(row, "ITEM_ID", "item_id"));
    let menuItemId = itemLegacyId ? menuItemMap.get(itemLegacyId) : undefined;

    if (!menuItemId) {
      const name = toString(getValue(row, "ITEM_NAME", "item_name")) || `Legacy Item ${itemLegacyId ?? "unknown"}`;
      const created = await prisma.menuItem.create({
        data: {
          name,
          price: toDecimal(getValue(row, "ITEM_PRICE", "item_price")) ?? new Prisma.Decimal(0),
          visible: false,
          categoryId: legacyFallbackCategory,
          legacyId: itemLegacyId,
          legacySource: "TICKET_ITEM"
        }
      });
      menuItemId = created.id;
      if (itemLegacyId) menuItemMap.set(itemLegacyId, menuItemId);
    }

    const quantity = toInt(getValue(row, "ITEM_COUNT", "item_count")) ?? Math.max(1, Math.round(Number(getValue(row, "ITEM_QUANTITY", "item_quantity") ?? 1)));

    await prisma.posOrderItem.create({
      data: {
        orderId,
        menuItemId,
        quantity,
        price: toDecimal(getValue(row, "ITEM_PRICE", "item_price")) ?? new Prisma.Decimal(0),
        name: toString(getValue(row, "ITEM_NAME", "item_name")),
        totalAmount: toDecimal(getValue(row, "TOTAL_PRICE", "total_price")),
        taxAmount: toDecimal(getValue(row, "TAX_AMOUNT", "tax_amount")),
        discountAmount: toDecimal(getValue(row, "DISCOUNT", "discount")),
        legacyId,
        legacyPayload: row
      }
    });
  }

  for (const row of transactions) {
    const legacyId = toInt(getValue(row, "ID", "id"));
    const ticketId = toInt(getValue(row, "TICKET_ID", "ticket_id"));
    if (!ticketId) continue;

    const orderId = orderMap.get(ticketId);
    if (!orderId) continue;

    const method = toString(getValue(row, "PAYMENT_TYPE", "payment_type")) || toString(getValue(row, "PAYMENT_SUB_TYPE", "payment_sub_type")) || "UNKNOWN";

    await prisma.payment.create({
      data: {
        orderId,
        method,
        amount: toDecimal(getValue(row, "AMOUNT", "amount")) ?? new Prisma.Decimal(0),
        status: toBool(getValue(row, "VOIDED", "voided")) ? "VOID" : (toBool(getValue(row, "CAPTURED", "captured")) ? "CAPTURED" : "PAID"),
        reference: toString(getValue(row, "CUSTOM_PAYMENT_REF", "custom_payment_ref")),
        tenderAmount: toDecimal(getValue(row, "TENDER_AMOUNT", "tender_amount")),
        tipAmount: toDecimal(getValue(row, "TIPS_AMOUNT", "tips_amount")),
        transactionType: toString(getValue(row, "TRANSACTION_TYPE", "transaction_type")),
        paymentType: toString(getValue(row, "PAYMENT_SUB_TYPE", "payment_sub_type")),
        cardType: toString(getValue(row, "CARD_TYPE", "card_type")),
        cardNumberMasked: maskCard(getValue(row, "CARD_NUMBER", "card_number")),
        cardAuthCode: toString(getValue(row, "CARD_AUTH_CODE", "card_auth_code")),
        cardTransactionId: toString(getValue(row, "CARD_TRANSACTION_ID", "card_transaction_id")),
        cardReader: toString(getValue(row, "CARD_READER", "card_reader")),
        captured: toBool(getValue(row, "CAPTURED", "captured")),
        voided: toBool(getValue(row, "VOIDED", "voided")),
        legacyId,
        legacyPayload: row
      }
    });
  }

  console.log("Legacy transform completed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
