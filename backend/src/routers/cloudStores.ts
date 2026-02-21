import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { generateSecret, hashSecret } from "../services/cloudNodes.js";
import { resolveRequestUserId } from "../services/accessControl.js";

const createStoreSchema = z.object({
  tenantId: z.string().optional(),
  tenantName: z.string().min(2).optional(),
  tenantSlug: z.string().min(2).optional(),
  storeName: z.string().min(2),
  storeCode: z.string().min(2).max(64).optional(),
  timezone: z.string().min(2).optional(),
  edgeBaseUrl: z.string().url().optional(),
  metadata: z.any().optional()
});

const bootstrapNodeSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  expiresInMinutes: z.number().int().min(5).max(24 * 60).optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

export async function registerCloudStoreRoutes(app: FastifyInstance) {
  app.get("/cloud/stores", async () => {
    const stores = await prisma.store.findMany({
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        nodes: {
          select: { id: true, label: true, status: true, lastSeenAt: true, softwareVersion: true },
          orderBy: { createdAt: "asc" }
        },
        _count: {
          select: {
            commands: true,
            revisions: true
          }
        }
      }
    });

    const pendingByStore = await prisma.syncCommand.groupBy({
      by: ["storeId", "status"],
      _count: { _all: true }
    });

    const pendingLookup = pendingByStore.reduce<Record<string, number>>((acc, row) => {
      if (row.status !== "PENDING") return acc;
      acc[row.storeId] = Number(row._count?._all || 0);
      return acc;
    }, {});

    return stores.map((store) => ({
      id: store.id,
      name: store.name,
      code: store.code,
      status: store.status,
      timezone: store.timezone,
      edgeBaseUrl: store.edgeBaseUrl,
      tenant: store.tenant,
      nodes: store.nodes,
      pendingCommands: pendingLookup[store.id] || 0,
      totalCommands: store._count.commands,
      totalRevisions: store._count.revisions,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt
    }));
  });

  app.post("/cloud/stores", async (request, reply) => {
    const body = createStoreSchema.parse(request.body);

    const tenant =
      (body.tenantId
        ? await prisma.tenant.findUnique({ where: { id: body.tenantId } })
        : null) ||
      (body.tenantSlug
        ? await prisma.tenant.findUnique({ where: { slug: slugify(body.tenantSlug) } })
        : null) ||
      (body.tenantName
        ? await prisma.tenant.upsert({
            where: { slug: slugify(body.tenantSlug || body.tenantName) || "default-tenant" },
            update: { name: body.tenantName },
            create: {
              name: body.tenantName,
              slug: slugify(body.tenantSlug || body.tenantName) || "default-tenant"
            }
          })
        : await prisma.tenant.upsert({
            where: { slug: "default-tenant" },
            update: { name: "Default Tenant" },
            create: { name: "Default Tenant", slug: "default-tenant" }
          }));

    const candidateCode =
      normalizeCode(body.storeCode || "") ||
      normalizeCode(body.storeName) ||
      normalizeCode(`STORE-${Date.now()}`);

    let uniqueCode = candidateCode;
    let suffix = 1;
    // Keep trying until unique code is available.
    while (await prisma.store.findUnique({ where: { code: uniqueCode }, select: { id: true } })) {
      uniqueCode = `${candidateCode}-${suffix}`;
      suffix += 1;
    }

    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        name: body.storeName.trim(),
        code: uniqueCode,
        timezone: body.timezone || "America/Chicago",
        edgeBaseUrl: body.edgeBaseUrl || null,
        metadata: body.metadata
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } }
      }
    });

    return reply.code(201).send(store);
  });

  app.post("/cloud/stores/:id/nodes/bootstrap", async (request, reply) => {
    const storeId = String((request.params as { id: string }).id);
    const body = bootstrapNodeSchema.parse(request.body ?? {});
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, code: true } });
    if (!store) return reply.notFound("Store not found.");

    const bootstrapToken = `bst_${generateSecret(24)}`;
    const tokenHash = hashSecret(bootstrapToken);
    const expiresInMinutes = body.expiresInMinutes ?? 60;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const creatorId = resolveRequestUserId(request) || undefined;
    await prisma.storeNodeBootstrapToken.create({
      data: {
        storeId,
        label: body.label || "Edge node",
        tokenHash,
        expiresAt,
        createdBy: creatorId
      }
    });

    return reply.code(201).send({
      storeId,
      storeCode: store.code,
      label: body.label || "Edge node",
      bootstrapToken,
      expiresAt
    });
  });
}
