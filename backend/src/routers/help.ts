import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildServerConnectionGuide, serverConnectionGuide } from "../help/serverConnectionGuide.js";

export async function registerHelpRoutes(app: FastifyInstance) {
  app.get("/help", async () => {
    return {
      guides: [
        {
          id: serverConnectionGuide.id,
          path: "/help/server-connection",
          title: serverConnectionGuide.title,
          summary: serverConnectionGuide.summary,
          updatedAt: serverConnectionGuide.updatedAt
        }
      ]
    };
  });

  app.get("/help/server-connection", async (request) => {
    const query = z
      .object({
        internal: z.coerce.boolean().optional()
      })
      .parse(request.query ?? {});

    const internalEnabled = process.env.EXPOSE_INTERNAL_HELP === "1" || process.env.NODE_ENV !== "production";
    const includeInternal = Boolean(query.internal) && internalEnabled;
    return buildServerConnectionGuide({ includeInternal });
  });
}
