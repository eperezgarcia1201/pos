import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";
import { applyPermissionOverrides, type PermissionMap } from "./permissions.js";

type Rule = {
  match: (path: string) => boolean;
  any?: string[];
  perm?: string;
};

type JwtClaims = {
  sub?: string;
  roleId?: string;
  username?: string;
  iat?: number;
  exp?: number;
};

const readRules: Rule[] = [
  {
    match: (path) => path.startsWith("/settings/services") || path.startsWith("/settings/store"),
    any: ["orders", "settings"]
  },
  {
    match: (path) =>
      path.startsWith("/menu") ||
      path.startsWith("/modifiers") ||
      path.startsWith("/taxes") ||
      path.startsWith("/menu-item-prices") ||
      path.startsWith("/recipes") ||
      path.startsWith("/kitchen-stations") ||
      path.startsWith("/discounts"),
    any: ["orders", "menu"]
  },
  { match: (path) => path.startsWith("/integrations"), any: ["orders", "settings"] },
  {
    match: (path) => path.startsWith("/tables") || path.startsWith("/table-areas"),
    any: ["orders", "tables"]
  },
  { match: (path) => path.startsWith("/orders") || path.startsWith("/kitchen"), perm: "orders" },
  { match: (path) => path.startsWith("/cash"), perm: "cash" },
  { match: (path) => path.startsWith("/reports"), perm: "reports" },
  { match: (path) => path.startsWith("/owner"), perm: "reports" },
  { match: (path) => path.startsWith("/cloud"), perm: "settings" },
  { match: (path) => path.startsWith("/onsite"), perm: "settings" },
  {
    match: (path) =>
      path.startsWith("/inventory") ||
      path.startsWith("/vendors") ||
      path.startsWith("/purchase-orders"),
    perm: "inventory"
  },
  { match: (path) => path.startsWith("/users") || path.startsWith("/roles"), perm: "users" },
  {
    match: (path) =>
      path.startsWith("/settings") ||
      path.startsWith("/stations") ||
      path.startsWith("/maintenance"),
    perm: "settings"
  },
  { match: (path) => path.startsWith("/timeclock") || path.startsWith("/shifts"), perm: "timeclock" },
  { match: (path) => path.startsWith("/house-accounts"), perm: "cash" }
];

const writeRules: Rule[] = [
  {
    match: (path) =>
      path.startsWith("/menu") ||
      path.startsWith("/modifiers") ||
      path.startsWith("/taxes") ||
      path.startsWith("/menu-item-prices") ||
      path.startsWith("/recipes") ||
      path.startsWith("/kitchen-stations") ||
      path.startsWith("/discounts"),
    perm: "menu"
  },
  { match: (path) => path.startsWith("/integrations"), any: ["orders", "settings"] },
  { match: (path) => path.startsWith("/tables") || path.startsWith("/table-areas"), perm: "tables" },
  { match: (path) => path.startsWith("/orders") || path.startsWith("/kitchen"), perm: "orders" },
  { match: (path) => path.startsWith("/cash"), perm: "cash" },
  { match: (path) => path.startsWith("/reports"), perm: "reports" },
  { match: (path) => path.startsWith("/owner"), perm: "reports" },
  { match: (path) => path.startsWith("/cloud"), perm: "settings" },
  { match: (path) => path.startsWith("/onsite"), perm: "settings" },
  {
    match: (path) =>
      path.startsWith("/inventory") ||
      path.startsWith("/vendors") ||
      path.startsWith("/purchase-orders"),
    perm: "inventory"
  },
  { match: (path) => path.startsWith("/users") || path.startsWith("/roles"), perm: "users" },
  {
    match: (path) =>
      path.startsWith("/settings") ||
      path.startsWith("/stations") ||
      path.startsWith("/maintenance"),
    perm: "settings"
  },
  { match: (path) => path.startsWith("/timeclock") || path.startsWith("/shifts"), perm: "timeclock" },
  { match: (path) => path.startsWith("/house-accounts"), perm: "cash" }
];

const allowUnauthed = (path: string) =>
  path === "/" ||
  path === "/health" ||
  path.startsWith("/auth") ||
  path.startsWith("/settings/services") ||
  path.startsWith("/settings/store") ||
  path.startsWith("/settings/kitchen_display") ||
  path.startsWith("/spellcheck") ||
  path.startsWith("/kitchen") ||
  path.startsWith("/integrations/doordash/webhooks") ||
  path.startsWith("/integrations/doordash/menu") ||
  path.startsWith("/cloud/auth") ||
  path.startsWith("/cloud/platform") ||
  path.startsWith("/onsite/public") ||
  path === "/cloud/nodes/register" ||
  /^\/cloud\/nodes\/[^/]+\/commands$/.test(path) ||
  /^\/cloud\/nodes\/[^/]+\/heartbeat$/.test(path) ||
  /^\/cloud\/commands\/[^/]+\/ack$/.test(path);

function getHeaderUserId(request: FastifyRequest): string | null {
  const header = request.headers["x-user-id"];
  const userId = Array.isArray(header) ? header[0] : header;
  return userId ? String(userId) : null;
}

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const parts = value.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1] || null;
}

export function resolveRequestUserId(request: FastifyRequest): string | null {
  const token = getBearerToken(request);
  if (token) {
    try {
      const decoded = request.server.jwt.verify<JwtClaims>(token);
      if (decoded?.sub) {
        return String(decoded.sub);
      }
    } catch {
      // Fall through to legacy x-user-id header.
    }
  }
  return getHeaderUserId(request);
}

async function loadPermissions(request: FastifyRequest): Promise<PermissionMap | null> {
  const userId = resolveRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      permissionOverrides: true,
      role: { select: { permissions: true } }
    }
  });
  if (!user) return null;
  return applyPermissionOverrides(user.role?.permissions, user.permissionOverrides);
}

function hasPermission(permissions: PermissionMap, perm?: string, any?: string[]) {
  if (permissions.all) return true;
  if (perm) return Boolean(permissions[perm]);
  if (any) return any.some((key) => permissions[key]);
  return false;
}

async function authorize(request: FastifyRequest, reply: FastifyReply) {
  const path = (request.raw.url || request.url || "").split("?")[0];
  if (allowUnauthed(path)) return;
  const permissions = await loadPermissions(request);
  if (!permissions) {
    return reply.unauthorized("Access code required");
  }

  const method = request.method.toUpperCase();
  const rules = method === "GET" ? readRules : writeRules;

  for (const rule of rules) {
    if (!rule.match(path)) continue;
    if (hasPermission(permissions, rule.perm, rule.any)) return;
    return reply.forbidden("Insufficient permissions");
  }
}

export function registerAccessControl(app: FastifyInstance) {
  app.addHook("preHandler", authorize);
}
