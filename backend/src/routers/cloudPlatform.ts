import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { generateSecret, hashSecret } from "../services/cloudNodes.js";
import {
  canAccessReseller,
  canAccessTenant,
  requireCloudAccount,
  signCloudAccountToken,
  type CloudAccountSession
} from "../services/cloudPlatformAuth.js";

const cloudLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const createResellerAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(120).optional()
});

const createResellerSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(64).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(40).optional(),
  metadata: z.any().optional(),
  admin: createResellerAdminSchema.optional()
});

const createTenantAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(120).optional()
});

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).optional(),
  resellerId: z.string().optional(),
  active: z.boolean().optional(),
  metadata: z.any().optional(),
  admin: createTenantAdminSchema.optional()
});

const createStoreSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(64).optional(),
  timezone: z.string().min(2).optional(),
  status: z.string().min(2).max(40).optional(),
  edgeBaseUrl: z.string().url().optional(),
  metadata: z.any().optional()
});

const createStoreImpersonationLinkSchema = z.object({
  targetBaseUrl: z.string().url().optional()
});

const createScopedAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(120).optional(),
  metadata: z.any().optional()
});

const claimOnsiteSchema = z.object({
  onsiteBaseUrl: z.string().url(),
  claimId: z.string().min(6).max(120),
  claimCode: z.string().min(4).max(64),
  tenantId: z.string().optional(),
  storeId: z.string().optional(),
  storeName: z.string().min(2).max(120).optional(),
  storeCode: z.string().min(2).max(64).optional(),
  timezone: z.string().min(2).max(120).optional(),
  edgeBaseUrl: z.string().url().optional(),
  cloudBaseUrl: z.string().url().optional(),
  nodeLabel: z.string().min(2).max(120).optional()
});

const cloudNetworkQuerySchema = z.object({
  tenantId: z.string().optional(),
  resellerId: z.string().optional(),
  storeStatus: z.string().optional(),
  nodeStatus: z.enum(["ONLINE", "STALE", "OFFLINE"]).optional(),
  includeUnlinked: z.coerce.boolean().optional()
});

const remoteActionCodeSchema = z.enum([
  "HEARTBEAT_NOW",
  "SYNC_PULL",
  "RUN_DIAGNOSTICS",
  "RESTART_BACKEND",
  "RESTART_AGENT",
  "RELOAD_SETTINGS"
]);

const queueRemoteActionSchema = z.object({
  storeId: z.string().min(1),
  nodeId: z.string().optional(),
  targetAllNodes: z.boolean().optional(),
  action: remoteActionCodeSchema,
  note: z.string().max(400).optional(),
  parameters: z.any().optional()
});

