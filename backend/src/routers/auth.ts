import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../services/prisma.js";
import { resolveRequestUserId } from "../services/accessControl.js";
import {
  applyPermissionOverrides,
  normalizePermissionMap,
  normalizePermissionOverrides
} from "../services/permissions.js";
import {
  evaluateLegacySecurityConfig,
  normalizeLegacySecurityOverrides,
  normalizeOptionalSecurityLevel,
  normalizeSecurityLevel,
  resolveLegacySecurityConfig
} from "../services/legacySecurity.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const pinSchema = z.object({
  pin: z.string().min(1).max(10).regex(/^\d+$/)
});

const languageSchema = z.object({
  language: z.enum(["en", "es"])
});

const cloudImpersonationSchema = z.object({
  token: z.string().min(24)
});

type CloudImpersonationClaims = {
  kind?: string;
  storeId?: string;
  storeCode?: string;
  tenantId?: string;
  resellerId?: string | null;
  cloudAccountId?: string;
  cloudAccountType?: string;
  cloudAccountEmail?: string;
  iat?: number;
  exp?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseCloudStoreLink(value: unknown) {
  if (!isRecord(value)) return null;
  const cloudStoreId = typeof value.cloudStoreId === "string" ? value.cloudStoreId.trim() : "";
  const cloudStoreCode = typeof value.cloudStoreCode === "string" ? value.cloudStoreCode.trim() : "";
  if (!cloudStoreId && !cloudStoreCode) return null;
  return { cloudStoreId, cloudStoreCode };
}

function cloudImpersonationAllowedType(value: string | undefined) {
  const normalized = String(value || "").toUpperCase();
  return normalized === "OWNER" || normalized === "RESELLER" || normalized === "TENANT_ADMIN";
}

function toSessionUser(user: {
  id: string;
  username: string;
  roleId: string;
  displayName: string | null;
  language: string;
  permissionOverrides?: unknown;
  securityLevel?: number | null;
  legacySecurityOverrides?: unknown;
  role?: { permissions: unknown; securityLevel?: number; legacySecurityConfig?: unknown } | null;
}) {
  const permissionOverrides = normalizePermissionOverrides(user.permissionOverrides);
  const roleSecurityLevel = normalizeSecurityLevel(user.role?.securityLevel, 3);
  const securityLevel = normalizeOptionalSecurityLevel(user.securityLevel);
  const effectiveSecurityLevel = securityLevel ?? roleSecurityLevel;
  const resolvedLegacySecurity = resolveLegacySecurityConfig(
    user.role?.legacySecurityConfig,
    user.legacySecurityOverrides
  );
  const effectiveLegacySecurity = evaluateLegacySecurityConfig(
    resolvedLegacySecurity,
    effectiveSecurityLevel
  );
  return {
    id: user.id,
    username: user.username,
    roleId: user.roleId,
    displayName: user.displayName,
    language: user.language === "es" ? "es" : "en",
    permissions: applyPermissionOverrides(user.role?.permissions, permissionOverrides),
    permissionOverrides,
    roleSecurityLevel,
    securityLevel,
    effectiveSecurityLevel,
    effectiveLegacySecurity
  };
}

function signSessionToken(app: FastifyInstance, user: { id: string; roleId: string; username: string }) {
  return app.jwt.sign({
    sub: user.id,
    roleId: user.roleId,
    username: user.username
  });
}

function scoreImpersonationCandidate(user: {
  username: string;
  role?: { permissions: unknown } | null;
}) {
  let score = 0;
  if (user.username.toLowerCase() === "admin") score += 1000;
  const permissions = normalizePermissionMap(user.role?.permissions);
  if (permissions.all) score += 500;
  if (permissions.settings) score += 200;
  if (permissions.users) score += 120;
  if (permissions.reports) score += 80;
  return score;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { username: body.username },
      include: { role: true }
    });

    if (!user || !user.passwordHash) {
      return reply.unauthorized("Invalid credentials");
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return reply.unauthorized("Invalid credentials");
    }

    const token = signSessionToken(app, user);

    return {
      token,
      user: toSessionUser(user)
    };
  });

  app.post("/auth/pin", async (request, reply) => {
    const body = pinSchema.parse(request.body);
    const users = await prisma.user.findMany({
      where: { active: true, pinHash: { not: null } },
      include: { role: true }
    });

    for (const user of users) {
      if (!user.pinHash) continue;
      const ok = await bcrypt.compare(body.pin, user.pinHash);
      if (ok) {
        const token = signSessionToken(app, user);
        return {
          token,
          user: toSessionUser(user)
        };
      }
    }

    return reply.unauthorized("Invalid access code");
  });

  app.get("/auth/me", async (request, reply) => {
    const userId = resolveRequestUserId(request);
    if (!userId) {
      return reply.unauthorized("Access code required");
    }

    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      include: { role: true }
    });
    if (!user) {
      return reply.notFound("User not found");
    }

    return { user: toSessionUser(user) };
  });

  app.patch("/auth/language", async (request, reply) => {
    const userId = resolveRequestUserId(request);
    if (!userId) {
      return reply.unauthorized("Access code required");
    }

    const body = languageSchema.parse(request.body);
    try {
      const user = await prisma.user.update({
        where: { id: String(userId) },
        data: { language: body.language },
        select: { language: true }
      });
      return { language: user.language === "es" ? "es" : "en" };
    } catch {
      return reply.notFound("User not found");
    }
  });

  app.post("/auth/cloud-impersonate", async (request, reply) => {
    const body = cloudImpersonationSchema.parse(request.body ?? {});

    let claims: CloudImpersonationClaims;
    try {
      claims = request.server.jwt.verify<CloudImpersonationClaims>(body.token);
    } catch {
      return reply.unauthorized("Invalid or expired impersonation token.");
    }

    if (claims.kind !== "cloud-store-impersonation") {
      return reply.unauthorized("Invalid impersonation token type.");
    }
    if (!cloudImpersonationAllowedType(claims.cloudAccountType)) {
      return reply.forbidden("Unsupported cloud account type for impersonation.");
    }

    const tokenStoreId = String(claims.storeId || "").trim();
    const tokenStoreCode = String(claims.storeCode || "").trim();
    if (!tokenStoreId && !tokenStoreCode) {
      return reply.badRequest("Impersonation token is missing store scope.");
    }

    const cloudLinkSetting = await prisma.appSetting.findUnique({
      where: { key: "cloud_edge_link" },
      select: { value: true }
    });
    const linkedStore = parseCloudStoreLink(cloudLinkSetting?.value);

    if (linkedStore) {
      const idMatches = Boolean(tokenStoreId && linkedStore.cloudStoreId && tokenStoreId === linkedStore.cloudStoreId);
      const codeMatches = Boolean(tokenStoreCode && linkedStore.cloudStoreCode && tokenStoreCode === linkedStore.cloudStoreCode);
      if (!idMatches && !codeMatches) {
        return reply.forbidden("Impersonation token does not match this store.");
      }
    } else if (tokenStoreCode) {
      const byCode = await prisma.store.findUnique({
        where: { code: tokenStoreCode },
        select: { id: true }
      });
      if (!byCode) {
        return reply.forbidden("Impersonation token store code is not valid for this server.");
      }
    } else {
      const byId = await prisma.store.findUnique({
        where: { id: tokenStoreId },
        select: { id: true }
      });
      if (!byId) {
        return reply.forbidden("Impersonation token store id is not valid for this server.");
      }
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      include: { role: true }
    });
    if (users.length === 0) {
      return reply.notFound("No active local user is available for impersonation.");
    }

    const bestUser = [...users]
      .sort((left, right) => scoreImpersonationCandidate(right) - scoreImpersonationCandidate(left))[0];
    if (!bestUser) {
      return reply.notFound("No suitable local user found for impersonation.");
    }

    const token = signSessionToken(app, bestUser);
    return {
      token,
      user: toSessionUser(bestUser),
      impersonatedBy: {
        cloudAccountId: claims.cloudAccountId || null,
        cloudAccountType: claims.cloudAccountType || null,
        cloudAccountEmail: claims.cloudAccountEmail || null
      }
    };
  });
}
