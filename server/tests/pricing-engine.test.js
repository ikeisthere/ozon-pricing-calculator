"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePricing, PricingError, _internals } = require("../pricing-engine");

const category = _internals.COMMISSIONS.rows.find((row) => row.rfbs.some((rate, index) => rate !== row.rfbs[index - 1])) || _internals.COMMISSIONS.rows[0];
const base = {
  categoryId: category.id, country: "ru", fulfillment: "rfbs", provider: "cel", channel: "standard",
  costCny: 50, fx: 10, weightG: 1000, lengthCm: 20, widthCm: 20, heightCm: 10,
  profitMode: "fixed", targetProfit: 80, domesticCost: 2, promoRate: 2, otherCostRate: 1.2
};

function throwsCode(input, code) {
  assert.throws(() => calculatePricing(input), (error) => error instanceof PricingError && error.code === code);
}

test("reverse price is the lowest integer ruble meeting the fixed-profit target", () => {
  const result = calculatePricing(base);
  const quote = result.recommended;
  assert.ok(quote.profitCny + 0.0001 >= 80);
  const row = _internals.LOGISTICS.records.find((item) => item.method === quote.logistics.method);
  const normalized = _internals.normalize(base);
  const previous = _internals.evaluate(normalized, row, quote.saleRub - 1);
  assert.ok(!previous.valid || previous.profitCny + 0.0001 < 80);
  assert.equal(quote.fees.totalCostCny + quote.profitCny, quote.saleCny);
});

test("margin mode meets the target and rejects mathematically infeasible rates", () => {
  const result = calculatePricing({ ...base, profitMode: "margin", targetProfit: 20 });
  assert.ok(result.recommended.margin + 0.0001 >= 0.2);
  throwsCode({ ...base, profitMode: "margin", targetProfit: 80, promoRate: 80, otherCostRate: 0 }, "INFEASIBLE_RATE");
});

test("FBP uses the catalogue commission that is one percentage point below rFBS", () => {
  const rfbs = calculatePricing(base);
  const fbp = calculatePricing({ ...base, fulfillment: "fbp" });
  const band = (sale) => sale <= 1500 ? 0 : sale <= 5000 ? 1 : 2;
  assert.equal(rfbs.recommended.fees.commissionRate, category.rfbs[band(rfbs.recommended.saleRub)] / 100);
  assert.equal(fbp.recommended.fees.commissionRate, category.fbp[band(fbp.recommended.saleRub)] / 100);
  for (let index = 0; index < 3; index += 1) assert.equal(category.rfbs[index] - category.fbp[index], 1);
});

test("last-mile fee applies 2 percent with 15/200 ruble boundaries", () => {
  const normalized = _internals.normalize(base);
  const rows = _internals.LOGISTICS.records.filter((row) => row.country === "ru" && row.fulfillment === "rfbs" && row.providerKey === "cel" && row.channel === "standard");
  for (const [saleRub, expected] of [[500, 15], [750, 15], [1000, 20], [10000, 200], [250000, 200]]) {
    const row = rows.find((item) => saleRub >= item.saleMinRub && saleRub <= item.saleMaxRub && normalized.weightG >= item.weightMinG && normalized.weightG <= item.weightMaxG);
    const value = _internals.evaluate(normalized, row, saleRub);
    assert.equal(value.lastMileRub, expected);
  }
});

test("catalog volumetric rule and logistics cent rounding are authoritative", () => {
  const input = { ...base, weightG: 3000, lengthCm: 60, widthCm: 40, heightCm: 30, targetProfit: 0 };
  const normalized = _internals.normalize(input);
  const row = _internals.LOGISTICS.records.find((item) => item.country === "ru" && item.fulfillment === "rfbs" && item.providerKey === "cel" && item.channel === "standard" && item.group === "big");
  const value = _internals.evaluate(normalized, row, 5000);
  assert.equal(value.volumeKg, 6);
  assert.equal(value.chargeWeightKg, 6);
  assert.equal(value.logisticsCny, _internals.centsUp(row.baseCny + row.perGramCny * 6000));
});