const remoteActionQuerySchema = z.object({
  storeId: z.string().optional(),
  tenantId: z.string().optional(),
  resellerId: z.string().optional(),
  nodeId: z.string().optional(),
  status: z.string().optional(),
  action: remoteActionCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const onsiteConsumeResponseSchema = z.object({
  serverUid: z.string().min(4),
  serverLabel: z.string().optional(),
  storeNameHint: z.string().nullable().optional(),
  addressHint: z.string().nullable().optional(),
  timezoneHint: z.string().optional(),
  finalizeToken: z.string().optional(),
  finalizeExpiresAt: z.string().optional()
});

function sanitizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function toPublicAccount(account: CloudAccountSession) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    accountType: account.accountType,
    status: account.status,
    resellerId: account.resellerId,
    tenantId: account.tenantId,
    reseller: account.reseller,
    tenant: account.tenant,
    metadata: account.metadata,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

async function reserveUniqueResellerCode(rawName: string, rawCode?: string) {
  const base = normalizeCode(rawCode || "") || normalizeCode(rawName) || `RESELLER-${Date.now()}`;
  let candidate = base;
  let suffix = 1;
  while (await prisma.reseller.findUnique({ where: { code: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function reserveUniqueTenantSlug(rawName: string, rawSlug?: string) {
  const base = slugify(rawSlug || "") || slugify(rawName) || `tenant-${Date.now()}`;
  let candidate = base;
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function reserveUniqueStoreCode(rawName: string, rawCode?: string) {
  const base = normalizeCode(rawCode || "") || normalizeCode(rawName) || `STORE-${Date.now()}`;
  let candidate = base;
  let suffix = 1;
  while (await prisma.store.findUnique({ where: { code: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function isCloudEmailTaken(email: string) {
  const existing = await prisma.cloudAccount.findUnique({
    where: { email: sanitizeEmail(email) },
    select: { id: true }
  });
  return Boolean(existing);
}

async function createCloudAccount(params: {
  email: string;
  password: string;
  displayName?: string;
  accountType: "OWNER" | "RESELLER" | "TENANT_ADMIN";
  resellerId?: string | null;
  tenantId?: string | null;
  metadata?: unknown;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.cloudAccount.create({
    data: {
      email: sanitizeEmail(params.email),
      passwordHash,
      displayName: params.displayName || null,
      accountType: params.accountType,
      status: "ACTIVE",
      resellerId: params.resellerId ?? null,
      tenantId: params.tenantId ?? null,
      metadata: params.metadata as any
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      accountType: true,
      status: true,
      resellerId: true,
      tenantId: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

function resolveTenantWhere(account: CloudAccountSession, query: { resellerId?: string }) {
  if (account.accountType === "OWNER") {
    return {
      resellerId: query.resellerId || undefined
    };
  }
  if (account.accountType === "RESELLER") {
    return { resellerId: account.resellerId || "__none__" };
  }
  return { id: account.tenantId || "__none__" };
}

function parseStoreFilters(query: unknown) {
  const parsed = z
    .object({
      tenantId: z.string().optional(),
      resellerId: z.string().optional(),
      status: z.string().optional()
    })
    .parse(query || {});
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveNodeStatus(lastSeenAt: Date | null, rawStatus: string | null | undefined) {
  if (!lastSeenAt) return "OFFLINE";
  const ageMs = Date.now() - lastSeenAt.getTime();
  if (ageMs <= 120_000) return "ONLINE";
  if (ageMs <= 900_000) return "STALE";
  if (String(rawStatus || "").toUpperCase() === "ONLINE") return "STALE";
  return "OFFLINE";
}

function parseStatusFilter(raw: string | undefined, fallback: string[]) {
  const statuses = String(raw || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  return statuses.length > 0 ? statuses : fallback;
}

async function consumeOnsiteClaim(baseUrl: string, claimId: string, claimCode: string) {
  const targetUrl = `${normalizeBaseUrl(baseUrl)}/onsite/public/claim/consume`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, claimCode }),
      signal: controller.signal
    });

    const bodyText = await response.text();
    let parsed: unknown = null;
    if (bodyText) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = bodyText;
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed === "string"
          ? parsed
          : (parsed as { message?: string; error?: string } | null)?.message ||
            (parsed as { message?: string; error?: string } | null)?.error ||
            `Onsite claim request failed (${response.status})`;
      throw new Error(message);
    }

    return onsiteConsumeResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Onsite server did not respond in time.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function finalizeOnsiteClaim(params: {
  baseUrl: string;
  finalizeToken: string;
  cloudStoreId: string;
  cloudStoreCode: string;
  cloudNodeId: string;
  nodeKey: string;
  nodeToken: string;
  cloudBaseUrl?: string;
  linkedBy?: string;
}) {
  const targetUrl = `${normalizeBaseUrl(params.baseUrl)}/onsite/public/claim/finalize`;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      finalizeToken: params.finalizeToken,
      cloudStoreId: params.cloudStoreId,
      cloudStoreCode: params.cloudStoreCode,
      cloudNodeId: params.cloudNodeId,
      nodeKey: params.nodeKey,
      nodeToken: params.nodeToken,
      cloudBaseUrl: params.cloudBaseUrl,
      linkedBy: params.linkedBy
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Onsite finalize failed (${response.status})`);
  }
}

export async function registerCloudPlatformRoutes(app: FastifyInstance) {
  app.post("/cloud/auth/login", async (request, reply) => {
    const body = cloudLoginSchema.parse(request.body);
    const account = await prisma.cloudAccount.findUnique({
      where: { email: sanitizeEmail(body.email) },
      include: {
        reseller: { select: { id: true, name: true, code: true } },
        tenant: { select: { id: true, name: true, slug: true } }
      }
    });
    if (!account || account.status !== "ACTIVE") {
      return reply.unauthorized("Invalid cloud credentials.");
    }

    const validPassword = await bcrypt.compare(body.password, account.passwordHash);
    if (!validPassword) {
      return reply.unauthorized("Invalid cloud credentials.");
    }

    const accountType = String(account.accountType || "").toUpperCase();
    if (accountType !== "OWNER" && accountType !== "RESELLER" && accountType !== "TENANT_ADMIN") {
      return reply.forbidden("Unsupported cloud account type.");
    }

    await prisma.cloudAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() }
    });

    const session: CloudAccountSession = {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      accountType,
      status: account.status,
      resellerId: account.resellerId,
      tenantId: account.tenantId,
      metadata: account.metadata,
      reseller: account.reseller,
      tenant: account.tenant,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastLoginAt: new Date()
    };

    const token = signCloudAccountToken(app, session);
    return {
      token,
      account: toPublicAccount(session)
    };
  });

  app.get("/cloud/auth/me", async (request, reply) => {
    const account = await requireCloudAccount(request, reply);
    if (!account) return;
    return { account: toPublicAccount(account) };
  });

  app.get("/cloud/platform/resellers", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER"]);
    if (!account) return;

    const where =
      account.accountType === "OWNER"
        ? {}
        : {
            id: account.resellerId || "__none__"
          };

    const resellers = await prisma.reseller.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { tenants: true, accounts: true } }
      }
    });

    return { resellers };
  });

  app.post("/cloud/platform/resellers", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER"]);
    if (!account) return;
    const body = createResellerSchema.parse(request.body);

    if (body.admin && (await isCloudEmailTaken(body.admin.email))) {
      return reply.conflict("Cloud account email already exists.");
    }

    const code = await reserveUniqueResellerCode(body.name, body.code);
    const reseller = await prisma.$transaction(async (tx) => {
      const created = await tx.reseller.create({
        data: {
          name: body.name.trim(),
          code,
          active: true,
          contactName: body.contactName || null,
          contactEmail: body.contactEmail ? sanitizeEmail(body.contactEmail) : null,
          contactPhone: body.contactPhone || null,
          metadata: body.metadata
        }
      });

      let admin = null;
      if (body.admin) {
        const hashed = await bcrypt.hash(body.admin.password, 10);
        admin = await tx.cloudAccount.create({
          data: {
            email: sanitizeEmail(body.admin.email),
            passwordHash: hashed,
            displayName: body.admin.displayName || `${created.name} Admin`,
            accountType: "RESELLER",
            status: "ACTIVE",
            resellerId: created.id
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            accountType: true,
            status: true,
            resellerId: true,
            tenantId: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }

      return { created, admin };
    });

    return reply.code(201).send({
      reseller: reseller.created,
      adminAccount: reseller.admin
    });
  });

  app.post("/cloud/platform/resellers/:id/accounts", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER"]);
    if (!account) return;
    const resellerId = String((request.params as { id: string }).id);
    if (!canAccessReseller(account, resellerId)) {
      return reply.forbidden("Cannot manage this reseller.");
    }

    const reseller = await prisma.reseller.findUnique({ where: { id: resellerId }, select: { id: true } });
    if (!reseller) return reply.notFound("Reseller not found.");

    const body = createScopedAccountSchema.parse(request.body);
    const created = await createCloudAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      accountType: "RESELLER",
      resellerId: reseller.id,
      metadata: body.metadata
    });

    return reply.code(201).send({ account: created });
  });

  app.get("/cloud/platform/tenants", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;

    const query = z.object({ resellerId: z.string().optional() }).parse(request.query || {});
    const where = resolveTenantWhere(account, query);

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        reseller: { select: { id: true, name: true, code: true } },
        _count: { select: { stores: true, accounts: true } }
      }
    });

    return { tenants };
  });

  app.post("/cloud/platform/tenants", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER"]);
    if (!account) return;
    const body = createTenantSchema.parse(request.body);

    if (body.admin && (await isCloudEmailTaken(body.admin.email))) {
      return reply.conflict("Cloud account email already exists.");
    }

    const resolvedResellerId = account.accountType === "RESELLER" ? account.resellerId : body.resellerId || null;
    if (account.accountType === "RESELLER" && !resolvedResellerId) {
      return reply.forbidden("Reseller account is not linked to a reseller.");
    }

    if (resolvedResellerId) {
      const reseller = await prisma.reseller.findUnique({ where: { id: resolvedResellerId }, select: { id: true } });
      if (!reseller) return reply.badRequest("Reseller not found.");
    }

    const slug = await reserveUniqueTenantSlug(body.name, body.slug);
    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name.trim(),
          slug,
          active: body.active ?? true,
          resellerId: resolvedResellerId,
          metadata: body.metadata
        }
      });

      let admin = null;
      if (body.admin) {
        const hashed = await bcrypt.hash(body.admin.password, 10);
        admin = await tx.cloudAccount.create({
          data: {
            email: sanitizeEmail(body.admin.email),
            passwordHash: hashed,
            displayName: body.admin.displayName || `${tenant.name} Admin`,
            accountType: "TENANT_ADMIN",
            status: "ACTIVE",
            tenantId: tenant.id
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            accountType: true,
            status: true,
            resellerId: true,
            tenantId: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }

      return { tenant, admin };
    });

    return reply.code(201).send(created);
  });

  app.post("/cloud/platform/resellers/:id/tenants", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER"]);
    if (!account) return;
    const resellerId = String((request.params as { id: string }).id);
    if (!canAccessReseller(account, resellerId)) {
      return reply.forbidden("Cannot create tenant for this reseller.");
    }

    const reseller = await prisma.reseller.findUnique({ where: { id: resellerId }, select: { id: true } });
    if (!reseller) return reply.notFound("Reseller not found.");

    const body = createTenantSchema.parse(request.body);
    if (body.admin && (await isCloudEmailTaken(body.admin.email))) {
      return reply.conflict("Cloud account email already exists.");
    }
    const slug = await reserveUniqueTenantSlug(body.name, body.slug);

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name.trim(),
          slug,
          active: body.active ?? true,
          resellerId,
          metadata: body.metadata
        }
      });

      let admin = null;
      if (body.admin) {
        const hashed = await bcrypt.hash(body.admin.password, 10);
        admin = await tx.cloudAccount.create({
          data: {
            email: sanitizeEmail(body.admin.email),
            passwordHash: hashed,
            displayName: body.admin.displayName || `${tenant.name} Admin`,
            accountType: "TENANT_ADMIN",
            status: "ACTIVE",
            tenantId: tenant.id
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            accountType: true,
            status: true,
            resellerId: true,
            tenantId: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }

      return { tenant, admin };
    });

    return reply.code(201).send(created);
  });

  app.post("/cloud/platform/tenants/:id/accounts", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const tenantId = String((request.params as { id: string }).id);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, resellerId: true }
    });
    if (!tenant) return reply.notFound("Tenant not found.");

    if (!canAccessTenant(account, tenant)) {
      return reply.forbidden("Cannot manage this tenant.");
    }

    const body = createScopedAccountSchema.parse(request.body);
    const created = await createCloudAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      accountType: "TENANT_ADMIN",
      tenantId: tenant.id,
      metadata: body.metadata
    });

    return reply.code(201).send({ account: created });
  });

  app.get("/cloud/platform/stores", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;

    const query = parseStoreFilters(request.query);
    const where =
      account.accountType === "OWNER"
        ? {
            tenantId: query.tenantId || undefined,
            status: query.status || undefined,
            tenant: query.resellerId ? { resellerId: query.resellerId } : undefined
          }
        : account.accountType === "RESELLER"
          ? {
              status: query.status || undefined,
              tenant: {
                resellerId: account.resellerId || "__none__",
                id: query.tenantId || undefined
              }
            }
          : {
              status: query.status || undefined,
              tenantId: account.tenantId || "__none__"
            };

    const stores = await prisma.store.findMany({
      where,
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            resellerId: true,
            reseller: { select: { id: true, name: true, code: true } }
          }
        },
        _count: {
          select: {
            nodes: true,
            revisions: true
          }
        }
      }
    });

    return { stores };
  });

  app.post("/cloud/platform/stores", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const body = createStoreSchema.parse(request.body);

    const tenant = await prisma.tenant.findUnique({
      where: { id: body.tenantId },
      select: { id: true, resellerId: true, name: true }
    });
    if (!tenant) return reply.notFound("Tenant not found.");
    if (!canAccessTenant(account, tenant)) {
      return reply.forbidden("Cannot create store for this tenant.");
    }

    const code = await reserveUniqueStoreCode(body.name, body.code);
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        name: body.name.trim(),
        code,
        timezone: body.timezone || "America/Chicago",
        status: body.status || "ACTIVE",
        edgeBaseUrl: body.edgeBaseUrl || null,
        metadata: body.metadata
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, resellerId: true }
        }
      }
    });

    return reply.code(201).send(store);
  });

  app.post("/cloud/platform/stores/:id/impersonation-link", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const storeId = String((request.params as { id: string }).id);
    const body = createStoreImpersonationLinkSchema.parse(request.body ?? {});

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        tenant: {
          select: {
            id: true,
            resellerId: true
          }
        }
      }
    });
    if (!store) return reply.notFound("Store not found.");
    if (!canAccessTenant(account, { id: store.tenantId, resellerId: store.tenant.resellerId })) {
      return reply.forbidden("Cannot impersonate this store.");
    }

    const targetBaseUrl = normalizeBaseUrl(body.targetBaseUrl?.trim() || store.edgeBaseUrl || "");
    if (!targetBaseUrl) {
      return reply.badRequest("Store base URL is missing. Provide targetBaseUrl or set edgeBaseUrl on store.");
    }

    const impersonationToken = app.jwt.sign(
      {
        kind: "cloud-store-impersonation",
        storeId: store.id,
        storeCode: store.code,
        tenantId: store.tenantId,
        resellerId: store.tenant.resellerId,
        cloudAccountId: account.id,
        cloudAccountType: account.accountType,
        cloudAccountEmail: account.email
      },
      { expiresIn: "5m" }
    );

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name
      },
      targetBaseUrl,
      expiresInSeconds: 300,
      url: `${targetBaseUrl}/back-office?impersonationToken=${encodeURIComponent(impersonationToken)}`
    };
  });

  app.post("/cloud/platform/onsite/claim", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const body = claimOnsiteSchema.parse(request.body);

    if (!body.tenantId && !body.storeId) {
      return reply.badRequest("tenantId or storeId is required.");
    }

    let consumeResult: z.infer<typeof onsiteConsumeResponseSchema>;
    try {
      consumeResult = await consumeOnsiteClaim(body.onsiteBaseUrl, body.claimId, body.claimCode);
    } catch (error) {
      return reply.badGateway(error instanceof Error ? error.message : "Unable to contact onsite server.");
    }

    let store = null as
      | {
          id: string;
          tenantId: string;
          name: string;
          code: string;
          timezone: string;
          edgeBaseUrl: string | null;
          tenant: { id: string; name: string; slug: string; resellerId: string | null };
        }
      | null;

    if (body.storeId) {
      const existingStore = await prisma.store.findUnique({
        where: { id: body.storeId },
        include: {
          tenant: { select: { id: true, name: true, slug: true, resellerId: true } }
        }
      });
      if (!existingStore) return reply.notFound("Store not found.");
      if (!canAccessTenant(account, { id: existingStore.tenantId, resellerId: existingStore.tenant.resellerId })) {
        return reply.forbidden("Cannot claim onsite server for this store.");
      }
      store = existingStore;
    } else {
      const tenant = await prisma.tenant.findUnique({
        where: { id: body.tenantId as string },
        select: { id: true, name: true, slug: true, resellerId: true }
      });
      if (!tenant) return reply.notFound("Tenant not found.");
      if (!canAccessTenant(account, tenant)) {
        return reply.forbidden("Cannot claim onsite server for this tenant.");
      }

      const storeName =
        body.storeName?.trim() ||
        consumeResult.storeNameHint?.trim() ||
        consumeResult.serverLabel?.trim() ||
        `${tenant.name} Onsite`;
      const storeCode = await reserveUniqueStoreCode(storeName, body.storeCode);

      store = await prisma.store.create({
        data: {
          tenantId: tenant.id,
          name: storeName,
          code: storeCode,
          timezone: body.timezone || consumeResult.timezoneHint || "America/Chicago",
          status: "ACTIVE",
          edgeBaseUrl: body.edgeBaseUrl || normalizeBaseUrl(body.onsiteBaseUrl),
          metadata: {
            onsiteServerUid: consumeResult.serverUid,
            onsiteBaseUrl: normalizeBaseUrl(body.onsiteBaseUrl),
            claimSource: "onsite-public-claim",
            claimedByCloudAccountId: account.id
          }
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true, resellerId: true } }
        }
      });
    }

    const existingNodeKey = `ONSITE-${normalizeCode(consumeResult.serverUid)}`.slice(0, 64);
    const existingNode = await prisma.storeNode.findUnique({
      where: { nodeKey: existingNodeKey },
      select: { id: true, storeId: true, nodeKey: true, label: true }
    });

    if (existingNode && existingNode.storeId !== store.id) {
      return reply.conflict(`This onsite server is already linked to another store (node ${existingNode.nodeKey}).`);
    }

    const nodeToken = `node_${generateSecret(30)}`;
    const now = new Date();

    const node = existingNode
      ? await prisma.storeNode.update({
          where: { id: existingNode.id },
          data: {
            tokenHash: hashSecret(nodeToken),
            label: body.nodeLabel || consumeResult.serverLabel || existingNode.label,
            status: "ONLINE",
            metadata: {
              onsiteServerUid: consumeResult.serverUid,
              onsiteBaseUrl: normalizeBaseUrl(body.onsiteBaseUrl),
              claimedAt: now.toISOString(),
              claimedByCloudAccountId: account.id
            },
            lastSeenAt: now
          },
          select: {
            id: true,
            storeId: true,
            nodeKey: true,
            label: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        })
      : await prisma.storeNode.create({
          data: {
            storeId: store.id,
            label: body.nodeLabel || consumeResult.serverLabel || "Onsite Server",
            nodeKey: existingNodeKey,
            tokenHash: hashSecret(nodeToken),
            status: "ONLINE",
            metadata: {
              onsiteServerUid: consumeResult.serverUid,
              onsiteBaseUrl: normalizeBaseUrl(body.onsiteBaseUrl),
              claimedAt: now.toISOString(),
              claimedByCloudAccountId: account.id
            },
            lastSeenAt: now
          },
          select: {
            id: true,
            storeId: true,
            nodeKey: true,
            label: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        });

    let onsiteFinalizeError: string | null = null;
    if (consumeResult.finalizeToken) {
      const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim();
      const forwardedHost = String(request.headers["x-forwarded-host"] || "")
        .split(",")[0]
        .trim();
      const fallbackHost = String(request.headers.host || "").trim();
      const host = forwardedHost || fallbackHost;
      const protocol = forwardedProto || request.protocol || "http";
      const inferredCloudBaseUrl = host ? `${protocol}://${host}` : undefined;

      try {
        await finalizeOnsiteClaim({
          baseUrl: body.onsiteBaseUrl,
          finalizeToken: consumeResult.finalizeToken,
          cloudStoreId: store.id,
          cloudStoreCode: store.code,
          cloudNodeId: node.id,
          nodeKey: node.nodeKey,
          nodeToken,
          cloudBaseUrl: body.cloudBaseUrl || inferredCloudBaseUrl,
          linkedBy: account.email
        });
      } catch (error) {
        onsiteFinalizeError = error instanceof Error ? error.message : "Onsite finalize call failed.";
      }
    }

    return reply.code(existingNode ? 200 : 201).send({
      store,
      node: {
        ...node,
        nodeToken
      },
      onsite: {
        serverUid: consumeResult.serverUid,
        serverLabel: consumeResult.serverLabel || null,
        storeNameHint: consumeResult.storeNameHint || null,
        addressHint: consumeResult.addressHint || null,
        finalized: Boolean(consumeResult.finalizeToken) && !onsiteFinalizeError,
        finalizeError: onsiteFinalizeError
      }
    });
  });

  app.get("/cloud/platform/network", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;

    const query = cloudNetworkQuerySchema.parse(request.query ?? {});

    const where =
      account.accountType === "OWNER"
        ? {
            tenantId: query.tenantId || undefined,
            status: query.storeStatus || undefined,
            tenant: query.resellerId ? { resellerId: query.resellerId } : undefined
          }
        : account.accountType === "RESELLER"
          ? {
              status: query.storeStatus || undefined,
              tenant: {
                resellerId: account.resellerId || "__none__",
                id: query.tenantId || undefined
              }
            }
          : {
              status: query.storeStatus || undefined,
              tenantId: account.tenantId || "__none__"
            };

    const stores = await prisma.store.findMany({
      where,
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            resellerId: true,
            reseller: { select: { id: true, name: true, code: true } }
          }
        },
        nodes: {
          orderBy: [{ label: "asc" }],
          select: {
            id: true,
            label: true,
            nodeKey: true,
            status: true,
            softwareVersion: true,
            metadata: true,
            lastSeenAt: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    const mapped = stores
      .map((store) => {
        const nodes = store.nodes
          .map((node) => {
            const metadata = isRecord(node.metadata) ? node.metadata : {};
            const onsiteServerUid =
              typeof metadata.onsiteServerUid === "string" && metadata.onsiteServerUid.trim()
                ? metadata.onsiteServerUid.trim()
                : "";
            const onsiteBaseUrl =
              (typeof metadata.onsiteBaseUrl === "string" && metadata.onsiteBaseUrl.trim()) || store.edgeBaseUrl || null;
            const status = resolveNodeStatus(node.lastSeenAt, node.status);
            const heartbeatAgeSeconds = node.lastSeenAt
              ? Math.max(0, Math.floor((Date.now() - node.lastSeenAt.getTime()) / 1000))
              : null;

            return {
              id: node.id,
              label: node.label,
              nodeKey: node.nodeKey,
              status,
              rawStatus: node.status,
              softwareVersion: node.softwareVersion || null,
              onsiteServerUid: onsiteServerUid || null,
              onsiteBaseUrl,
              heartbeatAgeSeconds,
              lastSeenAt: node.lastSeenAt,
              createdAt: node.createdAt,
              updatedAt: node.updatedAt
            };
          })
          .filter((node) => (query.nodeStatus ? node.status === query.nodeStatus : true));

        const uniqueServerUids = Array.from(
          new Set(nodes.map((node) => node.onsiteServerUid).filter((value): value is string => Boolean(value)))
        );

        return {
          id: store.id,
          name: store.name,
          code: store.code,
          status: store.status,
          timezone: store.timezone,
          edgeBaseUrl: store.edgeBaseUrl,
          tenant: store.tenant,
          linkedServerUids: uniqueServerUids,
          nodeCount: nodes.length,
          nodes,
          createdAt: store.createdAt,
          updatedAt: store.updatedAt
        };
      })
      .filter((store) => (query.includeUnlinked === false ? store.nodeCount > 0 : true));

    const allNodes = mapped.flatMap((store) => store.nodes);
    const summary = {
      storesTotal: mapped.length,
      storesLinked: mapped.filter((store) => store.nodeCount > 0).length,
      nodesTotal: allNodes.length,
      nodesOnline: allNodes.filter((node) => node.status === "ONLINE").length,
      nodesStale: allNodes.filter((node) => node.status === "STALE").length,
      nodesOffline: allNodes.filter((node) => node.status === "OFFLINE").length
    };

    return { summary, stores: mapped };
  });

  app.post("/cloud/platform/network/nodes/:id/rotate-token", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;

    const nodeId = String((request.params as { id: string }).id);
    const existing = await prisma.storeNode.findUnique({
      where: { id: nodeId },
      include: {
        store: {
          select: {
            id: true,
            code: true,
            tenantId: true,
            tenant: {
              select: {
                id: true,
                resellerId: true
              }
            }
          }
        }
      }
    });
    if (!existing) return reply.notFound("Store node not found.");

    if (!canAccessTenant(account, { id: existing.store.tenantId, resellerId: existing.store.tenant.resellerId })) {
      return reply.forbidden("Cannot rotate token for this store node.");
    }

    const nextToken = `node_${generateSecret(30)}`;
    const metadata = isRecord(existing.metadata) ? existing.metadata : {};
    const now = new Date();

    const updated = await prisma.storeNode.update({
      where: { id: existing.id },
      data: {
        tokenHash: hashSecret(nextToken),
        metadata: {
          ...metadata,
          tokenRotatedAt: now.toISOString(),
          tokenRotatedByCloudAccountId: account.id
        } as any
      },
      select: {
        id: true,
        storeId: true,
        label: true,
        nodeKey: true,
        status: true,
        lastSeenAt: true,
        updatedAt: true
      }
    });

    return {
      node: updated,
      nodeToken: nextToken
    };
  });

  app.post("/cloud/platform/network/actions", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const body = queueRemoteActionSchema.parse(request.body ?? {});

    const store = await prisma.store.findUnique({
      where: { id: body.storeId },
      include: {
        tenant: {
          select: {
            id: true,
            resellerId: true
          }
        },
        nodes: {
          orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            label: true,
            nodeKey: true
          }
        }
      }
    });
    if (!store) return reply.notFound("Store not found.");
    if (!canAccessTenant(account, { id: store.tenantId, resellerId: store.tenant.resellerId })) {
      return reply.forbidden("Cannot dispatch remote action for this store.");
    }

    if (store.nodes.length === 0) {
      return reply.badRequest("Store has no registered nodes.");
    }

    let nodeId: string | null = null;
    if (body.nodeId) {
      const node = store.nodes.find((entry) => entry.id === body.nodeId);
      if (!node) return reply.badRequest("Target node does not belong to this store.");
      nodeId = node.id;
    } else if (!body.targetAllNodes) {
      if (store.nodes.length > 1) {
        return reply.badRequest("Store has multiple nodes. Specify nodeId or set targetAllNodes=true.");
      }
      nodeId = store.nodes[0]?.id || null;
    }

    const commandType = `REMOTE_ACTION_${body.action}`;
    const issuedAtIso = new Date().toISOString();
    const command = await prisma.syncCommand.create({
      data: {
        storeId: store.id,
        nodeId,
        revisionId: null,
        domain: "REMOTE_ACTION",
        commandType,
        payload: {
          action: body.action,
          parameters: body.parameters ?? {},
          note: body.note?.trim() || null,
          issuedAt: issuedAtIso,
          requestedBy: {
            cloudAccountId: account.id,
            email: account.email,
            accountType: account.accountType
          }
        } as any,
        status: "PENDING",
        createdBy: `cloud:${account.id}`
      },
      include: {
        node: {
          select: {
            id: true,
            label: true,
            nodeKey: true
          }
        },
        store: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    return reply.code(201).send({
      action: body.action,
      command
    });
  });

  app.get("/cloud/platform/network/actions", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const query = remoteActionQuerySchema.parse(request.query ?? {});
    const limit = query.limit ?? 80;
    const statuses = parseStatusFilter(query.status, ["PENDING", "FAILED", "ACKED"]);

    const where =
      account.accountType === "OWNER"
        ? {
            domain: "REMOTE_ACTION",
            status: { in: statuses },
            storeId: query.storeId || undefined,
            nodeId: query.nodeId || undefined,
            commandType: query.action ? `REMOTE_ACTION_${query.action}` : undefined,
            store: {
              tenantId: query.tenantId || undefined,
              tenant: query.resellerId ? { resellerId: query.resellerId } : undefined
            }
          }
        : account.accountType === "RESELLER"
          ? {
              domain: "REMOTE_ACTION",
              status: { in: statuses },
              storeId: query.storeId || undefined,
              nodeId: query.nodeId || undefined,
              commandType: query.action ? `REMOTE_ACTION_${query.action}` : undefined,
              store: {
                tenantId: query.tenantId || undefined,
                tenant: { resellerId: account.resellerId || "__none__" }
              }
            }
          : {
              domain: "REMOTE_ACTION",
              status: { in: statuses },
              storeId: query.storeId || undefined,
              nodeId: query.nodeId || undefined,
              commandType: query.action ? `REMOTE_ACTION_${query.action}` : undefined,
              store: { tenantId: account.tenantId || "__none__" }
            };

    const commands = await prisma.syncCommand.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: limit,
      include: {
        node: {
          select: {
            id: true,
            label: true,
            nodeKey: true
          }
        },
        store: {
          select: {
            id: true,
            name: true,
            code: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                reseller: {
                  select: {
                    id: true,
                    name: true,
                    code: true
                  }
                }
              }
            }
          }
        },
        _count: {
          select: { logs: true }
        }
      }
    });

    const mapped = commands.map((command) => ({
      ...command,
      action: command.commandType.startsWith("REMOTE_ACTION_")
        ? command.commandType.slice("REMOTE_ACTION_".length)
        : null
    }));

    return { actions: mapped };
  });

  app.post("/cloud/platform/network/actions/:id/retry", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const actionId = String((request.params as { id: string }).id);

    const existing = await prisma.syncCommand.findUnique({
      where: { id: actionId },
      include: {
        store: {
          select: {
            id: true,
            tenantId: true,
            tenant: {
              select: {
                resellerId: true
              }
            }
          }
        }
      }
    });
    if (!existing || existing.domain !== "REMOTE_ACTION") {
      return reply.notFound("Remote action command not found.");
    }
    if (!canAccessTenant(account, { id: existing.store.tenantId, resellerId: existing.store.tenant.resellerId })) {
      return reply.forbidden("Cannot retry remote action for this store.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.syncCommand.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          errorCode: null,
          errorDetail: null,
          acknowledgedAt: null
        }
      });

      await tx.syncCommandLog.create({
        data: {
          commandId: existing.id,
          storeId: existing.storeId,
          nodeId: existing.nodeId,
          status: "RETRY_QUEUED",
          output: {
            actorCloudAccountId: account.id,
            actorEmail: account.email,
            previousStatus: existing.status
          }
        }
      });

      return next;
    });

    return { action: updated };
  });

  app.post("/cloud/platform/network/actions/:id/cancel", async (request, reply) => {
    const account = await requireCloudAccount(request, reply, ["OWNER", "RESELLER", "TENANT_ADMIN"]);
    if (!account) return;
    const actionId = String((request.params as { id: string }).id);

    const existing = await prisma.syncCommand.findUnique({
      where: { id: actionId },
      include: {
        store: {
          select: {
            id: true,
            tenantId: true,
            tenant: {
              select: {
                resellerId: true
              }
            }
          }
        }
      }
    });
    if (!existing || existing.domain !== "REMOTE_ACTION") {
      return reply.notFound("Remote action command not found.");
    }
    if (!canAccessTenant(account, { id: existing.store.tenantId, resellerId: existing.store.tenant.resellerId })) {
      return reply.forbidden("Cannot cancel remote action for this store.");
    }
    if (existing.status !== "PENDING") {
      return reply.badRequest("Only pending actions can be cancelled.");
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.syncCommand.update({
        where: { id: existing.id },
        data: {
          status: "FAILED",
          errorCode: "CANCELLED_BY_CLOUD",
          errorDetail: `Cancelled by ${account.email}`,
          acknowledgedAt: now
        }
      });

      await tx.syncCommandLog.create({
        data: {
          commandId: existing.id,
          storeId: existing.storeId,
          nodeId: existing.nodeId,
          status: "CANCELLED",
          output: {
            actorCloudAccountId: account.id,
            actorEmail: account.email
          }
        }
      });

      return next;
    });

    return { action: updated };
  });
}
