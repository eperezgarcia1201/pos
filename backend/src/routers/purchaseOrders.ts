import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const poSchema = z.object({
  vendorId: z.string()
});

const poItemSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().optional()
});

const poUpdateSchema = z.object({
  status: z.enum(["OPEN", "ORDERED", "RECEIVED", "CANCELLED"]).optional()
});

export async function registerPurchaseOrderRoutes(app: FastifyInstance) {
  app.get("/purchase-orders", async () => {
    return prisma.purchaseOrder.findMany({
      include: { items: true, vendor: true },
      orderBy: { createdAt: "desc" }
    });
  });

  app.post("/purchase-orders", async (request, reply) => {
    const body = poSchema.parse(request.body);
    const po = await prisma.purchaseOrder.create({
      data: {
        vendorId: body.vendorId
      }
    });
    return reply.code(201).send(po);
  });

  app.post("/purchase-orders/:id/items", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = poItemSchema.parse(request.body);

    const item = await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId: id,
        inventoryItemId: body.inventoryItemId,
        quantity: body.quantity,
        unitCost: body.unitCost
      }
    });

    return reply.code(201).send(item);
  });

  app.delete("/purchase-orders/:id/items/:itemId", async (request, reply) => {
    const itemId = String((request.params as { itemId: string }).itemId);
    try {
      await prisma.purchaseOrderItem.delete({ where: { id: itemId } });
      return { ok: true };
    } catch {
      return reply.notFound("PO item not found");
    }
  });

  app.post("/purchase-orders/:id/receive", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!po) {
      return reply.notFound("Purchase order not found");
    }

    for (const item of po.items) {
      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantity: { increment: item.quantity } }
      });
      await prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: item.inventoryItemId,
          delta: item.quantity,
          reason: `PO ${id} received`
        }
      });
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date()
      }
    });

    return updated;
  });

  app.patch("/purchase-orders/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = poUpdateSchema.parse(request.body);
    try {
      const po = await prisma.purchaseOrder.update({
        where: { id },
        data: body
      });
      return po;
    } catch {
      return reply.notFound("Purchase order not found");
    }
  });

  app.delete("/purchase-orders/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    try {
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await prisma.purchaseOrder.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Purchase order not found");
    }
  });
}
