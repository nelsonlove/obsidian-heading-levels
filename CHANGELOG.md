# Changelog

All notable changes to Heading Levels are listed here. The release workflow copies a version's section into the GitHub release notes.

## Unreleased

-

## 0.1.2 — 2026-10-13

- `obsidian` types pinned to 1.5.7, the oldest published typings at or above `minAppVersion` 1.5.0 (none exist for 1.5.0 itself), so the build checks against an API close to the one the plugin promises instead of whatever `latest` is; `builtin-modules` replaced by `node:module`; `onload` is synchronous, as it awaits nothing.
- Release and CI workflows, preflight, the Obsidian team's ESLint rules, SECURITY and PRIVACY notes, a CHANGELOG, and the lockfile committed (obsidian-release-kit).
