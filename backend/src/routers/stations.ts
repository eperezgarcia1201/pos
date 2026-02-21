import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const stationSchema = z.object({
  name: z.string().min(2),
  terminalId: z.string().optional(),
  receiptPrinterId: z.string().optional(),
  kitchenPrinterId: z.string().optional(),
  barPrinterId: z.string().optional(),
  cashDrawerId: z.string().optional(),
  kitchenStationIds: z.array(z.string()).optional(),
  barStationIds: z.array(z.string()).optional(),
  active: z.boolean().optional()
});

export async function registerStationRoutes(app: FastifyInstance) {
  app.get("/stations", async (request) => {
    const query = request.query as { terminalId?: string; id?: string };
    const where: Record<string, string> = {};
    if (query?.id) {
      where.id = query.id;
    }
    if (query?.terminalId) {
      where.terminalId = query.terminalId;
    }
    return prisma.station.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { name: "asc" }
    });
  });

  app.post("/stations", async (request, reply) => {
    const body = stationSchema.parse(request.body);
    const station = await prisma.station.create({ data: body });
    return reply.code(201).send(station);
  });

  app.patch("/stations/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = stationSchema.partial().parse(request.body);
    try {
      const station = await prisma.station.update({
        where: { id },
        data: body
      });
      return station;
    } catch {
      return reply.notFound("Station not found");
    }
  });
}
