import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import dts from "vite-plugin-dts";

// Mirror of spotify-plugin / bookmarks-plugin: two bundles, two externals
// strategies. The server bundle (`dist/index.js`) inlines
// `gui-chat-protocol`, `zod` and `@mulmoclaude/common` because the runtime
// loader may extract the tarball into a cache dir with no node_modules; the
// browser bundle (`dist/vue.js`) leaves `vue` + `gui-chat-protocol/vue`
// external so the host's Vue instance and runtime composables resolve.
export default defineConfig({
  // No `rollupTypes: true` — see spotify-plugin/vite.config.ts (api-extractor
  // bundles an older TS engine and drops every export under TS 6+).
  plugins: [
    vue(),
    dts({
      include: ["src/**/*.{ts,vue}"],
      outDir: "dist",
      compilerOptions: { rootDir: "src" },
    }),
  ],
  build: {
    lib: {
      entry: { index: "src/index.ts", vue: "src/vue.ts" },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["vue", "gui-chat-protocol/vue"],
      output: {
        // Pin the CSS asset name so the host's runtime loader finds it.
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "style.css";
          return assetInfo.name ?? "[name]";
        },
      },
    },
    minify: false,
    sourcemap: true,
  },
});
