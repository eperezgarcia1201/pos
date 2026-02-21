import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { generateSecret, hashSecret } from "../services/cloudNodes.js";
import { resolveRequestUserId } from "../services/accessControl.js";

const ONSITE_IDENTITY_KEY = "onsite_identity";
const CLOUD_EDGE_LINK_KEY = "cloud_edge_link";

type OnsiteClaimState = {
  id: string;
  codeHash: string;
  issuedAt: string;
  expiresAt: string;
  usedAt?: string | null;
  issuedBy?: string | null;
};

type OnsiteFinalizeState = {
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  usedAt?: string | null;
};

type OnsiteCloudLinkState = {
  cloudStoreId: string;
  cloudStoreCode: string;
  cloudNodeId: string;
  nodeKey: string;
  nodeToken: string;
  cloudBaseUrl?: string | null;
  linkedAt: string;
  linkedBy?: string | null;
};

type OnsiteIdentityState = {
  serverUid: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  claim?: OnsiteClaimState | null;
  finalize?: OnsiteFinalizeState | null;
  cloudLink?: OnsiteCloudLinkState | null;
};

const onsiteHeartbeatSchema = z.object({
  cloudBaseUrl: z.string().url().optional()
});

const createClaimSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  expiresInMinutes: z.number().int().min(3).max(120).optional()
});

const consumeClaimSchema = z.object({
  claimId: z.string().min(6).max(120),
  claimCode: z.string().min(4).max(64)
});

