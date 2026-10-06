<template>
  <!-- One row of mutually-exclusive buttons — the click-once replacement
       for a stepped slider with tick dots (Settings → Personality /
       Rules). Radio semantics: the group is labelled, each button says
       whether it is the checked one. -->
  <div class="inline-flex shrink-0 rounded border border-gray-300 overflow-hidden" role="radiogroup" :aria-label="groupLabel" :data-testid="testid">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="h-8 px-2.5 text-xs whitespace-nowrap border-l border-gray-300 first:border-l-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      :class="buttonClass(option)"
      :aria-checked="option.value === modelValue"
      :disabled="disabled"
      :data-testid="`${testid}-${option.value}`"
      @click="select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
export interface SegmentedOption {
  value: string;
  label: string;
  /** Checked state drawn in red — for the option that takes something away. */
  danger?: boolean;
}

const props = withDefaults(
  defineProps<{
    options: readonly SegmentedOption[];
    modelValue: string;
    /** Accessible name for the whole group (it has no visible label of its own). */
    groupLabel: string;
    testid: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function buttonClass(option: SegmentedOption): string {
  if (option.value !== props.modelValue) return "bg-white text-gray-600 hover:bg-gray-50";
  return option.danger === true ? "bg-red-50 text-red-700 font-medium" : "bg-blue-50 text-blue-700 font-medium";
}

function select(value: string): void {
  if (value === props.modelValue) return;
  emit("update:modelValue", value);
}
</script>
