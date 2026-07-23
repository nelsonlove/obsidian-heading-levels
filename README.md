# Heading Levels

Promote and demote Markdown headings straight from the Obsidian editor, with
**org-mode-style hotkeys**. No outline pane required — your cursor and selection
drive everything.

## Motions

Canonical org-mode modifier mapping (**←** promotes toward H1, **→** demotes toward H6):

| Hotkey (default) | Command | What it does |
|---|---|---|
| `Opt-←` / `Opt-→` | Promote / Demote heading | Shift **just the heading** on the cursor line. With a selection, shift **every heading line the selection touches**. |
| `Opt-Shift-←` / `Opt-Shift-→` | Promote / Demote heading and subtree | Shift the **heading plus its whole subtree** (children preserved). |
| _(unbound)_ | Promote / Demote all headings in note | Shift **every heading in the note**. |

All six are ordinary commands — rebind them in **Settings → Hotkeys** (search
"Heading Levels").

> On macOS `Opt` is the `Alt` modifier. The default `Alt+Arrow` bindings can
> collide with word-wise cursor motion in some setups; if so, just rebind.

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
