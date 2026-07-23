import { Editor, EditorChange, Notice, Plugin } from "obsidian";
import { ChangeSpec, EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  Direction,
  Scope,
  headingFrontBoundary,
  parseHeadings,
  shiftHeadings,
} from "./headings";

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
    // Commands are unbound by default: `opt+arrow` is macOS word-navigation, so
    // binding a command to it would hijack word-nav everywhere. Instead we
    // handle the arrows via a CodeMirror keymap that acts only at a heading's
    // front and otherwise falls through to native word-nav (see below). These
    // commands stay available for the palette, selection, and whole-note use,
    // and can be bound to any non-conflicting hotkey in Settings → Hotkeys.
    const cmd = (
      id: string,
      name: string,
      direction: Direction,
      variant: Variant,
    ) => {
      this.addCommand({
        id,
        name,
        editorCallback: (editor: Editor) => this.run(editor, direction, variant),
      });
    };

    cmd("promote-heading", "Promote heading", "promote", "heading");
    cmd("demote-heading", "Demote heading", "demote", "heading");
    cmd("promote-subtree", "Promote heading and subtree", "promote", "subtree");
    cmd("demote-subtree", "Demote heading and subtree", "demote", "subtree");
    cmd("promote-all", "Promote all headings in note", "promote", "all");
    cmd("demote-all", "Demote all headings in note", "demote", "all");

    this.registerEditorExtension(this.headingKeymap());
  }

  /**
   * Org-mode-style context-sensitive arrow handling. At the *front* of a
   * heading, `opt+arrow` promotes/demotes (and `opt+shift+arrow` the subtree);
   * anywhere else the handler returns false so CodeMirror's native word-motion
   * (and word-selection with Shift) runs instead — which is what keeps macOS /
   * Karabiner `opt`-based word navigation working.
   */
  private headingKeymap(): Extension {
    const bind = (key: string, direction: Direction, subtree: boolean) => ({
      key,
      run: (view: EditorView) => this.handleArrowKey(view, direction, subtree),
    });
    return Prec.highest(
      keymap.of([
        bind("Alt-ArrowLeft", "promote", false),
        bind("Alt-ArrowRight", "demote", false),
        bind("Alt-Shift-ArrowLeft", "promote", true),
        bind("Alt-Shift-ArrowRight", "demote", true),
      ]),
    );
  }

  private handleArrowKey(
    view: EditorView,
    direction: Direction,
    subtree: boolean,
  ): boolean {
    const { state } = view;
    const sel = state.selection.main;
    // A real selection → let native word-selection handle the arrow.
    if (!sel.empty) return false;

    const line = state.doc.lineAt(sel.head);
    const col = sel.head - line.from;
    const boundary = headingFrontBoundary(line.text);
    // Not a heading, or the cursor is past the front of the title → word-nav.
    if (boundary === null || col > boundary) return false;

    // Confirm it's a real heading (fence-aware) before acting.
    const text = state.doc.toString();
    const lineNo = line.number - 1;
    if (!parseHeadings(text).some((h) => h.line === lineNo)) return false;

    const result = shiftHeadings({
      text,
      direction,
      scope: { kind: "cursor", line: lineNo, subtree },
    });
    // Refused (e.g. promote past H1 / demote past H6): consume the key so it
    // doesn't fall through to a surprising word-nav; org-mode just declines too.
    if (!result.changed) return true;

    const changes = cmChanges(state, text, result.text);
    if (changes.length === 0) return true;
    view.dispatch({ changes, userEvent: "input.heading-levels" });
    return true;
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

/** Per-line CodeMirror changes from an old→new full-text diff (line count fixed). */
function cmChanges(
  state: EditorState,
  oldText: string,
  newText: string,
): ChangeSpec[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const changes: ChangeSpec[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    if (oldLines[i] !== newLines[i]) {
      const line = state.doc.line(i + 1);
      changes.push({ from: line.from, to: line.to, insert: newLines[i] });
    }
  }
  return changes;
}
