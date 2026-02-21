import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  if (!order) return;

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
}

async function ensureRolesAndUsers() {
  const managerRole = await prisma.role.upsert({
    where: { name: "Manager" },
    update: { permissions: { all: true } },
    create: { name: "Manager", permissions: { all: true } }
  });
  const cashierRole = await prisma.role.upsert({
    where: { name: "Cashier" },
    update: { permissions: { cash: true, orders: true, timeclock: true } },
    create: { name: "Cashier", permissions: { cash: true, orders: true, timeclock: true } }
  });
  const serverRole = await prisma.role.upsert({
    where: { name: "Server" },
    update: { permissions: { orders: true, timeclock: true } },
    create: { name: "Server", permissions: { orders: true, timeclock: true } }
  });

  const hash = await bcrypt.hash("poselmer123", 10);
  const adminPin = await bcrypt.hash("1234", 10);
  const cashierPin = await bcrypt.hash("1111", 10);
  const serverPin = await bcrypt.hash("2222", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { pinHash: adminPin },
    create: {
      username: "admin",
      displayName: "Admin",
      passwordHash: hash,
      pinHash: adminPin,
      roleId: managerRole.id
    }
  });

  await prisma.user.upsert({
    where: { username: "cashier1" },
    update: { pinHash: cashierPin },
    create: {
      username: "cashier1",
      displayName: "Front Cashier",
      passwordHash: hash,
      pinHash: cashierPin,
      roleId: cashierRole.id
    }
  });

  await prisma.user.upsert({
    where: { username: "server1" },
    update: { pinHash: serverPin },
    create: {
      username: "server1",
      displayName: "Floor Server",
      passwordHash: hash,
      pinHash: serverPin,
      roleId: serverRole.id
    }
  });

  return { managerRole, cashierRole, serverRole };
}

async function ensureSalesTax() {
  const existing = await prisma.tax.findFirst({ where: { name: "Sales Tax" } });
  if (existing) return existing;
  return prisma.tax.create({
    data: { name: "Sales Tax", rate: new Prisma.Decimal(0.0825), active: true }
  });
}

async function ensureKitchenStation(name: string, printerId = "kitchen-1") {
  const existing = await prisma.kitchenStation.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.kitchenStation.create({ data: { name, printerId } });
}

async function ensureMenuCategory(data: { name: string; sortOrder: number; color?: string }) {
  const existing = await prisma.menuCategory.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return prisma.menuCategory.create({ data });
}

async function ensureMenuGroup(data: { name: string; categoryId: string; sortOrder: number }) {
  const existing = await prisma.menuGroup.findFirst({
    where: { name: data.name, categoryId: data.categoryId }
  });
  if (existing) return existing;
  return prisma.menuGroup.create({ data });
}

async function ensureCategoryGroupItems(params: {
  category: { name: string; sortOrder: number; color?: string };
  group: { name: string; sortOrder: number };
  items: Array<{ name: string; price: number; color?: string }>;
  taxId: string;
  stationId: string;
}) {
  const category = await ensureMenuCategory(params.category);
  const group = await ensureMenuGroup({ name: params.group.name, categoryId: category.id, sortOrder: params.group.sortOrder });
  for (const item of params.items) {
    await ensureMenuItem({
      name: item.name,
      price: new Prisma.Decimal(item.price),
      categoryId: category.id,
      groupId: group.id,
      taxId: params.taxId,
      kitchenStationId: params.stationId,
      color: item.color
    });
  }
}

async function ensureMenuItem(data: {
  name: string;
  price: Prisma.Decimal;
  categoryId?: string;
  groupId?: string;
  taxId?: string;
  kitchenStationId?: string;
  barcode?: string;
  color?: string;
}) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      name: data.name,
      categoryId: data.categoryId ?? null,
      groupId: data.groupId ?? null
    }
  });
  if (existing) return existing;
  return prisma.menuItem.create({
    data: {
      name: data.name,
      price: data.price,
      barcode: data.barcode,
      color: data.color,
      category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
      group: data.groupId ? { connect: { id: data.groupId } } : undefined,
      tax: data.taxId ? { connect: { id: data.taxId } } : undefined,
      kitchenStation: data.kitchenStationId ? { connect: { id: data.kitchenStationId } } : undefined
    }
  });
}

