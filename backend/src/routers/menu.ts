import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const categorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  color: z.string().optional(),
  visible: z.boolean().optional()
});

const menuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  color: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  categoryId: z.string().optional(),
  groupId: z.string().optional(),
  taxId: z.string().optional(),
  kitchenStationId: z.string().optional(),
  taxable: z.boolean().optional(),
  visible: z.boolean().optional()
});

export async function registerMenuRoutes(app: FastifyInstance) {
  app.get("/menu/categories", async () => {
    return prisma.menuCategory.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.get("/menu/groups", async () => {
    return prisma.menuGroup.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/menu/categories", async (request, reply) => {
    const body = categorySchema.parse(request.body);
    const category = await prisma.menuCategory.create({ data: body });
    return reply.code(201).send(category);
  });

  app.post("/menu/groups", async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        categoryId: z.string(),
        sortOrder: z.number().int().optional(),
        visible: z.boolean().optional(),
        kitchenStationId: z.string().optional()
      })
      .parse(request.body);
    const group = await prisma.menuGroup.create({
      data: {
        name: body.name,
        categoryId: body.categoryId,
        sortOrder: body.sortOrder ?? 0,
        visible: body.visible ?? true,
        kitchenStationId: body.kitchenStationId
      }
    });
    return reply.code(201).send(group);
  });

  app.patch("/menu/categories/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = categorySchema.partial().parse(request.body);
    try {
      const category = await prisma.menuCategory.update({ where: { id }, data: body });
      return category;
    } catch {
      return reply.notFound("Category not found");
    }
  });

  app.delete("/menu/categories/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const groupCount = await prisma.menuGroup.count({ where: { categoryId: id } });
    if (groupCount > 0) {
      return reply.badRequest("Delete or move menu groups first");
    }
    const itemCount = await prisma.menuItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      return reply.badRequest("Delete or move menu items first");
    }
    try {
      await prisma.menuCategory.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Category not found");
    }
  });

  app.patch("/menu/groups/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        categoryId: z.string().optional(),
        sortOrder: z.number().int().optional(),
        visible: z.boolean().optional(),
        kitchenStationId: z.string().optional()
      })
      .parse(request.body);
    try {
      const group = await prisma.menuGroup.update({ where: { id }, data: body });
      return group;
    } catch {
      return reply.notFound("Menu group not found");
    }
  });

  app.delete("/menu/groups/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const itemCount = await prisma.menuItem.count({ where: { groupId: id } });
    if (itemCount > 0) {
      return reply.badRequest("Delete or move menu items first");
    }
    try {
      await prisma.menuGroup.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Menu group not found");
    }
  });

  app.get("/menu/items", async () => {
    return prisma.menuItem.findMany({
      include: { category: true, group: true, availability: true },
      orderBy: { name: "asc" }
    });
  });

  app.post("/menu/items", async (request, reply) => {
    const body = menuItemSchema.parse(request.body);
    const item = await prisma.menuItem.create({
      data: {
        name: body.name,
        description: body.description,
        sku: body.sku,
        barcode: body.barcode,
        color: body.color,
        price: body.price,
        cost: body.cost,
        taxable: body.taxable,
        visible: body.visible,
        category: body.categoryId ? { connect: { id: body.categoryId } } : undefined,
        group: body.groupId ? { connect: { id: body.groupId } } : undefined,
        tax: body.taxId ? { connect: { id: body.taxId } } : undefined,
        kitchenStation: body.kitchenStationId ? { connect: { id: body.kitchenStationId } } : undefined
      }
    });
    return reply.code(201).send(item);
  });

  app.get("/menu/items/:id/availability", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const availability = await prisma.menuItemAvailability.findMany({
      where: { menuItemId: id },
      orderBy: { dayOfWeek: "asc" }
    });
    return availability;
  });

  app.post("/menu/items/:id/availability", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = z
      .object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
        enabled: z.boolean().optional()
      })
      .parse(request.body);

    const availability = await prisma.menuItemAvailability.create({
      data: {
        menuItemId: id,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        enabled: body.enabled ?? true
      }
    });

    return reply.code(201).send(availability);
  });

  app.delete("/menu/items/:id/availability/:availabilityId", async (request, reply) => {
    const availabilityId = String((request.params as { availabilityId: string }).availabilityId);
    try {
      const availability = await prisma.menuItemAvailability.delete({
        where: { id: availabilityId }
      });
      return availability;
    } catch {
      return reply.notFound("Availability not found");
    }
  });

  app.patch("/menu/items/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = menuItemSchema.partial().parse(request.body);
    try {
      const item = await prisma.menuItem.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(typeof body.description !== "undefined" ? { description: body.description } : {}),
          ...(typeof body.sku !== "undefined" ? { sku: body.sku } : {}),
          ...(typeof body.barcode !== "undefined" ? { barcode: body.barcode } : {}),
          ...(typeof body.color !== "undefined" ? { color: body.color } : {}),
          ...(typeof body.price !== "undefined" ? { price: body.price } : {}),
          ...(typeof body.cost !== "undefined" ? { cost: body.cost } : {}),
          ...(typeof body.taxable !== "undefined" ? { taxable: body.taxable } : {}),
          ...(typeof body.visible !== "undefined" ? { visible: body.visible } : {}),
          ...(typeof body.categoryId !== "undefined"
            ? { category: body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true } }
            : {}),
          ...(typeof body.groupId !== "undefined"
            ? { group: body.groupId ? { connect: { id: body.groupId } } : { disconnect: true } }
            : {}),
          ...(typeof body.taxId !== "undefined"
            ? { tax: body.taxId ? { connect: { id: body.taxId } } : { disconnect: true } }
            : {}),
          ...(typeof body.kitchenStationId !== "undefined"
            ? {
                kitchenStation: body.kitchenStationId
                  ? { connect: { id: body.kitchenStationId } }
                  : { disconnect: true }
              }
            : {})
        }
      });
      return item;
    } catch {
      return reply.notFound("Menu item not found");
    }
  });

  app.delete("/menu/items/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const orderCount = await prisma.posOrderItem.count({ where: { menuItemId: id } });
    if (orderCount > 0) {
      return reply.badRequest("Item has sales history. Hide it instead.");
    }
    try {
      await prisma.menuItemAvailability.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItemIngredient.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItemPrice.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItem.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.notFound("Menu item not found");
    }
  });
}
