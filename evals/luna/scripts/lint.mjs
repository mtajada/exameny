import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = await findModules(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "A module failed syntax validation\n");
    process.exit(1);
  }
}
process.stdout.write(`Syntax validated for ${files.length} modules.\n`);

async function findModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (["node_modules", "output"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findModules(path));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      found.push(path);
    }
  }
  return found.sort();
}
