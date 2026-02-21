import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const clockSchema = z.object({
  userId: z.string(),
  shiftId: z.string().optional()
});

export async function registerTimeClockRoutes(app: FastifyInstance) {
  app.get("/timeclock", async () => {
    return prisma.timeClock.findMany({
      include: { user: true },
      orderBy: { clockIn: "desc" }
    });
  });

  app.post("/timeclock/in", async (request, reply) => {
    const body = clockSchema.parse(request.body);
    const entry = await prisma.timeClock.create({
      data: {
        userId: body.userId,
        shiftId: body.shiftId
      }
    });
    return reply.code(201).send(entry);
  });

  app.post("/timeclock/out", async (request, reply) => {
    const body = clockSchema.parse(request.body);
    const openEntry = await prisma.timeClock.findFirst({
      where: { userId: body.userId, clockOut: null },
      orderBy: { clockIn: "desc" }
    });

    if (!openEntry) {
      return reply.notFound("No open time clock entry");
    }

    const entry = await prisma.timeClock.update({
      where: { id: openEntry.id },
      data: { clockOut: new Date() }
    });

    return entry;
  });
}
