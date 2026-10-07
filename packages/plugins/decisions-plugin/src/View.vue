<script setup lang="ts">
// Decisions plugin View — the answer table (one row per item, one column per
// question) plus a detail panel with every probability for the selected
// row. Renders straight from the tool result's `data`: the plugin keeps no
// server state, so there is nothing to refetch.

import { computed, ref, watch } from "vue";
import AnswerDetail from "./AnswerDetail.vue";
import { useT } from "./lang";
import type { DecisionsData } from "./types";
import { cellText } from "./viewModel";

// Exported because `vite-plugin-dts` rolls View into `dist/vue.d.ts` via the
// `plugin = { viewComponent: View }` re-export in `vue.ts`; TS4023 fires if
// the inferred component type names an unexported interface.
export interface Props {
  selectedResult: { data?: DecisionsData };
}
const props = defineProps<Props>();
const t = useT();

const data = computed(() => props.selectedResult.data);
const failedCount = computed(() => data.value?.items.filter((item) => item.error !== undefined).length ?? 0);
const selectedIndex = ref(0);
// The host can swap in a newer result while this component stays mounted.
watch(data, () => {
  selectedIndex.value = 0;
});
const selectedItem = computed(() => data.value?.items[selectedIndex.value]);
</script>

<template>
  <div class="decisions-view">
    <template v-if="data && data.items.length > 0">
      <header class="decisions-header">
        <h2 class="decisions-title">{{ data.title ?? t.title }}</h2>
        <p class="decisions-meta">
          {{ data.items.length }} {{ t.itemsLabel }} · {{ data.questions.length }} {{ t.questionsLabel }} · {{ data.model }} · {{ data.elapsedMs }} ms
          <span v-if="failedCount > 0" class="decisions-failed">· {{ failedCount }} {{ t.failedLabel }}</span>
        </p>
      </header>
      <div class="decisions-table-wrap">
        <table class="decisions-table">
          <thead>
            <tr>
              <th scope="col">{{ t.itemColumn }}</th>
              <th v-for="question in data.questions" :key="question.id" scope="col" :title="question.question">{{ question.id }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in data.items" :key="`${index}:${item.id}`" :class="{ selected: index === selectedIndex }">
              <th scope="row" class="decisions-item">
                <button type="button" class="decisions-item-button" @click="selectedIndex = index">
                  <span class="decisions-item-id">{{ item.id }}</span>
                  <span v-if="item.text" class="decisions-item-text">{{ item.text }}</span>
                  <span v-else-if="item.image" class="decisions-item-text">{{ t.imageLabel }}: {{ item.image }}</span>
                </button>
              </th>
              <td v-if="item.error !== undefined" :colspan="data.questions.length" class="decisions-error">{{ item.error }}</td>
              <template v-else>
                <td v-for="question in data.questions" :key="question.id">{{ cellText(question, item.answers?.[question.id]) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <section v-if="selectedItem" class="decisions-detail">
        <h3 class="decisions-detail-title">{{ t.details }}: {{ selectedItem.id }}</h3>
        <p v-if="selectedItem.error !== undefined" class="decisions-error">{{ t.error }}: {{ selectedItem.error }}</p>
        <template v-else>
          <AnswerDetail v-for="question in data.questions" :key="question.id" :question="question" :answer="selectedItem.answers?.[question.id]" />
        </template>
      </section>
    </template>
    <p v-else class="decisions-empty">{{ t.empty }}</p>
  </div>
</template>

<style scoped>
.decisions-view {
  padding: 1rem;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  color: #111827;
}
.decisions-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}
.decisions-meta {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.8125rem;
  color: #6b7280;
}
.decisions-failed {
  color: #b91c1c;
}
.decisions-table-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}
.decisions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.decisions-table th,
.decisions-table td {
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}
.decisions-table thead th {
  background: #f9fafb;
  font-weight: 600;
  cursor: help;
}
.decisions-table tbody tr.selected {
  background: #eef2ff;
}
.decisions-item {
  min-width: 12rem;
  max-width: 24rem;
  white-space: normal;
}
.decisions-item-button {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.decisions-item-id {
  font-weight: 600;
}
.decisions-item-text {
  color: #6b7280;
  font-weight: 400;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.decisions-error {
  color: #b91c1c;
  white-space: normal;
}
.decisions-detail {
  margin-top: 1rem;
}
.decisions-detail-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.decisions-empty {
  color: #6b7280;
}
</style>
