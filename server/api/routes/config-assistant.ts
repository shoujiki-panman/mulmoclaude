// HTTP routes for the assistant profile in Settings:
//
//   GET /api/config/personality  → Personality
//   PUT /api/config/personality  → replace it → Personality (normalised)
//   GET /api/config/rules        → AssistantRules
//   PUT /api/config/rules        → replace them → AssistantRules (normalised)
//   GET /api/config/rules/catalog → { plugins, mcpServers } the
//                                   plugin-permission list offers
//
// Each PUT replaces the whole value — the tab always holds the full
// object, so there is no merge to get wrong. The envelope is checked
// strictly (a malformed body is a 400, never "reset to defaults"); the
// values inside are normalised by the shared `normalize*` helpers, the
// same ones the prompt builder reads through.

import { Router, type Request } from "express";
import { API_ROUTES } from "../../../src/config/apiRoutes.js";
import type { Personality } from "../../../src/types/personality.js";
import type { AssistantRules } from "../../../src/types/assistantRules.js";
import { readPersonality, writePersonality } from "../../utils/files/personality-io.js";
import { readRules, writeRules } from "../../utils/files/rules-io.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, type ApiResponse } from "../../utils/httpError.js";
import { isRecord } from "../../utils/types.js";
import { log } from "../../system/logger/index.js";
import { loadMcpConfig } from "../../system/config.js";
import { listRoleGatedToolNames } from "../../agent/activeTools.js";

const router = Router();

/** Every field present with the right container type. Values inside
 *  are left to `normalizePersonality`. */
export function isPersonalityPutBody(body: unknown): boolean {
  if (!isRecord(body)) return false;
  return typeof body.tone === "string" && isRecord(body.traits) && typeof body.customInstructions === "string";
}

/** `rules` must be a list; `plugins`, when sent, a map. */
export function isRulesPutBody(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (!Array.isArray(body.rules)) return false;
  return body.plugins === undefined || isRecord(body.plugins);
}

router.get(
  API_ROUTES.config.personality,
  asyncHandler<Request, ApiResponse<Personality>>("config-assistant", "failed to read personality", async (_req, res) => {
    res.json(await readPersonality());
  }),
);

router.put(
  API_ROUTES.config.personality,
  asyncHandler<Request, ApiResponse<Personality>>("config-assistant", "failed to save personality", async (req, res) => {
    if (!isPersonalityPutBody(req.body)) {
      log.warn("config-assistant", "PUT personality: invalid payload");
      badRequest(res, "expected { tone, traits, customInstructions }");
      return;
    }
    const saved = await writePersonality(req.body);
    log.info("config-assistant", "PUT personality: ok", { tone: saved.tone });
    res.json(saved);
  }),
);

router.get(
  API_ROUTES.config.rules,
  asyncHandler<Request, ApiResponse<AssistantRules>>("config-assistant", "failed to read rules", async (_req, res) => {
    res.json(await readRules());
  }),
);

router.put(
  API_ROUTES.config.rules,
  asyncHandler<Request, ApiResponse<AssistantRules>>("config-assistant", "failed to save rules", async (req, res) => {
    if (!isRulesPutBody(req.body)) {
      log.warn("config-assistant", "PUT rules: invalid payload");
      badRequest(res, "expected { rules: [...], plugins?: { ... } }");
      return;
    }
    const saved = await writeRules(req.body);
    log.info("config-assistant", "PUT rules: ok", { rules: saved.rules.length, plugins: Object.keys(saved.plugins).length });
    res.json(saved);
  }),
);

/** What a plugin permission can be set on: every tool a role can grant
 *  (so "never" can withhold it) and every configured user MCP server. */
export interface RulesCatalog {
  plugins: string[];
  mcpServers: string[];
}

router.get(
  API_ROUTES.config.rulesCatalog,
  asyncHandler<Request, ApiResponse<RulesCatalog>>("config-assistant", "failed to list plugins", async (_req, res) => {
    res.json({ plugins: listRoleGatedToolNames(), mcpServers: Object.keys(loadMcpConfig().mcpServers).sort() });
  }),
);

export default router;
