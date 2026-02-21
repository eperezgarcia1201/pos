import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const areaSchema = z.object({
  name: z.string().min(2),
  sortOrder: z.number().int().optional()
});

export async function registerTableAreaRoutes(app: FastifyInstance) {
  app.get("/table-areas", async () => {
    return prisma.tableArea.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/table-areas", async (request, reply) => {
    const body = areaSchema.parse(request.body);
    const area = await prisma.tableArea.create({
      data: {
        name: body.name,
        sortOrder: body.sortOrder ?? 0
      }
    });
    return reply.code(201).send(area);
  });

  app.patch("/table-areas/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = areaSchema.partial().parse(request.body);
    try {
      const area = await prisma.tableArea.update({ where: { id }, data: body });
      return area;
    } catch {
      return reply.notFound("Area not found");
    }
  });

  app.delete("/table-areas/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    try {
      await prisma.diningTable.updateMany({
        where: { areaId: id },
        data: { areaId: null }
      });
      await prisma.tableArea.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Area not found");
    }
  });
}
