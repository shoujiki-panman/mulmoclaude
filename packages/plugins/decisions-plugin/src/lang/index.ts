// Plugin-local i18n — same pattern as bookmarks / spotify. Locales without
// a table fall back to English.

import { createUseT } from "gui-chat-protocol/vue";
import en from "./en";
import ja from "./ja";

const MESSAGES = { en, ja } as const;

export const useT = createUseT(MESSAGES);
