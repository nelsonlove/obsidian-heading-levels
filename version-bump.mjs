// Runs from `npm version <bump>`: copies the new package.json version into manifest.json, records it in versions.json against the current minAppVersion, turns the CHANGELOG's "## Unreleased" section into this version's section so the release notes find it, and stages exactly the files it wrote. Standard Obsidian sample-plugin behaviour plus the changelog, keeping each file's own indentation and line endings.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// `npm version x.y.z` sets npm_command to "version" and bumps package.json first; `npm run version` (an easy slip) sets it to "run-script" and would roll the Unreleased notes under the version that is already released.
if (process.env.npm_command !== "version") {
  console.error(`version-bump: run this through \`npm version <patch|minor|major|x.y.z>\`, not directly or with npm run (npm_command is ${process.env.npm_command ?? "unset"}).`);
  process.exit(1);
}
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("version-bump: npm_package_version is not set; run this through `npm version`.");
  process.exit(1);
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

// Same rules as obsidian-release-kit's rollChangelog (bin/lib.mjs; a kit test checks the two agree): the Unreleased body moves under the version heading, placeholder bullets (a line that is only "-" or "*") are dropped, a fresh Unreleased placeholder is left above, and the file's line ending is kept.
if (existsSync("CHANGELOG.md")) {
  const text = readFileSync("CHANGELOG.md", "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const start = lines.findIndex((l) => /^## \[?Unreleased\]?[ \t]*$/i.test(l));
  if (start !== -1) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        end = i;
        break;
      }
    }
    const body = lines.slice(start + 1, end).filter((l) => !/^[ \t]*[-*][ \t]*$/.test(l));
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();
    if (body.length === 0) {
      // Nothing written under Unreleased: no empty version section; the release notes will be GitHub's generated ones.
      console.error(`version-bump: CHANGELOG.md's Unreleased section is empty; no ${targetVersion} section written`);
    } else {
      const section = [`## ${targetVersion} — ${today}`, "", ...body, ""];
      write("CHANGELOG.md", [...lines.slice(0, start), lines[start].trim(), "", "-", "", ...section, ...lines.slice(end)].join(eol));
    }
  } else {
    console.error("version-bump: CHANGELOG.md has no '## Unreleased' section; nothing rolled into the release notes");
  }
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
      // Put the files back as they were; npm's own package.json bump is the one change left, and npm reports the failure.
      for (const [path, text] of originals) writeFileSync(path, text);
      console.error(`version-bump: git add failed (${e.message}); ${[...originals.keys()].join(", ")} were put back as they were, and nothing is staged. Fix git (an index.lock?) and run npm version again.`);
      process.exit(1);
    }
  }
}
