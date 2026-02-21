import type { SessionUser } from "./session";

export function hasPermission(user: SessionUser | null | undefined, permission: string) {
  if (!user?.permissions) return false;
  if (user.permissions.all) return true;
  return Boolean(user.permissions[permission]);
}

export function hasAnyPermission(user: SessionUser | null | undefined, permissions: string[]) {
  if (!permissions.length) return true;
  if (!user?.permissions) return false;
  if (user.permissions.all) return true;
  return permissions.some((perm) => Boolean(user.permissions?.[perm]));
}
