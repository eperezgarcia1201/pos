import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const stationSchema = z.object({
  name: z.string().min(2),
  printerId: z.string().optional()
});

export async function registerKitchenStationRoutes(app: FastifyInstance) {
  app.get("/kitchen-stations", async () => {
    return prisma.kitchenStation.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/kitchen-stations", async (request, reply) => {
    const body = stationSchema.parse(request.body);
    const station = await prisma.kitchenStation.create({
      data: { name: body.name, printerId: body.printerId }
    });
    return reply.code(201).send(station);
  });

  app.patch("/kitchen-stations/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = stationSchema.partial().parse(request.body);
    try {
      const station = await prisma.kitchenStation.update({
        where: { id },
        data: body
      });
      return station;
    } catch {
      return reply.notFound("Kitchen station not found");
    }
  });
}
