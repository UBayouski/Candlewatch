// Loads the real source files of src/ (TypeScript, types stripped by Node) so the prototype reads the real geometry and
// markup and never copies them by eye. Node 22.18+ strips types; this hook only adds the missing ".ts" to relative imports.
import { registerHooks } from "node:module";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".")) {
        for (const s of [`${spec}.ts`, `${spec}/index.ts`]) {
          try {
            return next(s, ctx);
          } catch {
            /* try the next form */
          }
        }
      }
      throw e;
    }
  },
});

const root = new URL("../../../../src/", import.meta.url);
export const layout = await import(new URL("ui/layout.ts", root));
export const geometry = await import(new URL("graveyard/geometry.ts", root));
export const room = await import(new URL("scene/room.ts", root));
export const sceneConstants = await import(new URL("scene/constants.ts", root));
export const visible = await import(new URL("graveyard/visible.ts", root));
export const plan = await import(new URL("graveyard/plan.ts", root));
export const slots = await import(new URL("ghosts/slots.ts", root));
export const engine = await import(new URL("engine/index.ts", root));
export const { STRINGS } = await import(new URL("strings.ts", root));
export const SRC = root;

