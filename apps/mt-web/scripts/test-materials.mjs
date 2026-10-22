import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import materialFiles from "../src/data/material-files.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bank = JSON.parse(readFileSync(path.join(projectRoot, "src/data/question-bank.json"), "utf8"));

assert.equal(bank.sources.length, 0);
assert.deepEqual(Object.keys(materialFiles).sort(), bank.sources.map((source) => source.id).sort());

for (const source of bank.sources) {
  const material = materialFiles[source.id];
  const downloadPath = path.join(projectRoot, "public/downloads", material.file);
  const download = readFileSync(downloadPath);
  assert.equal(download.length, material.size, `${source.name} 下载副本大小不一致`);
  assert.equal(createHash("sha256").update(download).digest("hex"), source.sha256, `${source.name} 下载副本哈希不一致`);
}

console.log("test-materials: OK");
