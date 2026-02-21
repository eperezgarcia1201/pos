import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const drawerSchema = z.object({
  name: z.string().min(2),
  status: z.enum(["OPEN", "CLOSED"]).optional()
});

const cashTxnSchema = z.object({
  drawerId: z.string().optional(),
  userId: z.string().optional(),
  type: z.enum(["IN", "OUT", "PAYOUT", "DROP", "OPENING"]),
  amount: z.number().nonnegative(),
  note: z.string().optional(),
  details: z.any().optional()
});

export async function registerCashRoutes(app: FastifyInstance) {
  app.get("/cash/drawers", async () => {
    return prisma.cashDrawer.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/cash/drawers", async (request, reply) => {
    const body = drawerSchema.parse(request.body);
    const drawer = await prisma.cashDrawer.create({
      data: {
        name: body.name,
        status: body.status ?? "CLOSED"
      }
    });
    return reply.code(201).send(drawer);
  });

  app.patch("/cash/drawers/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = drawerSchema.partial().parse(request.body);
    try {
      const drawer = await prisma.cashDrawer.update({
        where: { id },
        data: body
      });
      return drawer;
    } catch {
      return reply.notFound("Drawer not found");
    }
  });

  app.get("/cash/transactions", async () => {
    return prisma.cashTransaction.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/cash/transactions", async (request, reply) => {
    const body = cashTxnSchema.parse(request.body);
  const txn = await prisma.cashTransaction.create({
      data: {
        drawerId: body.drawerId,
        userId: body.userId,
        type: body.type,
        amount: body.amount,
        note: body.note,
        details: body.details
      }
    });
    return reply.code(201).send(txn);
  });

  app.post("/cash/drawers/:id/open", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const deviceBridgeUrl = process.env.DEVICE_BRIDGE_URL || "http://localhost:7090";
    let drawer;
    try {
      drawer = await prisma.cashDrawer.update({
        where: { id },
        data: { status: "OPEN" }
      });
    } catch {
      return reply.notFound("Drawer not found");
    }

    try {
      await fetch(`${deviceBridgeUrl}/drawer/open`, { method: "POST" });
    } catch {
      // Device bridge is optional; drawer status already updated.
    }

    return drawer;
  });

  app.post("/cash/drawers/:id/close", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const openOrders = await prisma.posOrder.count({
      where: {
        status: { in: ["OPEN", "SENT", "HOLD"] }
      }
    });
    if (openOrders > 0) {
      return reply.code(409).send({
        message: `You still have ${openOrders} open order(s). Close open orders before cashier out.`
      });
    }

    try {
      const drawer = await prisma.cashDrawer.update({
        where: { id },
        data: { status: "CLOSED" }
      });
      return drawer;
    } catch {
      return reply.notFound("Drawer not found");
    }
  });
}
