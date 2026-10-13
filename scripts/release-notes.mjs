#!/usr/bin/env node
// release-notes.mjs — prints the CHANGELOG.md section for one version, for the release workflow's notes.
// Usage: node scripts/release-notes.mjs <version> [--file CHANGELOG.md | --file=CHANGELOG.md]
//   Matches "## 1.2.3", "## [1.2.3]", with or without a date after it. Placeholder bullets (a line that is only "-" or "*") are dropped. LF, CRLF and mixed files all work (scripts/changelog.mjs does the reading).
//   Prints nothing and exits 0 when the file or the section is missing or empty; the workflow then lets GitHub generate the notes.
import { existsSync, readFileSync } from "node:fs";
import { notesFor } from "./changelog.mjs";

const args = process.argv.slice(2);
// --file takes `--file path` or `--file=path`. The version is the positional that is not the --file value, whichever order they come in. (-1 when there is no two-token --file: fileIdx + 1 would be 0, the first positional.)
const joined = args.find((a) => a.startsWith("--file="));
const fileIdx = args.indexOf("--file");
const fileValueIdx = fileIdx === -1 ? -1 : fileIdx + 1;
const file = joined !== undefined ? joined.slice("--file=".length) : fileIdx === -1 ? "CHANGELOG.md" : args[fileValueIdx];
const version = args.find((a, i) => !a.startsWith("--") && i !== fileValueIdx);
if (!version || !file || file.startsWith("--") || (joined !== undefined && fileIdx !== -1)) {
  console.error("usage: release-notes <version> [--file CHANGELOG.md]");
  process.exit(2);
}
if (!existsSync(file)) process.exit(0);

const body = notesFor(readFileSync(file, "utf8"), version);
if (body) process.stdout.write(body + "\n");
