import { Editor, EditorChange, Notice, Plugin } from "obsidian";
import { Direction, Scope, shiftHeadings } from "./headings";

type Variant = "heading" | "subtree" | "all";

/**
 * Build a {@link Scope} from the editor's primary selection.
 *
 * - "all" ignores the selection and targets every heading in the note.
 * - With a real selection, every heading line the selection touches is shifted
 *   (Shift is intentionally ignored in this mode — see docs/design.md).
 * - With just a cursor, "subtree" also shifts descendants; "heading" does not.
 */
function scopeFor(editor: Editor, variant: Variant): Scope {
  if (variant === "all") return { kind: "all" };

  const sel = editor.listSelections()[0];
  const a = sel.anchor;
  const b = sel.head;
  const before = a.line < b.line || (a.line === b.line && a.ch <= b.ch);
  const from = before ? a : b;
  const to = before ? b : a;

  const hasSelection = from.line !== to.line || from.ch !== to.ch;
  if (hasSelection) {
    // A selection that ends at column 0 doesn't really include that last line.
    const toLine = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
    return { kind: "selection", fromLine: from.line, toLine };
  }

  return { kind: "cursor", line: from.line, subtree: variant === "subtree" };
}

/**
 * Turn the old→new full-text change into per-line editor changes. The line
 * count never changes, so we replace only the lines that differ. `to.ch` comes
 * from the editor's own line length (authoritative regardless of how the buffer
 * handles carriage returns), not from the LF-split string.
 */
function diffToChanges(
  editor: Editor,
  oldText: string,
  newText: string,
): EditorChange[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const changes: EditorChange[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes.push({
        from: { line: i, ch: 0 },
        to: { line: i, ch: editor.getLine(i).length },
        text: newLines[i],
      });
    }
  }
  return changes;
}

export default class HeadingLevelsPlugin extends Plugin {
  async onload() {
    const cmd = (
      id: string,
      name: string,
      direction: Direction,
      variant: Variant,
      hotkeys?: { modifiers: ("Alt" | "Shift" | "Mod" | "Ctrl")[]; key: string }[],
    ) => {
      this.addCommand({
        id,
        name,
        hotkeys,
        editorCallback: (editor: Editor) => this.run(editor, direction, variant),
      });
    };

    cmd("promote-heading", "Promote heading", "promote", "heading", [
      { modifiers: ["Alt"], key: "ArrowLeft" },
    ]);
    cmd("demote-heading", "Demote heading", "demote", "heading", [
      { modifiers: ["Alt"], key: "ArrowRight" },
    ]);
    cmd("promote-subtree", "Promote heading and subtree", "promote", "subtree", [
      { modifiers: ["Alt", "Shift"], key: "ArrowLeft" },
    ]);
    cmd("demote-subtree", "Demote heading and subtree", "demote", "subtree", [
      { modifiers: ["Alt", "Shift"], key: "ArrowRight" },
    ]);
    cmd("promote-all", "Promote all headings in note", "promote", "all");
    cmd("demote-all", "Demote all headings in note", "demote", "all");
  }

  private run(editor: Editor, direction: Direction, variant: Variant) {
    const text = editor.getValue();
    const scope = scopeFor(editor, variant);
    const result = shiftHeadings({ text, direction, scope });

    if (!result.changed) {
      if (result.message) new Notice(result.message);
      return;
    }

    const changes = diffToChanges(editor, text, result.text);
    if (changes.length === 0) return;
    // A single transaction = one undo step; the editor maps the cursor for us.
    editor.transaction({ changes });
  }
}
