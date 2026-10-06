// The name and avatar the user gave the assistant (Settings → Personality,
// or just by asking in chat), for labelling its replies.
//
// One shared copy for the whole app: fetched once, then refetched whenever
// `config/personality.json` changes — the settings route and the
// `manageAssistant` chat tool both publish on that file's channel — and
// after a socket reconnect (events missed while down are not replayed).
// So every reply card picks up a rename in place, without each card
// fetching or subscribing on its own.

import { readonly, ref, type Ref } from "vue";
import { apiGet } from "../utils/api";
import { API_ROUTES } from "../config/apiRoutes";
import { WORKSPACE_FILES } from "../config/workspacePaths";
import { fileChannel } from "../config/pubsubChannels";
import { normalizePersonality } from "../types/personality";
import { usePubSub } from "./usePubSub";

export interface AssistantIdentity {
  /** Empty ⇒ no name set; callers fall back to the generic label. */
  name: string;
  avatar: string;
}

const identity = ref<AssistantIdentity>({ name: "", avatar: "" });
let started = false;

async function refresh(): Promise<void> {
  const response = await apiGet<unknown>(API_ROUTES.config.personality);
  // A failed fetch keeps the last known identity (initially: none).
  if (!response.ok) return;
  const { name, avatar } = normalizePersonality(response.data);
  identity.value = { name, avatar };
}

function start(): void {
  if (started) return;
  started = true;
  const { subscribe, onReconnect } = usePubSub();
  subscribe(fileChannel(WORKSPACE_FILES.personality), () => {
    void refresh();
  });
  onReconnect(() => {
    void refresh();
  });
  void refresh();
}

/** The shared, read-only identity. The first caller starts the fetch and
 *  the change subscription, which then live as long as the app. */
export function useAssistantIdentity(): { identity: Readonly<Ref<AssistantIdentity>> } {
  start();
  return { identity: readonly(identity) };
}
