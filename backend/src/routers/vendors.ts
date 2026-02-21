import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const vendorSchema = z.object({
  name: z.string().min(2),
  contact: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional()
});

export async function registerVendorRoutes(app: FastifyInstance) {
  app.get("/vendors", async () => {
    return prisma.vendor.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/vendors", async (request, reply) => {
    const body = vendorSchema.parse(request.body);
    const vendor = await prisma.vendor.create({ data: body });
    return reply.code(201).send(vendor);
  });

  app.patch("/vendors/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = vendorSchema.partial().parse(request.body);
    try {
      const vendor = await prisma.vendor.update({ where: { id }, data: body });
      return vendor;
    } catch {
      return reply.notFound("Vendor not found");
    }
  });

  app.delete("/vendors/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const [poCount, vendorItemCount] = await Promise.all([
      prisma.purchaseOrder.count({ where: { vendorId: id } }),
      prisma.vendorItem.count({ where: { vendorId: id } })
    ]);
    if (poCount > 0 || vendorItemCount > 0) {
      return reply.badRequest("Vendor has purchase history.");
    }
    try {
      await prisma.vendor.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Vendor not found");
    }
  });
}
