# Heading Levels

Promote and demote Markdown headings straight from the Obsidian editor,
org-mode style. No outline pane required — your cursor and selection drive
everything.

## Commands (unbound by default)

Six commands are available in the palette and bindable in
**Settings → Hotkeys** ("Heading Levels"). **Promote** moves toward H1,
**Demote** toward H6:

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
