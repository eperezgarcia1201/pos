import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const inventorySchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().optional(),
  quantity: z.number().optional(),
  reorderLevel: z.number().optional()
});

const adjustSchema = z.object({
  delta: z.number(),
  reason: z.string().optional()
});

const receiveSchema = z.object({
  quantity: z.number().positive(),
  reason: z.string().optional()
});

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/inventory", async () => {
    return prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/inventory", async (request, reply) => {
    const body = inventorySchema.parse(request.body);
    const item = await prisma.inventoryItem.create({ data: body });
    return reply.code(201).send(item);
  });

  app.patch("/inventory/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = inventorySchema.partial().parse(request.body);
    try {
      const item = await prisma.inventoryItem.update({ where: { id }, data: body });
      return item;
    } catch {
      return reply.notFound("Inventory item not found");
    }
  });

  app.post("/inventory/:id/adjust", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = adjustSchema.parse(request.body);
    try {
      const item = await prisma.inventoryItem.update({
        where: { id },
        data: {
          quantity: { increment: body.delta }
        }
      });

      await prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: id,
          delta: body.delta,
          reason: body.reason
        }
      });

      return item;
    } catch {
      return reply.notFound("Inventory item not found");
    }
  });

  app.post("/inventory/:id/receive", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = receiveSchema.parse(request.body);
    try {
      const item = await prisma.inventoryItem.update({
        where: { id },
        data: {
          quantity: { increment: body.quantity }
        }
      });

      await prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: id,
          delta: body.quantity,
          reason: body.reason || "Receiving"
        }
      });

      return item;
    } catch {
      return reply.notFound("Inventory item not found");
    }
  });

  app.get("/inventory/adjustments", async (request) => {
    const query = request.query as { itemId?: string; limit?: string };
    const limit = query.limit ? Number(query.limit) : 50;
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: query.itemId ? { inventoryItemId: query.itemId } : undefined,
      include: { inventoryItem: true },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? Math.min(limit, 200) : 50
    });
    return adjustments;
  });

  app.delete("/inventory/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const [ingredientCount, vendorItemCount, poItemCount] = await Promise.all([
      prisma.menuItemIngredient.count({ where: { inventoryItemId: id } }),
      prisma.vendorItem.count({ where: { inventoryItemId: id } }),
      prisma.purchaseOrderItem.count({ where: { inventoryItemId: id } })
    ]);
    if (ingredientCount > 0 || vendorItemCount > 0 || poItemCount > 0) {
      return reply.badRequest("Item is linked to recipes or purchase orders.");
    }
    try {
      await prisma.inventoryItem.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Inventory item not found");
    }
  });
}
