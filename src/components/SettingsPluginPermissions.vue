<template>
  <div class="space-y-4" data-testid="settings-plugin-permissions">
    <button
      type="button"
      class="h-8 -ml-1 pr-2.5 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 rounded"
      data-testid="settings-plugin-permissions-back"
      @click="emit('back')"
    >
      <span class="material-icons text-lg" aria-hidden="true">chevron_left</span>
      {{ t("settingsRulesTab.plugins.back") }}
    </button>

    <div class="space-y-1">
      <h3 class="text-base font-semibold text-gray-900">{{ t("settingsRulesTab.pluginPermissions") }}</h3>
      <p class="text-sm text-gray-600">{{ t("settingsRulesTab.plugins.description") }}</p>
    </div>

    <p v-if="loadError" class="text-sm text-red-700" role="alert" data-testid="settings-plugin-permissions-error">{{ loadError }}</p>
    <p v-else-if="!catalog" class="text-sm text-gray-400">{{ t("common.loading") }}</p>

    <template v-else>
      <section v-for="section in sections" :key="section.key" class="space-y-2">
        <h4 class="text-xs font-semibold text-gray-500">{{ t(`settingsRulesTab.plugins.${section.key}Heading`) }}</h4>
        <p v-if="section.entries.length === 0" class="text-sm text-gray-400">{{ t("settingsRulesTab.plugins.empty") }}</p>
        <ul v-else class="rounded-xl border border-gray-200 bg-white divide-y divide-gray-200">
          <li v-for="entry in section.entries" :key="entry.key" class="flex items-center justify-between gap-3 px-4 py-2">
            <span class="min-w-0 truncate font-mono text-sm text-gray-800" :title="entry.label">{{ entry.label }}</span>
            <SegmentedControl
              :options="levelOptions"
              :model-value="pluginPermissionFor(plugins, entry.key)"
              :group-label="entry.label"
              :testid="`settings-plugin-permission-${entry.key}`"
              :disabled="disabled"
              @update:model-value="(level) => change(entry.key, level)"
            />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import SegmentedControl, { type SegmentedOption } from "./SegmentedControl.vue";
import { apiGet } from "../utils/api";
import { API_ROUTES } from "../config/apiRoutes";
import { isRecord, isStringArray } from "../utils/types";
import { MCP_SERVER_PERMISSION_PREFIX, PLUGIN_PERMISSIONS, pluginPermissionFor, type PluginPermission } from "../types/assistantRules";

const { t } = useI18n();

defineProps<{
  plugins: Record<string, PluginPermission>;
  disabled: boolean;
}>();

const emit = defineEmits<{
  back: [];
  change: [key: string, level: PluginPermission];
}>();

interface Catalog {
  plugins: string[];
  mcpServers: string[];
}

interface Entry {
  /** Key in `AssistantRules.plugins`: a tool name or `mcp__<server>`. */
  key: string;
  label: string;
}

const catalog = ref<Catalog | null>(null);
const loadError = ref("");

const levelOptions = computed<SegmentedOption[]>(() =>
  PLUGIN_PERMISSIONS.map((value) => ({ value, label: t(`settingsRulesTab.plugins.levels.${value}`), danger: value === "never" })),
);

const sections = computed<{ key: "builtIn" | "mcp"; entries: Entry[] }[]>(() => {
  const current = catalog.value;
  if (!current) return [];
  return [
    { key: "builtIn", entries: current.plugins.map((name) => ({ key: name, label: name })) },
    { key: "mcp", entries: current.mcpServers.map((serverId) => ({ key: `${MCP_SERVER_PERMISSION_PREFIX}${serverId}`, label: serverId })) },
  ];
});

function parseCatalog(data: unknown): Catalog | null {
  if (!isRecord(data) || !isStringArray(data.plugins) || !isStringArray(data.mcpServers)) return null;
  return { plugins: data.plugins, mcpServers: data.mcpServers };
}

async function load(): Promise<void> {
  const response = await apiGet<unknown>(API_ROUTES.config.rulesCatalog);
  const parsed = response.ok ? parseCatalog(response.data) : null;
  if (parsed === null) {
    loadError.value = (!response.ok && response.error) || t("settingsRulesTab.plugins.loadError");
    return;
  }
  catalog.value = parsed;
}

function change(key: string, value: string): void {
  const level = PLUGIN_PERMISSIONS.find((candidate) => candidate === value);
  if (level !== undefined) emit("change", key, level);
}

onMounted(() => {
  void load();
});
</script>
