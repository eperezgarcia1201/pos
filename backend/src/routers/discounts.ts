import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const discountSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().nonnegative(),
  active: z.boolean().optional(),
  autoApply: z.boolean().optional()
});

export async function registerDiscountRoutes(app: FastifyInstance) {
  app.get("/discounts", async () => {
    return prisma.discount.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/discounts", async (request, reply) => {
    const body = discountSchema.parse(request.body);
    const discount = await prisma.discount.create({
      data: {
        name: body.name,
        type: body.type,
        value: body.value,
        active: body.active ?? true,
        autoApply: body.autoApply ?? false
      }
    });
    return reply.code(201).send(discount);
  });

  app.patch("/discounts/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = discountSchema.partial().parse(request.body);
    try {
      const discount = await prisma.discount.update({ where: { id }, data: body });
      return discount;
    } catch {
      return reply.notFound("Discount not found");
    }
  });
}
