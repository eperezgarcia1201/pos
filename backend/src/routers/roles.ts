import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import {
  normalizeLegacySecurityOverrides,
  normalizeSecurityLevel,
  LEGACY_SECURITY_RULES
} from "../services/legacySecurity.js";
import { normalizePermissionMap } from "../services/permissions.js";

const roleSchema = z.object({
  name: z.string().min(2),
  permissions: z.record(z.boolean()).optional(),
  securityLevel: z.number().int().min(1).max(5).optional(),
  legacySecurityConfig: z.record(
    z.object({
      minLevel: z.number().int().min(1).max(5).optional(),
      enforced: z.boolean().optional()
    })
  ).optional()
});

function toRoleResponse(role: {
  id: string;
  name: string;
  permissions: unknown;
  securityLevel: number;
  legacySecurityConfig: unknown;
}) {
  return {
    id: role.id,
    name: role.name,
    permissions: normalizePermissionMap(role.permissions),
    securityLevel: normalizeSecurityLevel(role.securityLevel, 3),
    legacySecurityConfig: normalizeLegacySecurityOverrides(role.legacySecurityConfig)
  };
}

export async function registerRoleRoutes(app: FastifyInstance) {
  app.get("/roles/security-catalog", async () => {
    return { rules: LEGACY_SECURITY_RULES };
  });

  app.get("/roles", async () => {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        permissions: true,
        securityLevel: true,
        legacySecurityConfig: true
      },
      orderBy: { name: "asc" }
    });
    return roles.map(toRoleResponse);
  });

  app.post("/roles", async (request, reply) => {
    const body = roleSchema.parse(request.body);
    try {
      const role = await prisma.role.create({
        data: {
          name: body.name,
          permissions: normalizePermissionMap(body.permissions),
          securityLevel: normalizeSecurityLevel(body.securityLevel, 3),
          legacySecurityConfig: normalizeLegacySecurityOverrides(body.legacySecurityConfig)
        },
        select: {
          id: true,
          name: true,
          permissions: true,
          securityLevel: true,
          legacySecurityConfig: true
        }
      });
      return reply.code(201).send(toRoleResponse(role));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.badRequest("Role already exists");
      }
      request.log.error({ err }, "Failed to create role");
      return reply.internalServerError("Unable to create role");
    }
  });

  app.patch("/roles/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = roleSchema.partial().parse(request.body);
    const data: Record<string, unknown> = {};
    if (typeof body.name !== "undefined") {
      data.name = body.name;
    }
    if (typeof body.permissions !== "undefined") {
      data.permissions = normalizePermissionMap(body.permissions);
    }
    if (typeof body.securityLevel !== "undefined") {
      data.securityLevel = normalizeSecurityLevel(body.securityLevel, 3);
    }
    if (typeof body.legacySecurityConfig !== "undefined") {
      data.legacySecurityConfig = normalizeLegacySecurityOverrides(body.legacySecurityConfig);
    }
    try {
      const role = await prisma.role.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          permissions: true,
          securityLevel: true,
          legacySecurityConfig: true
        }
      });
      return toRoleResponse(role);
    } catch {
      return reply.notFound("Role not found");
    }
  });
}
