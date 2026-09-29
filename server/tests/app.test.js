"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../app");
const { _internals } = require("../pricing-engine");

test("standalone server serves the calculator and its own catalogs/calculation API", async (t) => {
  const server = createServer({ exchangeRateProvider: async () => ({ rate: 12.5, quoteDate: "29.09.2026", fetchedAt: "2026-09-29T00:00:00.000Z", source: "test" }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const root = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/pricing-calculator/");
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Ozon 跨境定价计算器/);
  assert.equal((await fetch(`${baseUrl}/pricing-calculator/calculator.css`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/pricing-calculator/calculator.js`)).status, 200);

  const commission = await fetch(`${baseUrl}/api/pricing/catalog/commission`).then((response) => response.json());
  assert.ok(commission.rows.length > 0);
  const logistics = await fetch(`${baseUrl}/api/pricing/catalog/logistics`).then((response) => response.json());
  assert.ok(logistics.records.length > 0);
  assert.equal(logistics.sources.find((source) => source.key === "rfbs-ru").url, "https://cdn.ozone.ru/s3/ozon-disk-api/Partner_Delivery/China_scoring_ENG_CN_24_07_26_1784197567.xlsx");
  const rate = await fetch(`${baseUrl}/api/pricing/exchange-rate`).then((response) => response.json());
  assert.equal(rate.source, "test");

  const category = _internals.COMMISSIONS.rows[0];
  const calculated = await fetch(`${baseUrl}/api/pricing/calculate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId: category.id, country: "ru", fulfillment: "rfbs", provider: "cel", channel: "standard", costCny: 50, fx: 12.5, weightG: 300, lengthCm: 20, widthCm: 20, heightCm: 10, profitMode: "fixed", targetProfit: 20 })
  });
  assert.equal(calculated.status, 200);
  assert.ok((await calculated.json()).recommended.saleRub > 0);

  const privatePath = await fetch(`${baseUrl}/server/data/ozon-commission-catalog.json`);
  assert.equal(privatePath.status, 404);

  const malformed = await fetch(`${baseUrl}/api/pricing/calculate`, { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(`${baseUrl}/api/pricing/calculate`, { method: "POST", body: " ".repeat(8193), headers: { "Content-Type": "application/json" } });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404);
});

test("exchange-rate provider failures return a safe, usable API error", async (t) => {
  const server = createServer({ exchangeRateProvider: async () => { throw Object.assign(new Error("rate service unavailable"), { status: 502 }); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pricing/exchange-rate`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error.message, /rate service unavailable/);
});
