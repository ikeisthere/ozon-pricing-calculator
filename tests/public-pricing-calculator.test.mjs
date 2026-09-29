import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "pricing-calculator", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "pricing-calculator", "calculator.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pricing-calculator", "calculator.css"), "utf8");

assert.match(html, /<title>Ozon 跨境定价计算器<\/title>/);
assert.doesNotMatch(html, /rel="canonical"/, "standalone source must not canonicalize every deployment to kuakuakua.com");
assert.match(html, /\.\.\/tools\/tools\.css/);
assert.match(html, /\.\.\/tools\/tools\.js/);
assert.match(html, /\.\.\/brand-mark\.svg/);
assert.match(js, /const api = "\/api\/pricing\/"/);
assert.doesNotMatch(js, /ozon\.kuakuakua\.com\/api\/public\/pricing/);
assert.doesNotMatch(js, /fetch\(\s*["'`]https?:\/\//, "calculator must not call a remote calculation API");
assert.match(js, /credentials:\s*"omit"/);
assert.match(js, /function scheduleCalculation\(\)/);
assert.ok(css.length > 1000, "calculator styles are present");
new Function(js);

console.log("Standalone calculator assets, local API dependency, canonical target, and script syntax are valid.");
