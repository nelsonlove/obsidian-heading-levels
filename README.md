# Heading Levels

Promote and demote Markdown headings straight from the Obsidian editor, with
**org-mode-style hotkeys**. No outline pane required — your cursor and selection
drive everything.

## The org-mode arrow keys

Just like Emacs org-mode, the arrow keys are **context-sensitive** (**←**
promotes toward H1, **→** demotes toward H6):

| Key | At the **front** of a heading | Anywhere else |
|---|---|---|
| `opt+←` / `opt+→` | promote / demote **the heading** | normal word-navigation |
| `opt+shift+←` / `opt+shift+→` | promote / demote **the heading + its subtree** | normal word-selection |

"At the front" means the cursor is at or before the first character of the
heading's title (only the `#`s/spaces to its left). Once you're *into* the
heading's text — or on any non-heading line — the arrows fall through to macOS's
native `opt`-word motion, so word navigation keeps working everywhere.

This is why the keys are handled by a CodeMirror keymap rather than bound as
commands: a bound command would *always* consume `opt+arrow` and permanently
break word-nav (which on macOS — and via Karabiner `opt+b`/`opt+f` — is exactly
`opt+arrow`).

### Commands (unbound by default)

For selection-wide and whole-note edits, six commands are available in the
palette and rebindable in **Settings → Hotkeys** ("Heading Levels"):

- **Promote / Demote heading** — the heading on the cursor line, or, with a
  selection, every heading line the selection touches.
- **Promote / Demote heading and subtree** — the heading plus its subtree.
- **Promote / Demote all headings in note** — every heading in the note.

## Behavior notes

- With a selection, Shift is ignored — shifting the selected heading lines
  already equals the subtree result when a full subtree is selected, and is more
  predictable when only part of one is.
- **Single heading / subtree / whole note** ops are *uniform*: if the shift would
  push any affected heading past H1 or H6, the whole op is refused (with a
  notice) rather than partially applied.
- **Selection** ops clamp each heading independently — ones already at the
  boundary stay put, the rest still move.
- Only real ATX headings are touched. `#tag` and other `#`-without-a-space lines,
  and any `#` lines inside fenced code blocks, are left alone.

## Development

```bash
npm install
npm test        # vitest — the heading math is a pure, fully-tested module
npm run dev     # esbuild watch
npm run build   # typecheck + production bundle -> main.js
```

The interesting logic lives in `src/headings.ts` (no Obsidian imports, unit
tested in `src/headings.test.ts`); `src/main.ts` is thin glue that maps the
editor's cursor/selection onto it. See `docs/design.md`.

## License

MIT
