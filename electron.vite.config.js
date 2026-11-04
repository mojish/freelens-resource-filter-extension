import { builtinModules } from "node:module";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { globalExternals } from "./build/global-externals.js";

// Modules provided by the Node.js/Electron runtime in the Freelens host. They
// must stay external (left as `require(...)`) instead of being bundled. We list
// them explicitly because setting `rolldownOptions` opts out of the
// `rollupOptions.external` that electron-vite would otherwise apply.
const runtimeExternals = ["electron", /^electron\//, ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// Host-provided modules resolved from globals at runtime — never bundled.
const hostExternals = {
  "@freelensapp/extensions": "globalThis.FreelensExtensionApi",
  mobx: "globalThis.FreelensExtensionApi.Mobx",
  "mobx-react": "globalThis.FreelensExtensionApi.MobxReact",
  react: "globalThis.FreelensExtensionApi.React",
  "react-dom": "globalThis.FreelensExtensionApi.ReactDom",
  "react/jsx-runtime": "globalThis.FreelensExtensionApi.ReactJsxRuntime",
};

export default defineConfig({
  // main process has full access to Node.js APIs
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
        // Freelens 2 accepts CommonJS in the main process.
        formats: ["cjs"],
      },
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          // silence warning about using `chunk.default` to access the default export
          exports: "named",
          // prefer separate files for each module
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/main",
        },
      },
      sourcemap: true,
    },
    plugins: [react(), globalExternals(hostExternals)],
  },
  // Use the library/preload build pipeline; the actual renderer runs in a
  // browser without Node.js and is loaded as ESM by Freelens 2.
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, "src/renderer/index.tsx"),
        formats: ["es"],
        fileName: () => "index.mjs",
      },
      outDir: "out/renderer",
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          entryFileNames: "[name].mjs",
          chunkFileNames: "[name].mjs",
          // prefer separate files for each module
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/renderer",
        },
      },
      sourcemap: true,
    },
    plugins: [react(), globalExternals(hostExternals)],
  },
});