const finalizeClaimSchema = z.object({
  finalizeToken: z.string().min(12).max(256),
  cloudStoreId: z.string().min(1),
  cloudStoreCode: z.string().min(1),
  cloudNodeId: z.string().min(1),
  nodeKey: z.string().min(2).max(120),
  nodeToken: z.string().min(8),
  cloudBaseUrl: z.string().url().optional(),
  linkedBy: z.string().max(120).optional()
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeClaimCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatClaimCode(value: string) {
  const normalized = normalizeClaimCode(value).slice(0, 8);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function generateClaimCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let index = 0; index < 8; index += 1) {
    raw += alphabet[bytes[index] % alphabet.length];
  }
  return formatClaimCode(raw);
}

function createServerUid() {
  return `srv_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function parseOnsiteIdentity(value: unknown): OnsiteIdentityState | null {
  if (!isRecord(value)) return null;
  const serverUid = typeof value.serverUid === "string" ? value.serverUid.trim() : "";
  if (!serverUid) return null;

  const createdAt = typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : createdAt;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim() : "Onsite Store Server";

  const claim = isRecord(value.claim)
    ? {
        id: typeof value.claim.id === "string" ? value.claim.id : "",
        codeHash: typeof value.claim.codeHash === "string" ? value.claim.codeHash : "",
        issuedAt: typeof value.claim.issuedAt === "string" ? value.claim.issuedAt : "",
        expiresAt: typeof value.claim.expiresAt === "string" ? value.claim.expiresAt : "",
        usedAt: typeof value.claim.usedAt === "string" ? value.claim.usedAt : null,
        issuedBy: typeof value.claim.issuedBy === "string" ? value.claim.issuedBy : null
      }
    : null;

  const finalize = isRecord(value.finalize)
    ? {
        tokenHash: typeof value.finalize.tokenHash === "string" ? value.finalize.tokenHash : "",
        issuedAt: typeof value.finalize.issuedAt === "string" ? value.finalize.issuedAt : "",
        expiresAt: typeof value.finalize.expiresAt === "string" ? value.finalize.expiresAt : "",
        usedAt: typeof value.finalize.usedAt === "string" ? value.finalize.usedAt : null
      }
    : null;

  const cloudLink = isRecord(value.cloudLink)
    ? {
        cloudStoreId: typeof value.cloudLink.cloudStoreId === "string" ? value.cloudLink.cloudStoreId : "",
        cloudStoreCode: typeof value.cloudLink.cloudStoreCode === "string" ? value.cloudLink.cloudStoreCode : "",
        cloudNodeId: typeof value.cloudLink.cloudNodeId === "string" ? value.cloudLink.cloudNodeId : "",
        nodeKey: typeof value.cloudLink.nodeKey === "string" ? value.cloudLink.nodeKey : "",
        nodeToken: typeof value.cloudLink.nodeToken === "string" ? value.cloudLink.nodeToken : "",
        cloudBaseUrl: typeof value.cloudLink.cloudBaseUrl === "string" ? value.cloudLink.cloudBaseUrl : null,
        linkedAt: typeof value.cloudLink.linkedAt === "string" ? value.cloudLink.linkedAt : "",
        linkedBy: typeof value.cloudLink.linkedBy === "string" ? value.cloudLink.linkedBy : null
      }
    : null;

  return {
    serverUid,
    label,
    createdAt,
    updatedAt,
    claim: claim && claim.id && claim.codeHash ? claim : null,
    finalize: finalize && finalize.tokenHash ? finalize : null,
    cloudLink: cloudLink && cloudLink.cloudStoreId && cloudLink.cloudNodeId ? cloudLink : null
  };
}

async function loadStoreHints() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "store" }, select: { value: true } });
  const value = isRecord(setting?.value) ? setting.value : {};
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const address = typeof value.address === "string" ? value.address.trim() : "";
  const timezone = typeof value.timezone === "string" ? value.timezone.trim() : "";
  return {
    storeName: name || null,
    address: address || null,
    timezone: timezone || "America/Chicago"
  };
}

async function saveIdentity(identity: OnsiteIdentityState) {
  await prisma.appSetting.upsert({
    where: { key: ONSITE_IDENTITY_KEY },
    update: { value: identity },
    create: { key: ONSITE_IDENTITY_KEY, value: identity }
  });
}

async function getIdentityIfExists() {
  const existing = await prisma.appSetting.findUnique({ where: { key: ONSITE_IDENTITY_KEY } });
  return parseOnsiteIdentity(existing?.value);
}

async function getOrCreateIdentity() {
  const existing = await prisma.appSetting.findUnique({ where: { key: ONSITE_IDENTITY_KEY } });
  const parsed = parseOnsiteIdentity(existing?.value);
  if (parsed) return parsed;

  const now = new Date().toISOString();
  const identity: OnsiteIdentityState = {
    serverUid: createServerUid(),
    label: "Onsite Store Server",
    createdAt: now,
    updatedAt: now,
    claim: null,
    finalize: null,
    cloudLink: null
  };
  await saveIdentity(identity);
  return identity;
}

function publicIdentity(identity: OnsiteIdentityState) {
  const claimActive =
    Boolean(identity.claim) &&
    !identity.claim?.usedAt &&
    new Date(identity.claim?.expiresAt || 0).getTime() > Date.now();

  return {
    serverUid: identity.serverUid,
    label: identity.label,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    claim: identity.claim
      ? {
          id: identity.claim.id,
          issuedAt: identity.claim.issuedAt,
          expiresAt: identity.claim.expiresAt,
          usedAt: identity.claim.usedAt || null,
          active: claimActive
        }
      : null,
    cloudLink: identity.cloudLink
      ? {
          cloudStoreId: identity.cloudLink.cloudStoreId,
          cloudStoreCode: identity.cloudLink.cloudStoreCode,
          cloudNodeId: identity.cloudLink.cloudNodeId,
          nodeKey: identity.cloudLink.nodeKey,
          linkedAt: identity.cloudLink.linkedAt,
          linkedBy: identity.cloudLink.linkedBy || null,
          cloudBaseUrl: identity.cloudLink.cloudBaseUrl || null
        }
      : null
  };
}

export async function registerOnsiteConnectionRoutes(app: FastifyInstance) {
  const pushHeartbeatToCloud = async (identity: OnsiteIdentityState, cloudBaseUrlOverride?: string) => {
    const cloudLink = identity.cloudLink;
    if (!cloudLink) {
      throw new Error("Onsite server is not linked to cloud yet.");
    }

    const cloudBaseUrl =
      normalizeBaseUrl(cloudBaseUrlOverride?.trim() || "") ||
      normalizeBaseUrl(cloudLink.cloudBaseUrl?.trim() || "") ||
      normalizeBaseUrl(process.env.CLOUD_BASE_URL?.trim() || "");
    if (!cloudBaseUrl) {
      throw new Error("Cloud base URL is missing. Re-link onsite server or set CLOUD_BASE_URL.");
    }

    const endpoint = `${cloudBaseUrl}/cloud/nodes/${encodeURIComponent(cloudLink.cloudNodeId)}/heartbeat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-node-id": cloudLink.cloudNodeId,
          "x-node-token": cloudLink.nodeToken
        },
        body: JSON.stringify({
          softwareVersion: process.env.APP_VERSION || process.env.npm_package_version || "onsite-server",
          metadata: {
            onsiteServerUid: identity.serverUid,
            onsiteServerLabel: identity.label,
            linkedAt: cloudLink.linkedAt
          }
        }),
        signal: controller.signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Cloud heartbeat failed (${response.status}).`);
      }

      return {
        ok: true,
        cloudBaseUrl,
        cloudNodeId: cloudLink.cloudNodeId,
        nodeKey: cloudLink.nodeKey,
        response: text ? JSON.parse(text) : { ok: true },
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Cloud heartbeat timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  app.get("/onsite/identity", async () => {
    const identity = await getOrCreateIdentity();
    const hints = await loadStoreHints();
    return {
      ...publicIdentity(identity),
      storeHints: hints
    };
  });

  app.post("/onsite/claim/create", async (request) => {
    const body = createClaimSchema.parse(request.body ?? {});
    const identity = await getOrCreateIdentity();
    const actor = resolveRequestUserId(request) || null;
    const now = new Date();

    const claimId = `clm_${generateSecret(10)}`;
    const claimCode = generateClaimCode();
    const claimCodeHash = hashSecret(`${claimId}:${normalizeClaimCode(claimCode)}`);
    const expiresInMinutes = body.expiresInMinutes ?? 20;
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);

    const next: OnsiteIdentityState = {
      ...identity,
      label: body.label?.trim() || identity.label,
      updatedAt: now.toISOString(),
      claim: {
        id: claimId,
        codeHash: claimCodeHash,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        usedAt: null,
        issuedBy: actor
      },
      finalize: null
    };

    await saveIdentity(next);

    return {
      serverUid: next.serverUid,
      serverLabel: next.label,
      claimId,
      claimCode,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  });

  app.post("/onsite/public/claim/consume", async (request, reply) => {
    const body = consumeClaimSchema.parse(request.body ?? {});
    const identity = await getOrCreateIdentity();
    const claim = identity.claim;

    if (!claim || claim.id !== body.claimId) {
      return reply.unauthorized("Invalid claim id or claim code.");
    }

    if (claim.usedAt) {
      return reply.unauthorized("Claim code already used.");
    }

    const now = new Date();
    if (new Date(claim.expiresAt).getTime() <= now.getTime()) {
      return reply.unauthorized("Claim code expired.");
    }

    const expectedHash = hashSecret(`${body.claimId}:${normalizeClaimCode(body.claimCode)}`);
    if (expectedHash !== claim.codeHash) {
      return reply.unauthorized("Invalid claim id or claim code.");
    }

    const finalizeToken = `fin_${generateSecret(24)}`;
    const finalizeExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const next: OnsiteIdentityState = {
      ...identity,
      updatedAt: now.toISOString(),
      claim: {
        ...claim,
        usedAt: now.toISOString()
      },
      finalize: {
        tokenHash: hashSecret(finalizeToken),
        issuedAt: now.toISOString(),
        expiresAt: finalizeExpiresAt.toISOString(),
        usedAt: null
      }
    };

    await saveIdentity(next);
    const hints = await loadStoreHints();

    return {
      serverUid: next.serverUid,
      serverLabel: next.label,
      storeNameHint: hints.storeName,
      addressHint: hints.address,
      timezoneHint: hints.timezone,
      finalizeToken,
      finalizeExpiresAt: finalizeExpiresAt.toISOString()
    };
  });

  app.post("/onsite/public/claim/finalize", async (request, reply) => {
    const body = finalizeClaimSchema.parse(request.body ?? {});
    const identity = await getOrCreateIdentity();
    const finalize = identity.finalize;

    if (!finalize) {
      return reply.badRequest("Finalize session not available. Create and consume a new claim code.");
    }
    if (finalize.usedAt) {
      return reply.badRequest("Finalize token already used.");
    }
    if (new Date(finalize.expiresAt).getTime() <= Date.now()) {
      return reply.badRequest("Finalize token expired.");
    }

    const tokenHash = hashSecret(body.finalizeToken);
    if (tokenHash !== finalize.tokenHash) {
      return reply.unauthorized("Invalid finalize token.");
    }

    const now = new Date().toISOString();
    const cloudLink: OnsiteCloudLinkState = {
      cloudStoreId: body.cloudStoreId,
      cloudStoreCode: body.cloudStoreCode,
      cloudNodeId: body.cloudNodeId,
      nodeKey: body.nodeKey,
      nodeToken: body.nodeToken,
      cloudBaseUrl: body.cloudBaseUrl || null,
      linkedAt: now,
      linkedBy: body.linkedBy || null
    };

    const next: OnsiteIdentityState = {
      ...identity,
      updatedAt: now,
      finalize: {
        ...finalize,
        usedAt: now
      },
      cloudLink
    };

    await Promise.all([
      saveIdentity(next),
      prisma.appSetting.upsert({
        where: { key: CLOUD_EDGE_LINK_KEY },
        update: { value: cloudLink },
        create: { key: CLOUD_EDGE_LINK_KEY, value: cloudLink }
      })
    ]);

    return {
      ok: true,
      serverUid: next.serverUid,
      cloudLink: {
        cloudStoreId: cloudLink.cloudStoreId,
        cloudStoreCode: cloudLink.cloudStoreCode,
        cloudNodeId: cloudLink.cloudNodeId,
        nodeKey: cloudLink.nodeKey,
        linkedAt: cloudLink.linkedAt,
        cloudBaseUrl: cloudLink.cloudBaseUrl
      }
    };
  });

  app.get("/onsite/cloud/link", async () => {
    const identity = await getOrCreateIdentity();
    if (!identity.cloudLink) {
      return {
        linked: false,
        serverUid: identity.serverUid,
        message: "Onsite server is not linked to cloud."
      };
    }

    return {
      linked: true,
      serverUid: identity.serverUid,
      cloudLink: {
        cloudStoreId: identity.cloudLink.cloudStoreId,
        cloudStoreCode: identity.cloudLink.cloudStoreCode,
        cloudNodeId: identity.cloudLink.cloudNodeId,
        nodeKey: identity.cloudLink.nodeKey,
        linkedAt: identity.cloudLink.linkedAt,
        linkedBy: identity.cloudLink.linkedBy || null,
        cloudBaseUrl: identity.cloudLink.cloudBaseUrl || null
      }
    };
  });

  app.post("/onsite/cloud/heartbeat", async (request, reply) => {
    const body = onsiteHeartbeatSchema.parse(request.body ?? {});
    const identity = await getOrCreateIdentity();
    if (!identity.cloudLink) {
      return reply.badRequest("Onsite server is not linked to cloud yet.");
    }

    try {
      return await pushHeartbeatToCloud(identity, body.cloudBaseUrl);
    } catch (error) {
      return reply.badGateway(error instanceof Error ? error.message : "Cloud heartbeat failed.");
    }
  });

  const intervalSeconds = Math.max(15, Number(process.env.ONSITE_HEARTBEAT_INTERVAL_SEC || 60));
  const autoHeartbeatEnabled = process.env.ONSITE_HEARTBEAT_DISABLED !== "1";
  let heartbeatTimer: NodeJS.Timeout | null = null;

  if (autoHeartbeatEnabled) {
    app.addHook("onReady", async () => {
      const run = async () => {
        const identity = await getIdentityIfExists();
        if (!identity) return;
        if (!identity.cloudLink) return;
        try {
          await pushHeartbeatToCloud(identity);
        } catch (error) {
          app.log.debug(
            {
              err: error instanceof Error ? error.message : String(error),
              nodeKey: identity.cloudLink?.nodeKey
            },
            "Onsite auto-heartbeat skipped/failed"
          );
        }
      };

      heartbeatTimer = setInterval(() => {
        void run();
      }, intervalSeconds * 1000);

      void run();
    });

    app.addHook("onClose", async () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      heartbeatTimer = null;
    });
  }
}
