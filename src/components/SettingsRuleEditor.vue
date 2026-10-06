<template>
  <div class="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3" data-testid="settings-rule-editor">
    <div class="space-y-1.5">
      <div class="text-xs font-semibold text-gray-600">{{ t("settingsRulesTab.editor.kindLabel") }}</div>
      <SegmentedControl v-model="kind" :options="kindOptions" :group-label="t('settingsRulesTab.editor.kindLabel')" testid="settings-rule-editor-kind" />
      <p class="text-xs text-gray-500">{{ t(`settingsRulesTab.kindHints.${kind}`) }}</p>
    </div>
    <div class="space-y-1">
      <label class="block text-xs font-semibold text-gray-600" for="settings-rule-editor-text">{{ t("settingsRulesTab.editor.textLabel") }}</label>
      <textarea
        id="settings-rule-editor-text"
        ref="textareaRef"
        v-model="text"
        rows="3"
        :maxlength="RULE_TEXT_MAX_CHARS"
        class="w-full px-3 py-2 text-sm rounded border border-gray-300 bg-white focus:outline-none focus:border-blue-400"
        :placeholder="t(`settingsRulesTab.editor.placeholder.${kind}`)"
        data-testid="settings-rule-editor-text"
        @keydown.stop
      ></textarea>
    </div>
    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        data-testid="settings-rule-editor-cancel"
        @click="emit('cancel')"
      >
        {{ t("common.cancel") }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        :disabled="text.trim().length === 0"
        data-testid="settings-rule-editor-save"
        @click="submit"
      >
        {{ t("settingsRulesTab.editor.save") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import SegmentedControl, { type SegmentedOption } from "./SegmentedControl.vue";
import { RULE_KINDS, RULE_TEXT_MAX_CHARS, type RuleKind } from "../types/assistantRules";

const { t } = useI18n();

const props = defineProps<{
  initialKind: RuleKind;
  initialText: string;
}>();

const emit = defineEmits<{
  save: [rule: { kind: RuleKind; text: string }];
  cancel: [];
}>();

const kind = ref<string>(props.initialKind);
const text = ref(props.initialText);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const kindOptions = computed<SegmentedOption[]>(() =>
  RULE_KINDS.map((value) => ({ value, label: t(`settingsRulesTab.kinds.${value}`), danger: value === "never" })),
);

function submit(): void {
  const chosen = RULE_KINDS.find((candidate) => candidate === kind.value);
  const trimmed = text.value.trim();
  if (chosen === undefined || trimmed.length === 0) return;
  emit("save", { kind: chosen, text: trimmed });
}

onMounted(() => {
  textareaRef.value?.focus();
});
</script>
