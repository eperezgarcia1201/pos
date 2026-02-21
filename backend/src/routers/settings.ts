import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const settingSchema = z.object({
  value: z.any()
});

export async function registerSettingRoutes(app: FastifyInstance) {
  app.get("/settings", async () => {
    return prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  });

  app.get("/settings/:key", async (request, reply) => {
    const key = String((request.params as { key: string }).key);
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    if (!setting) return reply.notFound("Setting not found");
    return setting;
  });

  app.patch("/settings/:key", async (request, reply) => {
    const key = String((request.params as { key: string }).key);
    const body = settingSchema.parse(request.body);
    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: { value: body.value },
      create: { key, value: body.value }
    });
    return setting;
  });
}
