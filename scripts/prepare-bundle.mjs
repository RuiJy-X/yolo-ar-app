import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceBackend = path.join(root, "backend", "act_reg_final_version");
const bundle = path.join(root, "backend-bundle");
const frontend = path.join(root, "dist");

const required = [
  "websocket_api.py",
  "utils.py",
  "feeders",
  "graph",
  "model",
  "ffmpeg",
  "yolo-best.pt",
  "yolo11n-pose.pt",
  "results",
];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const missing = [];
for (const name of required) {
  if (!(await exists(path.join(sourceBackend, name)))) missing.push(name);
}
if (!(await exists(frontend))) missing.push("dist (run npm run build first)");

if (missing.length > 0) {
  throw new Error(`Cannot prepare bundle; missing: ${missing.join(", ")}`);
}

await rm(bundle, { recursive: true, force: true });
await mkdir(bundle, { recursive: true });

for (const name of required) {
  await cp(path.join(sourceBackend, name), path.join(bundle, name), {
    recursive: true,
  });
}
await cp(frontend, path.join(bundle, "frontend"), { recursive: true });

console.log("Prepared backend-bundle from source and dist.");