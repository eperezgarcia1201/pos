import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const shiftSchema = z.object({
  name: z.string().min(2),
  userId: z.string().optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional()
});

export async function registerShiftRoutes(app: FastifyInstance) {
  app.get("/shifts", async () => {
    return prisma.shift.findMany({ orderBy: { startedAt: "desc" } });
  });

  app.post("/shifts", async (request, reply) => {
    const body = shiftSchema.parse(request.body);
    const shift = await prisma.shift.create({
      data: {
        name: body.name,
        userId: body.userId,
        status: body.status ?? "OPEN"
      }
    });
    return reply.code(201).send(shift);
  });

  app.patch("/shifts/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = shiftSchema.partial().parse(request.body);
    try {
      const shift = await prisma.shift.update({
        where: { id },
        data: {
          name: body.name,
          userId: body.userId,
          status: body.status,
          endedAt: body.status === "CLOSED" ? new Date() : undefined
        }
      });
      return shift;
    } catch {
      return reply.notFound("Shift not found");
    }
  });
}
