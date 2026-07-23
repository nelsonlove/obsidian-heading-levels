/**
 * Pure heading math for the Heading Levels plugin.
 *
 * This module is deliberately free of any Obsidian imports so it can be
 * unit-tested in isolation. `src/main.ts` is the only place that touches the
 * editor; it translates cursor/selection state into a {@link ShiftRequest},
 * calls {@link shiftHeadings}, and applies the result.
 */

export type Direction = "promote" | "demote";

export type Scope =
  | { kind: "cursor"; line: number; subtree: boolean }
  | { kind: "selection"; fromLine: number; toLine: number }
  | { kind: "all" };

export interface ShiftRequest {
  text: string;
  direction: Direction;
  scope: Scope;
}

export interface ShiftResult {
  text: string;
  changed: boolean;
  /** Set when the op was refused or was a no-op; suitable for a Notice. */
  message?: string;
}

export interface Heading {
  /** 0-indexed line number. */
  line: number;
  /** Number of leading hashes, 1–6. */
  level: number;
}

const MIN_LEVEL = 1;
const MAX_LEVEL = 6;

/** ATX heading: up to 3 leading spaces, 1–6 hashes, then whitespace or EOL. */
const HEADING_RE = /^( {0,3})(#{1,6})(\s.*)?(\r?)$/;
/**
 * A code fence line: up to 3 leading spaces then 3+ backticks or tildes.
 * The trailing `\r?` keeps this working on CRLF documents (`.` excludes CR).
 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)\r?$/;

/** A parsed ATX heading with everything needed to rewrite its line. */
interface ParsedHeading extends Heading {
  indent: string;
  rest: string;
  /** Trailing carriage return, preserved on CRLF documents. */
  cr: string;
}

/**
 * If `lineText` is an ATX heading, return the column where its title text
 * begins (just past the indent, hashes, and the whitespace after them) — the
 * boundary at/before which a cursor is considered to be "at the front" of the
 * heading. Returns null if the line is not an ATX heading.
 *
 * NB: this is a per-line check and is NOT fence-aware; callers that must exclude
 * code-fenced lines should cross-check against {@link parseHeadings}.
 */
export function headingFrontBoundary(lineText: string): number | null {
  const m = HEADING_RE.exec(lineText);
  if (!m) return null;
  const indent = m[1];
  const hashes = m[2];
  const rest = m[3] ?? "";
  const lead = /^\s*/.exec(rest)?.[0].length ?? 0;
  return indent.length + hashes.length + lead;
}

/**
 * Track fenced-code-block state line by line. A fence opens on a run of 3+
 * backticks/tildes and closes on a same-or-longer run of the same character
 * with no trailing content (info strings are only allowed on the opener).
 */
function scanFences(lines: string[]): boolean[] {
  const inFence: boolean[] = new Array(lines.length);
  let fence: { char: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_RE.exec(lines[i]);
    if (fence === null) {
      inFence[i] = false; // the opening fence line itself is not "inside"
      if (m) fence = { char: m[1][0], len: m[1].length };
    } else {
      inFence[i] = true; // fence lines and their content are inside
      const closes =
        m !== null &&
        m[1][0] === fence.char &&
        m[1].length >= fence.len &&
        m[2].trim() === "";
      if (closes) fence = null;
    }
  }
  return inFence;
}

/** Parse ATX headings from pre-split lines and their fence mask. */
function parseHeadingLines(lines: string[], inFence: boolean[]): ParsedHeading[] {
  const out: ParsedHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    out.push({
      line: i,
      level: m[2].length,
      indent: m[1],
      rest: m[3] ?? "",
      cr: m[4] ?? "",
    });
  }
  return out;
}

export function parseHeadings(text: string): Heading[] {
  const lines = text.split("\n");
  return parseHeadingLines(lines, scanFences(lines)).map(({ line, level }) => ({
    line,
    level,
  }));
}

function clamp(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
}

function delta(direction: Direction): number {
  return direction === "promote" ? -1 : 1;
}

function refused(text: string, direction: Direction): ShiftResult {
  const verb = direction === "promote" ? "promote past H1" : "demote past H6";
  return { text, changed: false, message: `Cannot ${verb}.` };
}

function noTargetMessage(scope: Scope): string {
  switch (scope.kind) {
    case "cursor":
      return "No heading at the cursor.";
    case "selection":
      return "No headings in the selection.";
    case "all":
      return "No headings in this note.";
  }
}

/**
 * Resolve which headings an operation targets, plus whether bounds are enforced
 * uniformly (refuse the whole op) or per-heading (clamp).
 */
function resolveTargets(
  headings: ParsedHeading[],
  scope: Scope,
): { targets: ParsedHeading[]; mode: "uniform" | "clamp" } {
  if (scope.kind === "all") {
    return { targets: headings, mode: "uniform" };
  }

  if (scope.kind === "selection") {
    const targets = headings.filter(
      (h) => h.line >= scope.fromLine && h.line <= scope.toLine,
    );
    return { targets, mode: "clamp" };
  }

  // cursor: nearest heading at or before the cursor line.
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= scope.line) idx = i;
    else break;
  }
  if (idx === -1) return { targets: [], mode: "uniform" };

  if (!scope.subtree) {
    return { targets: [headings[idx]], mode: "uniform" };
  }

  // subtree: the heading plus following headings deeper than it.
  const rootLevel = headings[idx].level;
  const targets = [headings[idx]];
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level > rootLevel) targets.push(headings[i]);
    else break;
  }
  return { targets, mode: "uniform" };
}

export function shiftHeadings(req: ShiftRequest): ShiftResult {
  const { text, direction, scope } = req;
  const lines = text.split("\n");
  const inFence = scanFences(lines);
  const headings = parseHeadingLines(lines, inFence);

  const { targets, mode } = resolveTargets(headings, scope);
  if (targets.length === 0) {
    return { text, changed: false, message: noTargetMessage(scope) };
  }

  const d = delta(direction);

  if (mode === "uniform") {
    // Refuse the whole op if any target would leave the valid range.
    for (const h of targets) {
      const next = h.level + d;
      if (next < MIN_LEVEL || next > MAX_LEVEL) {
        return refused(text, direction);
      }
    }
  }

  const rewrites = new Map<number, string>();
  for (const h of targets) {
    const next = clamp(h.level + d);
    if (next === h.level) continue;
    rewrites.set(h.line, h.indent + "#".repeat(next) + h.rest + h.cr);
  }

  if (rewrites.size === 0) return refused(text, direction);

  const newLines = lines.map((raw, i) => rewrites.get(i) ?? raw);
  return { text: newLines.join("\n"), changed: true };
}