test("official logistics group is fixed by sale value and actual weight; size cannot upgrade the group", () => {
  assert.equal(_internals.officialGroupFor(1000, 300).group, "extraSmall");
  assert.throws(
    () => calculatePricing({ ...base, profitMode: "margin", targetProfit: 20, weightG: 300, lengthCm: 20, widthCm: 20, heightCm: 90, domesticCost: 0, promoRate: 0, otherCostRate: 1.2, fx: 11.5698 }),
    (error) => error instanceof PricingError && error.code === "SIZE_LIMIT" && error.details.group === "extraSmall" && /130cm/.test(error.message) && /90cm/.test(error.message)
  );
});

test("unsupported, overweight, oversize and over-ceiling requests never return a price", () => {
  throwsCode({ ...base, country: "kg", fulfillment: "fbp" }, "ROUTE_UNAVAILABLE");
  throwsCode({ ...base, weightG: 30001 }, "INVALID_INPUT");
  throwsCode({ ...base, lengthCm: 1000, widthCm: 1000, heightCm: 1000 }, "SIZE_LIMIT");
  throwsCode({ ...base, costCny: 1_000_000, targetProfit: 1_000_000 }, "SALE_LIMIT_EXCEEDED");
});

test("result includes complete selected quote and all feasible provider channels", () => {
  const result = calculatePricing(base);
  assert.ok(result.channelQuotes.length >= 2);
  assert.ok(result.channelQuotes.some((quote) => quote.logistics.channel === "standard"));
  for (const quote of result.channelQuotes) {
    assert.ok(quote.saleRub > 0);
    assert.ok(quote.logistics.method);
    assert.equal(quote.fees.totalCostCny + quote.profitCny, quote.saleCny);
  }
});

test("input validation rejects zero/negative commercial values but allows zero profit", () => {
  assert.doesNotThrow(() => calculatePricing({ ...base, targetProfit: 0 }));
  throwsCode({ ...base, costCny: 0 }, "INVALID_INPUT");
  throwsCode({ ...base, targetProfit: -1 }, "INVALID_INPUT");
  throwsCode({ ...base, weightG: 1.5 }, "INVALID_INPUT");
  throwsCode({ ...base, fx: 0 }, "INVALID_INPUT");
});

test("country-specific catalog ceilings and fulfillment availability are enforced", () => {
  const cases = [
    ["ru", "rfbs", "cel", "standard", 250000],
    ["kz", "rfbs", "ural", "standard", 250000],
    ["kz", "fbp", "guoo", "standard", 18000],
    ["by", "rfbs", "ural", "standard", 18000],
    ["kg", "rfbs", "yx", "standard", 18000]
  ];
  for (const [country, fulfillment, provider, channel, ceiling] of cases) {
    const result = calculatePricing({ ...base, country, fulfillment, provider, channel, targetProfit: 0 });
    assert.equal(result.limits.maxSaleRub, ceiling);
    assert.ok(result.recommended.saleRub <= ceiling);
  }
  throwsCode({ ...base, country: "kg", fulfillment: "fbp", provider: "guoo", channel: "economy" }, "ROUTE_UNAVAILABLE");
});

test("commission boundaries at 1500/1501 and 5000/5001 use the correct band", () => {
  const normalized = _internals.normalize(base);
  const rows = _internals.LOGISTICS.records.filter((row) => row.country === "ru" && row.fulfillment === "rfbs" && row.providerKey === "cel" && row.channel === "standard");
  for (const [saleRub, index] of [[1500, 0], [1501, 1], [5000, 1], [5001, 2]]) {
    const row = rows.find((item) => saleRub >= item.saleMinRub && saleRub <= item.saleMaxRub && normalized.weightG >= item.weightMinG && normalized.weightG <= item.weightMaxG);
    assert.equal(_internals.evaluate(normalized, row, saleRub).commissionRate, category.rfbs[index] / 100);
  }
});

test("an infeasible high commission band does not reject a feasible low-band quote", () => {
  const stepped = _internals.COMMISSIONS.rows.find((row) => row.rfbs[0] <= 12 && row.rfbs[2] >= 20.5);
  assert.ok(stepped);
  const result = calculatePricing({ ...base, categoryId: stepped.id, costCny: 0.01, weightG: 1, lengthCm: 1, widthCm: 1, heightCm: 1, profitMode: "margin", targetProfit: 79, promoRate: 0, otherCostRate: 0, domesticCost: 0 });
  assert.ok(result.recommended.saleRub <= 1500);
  assert.ok(result.recommended.margin >= 0.79);
});
