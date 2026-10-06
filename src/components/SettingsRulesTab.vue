<template>
  <div class="space-y-4" data-testid="settings-rules-tab">
    <SettingsPluginPermissions v-if="view === 'plugins'" :plugins="stored.plugins" :disabled="!loaded" @back="view = 'main'" @change="setPluginPermission" />

    <template v-else>
      <div class="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <span class="material-icons text-3xl text-blue-600" aria-hidden="true">shield</span>
        <h3 class="text-lg font-semibold text-gray-900">{{ t("settingsRulesTab.title") }}</h3>
        <p class="text-sm text-gray-600 leading-relaxed">{{ t("settingsRulesTab.intro") }}</p>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white divide-y divide-gray-200">
        <div>
          <div class="flex items-center justify-between gap-3 px-4 py-2">
            <span class="text-sm font-medium text-gray-800">{{ t("settingsRulesTab.defaultRules") }}</span>
            <button
              type="button"
              class="h-8 px-2.5 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 rounded"
              :aria-expanded="showDefaults"
              aria-controls="settings-rules-defaults"
              data-testid="settings-rules-defaults-toggle"
              @click="showDefaults = !showDefaults"
            >
              {{ showDefaults ? t("settingsRulesTab.hide") : t("settingsRulesTab.view") }}
              <span class="material-icons text-lg" aria-hidden="true">{{ showDefaults ? "expand_less" : "expand_more" }}</span>
            </button>
          </div>
          <div v-if="showDefaults" id="settings-rules-defaults" class="px-4 pb-4 space-y-3" data-testid="settings-rules-defaults">
            <div v-for="group in defaultGroups" :key="group.kind">
              <div class="text-xs font-semibold text-gray-500">{{ t(`settingsRulesTab.kindHeadings.${group.kind}`) }}</div>
              <ul class="mt-1 list-disc pl-5 space-y-0.5 text-sm text-gray-700">
                <li v-for="rule in group.rules" :key="rule.id">{{ t(`settingsRulesTab.defaults.${rule.id}`) }}</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3 px-4 py-2">
          <span class="text-sm font-medium text-gray-800">{{ t("settingsRulesTab.pluginPermissions") }}</span>
          <button
            type="button"
            class="h-8 px-2.5 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 rounded"
            data-testid="settings-rules-plugins-open"
            @click="view = 'plugins'"
          >
            {{ t("settingsRulesTab.manage") }}
            <span class="material-icons text-lg" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-500">{{ t("settingsRulesTab.pluginPermissionsNote") }}</p>

      <div class="space-y-2">
        <h4 class="text-sm font-semibold text-gray-700">{{ t("settingsRulesTab.yourRules") }}</h4>
        <p v-if="loaded && stored.rules.length === 0 && editing === null" class="text-sm text-gray-500" data-testid="settings-rules-empty">
          {{ t("settingsRulesTab.empty") }}
        </p>
        <ul v-if="stored.rules.length > 0" class="rounded-xl border border-gray-200 bg-white divide-y divide-gray-200" data-testid="settings-rules-list">
          <li v-for="rule in stored.rules" :key="rule.id" :data-testid="`settings-rule-${rule.id}`">
            <SettingsRuleEditor
              v-if="editing?.ruleId === rule.id"
              class="m-2"
              :initial-kind="rule.kind"
              :initial-text="rule.text"
              @save="(edited) => updateRule(rule.id, edited)"
              @cancel="editing = null"
            />
            <div v-else class="flex items-start gap-3 px-4 py-3">
              <span class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="KIND_BADGE_CLASSES[rule.kind]">
                {{ t(`settingsRulesTab.kinds.${rule.kind}`) }}
              </span>
              <span class="flex-1 min-w-0 text-sm break-words" :class="rule.enabled ? 'text-gray-800' : 'text-gray-400 line-through'">{{ rule.text }}</span>
              <label class="shrink-0 flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  :checked="rule.enabled"
                  :data-testid="`settings-rule-toggle-${rule.id}`"
                  @change="(event) => toggleRule(rule.id, event)"
                />
                {{ t("settingsRulesTab.ruleEnabled") }}
              </label>
              <button
                type="button"
                class="shrink-0 h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                :title="t('settingsRulesTab.editRule')"
                :aria-label="t('settingsRulesTab.editRule')"
                :data-testid="`settings-rule-edit-${rule.id}`"
                @click="editing = { ruleId: rule.id }"
              >
                <span class="material-icons text-lg" aria-hidden="true">edit</span>
              </button>
              <button
                type="button"
                class="shrink-0 h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                :title="t('settingsRulesTab.deleteRule')"
                :aria-label="t('settingsRulesTab.deleteRule')"
                :data-testid="`settings-rule-delete-${rule.id}`"
                @click="deleteRule(rule.id)"
              >
                <span class="material-icons text-lg" aria-hidden="true">delete</span>
              </button>
            </div>
          </li>
        </ul>
        <SettingsRuleEditor v-if="editing !== null && editing.ruleId === null" initial-kind="ask" initial-text="" @save="addRule" @cancel="editing = null" />
      </div>

      <div v-if="editing === null" class="flex justify-end">
        <button
          type="button"
          class="px-5 py-2 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          :disabled="!loaded || stored.rules.length >= MAX_CUSTOM_RULES"
          data-testid="settings-rules-add"
          @click="editing = { ruleId: null }"
        >
          {{ t("settingsRulesTab.addRule") }}
        </button>
      </div>
    </template>

    <p v-if="savedNotice && !errorMessage" class="text-xs text-green-600" data-testid="settings-rules-status">{{ t("common.saved") }}</p>
    <p v-if="errorMessage" class="text-sm text-red-700" role="alert" data-testid="settings-rules-error">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SettingsRuleEditor from "./SettingsRuleEditor.vue";
