import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "pricing-calculator", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "pricing-calculator", "calculator.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pricing-calculator", "calculator.css"), "utf8");

assert.match(html, /<link rel="canonical" href="https:\/\/kuakuakua\.com\/pricing-calculator\/">/);
assert.match(html, /https:\/\/kuakuakua\.com\/pricing-calculator\//, "README-linked official page remains the canonical calculator");
assert.match(html, /\.\.\/tools\/tools\.css/);
assert.match(html, /\.\.\/tools\/tools\.js/);
assert.match(js, /https:\/\/ozon\.kuakuakua\.com\/api\/public\/pricing\//);
assert.match(js, /credentials:\s*"omit"/);
assert.match(js, /function scheduleCalculation\(\)/);
assert.ok(css.length > 1000, "calculator styles are present");
new Function(js);

console.log("Public calculator source, canonical target, public API dependency and script syntax are valid.");
