import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../services/prisma.js";

const backupDir = path.resolve(process.cwd(), "backup");

function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get("/maintenance/data-source", async () => {
    const databaseUrl = process.env.DATABASE_URL || "";
    const url = new URL(databaseUrl);
    return {
      provider: "mysql",
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      database: url.pathname.replace("/", ""),
      user: url.username
    };
  });

  app.post("/maintenance/backup", async () => {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${timestamp}.json`;
    const target = path.join(backupDir, filename);

    const payload = {
      menuCategories: await prisma.menuCategory.findMany(),
      menuGroups: await prisma.menuGroup.findMany(),
      menuItems: await prisma.menuItem.findMany(),
      menuItemPrices: await prisma.menuItemPrice.findMany(),
      modifiers: await prisma.menuModifier.findMany(),
      modifierGroups: await prisma.menuModifierGroup.findMany(),
      tables: await prisma.diningTable.findMany(),
      tableAreas: await prisma.tableArea.findMany(),
      taxes: await prisma.tax.findMany(),
      discounts: await prisma.discount.findMany(),
      inventory: await prisma.inventoryItem.findMany(),
      vendors: await prisma.vendor.findMany(),
      purchaseOrders: await prisma.purchaseOrder.findMany(),
      users: await prisma.user.findMany(),
      roles: await prisma.role.findMany(),
      houseAccounts: await prisma.houseAccount.findMany(),
      stations: await prisma.station.findMany(),
      settings: await prisma.appSetting.findMany()
    };

    fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
    await prisma.appSetting.upsert({
      where: { key: "last_backup" },
      update: { value: { file: target, at: new Date().toISOString() } },
      create: { key: "last_backup", value: { file: target, at: new Date().toISOString() } }
    });
    return { ok: true, file: target };
  });

  app.post("/maintenance/compact", async () => {
    const tables = (await prisma.$queryRaw<
      Array<{ table_name: string }>
    >`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()` ) || [];

    for (const row of tables) {
      const name = row.table_name;
      if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
      await prisma.$executeRawUnsafe(`OPTIMIZE TABLE \`${name}\``);
    }
    return { ok: true, tables: tables.length };
  });
}
