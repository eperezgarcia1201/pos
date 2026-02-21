import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";

import { registerAccessControl } from "./services/accessControl.js";
import { registerAuthRoutes } from "./routers/auth.js";
import { registerUserRoutes } from "./routers/users.js";
import { registerRoleRoutes } from "./routers/roles.js";
import { registerMenuRoutes } from "./routers/menu.js";
import { registerTableRoutes } from "./routers/tables.js";
import { registerOrderRoutes } from "./routers/orders.js";
import { registerInventoryRoutes } from "./routers/inventory.js";
import { registerReportRoutes } from "./routers/reports.js";
import { registerDiscountRoutes } from "./routers/discounts.js";
import { registerTaxRoutes } from "./routers/taxes.js";
import { registerModifierRoutes } from "./routers/modifiers.js";
import { registerShiftRoutes } from "./routers/shifts.js";
import { registerTimeClockRoutes } from "./routers/timeclock.js";
import { registerCashRoutes } from "./routers/cash.js";
import { registerKitchenRoutes } from "./routers/kitchen.js";
import { registerVendorRoutes } from "./routers/vendors.js";
import { registerPurchaseOrderRoutes } from "./routers/purchaseOrders.js";
import { registerTableAreaRoutes } from "./routers/tableAreas.js";
import { registerKitchenStationRoutes } from "./routers/kitchenStations.js";
import { registerRecipeRoutes } from "./routers/recipes.js";
import { registerSettingRoutes } from "./routers/settings.js";
import { registerStationRoutes } from "./routers/stations.js";
import { registerHouseAccountRoutes } from "./routers/houseAccounts.js";
import { registerMenuItemPriceRoutes } from "./routers/menuItemPrices.js";
import { registerMaintenanceRoutes } from "./routers/maintenance.js";
import { registerIntegrationRoutes } from "./routers/integrations.js";
import { registerSpellcheckRoutes } from "./routers/spellcheck.js";
import { registerOwnerRoutes } from "./routers/owner.js";
import { registerCloudStoreRoutes } from "./routers/cloudStores.js";
import { registerCloudSyncRoutes } from "./routers/cloudSync.js";
import { registerCloudPlatformRoutes } from "./routers/cloudPlatform.js";
import { registerOnsiteConnectionRoutes } from "./routers/onsiteConnection.js";
import { registerHelpRoutes } from "./routers/help.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  // Fastify default JSON parser rejects empty bodies when content-type is JSON.
  // Replace it so POS clients can send empty JSON payloads to action endpoints.
  app.removeContentTypeParser("application/json");

  const safeJsonParser = (body: string | Buffer | undefined, done: (error: Error | null, value?: unknown) => void) => {
    const raw = typeof body === "string" ? body : body?.toString("utf8") ?? "";
    if (raw.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  };

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    safeJsonParser(body, done);
  });
  app.addContentTypeParser(/^application\/[\w.+-]+\+json$/, { parseAs: "string" }, (_request, body, done) => {
    safeJsonParser(body, done);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const pathLabel =
        firstIssue && firstIssue.path.length > 0 ? firstIssue.path.map((part) => String(part)).join(".") : "request";
      const issueMessage = firstIssue?.message || "Invalid request payload.";
      void reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `${pathLabel}: ${issueMessage}`
      });
      return;
    }

    request.log.error(error);

    if (reply.sent) return;
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? ((error as { statusCode: number }).statusCode || 500)
      : 500;
    void reply.code(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? "Internal Server Error" : "Request Error",
      message: error.message || "Unexpected server error."
    });
  });

  await app.register(helmet);
  await app.register(sensible);
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "dev-secret"
  });

  registerAccessControl(app);

  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerRoleRoutes(app);
  await registerMenuRoutes(app);
  await registerTableRoutes(app);
  await registerOrderRoutes(app);
  await registerInventoryRoutes(app);
  await registerReportRoutes(app);
  await registerDiscountRoutes(app);
  await registerTaxRoutes(app);
  await registerModifierRoutes(app);
  await registerShiftRoutes(app);
  await registerTimeClockRoutes(app);
  await registerCashRoutes(app);
  await registerKitchenRoutes(app);
  await registerVendorRoutes(app);
  await registerPurchaseOrderRoutes(app);
  await registerTableAreaRoutes(app);
  await registerKitchenStationRoutes(app);
  await registerRecipeRoutes(app);
  await registerSettingRoutes(app);
  await registerStationRoutes(app);
  await registerHouseAccountRoutes(app);
  await registerMenuItemPriceRoutes(app);
  await registerMaintenanceRoutes(app);
  await registerIntegrationRoutes(app);
  await registerSpellcheckRoutes(app);
  await registerOwnerRoutes(app);
  await registerCloudPlatformRoutes(app);
  await registerCloudStoreRoutes(app);
  await registerCloudSyncRoutes(app);
  await registerOnsiteConnectionRoutes(app);
  await registerHelpRoutes(app);

  return app;
}
