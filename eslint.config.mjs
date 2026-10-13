// The Obsidian team's official rules for community plugins (github.com/obsidianmd/eslint-plugin): command ids and names, sentence case in UI strings, no global `app`, forbidden DOM, view and component cleanup, platform guards, manifest and LICENSE shape.
// Install: npm i -D eslint eslint-plugin-obsidianmd
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

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
    // The plugin's own name and "Obsidian" are proper nouns and stay as written in tooltips, titles and notices. Rule options replace, not merge, so the recommended enforceCamelCaseLower is repeated here. Add other brand names and acronyms as they come up.
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true, brands: ["Heading Levels", "Obsidian"], acronyms: [] }],
    },
  },
  {
    // Test files are not plugin code and never run on a phone: node:test's test() returns a promise by design (vitest's does not), and node:assert / node:test are the test runner, not a plugin dependency.
    files: ["**/*.test.ts", "**/*.test.mts", "**/*.test.js", "**/*.test.mjs"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
  {
    ignores: ["main.js", "node_modules/", "scripts/", "version-bump.mjs", "esbuild.config.mjs"],
  },
]);
