import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const accountSchema = z.object({
  accountNumber: z.string().min(1),
  customerName: z.string().min(1),
  phone: z.string().optional(),
  balance: z.number().optional(),
  active: z.boolean().optional()
});

const chargeSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional()
});

export async function registerHouseAccountRoutes(app: FastifyInstance) {
  app.get("/house-accounts", async () => {
    return prisma.houseAccount.findMany({ orderBy: { customerName: "asc" } });
  });

  app.post("/house-accounts", async (request, reply) => {
    const body = accountSchema.parse(request.body);
    const account = await prisma.houseAccount.create({
      data: {
        accountNumber: body.accountNumber,
        customerName: body.customerName,
        phone: body.phone,
        balance: body.balance ?? 0,
        active: body.active ?? true
      }
    });
    return reply.code(201).send(account);
  });

  app.patch("/house-accounts/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = accountSchema.partial().parse(request.body);
    try {
      const account = await prisma.houseAccount.update({
        where: { id },
        data: body
      });
      return account;
    } catch {
      return reply.notFound("House account not found");
    }
  });

  app.post("/house-accounts/:id/charge", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = chargeSchema.parse(request.body);
    try {
      const account = await prisma.houseAccount.update({
        where: { id },
        data: { balance: { increment: body.amount } }
      });
      return account;
    } catch {
      return reply.notFound("House account not found");
    }
  });

  app.post("/house-accounts/:id/payment", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = chargeSchema.parse(request.body);
    try {
      const account = await prisma.houseAccount.update({
        where: { id },
        data: { balance: { decrement: body.amount } }
      });
      return account;
    } catch {
      return reply.notFound("House account not found");
    }
  });
}
