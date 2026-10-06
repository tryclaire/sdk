import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const source = fileURLToPath(new URL("../openapi.json", import.meta.url));
const target = fileURLToPath(new URL("../src/schema.ts", import.meta.url));
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/generate.mjs [--check]");
}

const document = JSON.parse(await readFile(source, "utf8"));
const generated = astToString(await openapiTS(document));
if (check) {
  let committed;
  try {
    committed = await readFile(target, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (committed !== generated) {
    throw new Error("src/schema.ts is stale; run npm run generate");
  }
} else {
  await writeFile(target, generated);
}
