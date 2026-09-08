import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(scriptDir, "../src");
const platformTimeLibrary = path.normalize(
  path.join(srcDir, "lib/platform-time.ts"),
);

const sourceExtensions = new Set([".ts", ".tsx"]);
const violations = [];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }

  return files;
}

function record(filePath, node, message) {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push(
    `${path.relative(path.resolve(scriptDir, ".."), filePath)}:${position.line + 1}:${position.character + 1} ${message}`,
  );
}

function isIntlDateTimeFormat(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Intl" &&
    node.name.text === "DateTimeFormat"
  );
}

function isDirectDateConstruction(node) {
  return (
    (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Date"
  );
}

for (const filePath of walk(srcDir)) {
  const normalizedPath = path.normalize(filePath);
  const text = fs.readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function inspect(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "toLocaleDateString" ||
        node.expression.name.text === "toLocaleTimeString")
    ) {
      record(
        filePath,
        node,
        `${node.expression.name.text} is browser-locale dependent; use lib/platform-time.ts.`,
      );
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "toLocaleString" &&
      isDirectDateConstruction(node.expression.expression)
    ) {
      record(
        filePath,
        node,
        "Date.toLocaleString is browser-locale dependent; use lib/platform-time.ts.",
      );
    }

    if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      isIntlDateTimeFormat(node.expression) &&
      normalizedPath !== platformTimeLibrary
    ) {
      record(
        filePath,
        node,
        "Intl.DateTimeFormat is centralized in lib/platform-time.ts; UI code must use the platform formatter.",
      );
    }

    ts.forEachChild(node, inspect);
  }

  inspect(source);
}

if (violations.length > 0) {
  console.error("Platform-time verification failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nOperational date/time displays must follow the configured platform timezone. Financial settlement timezone logic remains separate.",
  );
  process.exit(1);
}

console.log("Platform-time verification passed.");
