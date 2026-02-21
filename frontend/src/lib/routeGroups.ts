const BACK_OFFICE_ROUTES = [
  "/back-office",
  "/operations",
  "/settings",
  "/menu",
  "/inventory",
  "/staff",
  "/reports",
  "/owner",
  "/tables",
  "/online-orders"
];

export function routeGroup(pathname: string) {
  if (BACK_OFFICE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return "back-office";
  }
  if (pathname.startsWith("/pos/")) return "pos";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/kitchen")) return "kitchen";
  if (pathname.startsWith("/cash")) return "cash";
  if (pathname.startsWith("/timeclock")) return "timeclock";
  if (pathname.startsWith("/settlement")) return "settlement";
  return pathname;
}
