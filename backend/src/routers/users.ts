import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../services/prisma.js";
import { resolveRequestUserId } from "../services/accessControl.js";
import {
  evaluateLegacySecurityConfig,
  normalizeLegacySecurityOverrides,
  normalizeOptionalSecurityLevel,
  normalizeSecurityLevel,
  resolveLegacySecurityConfig
} from "../services/legacySecurity.js";
import {
  applyPermissionOverrides,
  normalizePermissionMap,
  normalizePermissionOverrides
} from "../services/permissions.js";

const permissionOverrideSchema = z.record(z.enum(["allow", "deny"]));
const legacySecurityOverrideSchema = z.record(
  z.object({
    minLevel: z.number().int().min(1).max(5).optional(),
    enforced: z.boolean().optional()
  })
);

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  pin: z.string().min(4).max(10).regex(/^\d+$/).optional(),
  roleId: z.string(),
  displayName: z.string().min(1).optional(),
  language: z.enum(["en", "es"]).optional(),
  active: z.boolean().optional(),
  permissionOverrides: permissionOverrideSchema.optional(),
  securityLevel: z.number().int().min(1).max(5).nullable().optional(),
  legacySecurityOverrides: legacySecurityOverrideSchema.optional()
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  pin: z.string().min(4).max(10).regex(/^\d+$/).optional(),
  roleId: z.string().optional(),
  displayName: z.string().min(1).optional(),
  language: z.enum(["en", "es"]).optional(),
  active: z.boolean().optional(),
  permissionOverrides: permissionOverrideSchema.optional(),
  securityLevel: z.number().int().min(1).max(5).nullable().optional(),
  legacySecurityOverrides: legacySecurityOverrideSchema.optional()
});