async function ensureExtraMenuItems(taxId: string, grillStationId: string, barStationId: string) {
  const appetizers = await ensureMenuCategory({ name: "Appetizers", sortOrder: 1, color: "#ef4444" });
  const tacos = await ensureMenuCategory({ name: "Tacos", sortOrder: 2, color: "#f59e0b" });
  const burritos = await ensureMenuCategory({ name: "Burritos", sortOrder: 3, color: "#8b5cf6" });
  const quesadillas = await ensureMenuCategory({ name: "Quesadillas", sortOrder: 4, color: "#f97316" });
  const enchiladas = await ensureMenuCategory({ name: "Enchiladas", sortOrder: 5, color: "#34d399" });
  const fajitas = await ensureMenuCategory({ name: "Fajitas", sortOrder: 6, color: "#22c55e" });
  const seafood = await ensureMenuCategory({ name: "Seafood", sortOrder: 7, color: "#38bdf8" });
  const kids = await ensureMenuCategory({ name: "Kids Menu", sortOrder: 8, color: "#60a5fa" });
  const beverages = await ensureMenuCategory({ name: "Beverages", sortOrder: 9, color: "#fb7185" });
  const desserts = await ensureMenuCategory({ name: "Desserts", sortOrder: 10, color: "#f472b6" });
  const sides = await ensureMenuCategory({ name: "Sides", sortOrder: 11, color: "#a3e635" });

  const appGroup = await ensureMenuGroup({ name: "Starters", categoryId: appetizers.id, sortOrder: 1 });
  const dipGroup = await ensureMenuGroup({ name: "Dips", categoryId: appetizers.id, sortOrder: 2 });
  const tacoGroup = await ensureMenuGroup({ name: "Street Tacos", categoryId: tacos.id, sortOrder: 1 });
  const premiumTacoGroup = await ensureMenuGroup({ name: "Premium Tacos", categoryId: tacos.id, sortOrder: 2 });
  const burritoGroup = await ensureMenuGroup({ name: "House Burritos", categoryId: burritos.id, sortOrder: 1 });
  const smotheredBurritoGroup = await ensureMenuGroup({ name: "Smothered Burritos", categoryId: burritos.id, sortOrder: 2 });
  const quesadillaGroup = await ensureMenuGroup({ name: "Grilled Quesadillas", categoryId: quesadillas.id, sortOrder: 1 });
  const comboGroup = await ensureMenuGroup({ name: "Combo Plates", categoryId: quesadillas.id, sortOrder: 2 });
  const enchiladaGroup = await ensureMenuGroup({ name: "Traditional Enchiladas", categoryId: enchiladas.id, sortOrder: 1 });
  const fajitaGroup = await ensureMenuGroup({ name: "Sizzling Fajitas", categoryId: fajitas.id, sortOrder: 1 });
  const fajitaComboGroup = await ensureMenuGroup({ name: "Fajita Combos", categoryId: fajitas.id, sortOrder: 2 });
  const seafoodGroup = await ensureMenuGroup({ name: "Seafood Specials", categoryId: seafood.id, sortOrder: 1 });
  const kidsGroup = await ensureMenuGroup({ name: "Kids Plates", categoryId: kids.id, sortOrder: 1 });
  const beverageGroup = await ensureMenuGroup({ name: "Drinks", categoryId: beverages.id, sortOrder: 1 });
  const margaritaGroup = await ensureMenuGroup({ name: "Margaritas", categoryId: beverages.id, sortOrder: 2 });
  const dessertGroup = await ensureMenuGroup({ name: "Sweet Finish", categoryId: desserts.id, sortOrder: 1 });
  const sideGroup = await ensureMenuGroup({ name: "Sides", categoryId: sides.id, sortOrder: 1 });

  await ensureMenuItem({
    name: "Cheese Dip",
    price: new Prisma.Decimal(4.99),
    categoryId: appetizers.id,
    groupId: appGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Bean Dip",
    price: new Prisma.Decimal(4.75),
    categoryId: appetizers.id,
    groupId: dipGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Guacamole Dip",
    price: new Prisma.Decimal(6.5),
    categoryId: appetizers.id,
    groupId: dipGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Guacamole Dip",
    price: new Prisma.Decimal(6.5),
    categoryId: appetizers.id,
    groupId: appGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Queso Fundido",
    price: new Prisma.Decimal(8.5),
    categoryId: appetizers.id,
    groupId: appGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Nachos Supreme",
    price: new Prisma.Decimal(11.95),
    categoryId: appetizers.id,
    groupId: appGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Carne Asada Taco",
    price: new Prisma.Decimal(3.75),
    categoryId: tacos.id,
    groupId: tacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Al Pastor Taco",
    price: new Prisma.Decimal(3.75),
    categoryId: tacos.id,
    groupId: tacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Chicken Taco",
    price: new Prisma.Decimal(3.5),
    categoryId: tacos.id,
    groupId: tacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Fish Taco",
    price: new Prisma.Decimal(4.25),
    categoryId: tacos.id,
    groupId: tacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Shrimp Taco",
    price: new Prisma.Decimal(4.75),
    categoryId: tacos.id,
    groupId: premiumTacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Birria Taco",
    price: new Prisma.Decimal(4.95),
    categoryId: tacos.id,
    groupId: premiumTacoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Beef Burrito",
    price: new Prisma.Decimal(10.99),
    categoryId: burritos.id,
    groupId: burritoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Chicken Burrito",
    price: new Prisma.Decimal(10.49),
    categoryId: burritos.id,
    groupId: burritoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Smothered Beef Burrito",
    price: new Prisma.Decimal(12.75),
    categoryId: burritos.id,
    groupId: smotheredBurritoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Smothered Chicken Burrito",
    price: new Prisma.Decimal(12.25),
    categoryId: burritos.id,
    groupId: smotheredBurritoGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Cheese Quesadilla",
    price: new Prisma.Decimal(7.99),
    categoryId: quesadillas.id,
    groupId: quesadillaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Steak Quesadilla",
    price: new Prisma.Decimal(11.99),
    categoryId: quesadillas.id,
    groupId: quesadillaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Quesadilla Combo",
    price: new Prisma.Decimal(12.99),
    categoryId: quesadillas.id,
    groupId: comboGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Chicken Enchiladas",
    price: new Prisma.Decimal(12.99),
    categoryId: enchiladas.id,
    groupId: enchiladaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Cheese Enchiladas",
    price: new Prisma.Decimal(11.49),
    categoryId: enchiladas.id,
    groupId: enchiladaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Chicken Fajitas",
    price: new Prisma.Decimal(15.99),
    categoryId: fajitas.id,
    groupId: fajitaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Steak Fajitas",
    price: new Prisma.Decimal(17.49),
    categoryId: fajitas.id,
    groupId: fajitaGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Fajita Combo",
    price: new Prisma.Decimal(18.25),
    categoryId: fajitas.id,
    groupId: fajitaComboGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Coconut Shrimp",
    price: new Prisma.Decimal(14.25),
    categoryId: seafood.id,
    groupId: seafoodGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Shrimp Cocktail",
    price: new Prisma.Decimal(13.5),
    categoryId: seafood.id,
    groupId: seafoodGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Kids Taco Plate",
    price: new Prisma.Decimal(6.5),
    categoryId: kids.id,
    groupId: kidsGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Kids Chicken Tenders",
    price: new Prisma.Decimal(6.99),
    categoryId: kids.id,
    groupId: kidsGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Fountain Soda",
    price: new Prisma.Decimal(2.75),
    categoryId: beverages.id,
    groupId: beverageGroup.id,
    taxId,
    kitchenStationId: barStationId,
    barcode: "7894561239874"
  });
  await ensureMenuItem({
    name: "Iced Tea",
    price: new Prisma.Decimal(2.5),
    categoryId: beverages.id,
    groupId: beverageGroup.id,
    taxId,
    kitchenStationId: barStationId
  });
  await ensureMenuItem({
    name: "Horchata",
    price: new Prisma.Decimal(3.25),
    categoryId: beverages.id,
    groupId: beverageGroup.id,
    taxId,
    kitchenStationId: barStationId
  });
  await ensureMenuItem({
    name: "House Margarita",
    price: new Prisma.Decimal(8.99),
    categoryId: beverages.id,
    groupId: beverageGroup.id,
    taxId,
    kitchenStationId: barStationId
  });
  await ensureMenuItem({
    name: "Classic Margarita",
    price: new Prisma.Decimal(8.5),
    categoryId: beverages.id,
    groupId: margaritaGroup.id,
    taxId,
    kitchenStationId: barStationId
  });
  await ensureMenuItem({
    name: "Strawberry Margarita",
    price: new Prisma.Decimal(9.25),
    categoryId: beverages.id,
    groupId: margaritaGroup.id,
    taxId,
    kitchenStationId: barStationId
  });

  await ensureMenuItem({
    name: "Churros",
    price: new Prisma.Decimal(5.95),
    categoryId: desserts.id,
    groupId: dessertGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Flan",
    price: new Prisma.Decimal(5.5),
    categoryId: desserts.id,
    groupId: dessertGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureMenuItem({
    name: "Spanish Rice",
    price: new Prisma.Decimal(2.25),
    categoryId: sides.id,
    groupId: sideGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Refried Beans",
    price: new Prisma.Decimal(2.25),
    categoryId: sides.id,
    groupId: sideGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });
  await ensureMenuItem({
    name: "Chips & Salsa",
    price: new Prisma.Decimal(3.5),
    categoryId: sides.id,
    groupId: sideGroup.id,
    taxId,
    kitchenStationId: grillStationId
  });

  await ensureCategoryGroupItems({
    category: { name: "Lunch Specials", sortOrder: 12, color: "#fbbf24" },
    group: { name: "Lunch Specials", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Lunch Combo #1", price: 8.99, color: "#fde68a" },
      { name: "Lunch Combo #2", price: 9.49, color: "#fde68a" },
      { name: "Lunch Burrito Plate", price: 9.75, color: "#fde68a" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Nachos", sortOrder: 13, color: "#f97316" },
    group: { name: "Nachos", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Nachos", price: 7.5, color: "#fed7aa" },
      { name: "Nachos Supreme", price: 11.95, color: "#fed7aa" },
      { name: "Nachos with Steak", price: 12.75, color: "#fed7aa" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Veggie n Salads", sortOrder: 14, color: "#34d399" },
    group: { name: "Salads", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "House Salad", price: 7.25, color: "#bbf7d0" },
      { name: "Taco Salad", price: 9.75, color: "#bbf7d0" },
      { name: "Veggie Fajita Salad", price: 11.5, color: "#bbf7d0" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "House Specials", sortOrder: 15, color: "#f472b6" },
    group: { name: "House Specials", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Casa Amigos Sampler", price: 18.5, color: "#fecdd3" },
      { name: "Casa Amigos Platter", price: 16.75, color: "#fecdd3" },
      { name: "Steak Bacon n Fries", price: 17.25, color: "#fecdd3" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Chicken", sortOrder: 16, color: "#f59e0b" },
    group: { name: "Chicken", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Pollo Asado", price: 13.95, color: "#fde68a" },
      { name: "Chicken Enchiladas Special", price: 12.99, color: "#fde68a" },
      { name: "Chicken Chimichanga", price: 13.5, color: "#fde68a" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Beer", sortOrder: 17, color: "#38bdf8" },
    group: { name: "Beer", sortOrder: 1 },
    taxId,
    stationId: barStationId,
    items: [
      { name: "Domestic Draft", price: 4.5, color: "#bae6fd" },
      { name: "Imported Draft", price: 5.5, color: "#bae6fd" },
      { name: "Bucket of Beer", price: 18.0, color: "#bae6fd" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "A La Carte", sortOrder: 18, color: "#a3e635" },
    group: { name: "A La Carte", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Taco A La Carte", price: 3.25, color: "#d9f99d" },
      { name: "Enchilada A La Carte", price: 4.25, color: "#d9f99d" },
      { name: "Burrito A La Carte", price: 4.95, color: "#d9f99d" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Margaras n Drink", sortOrder: 19, color: "#fb7185" },
    group: { name: "Margaras n Drink", sortOrder: 1 },
    taxId,
    stationId: barStationId,
    items: [
      { name: "Margarita on the Rocks", price: 9.25, color: "#fda4af" },
      { name: "Frozen Margarita", price: 9.25, color: "#fda4af" },
      { name: "Paloma", price: 8.75, color: "#fda4af" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Special Dinners", sortOrder: 20, color: "#c4b5fd" },
    group: { name: "Special Dinners", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Combo Dinner #1", price: 14.95, color: "#ddd6fe" },
      { name: "Combo Dinner #2", price: 15.75, color: "#ddd6fe" },
      { name: "Combo Dinner #3", price: 16.5, color: "#ddd6fe" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "2x1 Margaritas", sortOrder: 21, color: "#f97316" },
    group: { name: "2x1 Margaritas", sortOrder: 1 },
    taxId,
    stationId: barStationId,
    items: [
      { name: "2x1 Classic Margarita", price: 12.0, color: "#fdba74" },
      { name: "2x1 Strawberry Margarita", price: 12.5, color: "#fdba74" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Drink Specials", sortOrder: 22, color: "#38bdf8" },
    group: { name: "Drink Specials", sortOrder: 1 },
    taxId,
    stationId: barStationId,
    items: [
      { name: "Happy Hour Draft", price: 3.5, color: "#bae6fd" },
      { name: "House Sangria", price: 7.5, color: "#bae6fd" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Dayli Special", sortOrder: 23, color: "#22c55e" },
    group: { name: "Dayli Special", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Daily Special Plate", price: 12.5, color: "#bbf7d0" },
      { name: "Daily Special Tacos", price: 11.0, color: "#bbf7d0" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Wines", sortOrder: 24, color: "#cbd5f5" },
    group: { name: "Wines", sortOrder: 1 },
    taxId,
    stationId: barStationId,
    items: [
      { name: "House Red", price: 7.25, color: "#e2e8f0" },
      { name: "House White", price: 7.25, color: "#e2e8f0" },
      { name: "Sangria Glass", price: 7.75, color: "#e2e8f0" }
    ]
  });

  await ensureCategoryGroupItems({
    category: { name: "Side Orders #1", sortOrder: 25, color: "#94a3b8" },
    group: { name: "Side Orders #1", sortOrder: 1 },
    taxId,
    stationId: grillStationId,
    items: [
      { name: "Extra Chips", price: 1.25, color: "#e2e8f0" },
      { name: "Extra Salsa", price: 1.25, color: "#e2e8f0" },
      { name: "Extra Sour Cream", price: 1.25, color: "#e2e8f0" }
    ]
  });
}

async function ensureOpenOrders() {
  const openCount = await prisma.posOrder.count({ where: { status: "OPEN" } });
  if (openCount >= 5) return;

  const users = await prisma.user.findMany({ where: { active: true } });
  const tables = await prisma.diningTable.findMany();
  const menuItems = await prisma.menuItem.findMany({ take: 30 });
  if (users.length === 0 || menuItems.length === 0) return;

  const pickItem = (offset: number) => menuItems[offset % menuItems.length];
  let created = 0;
  for (let i = 0; i < users.length && created < 5; i++) {
    const user = users[i];
    const table = tables[i % Math.max(1, tables.length)]?.id;
    const order = await prisma.posOrder.create({
      data: {
        tableId: table ?? null,
        serverId: user.id,
        status: "OPEN",
        orderType: i % 2 === 0 ? "DINE_IN" : "TAKE_OUT",
        numberOfGuests: i % 2 === 0 ? 2 : 1
      }
    });
    const first = pickItem(i * 2);
    const second = pickItem(i * 2 + 1);
    await prisma.posOrderItem.createMany({
      data: [
        { orderId: order.id, menuItemId: first.id, quantity: 1, price: new Prisma.Decimal(first.price), name: first.name },
        { orderId: order.id, menuItemId: second.id, quantity: 1, price: new Prisma.Decimal(second.price), name: second.name }
      ]
    });
    await recalcOrder(order.id);
    created += 1;
  }
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function ensureCloudControlPlaneFixtures() {
  const tenantName = String(process.env.CLOUD_TENANT_NAME || "Default Tenant").trim() || "Default Tenant";
  const tenantSlug = String(process.env.CLOUD_TENANT_SLUG || "default-tenant").trim() || "default-tenant";
  const storeName = String(process.env.CLOUD_STORE_NAME || "Primary Store").trim() || "Primary Store";
  const storeCode = String(process.env.CLOUD_STORE_CODE || "PRIMARY-STORE").trim() || "PRIMARY-STORE";
  const storeTimezone = String(process.env.CLOUD_STORE_TIMEZONE || "America/Chicago").trim() || "America/Chicago";
  const edgeBaseUrl = String(process.env.CLOUD_EDGE_BASE_URL || "").trim();
  const bootstrapToken = String(process.env.CLOUD_BOOTSTRAP_TOKEN || "").trim();
  const bootstrapLabel = String(process.env.CLOUD_BOOTSTRAP_LABEL || "Seed bootstrap token").trim() || "Seed bootstrap token";

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, active: true },
    create: { slug: tenantSlug, name: tenantName, active: true }
  });

  const store = await prisma.store.upsert({
    where: { code: storeCode },
    update: {
      tenantId: tenant.id,
      name: storeName,
      timezone: storeTimezone,
      status: "ACTIVE",
      edgeBaseUrl: edgeBaseUrl || null
    },
    create: {
      tenantId: tenant.id,
      name: storeName,
      code: storeCode,
      timezone: storeTimezone,
      status: "ACTIVE",
      edgeBaseUrl: edgeBaseUrl || null
    }
  });

  if (bootstrapToken) {
    const tokenHash = sha256(bootstrapToken);
    const existing = await prisma.storeNodeBootstrapToken.findFirst({
      where: {
        storeId: store.id,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { id: true }
    });

    if (!existing) {
      await prisma.storeNodeBootstrapToken.create({
        data: {
          storeId: store.id,
          label: bootstrapLabel,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
    }
  }

  console.log(`Cloud control-plane seed ready: tenant=${tenant.slug}, store=${store.code}`);
  return { tenant, store };
}

async function ensureCloudOwnerAccount() {
  const email = String(process.env.CLOUD_OWNER_EMAIL || "owner@websyspos.local")
    .trim()
    .toLowerCase();
  const password = String(process.env.CLOUD_OWNER_PASSWORD || "WebsysOwner123!");
  const displayName = String(process.env.CLOUD_OWNER_NAME || "Platform Owner").trim() || "Platform Owner";
  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await prisma.cloudAccount.upsert({
    where: { email },
    update: {
      displayName,
      passwordHash,
      accountType: "OWNER",
      status: "ACTIVE",
      resellerId: null,
      tenantId: null
    },
    create: {
      email,
      passwordHash,
      displayName,
      accountType: "OWNER",
      status: "ACTIVE"
    }
  });

  console.log(`Cloud owner account ready: ${owner.email}`);
}

async function main() {
  await ensureRolesAndUsers();
  await ensureCloudControlPlaneFixtures();
  await ensureCloudOwnerAccount();

  await prisma.appSetting.upsert({
    where: { key: "store" },
    update: {
      value: {
        name: "Casa Amigos Mexican Restaurant 3",
        address: "508 Grand Ave",
        cityStateZip: "Schofield, WI 54476",
        phone: "9204616022",
        stationName: "16"
      }
    },
    create: {
      key: "store",
      value: {
        name: "Casa Amigos Mexican Restaurant 3",
        address: "508 Grand Ave",
        cityStateZip: "Schofield, WI 54476",
        phone: "9204616022",
        stationName: "16"
      }
    }
  });

  await prisma.integrationProvider.upsert({
    where: { code: "DOORDASH" },
    update: {},
    create: {
      code: "DOORDASH",
      name: "DoorDash",
      enabled: false,
      settings: {}
    }
  });

  const existingCategories = await prisma.menuCategory.count();
  if (existingCategories > 0) {
    console.log("Menu data already present. Seeding stations/recipes and extra items.");
    const grillStation = await ensureKitchenStation("Grill");
    const barStation = await ensureKitchenStation("Bar");
    const salesTax = await ensureSalesTax();

    const bun = await prisma.inventoryItem.upsert({
      where: { sku: "BUN-001" },
      update: {},
      create: { sku: "BUN-001", name: "Brioche Bun", quantity: new Prisma.Decimal(120) }
    });
    const patty = await prisma.inventoryItem.upsert({
      where: { sku: "BEEF-001" },
      update: {},
      create: { sku: "BEEF-001", name: "Beef Patty", quantity: new Prisma.Decimal(85) }
    });
    const lettuce = await prisma.inventoryItem.upsert({
      where: { sku: "VEG-001" },
      update: {},
      create: { sku: "VEG-001", name: "Lettuce", quantity: new Prisma.Decimal(50) }
    });
    const sodaSyrup = await prisma.inventoryItem.upsert({
      where: { sku: "SODA-001" },
      update: {},
      create: { sku: "SODA-001", name: "Cola Syrup", quantity: new Prisma.Decimal(15) }
    });

    const classicBurger = await prisma.menuItem.findFirst({ where: { name: "Classic Burger" } });
    const veggieBurger = await prisma.menuItem.findFirst({ where: { name: "Garden Veggie Burger" } });
    const soda = await prisma.menuItem.findFirst({ where: { name: "Cola" } });

    if (classicBurger) {
      await prisma.menuItem.update({
        where: { id: classicBurger.id },
        data: { kitchenStationId: grillStation.id }
      });
      await prisma.menuItemIngredient.createMany({
        data: [
          { menuItemId: classicBurger.id, inventoryItemId: bun.id, quantity: new Prisma.Decimal(1), unit: "each" },
          { menuItemId: classicBurger.id, inventoryItemId: patty.id, quantity: new Prisma.Decimal(1), unit: "each" },
          { menuItemId: classicBurger.id, inventoryItemId: lettuce.id, quantity: new Prisma.Decimal(0.1), unit: "lb" }
        ],
        skipDuplicates: true
      });
    }

    if (veggieBurger) {
      await prisma.menuItem.update({
        where: { id: veggieBurger.id },
        data: { kitchenStationId: grillStation.id }
      });
      await prisma.menuItemIngredient.createMany({
        data: [
          { menuItemId: veggieBurger.id, inventoryItemId: bun.id, quantity: new Prisma.Decimal(1), unit: "each" },
          { menuItemId: veggieBurger.id, inventoryItemId: lettuce.id, quantity: new Prisma.Decimal(0.1), unit: "lb" }
        ],
        skipDuplicates: true
      });
    }

    if (soda) {
      await prisma.menuItem.update({
        where: { id: soda.id },
        data: { kitchenStationId: barStation.id }
      });
      await prisma.menuItemIngredient.createMany({
        data: [
          { menuItemId: soda.id, inventoryItemId: sodaSyrup.id, quantity: new Prisma.Decimal(0.02), unit: "gal" }
        ],
        skipDuplicates: true
      });
    }

    await ensureExtraMenuItems(salesTax.id, grillStation.id, barStation.id);
    await ensureOpenOrders();
    return;
  }

  const salesTax = await ensureSalesTax();

  const happyHour = await prisma.discount.create({
    data: { name: "Happy Hour", type: "PERCENT", value: new Prisma.Decimal(10) }
  });

  const burgers = await prisma.menuCategory.create({ data: { name: "Burgers", sortOrder: 1 } });
  const drinks = await prisma.menuCategory.create({ data: { name: "Drinks", sortOrder: 2 } });
  const sides = await prisma.menuCategory.create({ data: { name: "Sides", sortOrder: 3 } });
  const desserts = await prisma.menuCategory.create({ data: { name: "Desserts", sortOrder: 4 } });

  const grillStation = await ensureKitchenStation("Grill");
  const barStation = await ensureKitchenStation("Bar");

  const burgerGroup = await prisma.menuGroup.create({
    data: { name: "Signature Burgers", categoryId: burgers.id, sortOrder: 1 }
  });
  const drinkGroup = await prisma.menuGroup.create({
    data: { name: "Fountain", categoryId: drinks.id, sortOrder: 1 }
  });

  const classicBurger = await prisma.menuItem.create({
    data: {
      name: "Classic Burger",
      price: new Prisma.Decimal(10.95),
      category: { connect: { id: burgers.id } },
      group: { connect: { id: burgerGroup.id } },
      tax: { connect: { id: salesTax.id } },
      kitchenStation: { connect: { id: grillStation.id } }
    }
  });
  const veggieBurger = await prisma.menuItem.create({
    data: {
      name: "Garden Veggie Burger",
      price: new Prisma.Decimal(9.75),
      category: { connect: { id: burgers.id } },
      group: { connect: { id: burgerGroup.id } },
      tax: { connect: { id: salesTax.id } },
      kitchenStation: { connect: { id: grillStation.id } }
    }
  });
  const fries = await prisma.menuItem.create({
    data: {
      name: "Seasoned Fries",
      price: new Prisma.Decimal(3.5),
      category: { connect: { id: sides.id } },
      tax: { connect: { id: salesTax.id } },
      kitchenStation: { connect: { id: grillStation.id } }
    }
  });
  const soda = await prisma.menuItem.create({
    data: {
      name: "Cola",
      price: new Prisma.Decimal(2.5),
      category: { connect: { id: drinks.id } },
      group: { connect: { id: drinkGroup.id } },
      tax: { connect: { id: salesTax.id } },
      kitchenStation: { connect: { id: barStation.id } },
      barcode: "1234567890123"
    }
  });
  const brownie = await prisma.menuItem.create({
    data: {
      name: "Warm Brownie",
      price: new Prisma.Decimal(5.25),
      category: { connect: { id: desserts.id } },
      tax: { connect: { id: salesTax.id } },
      kitchenStation: { connect: { id: grillStation.id } }
    }
  });

  const cheeseGroup = await prisma.menuModifierGroup.create({
    data: { name: "Cheese Choice", minRequired: 1, maxAllowed: 1, sortOrder: 1 }
  });
  const addOnGroup = await prisma.menuModifierGroup.create({
    data: { name: "Add-ons", minRequired: 0, maxAllowed: 3, sortOrder: 2 }
  });

  const cheddar = await prisma.menuModifier.create({
    data: { name: "Cheddar", price: new Prisma.Decimal(0.5), groupId: cheeseGroup.id }
  });
  const swiss = await prisma.menuModifier.create({
    data: { name: "Swiss", price: new Prisma.Decimal(0.5), groupId: cheeseGroup.id }
  });
  const bacon = await prisma.menuModifier.create({
    data: { name: "Applewood Bacon", price: new Prisma.Decimal(1.25), groupId: addOnGroup.id }
  });
  const avocado = await prisma.menuModifier.create({
    data: { name: "Avocado", price: new Prisma.Decimal(1.5), groupId: addOnGroup.id }
  });

  await prisma.menuItemModifierGroup.createMany({
    data: [
      { menuItemId: classicBurger.id, groupId: cheeseGroup.id, minRequired: 1, maxAllowed: 1, sortOrder: 1 },
      { menuItemId: classicBurger.id, groupId: addOnGroup.id, maxAllowed: 3, sortOrder: 2 },
      { menuItemId: veggieBurger.id, groupId: addOnGroup.id, maxAllowed: 2, sortOrder: 1 }
    ]
  });

  await prisma.menuItemAvailability.createMany({
    data: [
      { menuItemId: soda.id, dayOfWeek: 1, startTime: "11:00", endTime: "23:00" },
      { menuItemId: soda.id, dayOfWeek: 2, startTime: "11:00", endTime: "23:00" },
      { menuItemId: soda.id, dayOfWeek: 3, startTime: "11:00", endTime: "23:00" },
      { menuItemId: soda.id, dayOfWeek: 4, startTime: "11:00", endTime: "23:00" },
      { menuItemId: soda.id, dayOfWeek: 5, startTime: "11:00", endTime: "23:00" }
    ]
  });

  const mainArea = await prisma.tableArea.create({ data: { name: "Main Dining", sortOrder: 1 } });
  const patioArea = await prisma.tableArea.create({ data: { name: "Patio", sortOrder: 2 } });
  const barArea = await prisma.tableArea.create({ data: { name: "Bar", sortOrder: 3 } });

  const table1 = await prisma.diningTable.create({
    data: { name: "T1", capacity: 4, areaId: mainArea.id, status: "AVAILABLE", posX: 60, posY: 80 }
  });
  const table2 = await prisma.diningTable.create({
    data: { name: "T2", capacity: 2, areaId: mainArea.id, status: "AVAILABLE", posX: 180, posY: 120 }
  });
  const patio1 = await prisma.diningTable.create({
    data: { name: "P1", capacity: 4, areaId: patioArea.id, status: "AVAILABLE", posX: 320, posY: 90 }
  });
  const bar1 = await prisma.diningTable.create({
    data: { name: "B1", capacity: 2, areaId: barArea.id, status: "AVAILABLE", posX: 480, posY: 60 }
  });

  const bun = await prisma.inventoryItem.create({
    data: { sku: "BUN-001", name: "Brioche Bun", quantity: new Prisma.Decimal(120) }
  });
  const patty = await prisma.inventoryItem.create({
    data: { sku: "BEEF-001", name: "Beef Patty", quantity: new Prisma.Decimal(85) }
  });
  const lettuce = await prisma.inventoryItem.create({
    data: { sku: "VEG-001", name: "Lettuce", quantity: new Prisma.Decimal(50) }
  });
  const sodaSyrup = await prisma.inventoryItem.create({
    data: { sku: "SODA-001", name: "Cola Syrup", quantity: new Prisma.Decimal(15) }
  });

  const vendor = await prisma.vendor.create({
    data: { name: "Main Food Distributor", phone: "555-0119", email: "orders@fooddistributor.com" }
  });

  await prisma.vendorItem.createMany({
    data: [
      { vendorId: vendor.id, inventoryItemId: bun.id, vendorSku: "FD-BUN", cost: new Prisma.Decimal(0.35) },
      { vendorId: vendor.id, inventoryItemId: patty.id, vendorSku: "FD-PATTY", cost: new Prisma.Decimal(1.05) },
      { vendorId: vendor.id, inventoryItemId: sodaSyrup.id, vendorSku: "FD-COLA", cost: new Prisma.Decimal(8.5) }
    ]
  });

  const po = await prisma.purchaseOrder.create({
    data: { vendorId: vendor.id }
  });
  await prisma.purchaseOrderItem.createMany({
    data: [
      { purchaseOrderId: po.id, inventoryItemId: bun.id, quantity: new Prisma.Decimal(100), unitCost: new Prisma.Decimal(0.32) },
      { purchaseOrderId: po.id, inventoryItemId: patty.id, quantity: new Prisma.Decimal(60), unitCost: new Prisma.Decimal(0.98) }
    ]
  });

  await prisma.menuItemIngredient.createMany({
    data: [
      { menuItemId: classicBurger.id, inventoryItemId: bun.id, quantity: new Prisma.Decimal(1), unit: "each" },
      { menuItemId: classicBurger.id, inventoryItemId: patty.id, quantity: new Prisma.Decimal(1), unit: "each" },
      { menuItemId: classicBurger.id, inventoryItemId: lettuce.id, quantity: new Prisma.Decimal(0.1), unit: "lb" },
      { menuItemId: veggieBurger.id, inventoryItemId: bun.id, quantity: new Prisma.Decimal(1), unit: "each" },
      { menuItemId: veggieBurger.id, inventoryItemId: lettuce.id, quantity: new Prisma.Decimal(0.1), unit: "lb" },
      { menuItemId: soda.id, inventoryItemId: sodaSyrup.id, quantity: new Prisma.Decimal(0.02), unit: "gal" }
    ]
  });

  await prisma.cashDrawer.create({
    data: { name: "Front Drawer", status: "CLOSED" }
  });

  const order = await prisma.posOrder.create({
    data: {
      tableId: table1.id,
      status: "OPEN",
      orderType: "DINE_IN",
      numberOfGuests: 2,
      serviceCharge: new Prisma.Decimal(0),
      deliveryCharge: new Prisma.Decimal(0),
      createdAtLegacy: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10)
    }
  });

  const orderItem = await prisma.posOrderItem.create({
    data: {
      orderId: order.id,
      menuItemId: classicBurger.id,
      quantity: 2,
      price: new Prisma.Decimal(10.95),
      name: classicBurger.name
    }
  });

  await prisma.orderItemModifier.createMany({
    data: [
      { orderItemId: orderItem.id, modifierId: cheddar.id, quantity: 1, price: cheddar.price },
      { orderItemId: orderItem.id, modifierId: bacon.id, quantity: 1, price: bacon.price }
    ]
  });

  await prisma.posOrderItem.create({
    data: {
      orderId: order.id,
      menuItemId: fries.id,
      quantity: 1,
      price: fries.price,
      name: fries.name
    }
  });

  await prisma.orderDiscount.create({
    data: {
      orderId: order.id,
      discountId: happyHour.id
    }
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      method: "CASH",
      amount: new Prisma.Decimal(30)
    }
  });

  await recalcOrder(order.id);

  const openOrder = await prisma.posOrder.create({
    data: {
      tableId: table2.id,
      status: "OPEN",
      orderType: "DINE_IN",
      numberOfGuests: 1,
      createdAtLegacy: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  });

  await prisma.posOrderItem.create({
    data: {
      orderId: openOrder.id,
      menuItemId: veggieBurger.id,
      quantity: 1,
      price: veggieBurger.price,
      name: veggieBurger.name
    }
  });
  await prisma.posOrderItem.create({
    data: {
      orderId: openOrder.id,
      menuItemId: soda.id,
      quantity: 1,
      price: soda.price,
      name: soda.name
    }
  });

  await recalcOrder(openOrder.id);

  await ensureExtraMenuItems(salesTax.id, grillStation.id, barStation.id);
  await ensureOpenOrders();

  console.log("Seed completed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
