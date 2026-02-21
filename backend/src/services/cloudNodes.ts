import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

type NodeAuthOptions = {
  expectedNodeId?: string;
};

export type AuthenticatedNode = {
  id: string;
  storeId: string;
  label: string;
  nodeKey: string;
  status: string;
  softwareVersion: string | null;
  metadata: unknown;
  lastSeenAt: Date | null;
};

function getSingleHeader(value: string | string[] | undefined) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ? String(value[0]) : null;
  return String(value);
}

function getBearerToken(request: FastifyRequest) {
  const authHeader = getSingleHeader(request.headers.authorization);
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateSecret(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function extractNodeCredentials(request: FastifyRequest) {
  const nodeId =
    getSingleHeader(request.headers["x-node-id"]) ||
    String((request.params as { nodeId?: string })?.nodeId || "").trim() ||
    null;
  const token = getSingleHeader(request.headers["x-node-token"]) || getBearerToken(request);
  return { nodeId, token };
}

export async function requireNodeAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  options: NodeAuthOptions = {}
) {
  const { nodeId, token } = extractNodeCredentials(request);
  if (!nodeId || !token) {
    reply.unauthorized("Node credentials are required.");
    return null;
  }

  if (options.expectedNodeId && options.expectedNodeId !== nodeId) {
    reply.forbidden("Node mismatch.");
    return null;
  }

  const node = await prisma.storeNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      storeId: true,
      label: true,
      nodeKey: true,
      tokenHash: true,
      status: true,
      softwareVersion: true,
      metadata: true,
      lastSeenAt: true
    }
  });

  if (!node) {
    reply.unauthorized("Node not found.");
    return null;
  }

  const tokenHash = hashSecret(token);
  if (!safeEqual(node.tokenHash, tokenHash)) {
    reply.unauthorized("Invalid node token.");
    return null;
  }

  await prisma.storeNode.update({
    where: { id: node.id },
    data: {
      lastSeenAt: new Date(),
      status: "ONLINE"
    }
  });

  return {
    id: node.id,
    storeId: node.storeId,
    label: node.label,
    nodeKey: node.nodeKey,
    status: node.status,
    softwareVersion: node.softwareVersion,
    metadata: node.metadata,
    lastSeenAt: node.lastSeenAt
  } satisfies AuthenticatedNode;
}
