<script setup lang="ts">
// Inline chat chip for a `decide` result: how many items and questions, and
// how many failed. The full table opens in the canvas.

import { computed } from "vue";
import { useT } from "./lang";
import type { DecisionsData } from "./types";

// Exported for the same TS4023 reason as View.vue's Props.
export interface Props {
  selectedResult: { data?: DecisionsData };
}
const props = defineProps<Props>();
const t = useT();

const summary = computed(() => {
  const { data } = props.selectedResult;
  if (!data) return t.value.empty;
  const failed = data.items.filter((item) => item.error !== undefined).length;
  const parts = [`${data.items.length} ${t.value.itemsLabel}`, `${data.questions.length} ${t.value.questionsLabel}`];
  if (failed > 0) parts.push(`${failed} ${t.value.failedLabel}`);
  return parts.join(" · ");
});
</script>

<template>
  <div class="decisions-preview">
    <span class="decisions-preview-icon" aria-hidden="true">☑</span>
    <span class="decisions-preview-label">{{ selectedResult.data?.title ?? t.previewLabel }}</span>
    <span class="decisions-preview-summary">{{ summary }}</span>
  </div>
</template>

<style scoped>
.decisions-preview {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  background: #f5f5f5;
  font-size: 0.875rem;
}
.decisions-preview-icon {
  color: #4f46e5;
}
.decisions-preview-label {
  font-weight: 500;
}
.decisions-preview-summary {
  color: #6b7280;
  font-size: 0.75rem;
}
</style>
