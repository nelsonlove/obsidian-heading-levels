// Runs from `npm version <bump>`: runs preflight's promise checks, copies the new package.json version into manifest.json, records it in versions.json against the current minAppVersion, turns the CHANGELOG's "## Unreleased" section into this version's section so the release notes find it, and stages exactly the files it wrote. Standard Obsidian sample-plugin behaviour plus the changelog, keeping each file's own indentation and line endings.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { rollChangelog } from "./scripts/changelog.mjs";

// `npm version x.y.z` sets npm_command to "version" and bumps package.json first; `npm run version` (an easy slip) sets it to "run-script" and would roll the Unreleased notes under the version that is already released. Only npm is recognised: yarn classic exposes nothing that tells `yarn version` from `yarn run version`.
if (process.env.npm_command !== "version") {
  console.error(`version-bump: run this through \`npm version <patch|minor|major|x.y.z>\`, not directly, with npm run, or with another package manager (npm_command is ${process.env.npm_command ?? "unset"}).`);
  process.exit(1);
}
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("version-bump: npm_package_version is not set; run this through `npm version`.");
  process.exit(1);
}

// The same gate kit-release applies before it writes anything: a template placeholder still in a root doc, or a SECURITY.md that promises a reporting route GitHub says is off, stops the bump here rather than in the Release workflow after the tag is up. Offline, so the bump does not need the network; the Release workflow repeats the checks online.
if (existsSync("scripts/preflight.mjs")) {
  const pre = spawnSync(process.execPath, ["scripts/preflight.mjs", "--promises", "--offline", "--bumping-to", targetVersion], { stdio: "inherit" });
  if (pre.status !== 0) {
    console.error("version-bump: preflight failed; fix it first (npm has already bumped package.json and package-lock.json: `git checkout -- package.json package-lock.json` to undo)");
    process.exit(1);
  }
}

// Every file is read before it is written, so a failure at the end can put the exact bytes back.
const originals = new Map();
const written = [];
function write(path, text) {
  if (!originals.has(path)) originals.set(path, readFileSync(path, "utf8"));
  writeFileSync(path, text);
  written.push(path);
}

function rewrite(path, change) {
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  change(data);
  const indent = raw.match(/^[ \t]+/m)?.[0] ?? "\t";
  write(path, JSON.stringify(data, null, indent) + "\n");
  return data;
}

const manifest = rewrite("manifest.json", (m) => (m.version = targetVersion));
rewrite("versions.json", (v) => (v[targetVersion] = manifest.minAppVersion));

// Local calendar date, not toISOString(): that is the UTC date, a day ahead in the evening west of Greenwich.
const today = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

if (existsSync("CHANGELOG.md")) {
  const rolled = rollChangelog(readFileSync("CHANGELOG.md", "utf8"), targetVersion, today);
  if (rolled.changed) write("CHANGELOG.md", rolled.text);
  else if (rolled.reason === "no-section") console.error("version-bump: CHANGELOG.md has no '## Unreleased' section; nothing rolled into the release notes");
  else console.error(`version-bump: CHANGELOG.md's Unreleased section is empty; no ${targetVersion} section written, and the release notes will be GitHub's generated ones`);
}

// Stage only what was written, so an absent or gitignored CHANGELOG cannot abort the bump. Outside a git work tree there is nothing to stage; inside one, a failing `git add` must fail the bump, or npm would commit and tag a half-done release.
let inGit = false;
try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  inGit = true;
} catch {
  // not a git work tree
}
if (inGit) {
  const stageable = written.filter((f) => {
    try {
      execFileSync("git", ["check-ignore", "-q", f], { stdio: "ignore" });
      console.error(`version-bump: ${f} is gitignored; updated on disk, not staged`);
      return false;
    } catch {
      return true;
    }
  });
  if (stageable.length) {
    try {
      execFileSync("git", ["add", ...stageable], { stdio: "inherit" });
    } catch (e) {
      // Put the files back as they were; npm's own bump of package.json and package-lock.json is what is left, and npm reports the failure.
      for (const [path, text] of originals) writeFileSync(path, text);
      console.error(`version-bump: git add failed (${e.message}); ${[...originals.keys()].join(", ")} were put back as they were, and nothing is staged. Fix git (an index.lock?), \`git checkout -- package.json package-lock.json\`, and run npm version again.`);
      process.exit(1);
    }
  }
}
