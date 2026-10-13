// changelog.mjs — the one reading of CHANGELOG.md the kit uses everywhere: version-bump.mjs (the npm version path), release-notes.mjs (the Release workflow) and kit-release (through the kit's lib). One file, no dependencies.
//
// Shape: "## Unreleased" (or "## [Unreleased]") at the top, then one "## <version> — <date>" (or "## [<version>] - <date>") section per release, newest first. A bullet line that is only "-" or "*" is the template's placeholder and is never notes. LF, CRLF and a mix of the two are read; only the lines that are rewritten take the section's own ending, so an untouched line keeps its ending and the diff stays on the moved section.

/** A line that is only a bullet marker: the template's placeholder, never a note. */
export const isPlaceholder = (line) => /^[ \t]*[-*][ \t]*$/.test(line);

/** Finds the section whose heading matches `headingRe` (tested against a heading line without its line ending). Returns { headingStart, bodyStart, end, eol } as offsets into `text`, or null. `end` is the offset of the next "## " heading, or text.length. */
export function findSection(text, headingRe) {
  const lineRe = /^(.*?)(\r?\n|$)/gm;
  let m;
  while ((m = lineRe.exec(text)) !== null) {
    if (m[0] === "" && m.index >= text.length) break;
    const line = m[1];
    if (headingRe.test(line)) {
      const headingStart = m.index;
      const eol = m[2] || "\n";
      const bodyStart = m.index + m[0].length;
      const rest = text.slice(bodyStart);
      const next = rest.search(/^## /m);
      return { headingStart, bodyStart, end: next === -1 ? text.length : bodyStart + next, eol };
    }
    if (m[0] === "") lineRe.lastIndex++;
  }
  return null;
}

/** The notes of one section, placeholder bullets dropped, leading and trailing blank lines trimmed; an array of lines. */
export function sectionNotes(text, section) {
  const body = text.slice(section.bodyStart, section.end).split(/\r?\n/).filter((l) => !isPlaceholder(l));
  while (body.length && body[0].trim() === "") body.shift();
  while (body.length && body[body.length - 1].trim() === "") body.pop();
  return body;
}

/** The release notes for `version`: the body of its section as one string, or "" when the section is missing or holds nothing but the placeholder. */
export function notesFor(text, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = findSection(text, new RegExp(`^## \\[?${escaped}\\]?(\\s|$)`));
  if (!section) return "";
  return sectionNotes(text, section).join("\n").trim();
}

/**
 * Moves the Unreleased body under a new "## <version> — <date>" heading and leaves a fresh "-" placeholder above it.
 * Returns { changed: true, text }; or { changed: false, text, reason: "no-section" } when there is no Unreleased heading; or { changed: false, text, reason: "empty" } when Unreleased holds nothing but the placeholder, in which case no empty version section is written.
 */
export function rollChangelog(text, version, date) {
  const section = findSection(text, /^## \[?Unreleased\]?[ \t]*$/i);
  if (!section) return { changed: false, text, reason: "no-section" };
  const body = sectionNotes(text, section);
  if (body.length === 0) return { changed: false, text, reason: "empty" };
  const { eol } = section;
  const heading = text.slice(section.headingStart, section.bodyStart).replace(/\s+$/, "");
  // The fresh placeholder is a bare "-": a trailing space would churn under editors that strip it and under markdownlint MD009.
  const rewritten = [heading, "", "-", "", `## ${version} — ${date}`, "", ...body, ""].join(eol);
  const tail = text.slice(section.end);
  return { changed: true, text: text.slice(0, section.headingStart) + rewritten + (tail ? eol + tail : "") };
}
