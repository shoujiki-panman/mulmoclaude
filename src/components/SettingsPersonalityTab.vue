<template>
  <div class="space-y-4" data-testid="settings-personality-tab">
    <p class="text-sm text-gray-700">{{ t("settingsPersonalityTab.description") }}</p>

    <div class="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2" data-testid="settings-personality-identity">
      <div class="flex items-end gap-3">
        <label class="w-20 shrink-0 space-y-1">
          <span class="block text-sm font-medium text-gray-800">{{ t("settingsPersonalityTab.avatarLabel") }}</span>
          <input
            v-model="avatarDraft"
            type="text"
            :maxlength="ASSISTANT_AVATAR_MAX_CHARS * 2"
            class="h-8 w-full px-2 text-center text-lg rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            :placeholder="t('settingsPersonalityTab.avatarPlaceholder')"
            :disabled="!loaded"
            data-testid="settings-personality-avatar"
            @change="saveIdentity('avatar')"
            @keydown.stop
          />
        </label>
        <label class="flex-1 min-w-0 space-y-1">
          <span class="block text-sm font-medium text-gray-800">{{ t("settingsPersonalityTab.nameLabel") }}</span>
          <input
            v-model="nameDraft"
            type="text"
            :maxlength="ASSISTANT_NAME_MAX_CHARS"
            class="h-8 w-full px-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            :placeholder="t('settingsPersonalityTab.namePlaceholder')"
            :disabled="!loaded"
            data-testid="settings-personality-name"
            @change="saveIdentity('name')"
            @keydown.stop
          />
        </label>
      </div>
      <p class="text-xs text-gray-500">{{ t("settingsPersonalityTab.identityHint") }}</p>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white divide-y divide-gray-200">
      <div class="px-4 py-3 space-y-1">
        <div class="flex items-center justify-between gap-4">
          <label class="text-sm font-medium text-gray-800" for="settings-personality-tone">{{ t("settingsPersonalityTab.toneLabel") }}</label>
          <select
            id="settings-personality-tone"
            v-model="toneDraft"
            class="h-8 px-2 text-sm rounded border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            :disabled="!loaded"
            data-testid="settings-personality-tone"
            @change="saveTone"
          >
            <option v-for="tone in TONE_PRESETS" :key="tone" :value="tone">{{ t(`settingsPersonalityTab.tones.${tone}.label`) }}</option>
          </select>
        </div>
        <p class="text-xs text-gray-500" data-testid="settings-personality-tone-hint">{{ t(`settingsPersonalityTab.tones.${toneDraft}.hint`) }}</p>
      </div>

      <div v-for="trait in PERSONALITY_TRAITS" :key="trait" class="flex items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <div class="text-sm font-medium text-gray-800">{{ t(`settingsPersonalityTab.traits.${trait}.label`) }}</div>
          <div class="text-xs text-gray-500">{{ t(`settingsPersonalityTab.traits.${trait}.hint`) }}</div>
        </div>
        <SegmentedControl
          :options="levelOptions"
          :model-value="traitsDraft[trait]"
          :group-label="t(`settingsPersonalityTab.traits.${trait}.label`)"
          :testid="`settings-personality-${trait}`"
          :disabled="!loaded"
          @update:model-value="(level) => saveTrait(trait, level)"
        />
      </div>
    </div>

    <div class="space-y-2">
      <label class="block text-sm font-semibold text-gray-700" for="settings-personality-instructions">{{
        t("settingsPersonalityTab.customInstructionsLabel")
      }}</label>
      <textarea
        id="settings-personality-instructions"
        v-model="instructionsDraft"
        rows="6"
        :maxlength="CUSTOM_INSTRUCTIONS_MAX_CHARS"
        class="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:border-blue-400"
        :placeholder="t('settingsPersonalityTab.customInstructionsPlaceholder')"
        :disabled="!loaded"
        data-testid="settings-personality-instructions"
        @keydown.stop
      ></textarea>
      <p class="text-xs text-gray-500">{{ t("settingsPersonalityTab.customInstructionsHint") }}</p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          :disabled="!instructionsDirty || saving"
          data-testid="settings-personality-instructions-save"
          @click="saveInstructions"
        >
          {{ saving ? t("settingsModal.saving") : t("common.save") }}
        </button>
        <span v-if="instructionsDirty" class="text-xs text-amber-600" data-testid="settings-personality-instructions-dirty">
          {{ t("settingsModal.unsavedMarker") }}
        </span>
        <span class="ml-auto text-xs text-gray-400">{{
          t("settingsPersonalityTab.charCount", { count: instructionsDraft.length, max: CUSTOM_INSTRUCTIONS_MAX_CHARS })
        }}</span>
      </div>
    </div>

    <p class="text-xs text-gray-500">{{ t("settingsPersonalityTab.chatHint") }}</p>

    <p v-if="savedNotice && !errorMessage" class="text-xs text-green-600" data-testid="settings-personality-status">{{ t("common.saved") }}</p>
    <p v-if="errorMessage" class="text-sm text-red-700" role="alert" data-testid="settings-personality-error">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import SegmentedControl, { type SegmentedOption } from "./SegmentedControl.vue";
