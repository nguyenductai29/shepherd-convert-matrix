// Cross-platform helper used by Tauri's beforeDevCommand / beforeBuildCommand.
//   node scripts/desktop.mjs dev    -> Vite dev server on http://localhost:1420
//   node scripts/desktop.mjs build  -> static SPA build in dist/client (index.html)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const mode = process.argv[2];
const env = { ...process.env, SHEPHERD_DESKTOP: "1" };
const run = (args) => {
  const r = spawnSync("npx", ["vite", ...args], { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (mode === "dev") {
  run(["dev", "--port", "1420", "--strictPort", "--host", "localhost"]);
} else if (mode === "build") {
  run(["build"]);
  const shell = "dist/client/_shell.html";
  if (!existsSync(shell)) {
    console.error(`[desktop] ${shell} was not produced by the SPA build.`);
    process.exit(1);
  }
  copyFileSync(shell, "dist/client/index.html");
  console.log("[desktop] dist/client/index.html ready for Tauri");
} else {
  console.error("usage: node scripts/desktop.mjs <dev|build>");
  process.exit(1);
}
