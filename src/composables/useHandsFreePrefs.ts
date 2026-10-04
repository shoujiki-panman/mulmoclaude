// Shared, localStorage-backed hands-free preferences. Module-level refs so a
// toggle in Settings reaches the chat input at once — no reload and no prop
// threading through App.vue. Keys and parsing: utils/handsFree/prefs.ts.

import { readonly, ref, type Ref } from "vue";
import { HANDS_FREE_STORAGE_KEYS, parseStoredHandsFreeFlag, serializeHandsFreeFlag, type HandsFreePref } from "../utils/handsFree/prefs";

type PrefRefs = Record<HandsFreePref, Ref<boolean>>;

let prefRefs: PrefRefs | null = null;

function readStored(pref: HandsFreePref): boolean {
  try {
    return parseStoredHandsFreeFlag(localStorage.getItem(HANDS_FREE_STORAGE_KEYS[pref]));
  } catch {
    // Storage blocked (private window, sandbox): behave as never opted in.
    return false;
  }
}

function sharedRefs(): PrefRefs {
  prefRefs ??= { autoSend: ref(readStored("autoSend")), readAloud: ref(readStored("readAloud")), camera: ref(readStored("camera")) };
  return prefRefs;
}

export function useHandsFreePrefs() {
  const refs = sharedRefs();

  function setPref(pref: HandsFreePref, value: boolean): void {
    refs[pref].value = value;
    try {
      localStorage.setItem(HANDS_FREE_STORAGE_KEYS[pref], serializeHandsFreeFlag(value));
    } catch {
      // Storage blocked: the choice still holds for this page load.
    }
  }

  return { autoSend: readonly(refs.autoSend), readAloud: readonly(refs.readAloud), camera: readonly(refs.camera), setPref };
}
