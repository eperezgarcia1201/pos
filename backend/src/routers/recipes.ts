import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";

const ingredientSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional()
});

export async function registerRecipeRoutes(app: FastifyInstance) {
  app.get("/menu/items/:id/ingredients", async (request) => {
    const menuItemId = String((request.params as { id: string }).id);
    return prisma.menuItemIngredient.findMany({
      where: { menuItemId },
      include: { inventoryItem: true }
    });
  });

  app.post("/menu/items/:id/ingredients", async (request, reply) => {
    const menuItemId = String((request.params as { id: string }).id);
    const body = ingredientSchema.parse(request.body);
    const ingredient = await prisma.menuItemIngredient.create({
      data: {
        menuItemId,
        inventoryItemId: body.inventoryItemId,
        quantity: body.quantity,
        unit: body.unit
      }
    });
    return reply.code(201).send(ingredient);
  });

  app.delete("/menu/items/:id/ingredients/:ingredientId", async (request, reply) => {
    const ingredientId = String((request.params as { ingredientId: string }).ingredientId);
    try {
      const ingredient = await prisma.menuItemIngredient.delete({ where: { id: ingredientId } });
      return ingredient;
    } catch {
      return reply.notFound("Ingredient not found");
    }
  });
}