import SettingsPluginPermissions from "./SettingsPluginPermissions.vue";
import { apiGet, apiPut } from "../utils/api";
import { API_ROUTES } from "../config/apiRoutes";
import { confirmItemDelete } from "../utils/confirmDelete";
import { createMutationQueue } from "../utils/mutationQueue";
import {
  DEFAULT_RULES,
  MAX_CUSTOM_RULES,
  emptyRules,
  newRuleId,
  normalizeRules,
  withPluginPermission,
  type AssistantRule,
  type AssistantRules,
  type DefaultRule,
  type PluginPermission,
  type RuleKind,
} from "../types/assistantRules";

const { t } = useI18n();

const props = defineProps<{
  /** Bumped by the parent on modal open so out-of-band edits to
   *  `config/rules.json` show up. */
  reloadToken: number;
}>();

const emit = defineEmits<{
  saved: [];
}>();

const KIND_BADGE_CLASSES: Record<RuleKind, string> = {
  ask: "bg-amber-50 text-amber-800",
  allow: "bg-green-50 text-green-800",
  never: "bg-red-50 text-red-700",
};

// Same order the system prompt uses: free, then needs a yes, then never.
const defaultGroups: { kind: RuleKind; rules: DefaultRule[] }[] = (["allow", "ask", "never"] as const).map((kind) => ({
  kind,
  rules: DEFAULT_RULES.filter((rule) => rule.kind === kind),
}));

const stored = ref<AssistantRules>(emptyRules());
const loaded = ref(false);
const savedNotice = ref(false);
const errorMessage = ref("");
const view = ref<"main" | "plugins">("main");
const showDefaults = ref(false);
/** `ruleId: null` = adding a new rule; otherwise the rule being edited. */
const editing = ref<{ ruleId: string | null } | null>(null);

async function load(): Promise<void> {
  errorMessage.value = "";
  savedNotice.value = false;
  editing.value = null;
  view.value = "main";
  const response = await apiGet<unknown>(API_ROUTES.config.rules);
  if (!response.ok) {
    errorMessage.value = response.error || t("settingsRulesTab.loadError");
    return;
  }
  stored.value = normalizeRules(response.data);
  loaded.value = true;
}

// Loads and saves share one queue: each save is derived from the latest
// server-confirmed rules, so quick successive edits can't race, and a
// reload waits for a save still in flight. Resolves to whether the save
// landed.
const { enqueue } = createMutationQueue();

function persist(produce: (current: AssistantRules) => AssistantRules): Promise<boolean> {
  return enqueue(async () => {
    errorMessage.value = "";
    const response = await apiPut<unknown>(API_ROUTES.config.rules, produce(stored.value));
    if (!response.ok) {
      errorMessage.value = response.error || t("settingsRulesTab.saveError");
      return false;
    }
    stored.value = normalizeRules(response.data);
    savedNotice.value = true;
    emit("saved");
    return true;
  });
}

function mapRule(ruleId: string, change: (rule: AssistantRule) => AssistantRule): (current: AssistantRules) => AssistantRules {
  return (current) => ({ ...current, rules: current.rules.map((rule) => (rule.id === ruleId ? change(rule) : rule)) });
}

async function addRule(draft: { kind: RuleKind; text: string }): Promise<void> {
  const landed = await persist((current) => {
    const rule: AssistantRule = { id: newRuleId(current.rules.map((existing) => existing.id)), ...draft, enabled: true };
    return { ...current, rules: [...current.rules, rule] };
  });
  if (landed) editing.value = null;
}

async function updateRule(ruleId: string, draft: { kind: RuleKind; text: string }): Promise<void> {
  const landed = await persist(mapRule(ruleId, (rule) => ({ ...rule, ...draft })));
  if (landed) editing.value = null;
}

async function toggleRule(ruleId: string, event: Event): Promise<void> {
  const landed = await persist(mapRule(ruleId, (rule) => ({ ...rule, enabled: !rule.enabled })));
  // `:checked` is one-way, so a failed save would leave the box showing a
  // state that never reached the server — put it back by hand.
  if (!landed && event.target instanceof HTMLInputElement) {
    event.target.checked = stored.value.rules.find((rule) => rule.id === ruleId)?.enabled ?? false;
  }
}

function deleteRule(ruleId: string): void {
  if (!confirmItemDelete(t("settingsRulesTab.deleteConfirm"))) return;
  void persist((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== ruleId) }));
}

function setPluginPermission(key: string, level: PluginPermission): void {
  void persist((current) => ({ ...current, plugins: withPluginPermission(current.plugins, key, level) }));
}

/** For the modal's close guard: a rule editor is open. */
function hasPendingChanges(): boolean {
  return editing.value !== null;
}

defineExpose({ hasPendingChanges });

watch(
  () => props.reloadToken,
  () => {
    void enqueue(load);
  },
  { immediate: true },
);
</script>
