import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const taxSchema = z.object({
  name: z.string().min(2),
  rate: z.number().nonnegative(),
  inclusive: z.boolean().optional(),
  active: z.boolean().optional()
});

export async function registerTaxRoutes(app: FastifyInstance) {
  app.get("/taxes", async () => {
    return prisma.tax.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/taxes", async (request, reply) => {
    const body = taxSchema.parse(request.body);
    const tax = await prisma.tax.create({
      data: {
        name: body.name,
        rate: body.rate,
        inclusive: body.inclusive ?? false,
        active: body.active ?? true
      }
    });
    return reply.code(201).send(tax);
  });

  app.patch("/taxes/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = taxSchema.partial().parse(request.body);
    try {
      const tax = await prisma.tax.update({ where: { id }, data: body });
      return tax;
    } catch {
      return reply.notFound("Tax not found");
    }
  });
}
