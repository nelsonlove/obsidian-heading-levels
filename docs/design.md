# Heading Levels — design

Org-mode-style heading promotion/demotion for Obsidian, driven entirely from the
editor (no sidebar/outline pane required).

## Goal

Give the editor the four org-mode heading motions, plus whole-note and
selection variants:

- **Promote** = fewer `#` (toward H1). **Demote** = more `#` (toward H6).
- Canonical org-mode modifier mapping:
  - `opt-←/→` → act on the **heading line only**.
  - `opt-shift-←/→` → act on the **heading + its subtree** (children preserved).

## Semantics

The same commands adapt to editor context:

| Trigger | No selection (cursor) | Selection present |
|---|---|---|
| **opt-←/→** ("heading") | shift the current heading line only | shift every heading line the selection touches |
| **opt-shift-←/→** ("subtree") | shift current heading + its subtree | same as above (shift every heading line in selection) |
| **"All headings" command** (no default hotkey) | shift every heading in the note | — |

Rationale for "Shift ignored when a selection exists": shifting every selected
heading line already equals the subtree result when a full subtree is selected,
and is more WYSIWYG when only part of one is selected. Confirmed with user.

Requirement coverage:
- **All headings in a note** → the dedicated command, or select-all + opt-arrow.
- **Selected headings** → opt-arrow with a selection.
- **Single heading + everything below it** → opt-shift-arrow with the cursor in it.

## Rules & guards

- **Heading detection:** ATX only — `^( {0,3})(#{1,6})(\s.*|)$`. A line like
  `#tag` or `#nospace` (no space after the hashes) is **not** a heading and is
  left alone. Up to 3 leading spaces allowed and preserved. Setext (underline)
  headings are ignored.
- **Fenced code blocks:** `#` lines inside ``` or ~~~ fences are never touched.
- **Subtree** = the heading plus all following lines until the next heading of
  equal-or-shallower level. All descendant headings shift by the same delta, so
  relative nesting is preserved.
- **Bounds (levels 1–6):**
  - *Uniform ops* (single heading, subtree, whole note): if the shift would push
    any affected heading out of 1–6, the whole op is **refused** with a `Notice`
    (no partial mangling). Matches org's "cannot promote" refusal.
  - *Selection op*: each heading is **clamped independently** — headings already
    at the boundary stay put; the rest still move.
- Selection/cursor position is preserved across the edit (line count never
  changes).
- Multiple cursors: out of scope — only the primary selection is used.

## Architecture

- `src/headings.ts` — **pure, Obsidian-free** core. Parses headings (fence- and
  ATX-aware) and computes the shifted document. Fully unit-tested.
- `src/main.ts` — thin plugin glue: registers commands + default hotkeys,
  translates the editor's cursor/selection into a `ShiftRequest`, calls the core,
  and applies the returned text (or shows the refusal `Notice`).

### Core API (sketch)

```ts
type Direction = "promote" | "demote";
type Scope =
  | { kind: "cursor"; line: number; subtree: boolean }
  | { kind: "selection"; fromLine: number; toLine: number }
  | { kind: "all" };

interface ShiftRequest { text: string; direction: Direction; scope: Scope; }
interface ShiftResult { text: string; changed: boolean; message?: string; }

function shiftHeadings(req: ShiftRequest): ShiftResult;
```

### Arrow keys — context-sensitive CodeMirror keymap (0.1.1)

`opt+arrow` on macOS **is** word-navigation (natively, and via Karabiner
`opt+b`/`opt+f` → `opt+arrow`). Binding a command to it would permanently
consume the key and break word-nav. So instead of default command hotkeys, the
arrows are handled by a high-precedence CodeMirror keymap that mirrors Emacs
org-mode's context-sensitivity:

- `Alt-ArrowLeft/Right` and `Alt-Shift-ArrowLeft/Right`.
- The handler acts **only when the cursor is at the front of a real heading**
  (no selection; `col <= headingFrontBoundary(line)`; fence-checked via
  `parseHeadings`): promote/demote the heading (or subtree with Shift), consume
  the key.
- Otherwise it returns `false`, so CodeMirror's native word-motion /
  word-selection runs — word-nav keeps working everywhere, including within a
  heading's own text.
- `headingFrontBoundary(lineText)` (pure, in `headings.ts`) returns the title
  start column, or null for non-headings.

### Commands (unbound by default; bindable in Settings → Hotkeys)

| id | name |
|---|---|
| `promote-heading` / `demote-heading` | Promote / Demote heading (cursor or selection) |
| `promote-subtree` / `demote-subtree` | Promote / Demote heading and subtree |
| `promote-all` / `demote-all` | Promote / Demote all headings in note |

These cover selection-wide and whole-note edits; the context-sensitive keymap
above covers the single-heading-at-cursor org-mode motions.

## Non-goals (YAGNI)

- Outline-pane integration (Quiet Outline already covers that).
- Multiple-cursor support.
- Setext heading conversion.
- Subtree expansion beyond the selection when a selection is active.
