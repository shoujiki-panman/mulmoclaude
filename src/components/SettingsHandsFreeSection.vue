<template>
  <!-- Hands-free mode (Settings → Voice). Always shown: read-aloud and
       the camera work on any OS, unlike voice input above. Saved per
       device in localStorage, applied immediately — no Save button. -->
  <section class="border-t border-gray-200 pt-3 space-y-3" data-testid="settings-hands-free">
    <div>
      <h3 class="text-sm font-semibold text-gray-800">{{ t("settingsModal.voiceTab.handsFree.heading") }}</h3>
      <p class="text-xs text-gray-500 mt-0.5">{{ t("settingsModal.voiceTab.handsFree.description") }}</p>
    </div>
    <div v-for="option in options" :key="option.pref" class="flex items-start gap-3">
      <input
        :id="`settings-hands-free-${option.testId}`"
        type="checkbox"
        class="mt-1 h-4 w-4"
        :checked="option.checked"
        :disabled="option.disabled"
        :data-testid="`settings-hands-free-${option.testId}-input`"
        @change="onToggle(option.pref, $event)"
      />
      <label :for="`settings-hands-free-${option.testId}`" class="flex-1" :class="{ 'opacity-60': option.disabled }">
        <span class="block text-sm font-medium text-gray-800">{{ option.label }}</span>
        <span class="block text-xs text-gray-500 mt-0.5">{{ option.hint }}</span>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useHandsFreePrefs } from "../composables/useHandsFreePrefs";
import { isReadAloudSupported } from "../composables/useReplyReadAloud";
import { isCameraSupported } from "../composables/useCameraSnapshot";
import type { HandsFreePref } from "../utils/handsFree/prefs";

interface HandsFreeOption {
  pref: HandsFreePref;
  testId: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
}

const { t } = useI18n();
const handsFree = useHandsFreePrefs();
const readAloudSupported = isReadAloudSupported();
const cameraSupported = isCameraSupported();

const options = computed<HandsFreeOption[]>(() => [
  {
    pref: "autoSend",
    testId: "auto-send",
    checked: handsFree.autoSend.value,
    disabled: false,
    label: t("settingsModal.voiceTab.handsFree.autoSendLabel"),
    hint: t("settingsModal.voiceTab.handsFree.autoSendHint"),
  },
  {
    pref: "readAloud",
    testId: "read-aloud",
    checked: handsFree.readAloud.value,
    disabled: !readAloudSupported,
    label: t("settingsModal.voiceTab.handsFree.readAloudLabel"),
    hint: readAloudSupported ? t("settingsModal.voiceTab.handsFree.readAloudHint") : t("settingsModal.voiceTab.handsFree.readAloudUnsupported"),
  },
  {
    pref: "camera",
    testId: "camera",
    checked: handsFree.camera.value,
    disabled: !cameraSupported,
    label: t("settingsModal.voiceTab.handsFree.cameraLabel"),
    hint: cameraSupported ? t("settingsModal.voiceTab.handsFree.cameraHint") : t("settingsModal.voiceTab.handsFree.cameraUnsupported"),
  },
]);

function onToggle(pref: HandsFreePref, event: Event): void {
  if (event.target instanceof HTMLInputElement) handsFree.setPref(pref, event.target.checked);
}
</script>
