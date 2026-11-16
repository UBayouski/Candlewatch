---
inclusion: fileMatch
fileMatchPattern: ["src/scene/**", "**/*.css"]
---

# Candlewatch - Scene and visual rules

Applies when working on `src/scene/**` or any CSS. Remember the core rule: the costume is the function; every spooky element shows one piece of state, and a still setting is drawn only where the candle's light or the window's light falls on it (the Lit Setting rule, `product.md`).

## The look

- A dark, painterly room lit only by the candle: deep blue-black walls, warm amber light, wax in ivory.
- Nothing like a retro OS, not 1-bit, not a spreadsheet. It must look nothing like the other entries by the same author.
- SVG and CSS only: candle, wax drips, flame (layered radial gradients with a seeded flicker), light pool (radial mask whose radius follows the wax), ghosts (translucent shapes with eyes, a soft glow and a slow drift, in their own layer, `src/ghosts/`), and the setting (wall, table, holder, window frame), drawn in one group below the night layer so that the pool and the window's light light it.
- The Door at the left of the floor is a wooden door and shows one piece of state: usable (an amber handle, no bar) when no candle burns, barred (a bar, no handle) while a session runs. The graveyard view (`src/graveyard/`) is a place with a sky, a ground and a wooden shelf, in the scene's palette and room units, and runs edge to edge above the floor line.
- The pool carries a warm tint and is not drawn in idle. The Window_Light and the wall fade toward the left and right edges by the Edge_Shade and the Wall_Veil. The zone's shadow is short so the table and the Holder stay lit (`room-art`, being built).
- Responsive from a phone in portrait to a wide desktop.

## Reduced motion

- `prefers-reduced-motion: reduce` gets a still version: no flicker, no drift, ghosts as still silhouettes.
- The still version must still show every state, by size, colour and text. Never rely on motion alone to communicate state.

## Contrast

- The time text meets WCAG AA (4.5:1, or 3:1 if large text) against the room at every light level, including the darkest minute. Check the extremes, not just the default.
- Focus is always visible.
- Non-text graphics that carry state (a ghost's outline and eyes, the Door's border, bar and handle, a Stone's edge, a Stub's wax) need 3:1 against what is next to them; the tests compute it from the stylesheets.
- Setting colours stay between the room's darkest and brightest published stops, after lighting; the costume reviewer judges that none is mistaken for a state colour.
- The scene's accessible name never contains a time; it ends with the distraction count in words.

## Naming

- No trademarks, logos or real product names anywhere (code, copy, assets, fonts' marketing names in UI).
- Never write the word "Pomodoro". Say "focus session".

## Screenshots stay current

Any change that alters what a user sees must retake the affected screenshots in `docs/screenshots/` before the work counts as done. This includes scene, CSS, copy and layout changes. State in the task summary which screenshots were retaken.
