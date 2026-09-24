import { copyFileSync, readFileSync } from "node:fs";
// The CommonJS backend and independently built website cannot import workspace TS at runtime.
// Keep their generated portable modules byte-identical; --check runs without modifying files.
const pairs = [
  ["packages/analytics/src/index.ts", "packages/domain/src/analytics.ts"],
  [
    "packages/analytics/src/index.ts",
    "backend/src/general/analytics/contracts.ts",
  ],
  ...["index", "client", "web"].map((name) => [
    `packages/analytics/src/${name}.ts`,
    `official-site/app/lib/analytics/${name}.ts`,
  ]),
];
for (const [source, target] of pairs) {
  if (process.argv.includes("--check")) {
    if (readFileSync(source, "utf8") !== readFileSync(target, "utf8"))
      throw new Error(`Analytics mirror out of date: ${target}`);
  } else copyFileSync(source, target);
}
