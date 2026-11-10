# Kiro Usage Log

A running log of how Kiro was used to build Candlewatch, for the hackathon write-up.

## 2026-11-10 - Steering docs from the brief

- **Surface:** Kiro CLI (the session ran through `kiro-cli chat`; the brief's plan names the Kiro IDE for this step, so this differs from plan).
- **What was asked:** Read `docs/BRIEF.md` and generate `product.md`, `tech.md` and `structure.md` in `.kiro/steering/`, plus a conditional `scene.md` (fileMatch on `src/scene/**` and `**/*.css`), and start this log. No source code, and no edits to the brief, LICENSE or `.gitignore`.
- **What Kiro produced:** `.kiro/steering/product.md` (the costume-is-function rule, core model, non-goals from section 9), `tech.md` (timestamps not ticks, pure DOM-free engine, stack, scripts, property tests), `structure.md` (planned folders, naming, boundaries), `scene.md` (look, reduced motion, AA contrast, naming rules, "Screenshots stay current"), and this file.
- **What was changed by hand:** Nothing yet.
- **Notable:** `structure.md` is a planned layout, since the brief gives no folder tree; the folder names are Kiro's proposal and should be reviewed. `.kiro/` is tracked, not ignored.
