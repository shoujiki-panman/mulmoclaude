<template>
  <div class="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3" data-testid="settings-rule-editor">
    <div class="space-y-1">
      <label class="block text-xs font-semibold text-gray-600" :for="textareaId">{{ t("settingsRulesTab.editor.textLabel") }}</label>
      <textarea
        :id="textareaId"
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
    <!-- dots' four modes, most autonomous first; each option explains itself. -->
    <fieldset class="space-y-1.5">
      <legend class="mb-1.5 text-xs font-semibold text-gray-600">{{ t("settingsRulesTab.editor.kindLabel") }}</legend>
      <label
        v-for="option in RULE_KINDS"
        :key="option"
        class="flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2 cursor-pointer"
        :class="kind === option ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-200 hover:border-gray-300'"
        :data-testid="`settings-rule-editor-kind-${option}`"
      >
        <input v-model="kind" type="radio" class="mt-0.5 h-4 w-4 shrink-0" :name="radioName" :value="option" @keydown.stop />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-gray-800">{{ t(`settingsRulesTab.kinds.${option}`) }}</span>
          <span class="block text-xs text-gray-500">{{ t(`settingsRulesTab.kindHints.${option}`) }}</span>
        </span>
      </label>
    </fieldset>
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
import { onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
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

// Per-instance ids so the label and the radio group stay paired even if
// two editors are ever on screen together.
const uid = useId();
const textareaId = `settings-rule-editor-text-${uid}`;
const radioName = `settings-rule-editor-kind-${uid}`;

const kind = ref<RuleKind>(props.initialKind);
const text = ref(props.initialText);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function submit(): void {
  const trimmed = text.value.trim();
  if (trimmed.length === 0) return;
  emit("save", { kind: kind.value, text: trimmed });
}

onMounted(() => {
  textareaRef.value?.focus();
});
</script>
