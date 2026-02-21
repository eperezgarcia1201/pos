import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const groupSchema = z.object({
  name: z.string().min(2),
  minRequired: z.number().int().optional(),
  maxAllowed: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional()
});

const modifierSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  groupId: z.string()
});

export async function registerModifierRoutes(app: FastifyInstance) {
  app.get("/modifier-groups", async () => {
    return prisma.menuModifierGroup.findMany({
      include: { modifiers: true },
      orderBy: { sortOrder: "asc" }
    });
  });

  app.get("/modifiers", async () => {
    return prisma.menuModifier.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/modifier-groups", async (request, reply) => {
    const body = groupSchema.parse(request.body);
    const group = await prisma.menuModifierGroup.create({
      data: {
        name: body.name,
        minRequired: body.minRequired,
        maxAllowed: body.maxAllowed,
        sortOrder: body.sortOrder ?? 0,
        active: body.active ?? true
      }
    });
    return reply.code(201).send(group);
  });

  app.patch("/modifier-groups/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = groupSchema.partial().parse(request.body);
    try {
      const group = await prisma.menuModifierGroup.update({ where: { id }, data: body });
      return group;
    } catch {
      return reply.notFound("Modifier group not found");
    }
  });

  app.delete("/modifier-groups/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    try {
      const modifiers = await prisma.menuModifier.findMany({ where: { groupId: id } });
      if (modifiers.length > 0) {
        await prisma.orderItemModifier.deleteMany({
          where: { modifierId: { in: modifiers.map((m) => m.id) } }
        });
        await prisma.menuModifier.deleteMany({ where: { groupId: id } });
      }
      await prisma.menuItemModifierGroup.deleteMany({ where: { groupId: id } });
      await prisma.menuModifierGroup.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Modifier group not found");
    }
  });

  app.post("/modifiers", async (request, reply) => {
    const body = modifierSchema.parse(request.body);
    const modifier = await prisma.menuModifier.create({
      data: {
        name: body.name,
        price: body.price,
        sortOrder: body.sortOrder ?? 0,
        active: body.active ?? true,
        groupId: body.groupId
      }
    });
    return reply.code(201).send(modifier);
  });

  app.patch("/modifiers/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = modifierSchema.partial().parse(request.body);
    try {
      const modifier = await prisma.menuModifier.update({ where: { id }, data: body });
      return modifier;
    } catch {
      return reply.notFound("Modifier not found");
    }
  });

  app.delete("/modifiers/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    try {
      await prisma.orderItemModifier.deleteMany({ where: { modifierId: id } });
      await prisma.menuModifier.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Modifier not found");
    }
  });

  app.post("/menu/items/:id/modifier-groups", async (request, reply) => {
    const menuItemId = String((request.params as { id: string }).id);
    const body = z
      .object({
        groupId: z.string(),
        minRequired: z.number().int().optional(),
        maxAllowed: z.number().int().optional(),
        sortOrder: z.number().int().optional()
      })
      .parse(request.body);

    const link = await prisma.menuItemModifierGroup.create({
      data: {
        menuItemId,
        groupId: body.groupId,
        minRequired: body.minRequired,
        maxAllowed: body.maxAllowed,
        sortOrder: body.sortOrder ?? 0
      }
    });

    return reply.code(201).send(link);
  });

  app.get("/menu/items/:id/modifier-groups", async (request) => {
    const menuItemId = String((request.params as { id: string }).id);
    const links = await prisma.menuItemModifierGroup.findMany({
      where: { menuItemId },
      include: { group: { include: { modifiers: true } } },
      orderBy: { sortOrder: "asc" }
    });
    return links;
  });

  app.delete("/menu/items/:id/modifier-groups/:linkId", async (request, reply) => {
    const linkId = String((request.params as { linkId: string }).linkId);
    try {
      await prisma.menuItemModifierGroup.delete({ where: { id: linkId } });
      return { ok: true };
    } catch {
      return reply.notFound("Link not found");
    }
  });
}
