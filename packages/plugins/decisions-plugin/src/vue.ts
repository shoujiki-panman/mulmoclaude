// Vue entry — exports the canvas + preview components the host's runtime
// plugin loader dynamic-imports as `dist/vue.js`. Same shape as
// bookmarks-plugin / spotify-plugin so the loader needs no special case.

import View from "./View.vue";
import Preview from "./Preview.vue";
import { TOOL_DEFINITION } from "./definition";

export const plugin = {
  toolDefinition: TOOL_DEFINITION,
  viewComponent: View,
  previewComponent: Preview,
};
