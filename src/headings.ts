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
/** A code fence line: up to 3 leading spaces then 3+ backticks or tildes. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface ParsedLine {
  raw: string;
  heading: { indent: string; level: number; rest: string; cr: string } | null;
}

function parseLine(raw: string, inFence: boolean): ParsedLine {
  if (inFence) return { raw, heading: null };
  const m = HEADING_RE.exec(raw);
  if (!m) return { raw, heading: null };
  return {
    raw,
    heading: {
      indent: m[1],
      level: m[2].length,
      rest: m[3] ?? "",
      cr: m[4] ?? "",
    },
  };
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

export function parseHeadings(text: string): Heading[] {
  const lines = text.split("\n");
  const inFence = scanFences(lines);
  const out: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const p = parseLine(lines[i], inFence[i]);
    if (p.heading) out.push({ line: i, level: p.heading.level });
  }
  return out;
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

/**
 * Resolve which heading lines an operation targets, plus whether bounds are
 * enforced uniformly (refuse the whole op) or per-heading (clamp).
 */
function resolveTargets(
  headings: Heading[],
  scope: Scope,
): { lines: number[]; mode: "uniform" | "clamp"; message?: string } {
  if (scope.kind === "all") {
    return { lines: headings.map((h) => h.line), mode: "uniform" };
  }

  if (scope.kind === "selection") {
    const lines = headings
      .filter((h) => h.line >= scope.fromLine && h.line <= scope.toLine)
      .map((h) => h.line);
    return { lines, mode: "clamp" };
  }

  // cursor: nearest heading at or before the cursor line.
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= scope.line) idx = i;
    else break;
  }
  if (idx === -1) {
    return { lines: [], mode: "uniform", message: "No heading here." };
  }

  if (!scope.subtree) {
    return { lines: [headings[idx].line], mode: "uniform" };
  }

  // subtree: the heading plus following headings deeper than it.
  const rootLevel = headings[idx].level;
  const lines = [headings[idx].line];
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level > rootLevel) lines.push(headings[i].line);
    else break;
  }
  return { lines, mode: "uniform" };
}

export function shiftHeadings(req: ShiftRequest): ShiftResult {
  const { text, direction, scope } = req;
  const lines = text.split("\n");
  const inFence = scanFences(lines);
  const headings = parseHeadings(text);

  const { lines: targetLines, mode, message } = resolveTargets(headings, scope);
  if (message) return { text, changed: false, message };
  if (targetLines.length === 0) return { text, changed: false };

  const d = delta(direction);
  const targetSet = new Set(targetLines);

  if (mode === "uniform") {
    // Refuse the whole op if any target would leave the valid range.
    for (const line of targetLines) {
      const p = parseLine(lines[line], inFence[line]);
      if (!p.heading) continue;
      const next = p.heading.level + d;
      if (next < MIN_LEVEL || next > MAX_LEVEL) {
        return refused(text, direction);
      }
    }
  }

  let changed = false;
  const newLines = lines.map((raw, i) => {
    if (!targetSet.has(i)) return raw;
    const p = parseLine(raw, inFence[i]);
    if (!p.heading) return raw;
    const next = clamp(p.heading.level + d);
    if (next === p.heading.level) return raw;
    changed = true;
    return p.heading.indent + "#".repeat(next) + p.heading.rest + p.heading.cr;
  });

  if (!changed) return refused(text, direction);
  return { text: newLines.join("\n"), changed: true };
}
