// The enforced half of Settings → Rules. A MulmoClaude plugin or user
// MCP server the user set to "never" is removed before the session
// starts — from the role's plugin list (which drives the plugin prompt
// sections, `--allowedTools` and the MCP child's tool list alike) and
// from the MCP config handed to the CLI — so the model never sees its
// tools. "ask" is advisory and lives in the rules prompt section
// (`buildRulesSection`); "allow" is the default and changes nothing.

import type { Role } from "../../src/config/roles.js";
import { MCP_SERVER_PERMISSION_PREFIX, pluginPermissionFor, type AssistantRules } from "../../src/types/assistantRules.js";

type PluginPermissionMap = AssistantRules["plugins"];

/** The role with every "never" plugin dropped from `availablePlugins`.
 *  Returns the same object when nothing is blocked. */
export function withoutBlockedPlugins(role: Role, plugins: PluginPermissionMap): Role {
  const isBlocked = (name: string): boolean => pluginPermissionFor(plugins, name) === "never";
  if (!role.availablePlugins.some(isBlocked)) return role;
  return { ...role, availablePlugins: role.availablePlugins.filter((name) => !isBlocked(name)) };
}

/** The user MCP server map without the servers set to "never". */
export function withoutBlockedMcpServers<T>(servers: Readonly<Record<string, T>>, plugins: PluginPermissionMap): Record<string, T> {
  return Object.fromEntries(
    Object.entries(servers).filter(([serverId]) => pluginPermissionFor(plugins, `${MCP_SERVER_PERMISSION_PREFIX}${serverId}`) !== "never"),
  );
}
