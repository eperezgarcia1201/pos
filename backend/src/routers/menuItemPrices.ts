import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const priceSchema = z.object({
  menuItemId: z.string(),
  priceType: z.enum(["DEFAULT", "DINE_IN", "TAKEOUT", "DELIVERY", "BAR"]),
  price: z.number().nonnegative()
});

export async function registerMenuItemPriceRoutes(app: FastifyInstance) {
  app.get("/menu-item-prices", async () => {
    return prisma.menuItemPrice.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.get("/menu/items/:id/prices", async (request) => {
    const menuItemId = String((request.params as { id: string }).id);
    return prisma.menuItemPrice.findMany({
      where: { menuItemId },
      orderBy: { priceType: "asc" }
    });
  });

  app.post("/menu/items/:id/prices", async (request, reply) => {
    const menuItemId = String((request.params as { id: string }).id);
    const body = priceSchema.parse({ ...(request.body as object), menuItemId });
    const entry = await prisma.menuItemPrice.upsert({
      where: { menuItemId_priceType: { menuItemId, priceType: body.priceType } },
      update: { price: body.price },
      create: {
        menuItemId,
        priceType: body.priceType,
        price: body.price
      }
    });
    return reply.code(201).send(entry);
  });

  app.delete("/menu/items/:id/prices/:priceType", async (request, reply) => {
    const menuItemId = String((request.params as { id: string }).id);
    const priceType = String((request.params as { priceType: string }).priceType);
    try {
      await prisma.menuItemPrice.delete({
        where: { menuItemId_priceType: { menuItemId, priceType } }
      });
      return { ok: true };
    } catch {
      return reply.notFound("Price not found");
    }
  });
}
