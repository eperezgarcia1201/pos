import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { autoCorrectText, detectLanguageForText } from "../services/spellcheck.js";

const autocorrectSchema = z.object({
  text: z.string(),
  language: z.enum(["en", "es", "mixed"]).optional()
});

export async function registerSpellcheckRoutes(app: FastifyInstance) {
  app.post("/spellcheck/autocorrect", async (request) => {
    const body = autocorrectSchema.parse(request.body);
    const language = body.language ?? detectLanguageForText(body.text);
    const result = await autoCorrectText(body.text, language);
    return {
      ...result,
      language
    };
  });
}
