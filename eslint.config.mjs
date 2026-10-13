// The Obsidian team's official rules for community plugins (github.com/obsidianmd/eslint-plugin): command ids and names, sentence case in UI strings, no global `app`, forbidden DOM, view and component cleanup, platform guards, manifest and LICENSE shape.
// Install: npm i -D eslint eslint-plugin-obsidianmd
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The sentence-case rule's `brands` option replaces its default list (Obsidian, Obsidian Sync, iOS, macOS, Android, GitHub, …) rather than extending it, so the defaults are read back from the package and the plugin's own name is added. The path is the package's build output; if a release moves it, the list falls back to the few names below.
let defaultBrands = ["Obsidian", "Obsidian Sync", "Obsidian Publish", "iOS", "macOS", "Android", "Windows", "Linux", "GitHub"];
try {
  const mod = await import("eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js");
  if (Array.isArray(mod.DEFAULT_BRANDS) && mod.DEFAULT_BRANDS.length) defaultBrands = mod.DEFAULT_BRANDS;
} catch {
  // fallback list above
}
// The plugin's own name, from manifest.json at adopt time; an empty name adds nothing (an empty brand would make the matcher loop forever).
const pluginName = "Heading Levels";
const brands = [...new Set([...defaultBrands, ...(pluginName ? [pluginName] : [])])];

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
  {
    // Rule options replace, not merge, so the recommended enforceCamelCaseLower is repeated here. Add acronyms as they come up.
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true, brands, acronyms: [] }],
    },
  },
  {
    // Test files and test helpers are not plugin code and never run on a phone: node:assert / node:test are the test runner, not a plugin dependency. node:test's test() and describe() return promises by design; they are named as known-safe calls so the floating-promise rule still catches a missing await on vitest's expect(...).rejects.
    files: ["**/*.{test,spec}.*", "tests/**", "test/**", "__tests__/**"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "@typescript-eslint/no-floating-promises": [
        "error",
        { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "it", "describe", "suite", "before", "after", "beforeEach", "afterEach"] }] },
      ],
    },
  },
  {
    ignores: ["main.js", "node_modules/", "scripts/", "version-bump.mjs", "esbuild.config.mjs"],
  },
]);
