import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export const CLOUD_ACCOUNT_TYPES = ["OWNER", "RESELLER", "TENANT_ADMIN"] as const;
export type CloudAccountType = (typeof CLOUD_ACCOUNT_TYPES)[number];

type JwtCloudClaims = {
  sub?: string;
  kind?: string;
  accountType?: string;
  email?: string;
  resellerId?: string | null;
  tenantId?: string | null;
  iat?: number;
  exp?: number;
};

export type CloudAccountSession = {
  id: string;
  email: string;
  displayName: string | null;
  accountType: CloudAccountType;
  status: string;
  resellerId: string | null;
  tenantId: string | null;
  metadata: unknown;
  reseller?: { id: string; name: string; code: string } | null;
  tenant?: { id: string; name: string; slug: string } | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

function normalizeType(value: string | null | undefined): CloudAccountType | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "OWNER" || normalized === "RESELLER" || normalized === "TENANT_ADMIN") {
    return normalized;
  }
  return null;
}

export function signCloudAccountToken(app: FastifyInstance, account: CloudAccountSession) {
  return app.jwt.sign(
    {
      sub: account.id,
      kind: "cloud-account",
      accountType: account.accountType,
      email: account.email,
      resellerId: account.resellerId,
      tenantId: account.tenantId
    },
    { expiresIn: "12h" }
  );
}

export async function requireCloudAccount(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedTypes?: CloudAccountType[]
) {
  const token = getBearerToken(request);
  if (!token) {
    reply.unauthorized("Cloud token required.");
    return null;
  }

  let claims: JwtCloudClaims;
  try {
    claims = request.server.jwt.verify<JwtCloudClaims>(token);
  } catch {
    reply.unauthorized("Invalid cloud token.");
    return null;
  }

  if (claims.kind !== "cloud-account" || !claims.sub) {
    reply.unauthorized("Invalid cloud session.");
    return null;
  }

  const account = await prisma.cloudAccount.findUnique({
    where: { id: claims.sub },
    include: {
      reseller: { select: { id: true, name: true, code: true } },
      tenant: { select: { id: true, name: true, slug: true } }
    }
  });

  if (!account || account.status !== "ACTIVE") {
    reply.unauthorized("Cloud account not active.");
    return null;
  }

  const accountType = normalizeType(account.accountType);
  if (!accountType) {
    reply.forbidden("Unsupported cloud account type.");
    return null;
  }

  if (allowedTypes && !allowedTypes.includes(accountType)) {
    reply.forbidden("Insufficient cloud account scope.");
    return null;
  }

  return {
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
    lastLoginAt: account.lastLoginAt
  } satisfies CloudAccountSession;
}

export function canAccessReseller(account: CloudAccountSession, resellerId: string) {
  if (account.accountType === "OWNER") return true;
  if (account.accountType === "RESELLER" && account.resellerId === resellerId) return true;
  return false;
}

export function canAccessTenant(
  account: CloudAccountSession,
  tenant: { id: string; resellerId: string | null }
) {
  if (account.accountType === "OWNER") return true;
  if (account.accountType === "RESELLER") {
    return Boolean(account.resellerId && tenant.resellerId && account.resellerId === tenant.resellerId);
  }
  if (account.accountType === "TENANT_ADMIN" && account.tenantId === tenant.id) return true;
  return false;
}
