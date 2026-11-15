// Rebuilds and retakes everything: build, measure the cards, build again with the cards' real size, shoot, measure.
//   node .kiro/specs/room-art/prototype/run-all.mjs
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));
const run = (...args) => {
  const r = spawnSync(process.execPath, args, { cwd: here, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
rmSync(new URL("card-sizes.json", import.meta.url), { force: true });
run("build.mjs");
run("measure.mjs", "--cards");
run("build.mjs");
run("shoot.mjs");
run("measure.mjs");
