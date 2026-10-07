<script setup lang="ts">
// One question's answer in full: the predicate probability, or one bar per
// option / level with the chosen one highlighted.

import { computed } from "vue";
import { formatPercent, formatScore } from "./format";
import { useT } from "./lang";
import type { QuestionSpec } from "./schemas";
import type { Answer } from "./types";
import { choiceBars, scoreBars, type Bar } from "./viewModel";

// Exported for the same TS4023 reason as View.vue's Props.
export interface Props {
  question: QuestionSpec;
  answer?: Answer | undefined;
}
const props = defineProps<Props>();
const t = useT();

const bars = computed<Bar[]>(() => {
  const { question, answer } = props;
  if (answer?.type === "predicate") return [{ key: "yes", label: t.value.yes, value: answer.probability, highlighted: true }];
  if (question.type === "choice" && answer?.type === "choice") return choiceBars(question, answer);
  if (question.type === "score" && answer?.type === "score") return scoreBars(question, answer);
  return [];
});
const hasDistribution = computed(() => bars.value.some((bar) => bar.value !== null));
const score = computed(() => (props.answer?.type === "score" ? formatScore(props.answer.score) : undefined));
const confidence = computed(() => (props.answer !== undefined && props.answer.type !== "predicate" ? props.answer.confidence : undefined));
</script>

<template>
  <div class="answer">
    <p class="answer-question">
      <code>{{ question.id }}</code> {{ question.question }}
    </p>
    <p v-if="score !== undefined || confidence !== undefined" class="answer-meta">
      <span v-if="score !== undefined">{{ t.score }} {{ score }}</span>
      <span v-if="confidence !== undefined">{{ t.confidence }} {{ formatPercent(confidence) }}</span>
    </p>
    <ul class="answer-bars">
      <li v-for="bar in bars" :key="bar.key" :class="{ highlighted: bar.highlighted }">
        <span class="answer-bar-label">{{ bar.label }}</span>
        <template v-if="bar.value !== null">
          <span class="answer-bar-track"><span class="answer-bar-fill" :style="{ width: formatPercent(bar.value) }" /></span>
          <span class="answer-bar-value">{{ formatPercent(bar.value) }}</span>
        </template>
      </li>
    </ul>
    <p v-if="bars.length > 0 && !hasDistribution" class="answer-note">{{ t.noDistribution }}</p>
  </div>
</template>

<style scoped>
.answer {
  padding: 0.5rem 0;
  border-top: 1px solid #e5e7eb;
}
.answer-question {
  margin: 0 0 0.25rem;
  font-weight: 500;
}
.answer-question code {
  font-size: 0.75rem;
  color: #6b7280;
}
.answer-meta {
  display: flex;
  gap: 1rem;
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
}
.answer-bars {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.answer-bars li {
  display: grid;
  grid-template-columns: minmax(8rem, 2fr) 3fr 3rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #6b7280;
}
.answer-bars li.highlighted {
  color: #111827;
  font-weight: 600;
}
.answer-bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.answer-bar-track {
  height: 0.5rem;
  border-radius: 9999px;
  background: #f3f4f6;
  overflow: hidden;
}
.answer-bar-fill {
  display: block;
  height: 100%;
  background: #9ca3af;
}
.highlighted .answer-bar-fill {
  background: #4f46e5;
}
.answer-bar-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.answer-note {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
