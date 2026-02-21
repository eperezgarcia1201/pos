export type PermissionMap = Record<string, boolean>;
export type PermissionOverrideValue = "allow" | "deny";
export type PermissionOverrideMap = Record<string, PermissionOverrideValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizePermissionMap(value: unknown): PermissionMap {
  if (!isRecord(value)) return {};
  const next: PermissionMap = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "boolean") continue;
    next[key] = raw;
  }
  return next;
}

export function normalizePermissionOverrides(value: unknown): PermissionOverrideMap {
  if (!isRecord(value)) return {};
  const next: PermissionOverrideMap = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw !== "allow" && raw !== "deny") continue;
    next[key] = raw;
  }
  return next;
}

export function applyPermissionOverrides(
  rolePermissionsValue: unknown,
  overrideValue: unknown
): PermissionMap {
  const rolePermissions = normalizePermissionMap(rolePermissionsValue);
  const overrides = normalizePermissionOverrides(overrideValue);
  if (Object.keys(overrides).length === 0) return rolePermissions;

  const effective: PermissionMap = { ...rolePermissions };
  for (const [key, value] of Object.entries(overrides)) {
    effective[key] = value === "allow";
  }
  return effective;
}