function toUserResponse(user: {
  id: string;
  username: string;
  roleId: string;
  displayName: string | null;
  language: string;
  active: boolean;
  pinHash: string | null;
  permissionOverrides: unknown;
  securityLevel: number | null;
  legacySecurityOverrides: unknown;
  role: {
    name: string;
    permissions: unknown;
    securityLevel: number;
    legacySecurityConfig: unknown;
  } | null;
}) {
  const rolePermissions = normalizePermissionMap(user.role?.permissions);
  const permissionOverrides = normalizePermissionOverrides(user.permissionOverrides);
  const roleSecurityLevel = normalizeSecurityLevel(user.role?.securityLevel, 3);
  const securityLevel = normalizeOptionalSecurityLevel(user.securityLevel);
  const effectiveSecurityLevel = securityLevel ?? roleSecurityLevel;
  const roleLegacySecurityConfig = normalizeLegacySecurityOverrides(user.role?.legacySecurityConfig);
  const legacySecurityOverrides = normalizeLegacySecurityOverrides(user.legacySecurityOverrides);
  const resolvedLegacySecurity = resolveLegacySecurityConfig(
    roleLegacySecurityConfig,
    legacySecurityOverrides
  );
  const effectiveLegacySecurity = evaluateLegacySecurityConfig(
    resolvedLegacySecurity,
    effectiveSecurityLevel
  );
  return {
    id: user.id,
    username: user.username,
    roleId: user.roleId,
    roleName: user.role?.name ?? null,
    displayName: user.displayName,
    language: user.language === "es" ? "es" : "en",
    active: user.active,
    hasPin: Boolean(user.pinHash),
    rolePermissions,
    permissionOverrides,
    permissions: applyPermissionOverrides(rolePermissions, permissionOverrides),
    roleSecurityLevel,
    securityLevel,
    effectiveSecurityLevel,
    roleLegacySecurityConfig,
    legacySecurityOverrides,
    effectiveLegacySecurity
  };
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/users", async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        roleId: true,
        displayName: true,
        language: true,
        active: true,
        pinHash: true,
        permissionOverrides: true,
        securityLevel: true,
        legacySecurityOverrides: true,
        role: {
          select: {
            name: true,
            permissions: true,
            securityLevel: true,
            legacySecurityConfig: true
          }
        }
      }
    });
    return users.map(toUserResponse);
  });

  app.post("/users", async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { username: body.username } });
    if (existing) {
      return reply.badRequest("Username already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const pinHash = body.pin ? await bcrypt.hash(body.pin, 10) : undefined;
    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash,
        pinHash,
        roleId: body.roleId,
        displayName: body.displayName,
        language: body.language ?? "en",
        active: body.active ?? true,
        permissionOverrides: normalizePermissionOverrides(body.permissionOverrides),
        securityLevel: normalizeOptionalSecurityLevel(body.securityLevel),
        legacySecurityOverrides: normalizeLegacySecurityOverrides(body.legacySecurityOverrides)
      },
      select: {
        id: true,
        username: true,
        roleId: true,
        displayName: true,
        language: true,
        active: true,
        pinHash: true,
        permissionOverrides: true,
        securityLevel: true,
        legacySecurityOverrides: true,
        role: {
          select: {
            name: true,
            permissions: true,
            securityLevel: true,
            legacySecurityConfig: true
          }
        }
      }
    });

    return reply.code(201).send(toUserResponse(user));
  });

  app.get("/users/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        roleId: true,
        displayName: true,
        language: true,
        active: true,
        pinHash: true,
        permissionOverrides: true,
        securityLevel: true,
        legacySecurityOverrides: true,
        role: {
          select: {
            name: true,
            permissions: true,
            securityLevel: true,
            legacySecurityConfig: true
          }
        }
      }
    });

    if (!user) {
      return reply.notFound("User not found");
    }

    return toUserResponse(user);
  });

  app.patch("/users/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const body = updateUserSchema.parse(request.body);
    const data: Record<string, unknown> = {
      roleId: body.roleId,
      displayName: body.displayName,
      language: body.language,
      active: body.active,
      permissionOverrides:
        typeof body.permissionOverrides !== "undefined"
          ? normalizePermissionOverrides(body.permissionOverrides)
          : undefined,
      securityLevel:
        typeof body.securityLevel !== "undefined"
          ? normalizeOptionalSecurityLevel(body.securityLevel)
          : undefined,
      legacySecurityOverrides:
        typeof body.legacySecurityOverrides !== "undefined"
          ? normalizeLegacySecurityOverrides(body.legacySecurityOverrides)
          : undefined
    };

    if (typeof body.username !== "undefined") {
      const username = body.username.trim();
      if (username.length < 3) {
        return reply.badRequest("Username must be at least 3 characters");
      }
      const existing = await prisma.user.findFirst({
        where: { username, id: { not: id } },
        select: { id: true }
      });
      if (existing) {
        return reply.badRequest("Username already exists");
      }
      data.username = username;
    }

    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }
    if (body.pin) {
      data.pinHash = await bcrypt.hash(body.pin, 10);
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          username: true,
          roleId: true,
          displayName: true,
          language: true,
          active: true,
          pinHash: true,
          permissionOverrides: true,
          securityLevel: true,
          legacySecurityOverrides: true,
          role: {
            select: {
              name: true,
              permissions: true,
              securityLevel: true,
              legacySecurityConfig: true
            }
          }
        }
      });
      return toUserResponse(user);
    } catch {
      return reply.notFound("User not found");
    }
  });

  app.delete("/users/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const actorUserId = resolveRequestUserId(request);

    if (actorUserId && actorUserId === id) {
      return reply.badRequest("You cannot delete the user currently signed in.");
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, active: true }
    });
    if (!user) {
      return reply.notFound("User not found");
    }

    if (user.active) {
      const otherActiveUsers = await prisma.user.count({
        where: {
          active: true,
          id: { not: id }
        }
      });
      if (otherActiveUsers === 0) {
        return reply.badRequest("Cannot delete the last active user.");
      }
    }

    const timeClockCount = await prisma.timeClock.count({
      where: { userId: id }
    });
    if (timeClockCount > 0) {
      return reply.badRequest("This user has time clock history and cannot be deleted. Set the user to inactive instead.");
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.userNotification.deleteMany({ where: { userId: id } });
        await tx.shift.updateMany({ where: { userId: id }, data: { userId: null } });
        await tx.cashTransaction.updateMany({ where: { userId: id }, data: { userId: null } });
        await tx.kitchenTicketEvent.updateMany({ where: { userId: id }, data: { userId: null } });
        await tx.posOrder.updateMany({ where: { serverId: id }, data: { serverId: null } });
        await tx.reservation.updateMany({ where: { createdById: id }, data: { createdById: null } });
        await tx.user.delete({ where: { id } });
      });
      return { ok: true };
    } catch (err) {
      request.log.error({ err, userId: id }, "Unable to delete user");
      return reply.badRequest("Unable to delete user. Set the user to inactive instead.");
    }
  });
}