import { apiGet, apiPut } from "../utils/api";
import { API_ROUTES } from "../config/apiRoutes";
import { createMutationQueue } from "../utils/mutationQueue";
import {
  ASSISTANT_AVATAR_MAX_CHARS,
  ASSISTANT_NAME_MAX_CHARS,
  CUSTOM_INSTRUCTIONS_MAX_CHARS,
  PERSONALITY_TRAITS,
  TONE_PRESETS,
  TRAIT_LEVELS,
  defaultPersonality,
  normalizePersonality,
  type Personality,
  type PersonalityTrait,
  type PersonalityTraits,
} from "../types/personality";

const { t } = useI18n();

const props = defineProps<{
  /** Bumped by the parent on modal open so out-of-band edits to
   *  `config/personality.json` show up. */
  reloadToken: number;
}>();

const emit = defineEmits<{
  saved: [];
}>();

// Server truth (last load / last successful PUT) and the drafts the
// controls bind to. Tone and characteristics save on every change; the
// custom instructions wait for their own Save button, like Allowed Tools.
const stored = ref<Personality>(defaultPersonality());
const nameDraft = ref("");
const avatarDraft = ref("");
const toneDraft = ref(stored.value.tone);
const traitsDraft = ref<PersonalityTraits>({ ...stored.value.traits });
const instructionsDraft = ref("");
const loaded = ref(false);
const saving = ref(false);
const savedNotice = ref(false);
const errorMessage = ref("");

const levelOptions = computed<SegmentedOption[]>(() => TRAIT_LEVELS.map((level) => ({ value: level, label: t(`settingsPersonalityTab.levels.${level}`) })));

// Trim-insensitive, matching what the server stores.
const instructionsDirty = computed(() => instructionsDraft.value.trim() !== stored.value.customInstructions);

const IDENTITY_FIELDS = ["name", "avatar"] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];
const identityDrafts: Record<IdentityField, Ref<string>> = { name: nameDraft, avatar: avatarDraft };

/** Show `personality` in the controls. A name / avatar draft that differs
 *  from what was stored is still being typed in (it saves on `change`), so
 *  another save landing must not wipe it — only the field that save wrote
 *  (`written`), or every field on load, takes the stored value. */
function adoptStored(personality: Personality, written: IdentityField | "all" | null): void {
  const previous = stored.value;
  stored.value = personality;
  for (const field of IDENTITY_FIELDS) {
    const draft = identityDrafts[field];
    if (written === "all" || written === field || draft.value === previous[field]) draft.value = personality[field];
  }
  toneDraft.value = personality.tone;
  traitsDraft.value = { ...personality.traits };
}

async function load(): Promise<void> {
  errorMessage.value = "";
  savedNotice.value = false;
  const response = await apiGet<unknown>(API_ROUTES.config.personality);
  if (!response.ok) {
    errorMessage.value = response.error || t("settingsPersonalityTab.loadError");
    return;
  }
  adoptStored(normalizePersonality(response.data), "all");
  instructionsDraft.value = stored.value.customInstructions;
  loaded.value = true;
}

// Loads and saves share one queue, so two quick clicks can't race and a
// reload waits for a save still in flight. Each save re-reads the file and
// changes only its own field; afterwards the controls show what was
// stored (cleaned up), or snap back to it when the save failed. The
// custom-instructions draft is never overwritten — it has its own Save.
const { enqueue } = createMutationQueue();

function persist(produce: (current: Personality) => Personality, written: IdentityField | null = null): Promise<void> {
  return enqueue(async () => {
    saving.value = true;
    errorMessage.value = "";
    // Build on what the server holds right now: a change made meanwhile
    // somewhere else (another tab, or by asking in chat) must survive.
    const latest = await apiGet<unknown>(API_ROUTES.config.personality);
    const base = latest.ok ? normalizePersonality(latest.data) : stored.value;
    const response = await apiPut<unknown>(API_ROUTES.config.personality, produce(base));
    saving.value = false;
    if (!response.ok) {
      errorMessage.value = response.error || t("settingsPersonalityTab.saveError");
      adoptStored(base, written);
      return;
    }
    adoptStored(normalizePersonality(response.data), written);
    savedNotice.value = true;
    emit("saved");
  });
}

function saveIdentity(field: IdentityField): void {
  const { value } = identityDrafts[field];
  void persist((current) => ({ ...current, [field]: value }), field);
}

function saveTone(): void {
  const tone = toneDraft.value;
  void persist((current) => ({ ...current, tone }));
}

function saveTrait(trait: PersonalityTrait, value: string): void {
  const level = TRAIT_LEVELS.find((candidate) => candidate === value);
  if (level === undefined) return;
  traitsDraft.value = { ...traitsDraft.value, [trait]: level };
  void persist((current) => ({ ...current, traits: { ...current.traits, [trait]: level } }));
}

function saveInstructions(): void {
  const customInstructions = instructionsDraft.value;
  void persist((current) => ({ ...current, customInstructions }));
}

/** For the modal's close guard: typed instructions not saved yet. */
function hasPendingChanges(): boolean {
  return loaded.value && instructionsDirty.value;
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
