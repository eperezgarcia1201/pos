import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { generateSecret, hashSecret, requireNodeAuth } from "../services/cloudNodes.js";
import { resolveRequestUserId } from "../services/accessControl.js";

const publishRevisionSchema = z.object({
  domain: z.string().min(2).max(120),
  payload: z.any(),
  commandType: z.string().min(2).max(120).optional(),
  nodeId: z.string().optional()
});

const registerNodeSchema = z.object({
  storeId: z.string(),
  bootstrapToken: z.string().min(10),
  label: z.string().min(2).max(120),
  softwareVersion: z.string().max(120).optional(),
  metadata: z.any().optional()
});

const ackCommandSchema = z.object({
  status: z.enum(["ACKED", "FAILED"]),
  appliedRevision: z.number().int().positive().optional(),
  errorCode: z.string().max(120).optional(),
  errorDetail: z.string().max(8000).optional(),
  output: z.any().optional()
});

const heartbeatSchema = z.object({
  softwareVersion: z.string().max(120).optional(),
  metadata: z.any().optional()
});

const commandQuerySchema = z.object({
  status: z.string().optional(),
  domain: z.string().optional(),
  nodeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const commandLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

function toDomainKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9:_-]+/g, "_");
}

function normalizeStatusFilter(rawStatus: string | undefined, fallback: string[]) {
  const statuses = String(rawStatus || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  return statuses.length > 0 ? statuses : fallback;
}

export async function registerCloudSyncRoutes(app: FastifyInstance) {
  app.post("/cloud/stores/:id/revisions", async (request, reply) => {
    const storeId = String((request.params as { id: string }).id);
    const body = publishRevisionSchema.parse(request.body);

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) return reply.notFound("Store not found.");

    const domain = toDomainKey(body.domain);
    const last = await prisma.syncRevision.findFirst({
      where: { storeId, domain },
      orderBy: { revision: "desc" },
      select: { revision: true }
    });
    const nextRevision = (last?.revision || 0) + 1;

    if (body.nodeId) {
      const assignedNode = await prisma.storeNode.findUnique({
        where: { id: body.nodeId },
        select: { id: true, storeId: true }
      });
      if (!assignedNode || assignedNode.storeId !== storeId) {
        return reply.badRequest("Target node does not belong to this store.");
      }
    }

    const creatorId = resolveRequestUserId(request) || undefined;
    const result = await prisma.$transaction(async (tx) => {
      const revision = await tx.syncRevision.create({
        data: {
          storeId,
          domain,
          revision: nextRevision,
          payload: body.payload,
          publishedBy: creatorId
        }
      });

      const command = await tx.syncCommand.create({
        data: {
          storeId,
          nodeId: body.nodeId || null,
          revisionId: revision.id,
          domain,
          commandType: body.commandType || `${domain}_PATCH`,
          payload: body.payload,
          status: "PENDING",
          createdBy: creatorId
        }
      });

      return { revision, command };
    });

    return reply.code(201).send(result);
  });

  app.get("/cloud/stores/:id/revisions/latest", async (request, reply) => {
    const storeId = String((request.params as { id: string }).id);
    const query = request.query as { domain?: string };
    const domain = query.domain ? toDomainKey(query.domain) : null;

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) return reply.notFound("Store not found.");

    if (domain) {
      const revision = await prisma.syncRevision.findFirst({
        where: { storeId, domain },
        orderBy: { revision: "desc" }
      });
      return { domain, revision };
    }

    const revisions = await prisma.syncRevision.findMany({
      where: { storeId },
      orderBy: [{ domain: "asc" }, { revision: "desc" }]
    });
    const latestByDomain = revisions.reduce<Record<string, (typeof revisions)[number]>>((acc, revision) => {
      if (!acc[revision.domain]) acc[revision.domain] = revision;
      return acc;
    }, {});
    return { revisions: Object.values(latestByDomain) };
  });

  app.get("/cloud/stores/:id/commands", async (request, reply) => {
    const storeId = String((request.params as { id: string }).id);
    const query = commandQuerySchema.parse(request.query ?? {});
    const limit = query.limit ?? 100;
    const statuses = normalizeStatusFilter(query.status, ["PENDING", "FAILED", "ACKED"]);
    const domain = query.domain ? toDomainKey(query.domain) : undefined;

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) return reply.notFound("Store not found.");

    const commands = await prisma.syncCommand.findMany({
      where: {
        storeId,
        status: { in: statuses },
        domain: domain || undefined,
        nodeId: query.nodeId || undefined
      },
      include: {
        node: {
          select: {
            id: true,
            label: true,
            nodeKey: true
          }
        },
        revisionRef: {
          select: {
            id: true,
            domain: true,
            revision: true,
            createdAt: true
          }
        },
        _count: {
          select: { logs: true }
        }
      },
      orderBy: { issuedAt: "desc" },
      take: limit
    });

    return { commands };
  });

  app.post("/cloud/nodes/register", async (request, reply) => {
    const body = registerNodeSchema.parse(request.body);
    const tokenHash = hashSecret(body.bootstrapToken);
    const now = new Date();

    const bootstrap = await prisma.storeNodeBootstrapToken.findFirst({
      where: {
        storeId: body.storeId,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!bootstrap) {
      return reply.unauthorized("Invalid or expired bootstrap token.");
    }

    const nodeToken = `node_${generateSecret(30)}`;
    const nodeTokenHash = hashSecret(nodeToken);
    const nodeKey = `EDGE-${generateSecret(8).toUpperCase()}`;

    const node = await prisma.$transaction(async (tx) => {
      await tx.storeNodeBootstrapToken.update({
        where: { id: bootstrap.id },
        data: { usedAt: now }
      });

      return tx.storeNode.create({
        data: {
          storeId: body.storeId,
          label: body.label,
          nodeKey,
          tokenHash: nodeTokenHash,
          status: "ONLINE",
          softwareVersion: body.softwareVersion,
          metadata: body.metadata,
          lastSeenAt: now
        }
      });
    });

    return reply.code(201).send({
      nodeId: node.id,
      storeId: node.storeId,
      nodeKey: node.nodeKey,
      nodeToken
    });
  });

  app.get("/cloud/nodes/:nodeId/commands", async (request, reply) => {
    const nodeId = String((request.params as { nodeId: string }).nodeId);
    const node = await requireNodeAuth(request, reply, { expectedNodeId: nodeId });
    if (!node) return;

    const query = commandQuerySchema.parse(request.query ?? {});
    const limit = query.limit ?? 50;
    const statuses = normalizeStatusFilter(query.status, ["PENDING"]);

    const commands = await prisma.syncCommand.findMany({
      where: {
        storeId: node.storeId,
        status: { in: statuses },
        domain: query.domain ? toDomainKey(query.domain) : undefined,
        OR: [{ nodeId: null }, { nodeId: node.id }]
      },
      orderBy: { issuedAt: "asc" },
      take: limit,
      include: {
        revisionRef: {
          select: {
            id: true,
            domain: true,
            revision: true,
            createdAt: true
          }
        }
      }
    });

    return { commands };
  });

  app.post("/cloud/commands/:id/ack", async (request, reply) => {
    const commandId = String((request.params as { id: string }).id);
    const body = ackCommandSchema.parse(request.body);
    const node = await requireNodeAuth(request, reply);
    if (!node) return;

    const command = await prisma.syncCommand.findUnique({
      where: { id: commandId },
      select: { id: true, storeId: true, nodeId: true, attempts: true }
    });
    if (!command || command.storeId !== node.storeId) {
      return reply.notFound("Command not found.");
    }
    if (command.nodeId && command.nodeId !== node.id) {
      return reply.forbidden("Command assigned to a different node.");
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.syncCommand.update({
        where: { id: command.id },
        data: {
          status: body.status,
          appliedRevision: body.appliedRevision ?? null,
          errorCode: body.errorCode ?? null,
          errorDetail: body.errorDetail ?? null,
          attempts: command.attempts + 1,
          acknowledgedAt: now
        }
      });

      await tx.syncCommandLog.create({
        data: {
          commandId: command.id,
          storeId: command.storeId,
          nodeId: node.id,
          status: body.status,
          errorCode: body.errorCode,
          errorDetail: body.errorDetail,
          output: body.output
        }
      });

      return next;
    });

    return updated;
  });

  app.get("/cloud/commands/:id/logs", async (request, reply) => {
    const commandId = String((request.params as { id: string }).id);
    const query = commandLogQuerySchema.parse(request.query ?? {});
    const limit = query.limit ?? 50;

    const command = await prisma.syncCommand.findUnique({
      where: { id: commandId },
      select: { id: true, storeId: true }
    });
    if (!command) return reply.notFound("Command not found.");

    const logs = await prisma.syncCommandLog.findMany({
      where: { commandId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        node: {
          select: {
            id: true,
            label: true,
            nodeKey: true
          }
        }
      }
    });

    return { command, logs };
  });

  app.post("/cloud/commands/:id/retry", async (request, reply) => {
    const commandId = String((request.params as { id: string }).id);
    const actor = resolveRequestUserId(request) || undefined;

    const command = await prisma.syncCommand.findUnique({
      where: { id: commandId },
      select: {
        id: true,
        storeId: true,
        status: true
      }
    });
    if (!command) return reply.notFound("Command not found.");

    const retried = await prisma.$transaction(async (tx) => {
      const next = await tx.syncCommand.update({
        where: { id: commandId },
        data: {
          status: "PENDING",
          errorCode: null,
          errorDetail: null,
          acknowledgedAt: null
        }
      });

      await tx.syncCommandLog.create({
        data: {
          commandId: command.id,
          storeId: command.storeId,
          status: "RETRY_QUEUED",
          output: { previousStatus: command.status, actor }
        }
      });

      return next;
    });

    return retried;
  });

  app.post("/cloud/nodes/:nodeId/heartbeat", async (request, reply) => {
    const nodeId = String((request.params as { nodeId: string }).nodeId);
    const body = heartbeatSchema.parse(request.body ?? {});
    const node = await requireNodeAuth(request, reply, { expectedNodeId: nodeId });
    if (!node) return;

    await prisma.storeNode.update({
      where: { id: node.id },
      data: {
        status: "ONLINE",
        lastSeenAt: new Date(),
        softwareVersion: body.softwareVersion ?? node.softwareVersion,
        metadata: body.metadata ?? node.metadata
      }
    });

    return { ok: true };
  });
}
