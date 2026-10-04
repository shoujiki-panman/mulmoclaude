<template>
  <!-- Live view of the hands-free camera, so the user can aim it before
       a snapshot is taken. `muted` + `playsinline` let it autoplay on
       mobile Safari without a user gesture. -->
  <video
    ref="video"
    class="w-40 aspect-video rounded border border-gray-300 bg-black object-cover"
    autoplay
    muted
    playsinline
    :aria-label="t('chatInput.camera.previewLabel')"
    data-testid="camera-preview"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { captureFrame } from "../composables/useCameraSnapshot";
import type { PastedFile } from "../types/pastedFile";

const props = defineProps<{ stream: MediaStream }>();

const { t } = useI18n();
const video = ref<HTMLVideoElement | null>(null);

watch(
  [video, () => props.stream],
  ([element, stream]) => {
    if (element && element.srcObject !== stream) element.srcObject = stream;
  },
  { immediate: true },
);

/** The frame on screen right now as a JPEG attachment (null before the
 *  first frame arrives). */
function capture(): PastedFile | null {
  return video.value ? captureFrame(video.value) : null;
}

defineExpose({ capture });
</script>
