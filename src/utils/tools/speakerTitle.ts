// Heading for a chat entry in the stack view and the session sidebar.
// Text replies carry a fixed "You" / "Assistant" title from
// `makeTextResult`; once the user has named the assistant (Settings →
// Personality, or by asking in chat), its replies are headed with that
// name instead — the avatar first when there is one. Everything else
// keeps its own title.

import type { ToolResultComplete } from "gui-chat-protocol/vue";
import { isRecord } from "../types";

export interface SpeakerIdentity {
  name: string;
  avatar: string;
}

export function speakerTitle(result: ToolResultComplete, identity: SpeakerIdentity): string | undefined {
  if (result.toolName !== "text-response" || identity.name.length === 0) return result.title;
  const role = isRecord(result.data) ? result.data.role : undefined;
  if (role !== "assistant") return result.title;
  return identity.avatar.length > 0 ? `${identity.avatar} ${identity.name}` : identity.name;
}
