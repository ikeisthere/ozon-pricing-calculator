"use strict";

const { getPricingCatalogs, PricingCatalogError } = require("./pricing-catalog");

let COMMISSIONS = null;
let LOGISTICS = null;
let CATEGORY_BY_ID = null;

class PricingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PricingError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) { throw new PricingError(code, message, details); }
function ensureCatalogs() {
  if (COMMISSIONS && LOGISTICS && CATEGORY_BY_ID) return { commissions: COMMISSIONS, logistics: LOGISTICS };
  try {
    const catalogs = getPricingCatalogs();
    COMMISSIONS = catalogs.commissions;
    LOGISTICS = catalogs.logistics;
    CATEGORY_BY_ID = new Map(COMMISSIONS.rows.map((row) => [row.id, row]));
    return catalogs;
  } catch (error) {
    if (error instanceof PricingCatalogError) fail("PRICING_DATA_UNAVAILABLE", error.message);
    throw error;
  }
}
function finite(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === "" || value === null || value === undefined || !Number.isFinite(Number(value))) fail("INVALID_INPUT", `${field}必须填写有效数字`, { field });
  const number = Number(value);
  if (number < min || number > max || (integer && !Number.isInteger(number))) fail("INVALID_INPUT", `${field}超出允许范围`, { field, min, max, integer });
  return number;
}
function centsUp(value) { return Math.ceil((Number(value) - 1e-9) * 100) / 100; }
function commissionBand(saleRub) { return saleRub <= 1500 ? 0 : saleRub <= 5000 ? 1 : 2; }
const OFFICIAL_GROUPS = [
  { group: "extraSmall", saleMinRub: 1, saleMaxRub: 1500, weightMinG: 1, weightMaxG: 500 },
  { group: "budget", saleMinRub: 1, saleMaxRub: 1500, weightMinG: 501, weightMaxG: 35000 },
  { group: "small", saleMinRub: 1501, saleMaxRub: 7000, weightMinG: 1, weightMaxG: 2000 },
  { group: "big", saleMinRub: 1501, saleMaxRub: 7000, weightMinG: 2001, weightMaxG: 35000 },
  { group: "premiumSmall", saleMinRub: 7001, saleMaxRub: 250000, weightMinG: 1, weightMaxG: 5000 },
  { group: "premiumBig", saleMinRub: 7001, saleMaxRub: 250000, weightMinG: 5001, weightMaxG: 35000 }
];
const OFFICIAL_GROUP_BY_KEY = new Map(OFFICIAL_GROUPS.map((item) => [item.group, item]));
const POSTAL_SALE_SEARCH_CEILING_RUB = 1000000000;
function officialGroupFor(saleRub, weightG) {
  return OFFICIAL_GROUPS.find((item) => saleRub >= item.saleMinRub && saleRub <= item.saleMaxRub && weightG >= item.weightMinG && weightG <= item.weightMaxG) || null;
}
function dimensionsValid(record, input) {
  const sides = [input.lengthCm, input.widthCm, input.heightCm];
  const sideSum = sides.reduce((sum, value) => sum + value, 0);
  const maxSide = Math.max(...sides);
  const reasons = [];
  if (record.size?.sideSum && (record.size.sideSumExclusive ? sideSum >= record.size.sideSum : sideSum > record.size.sideSum)) {
    reasons.push(record.size.sideSumExclusive ? `三边之和 ${sideSum}cm 必须小于 ${record.size.sideSum}cm` : `三边之和 ${sideSum}cm 超过 ${record.size.sideSum}cm`);
  }
  if (record.size?.maxSide && maxSide > record.size.maxSide) reasons.push(`最长边 ${maxSide}cm 超过 ${record.size.maxSide}cm`);
  if (Array.isArray(record.size?.minSides)) {
    const actual = [...sides].sort((a, b) => b - a);
    if (actual[0] < record.size.minSides[0] || actual[1] < record.size.minSides[1]) reasons.push(`包裹至少需要 ${record.size.minSides[0]}×${record.size.minSides[1]}cm`);
  }
  if (record.size?.box) {
    const actual = [...sides].sort((a, b) => b - a), allowed = [...record.size.box].sort((a, b) => b - a);
    if (actual.some((side, index) => side > allowed[index])) reasons.push(`外箱尺寸 ${actual.join("×")}cm 超过 ${allowed.join("×")}cm`);
  }
  if (reasons.length) return { valid: false, code: "SIZE_LIMIT", message: reasons.join("；") };
  return { valid: true };
}
function normalize(input = {}) {
  ensureCatalogs();
  const normalized = {
    categoryId: String(input.categoryId || "").trim(), country: String(input.country || "").trim().toLowerCase(),
    fulfillment: String(input.fulfillment || "").trim().toLowerCase(), provider: String(input.provider || input.providerKey || "").trim().toLowerCase(),
    channel: String(input.channel || "standard").trim().toLowerCase(), profitMode: String(input.profitMode || "margin").trim().toLowerCase(),
    containsBattery: input.containsBattery === true || input.containsBattery === "true",
    containsLiquid: input.containsLiquid === true || input.containsLiquid === "true",
    costCny: finite(input.costCny, "采购成本", { min: 0.01, max: 1e6 }), fx: finite(input.fx, "汇率", { min: 0.0001, max: 1000 }),
    weightG: finite(input.weightG, "包裹重量", { min: 1, max: 100000, integer: true }),
    lengthCm: finite(input.lengthCm, "包裹长度", { min: 0.1, max: 1000 }), widthCm: finite(input.widthCm, "包裹宽度", { min: 0.1, max: 1000 }), heightCm: finite(input.heightCm, "包裹高度", { min: 0.1, max: 1000 }),
    domesticCost: finite(input.domesticCost ?? 0, "国内运费+代贴单", { min: 0, max: 1e6 }),
    promoRate: finite(input.promoRate ?? 0, "广告费占比", { min: 0, max: 80 }) / 100,
    otherCostRate: finite(input.otherCostRate ?? input.otherCost ?? 0, "其他成本", { min: 0, max: 80 }) / 100,
    targetProfit: finite(input.targetProfit ?? input.targetProfitValue, "期望利润", { min: 0, max: 1e6 })
  };
  if (!CATEGORY_BY_ID.has(normalized.categoryId)) fail("CATEGORY_NOT_FOUND", "商品类目不存在或已失效", { field: "categoryId" });
  if (!new Set(["fixed", "margin"]).has(normalized.profitMode)) fail("INVALID_INPUT", "期望利润模式不支持", { field: "profitMode" });
  if (normalized.profitMode === "margin" && normalized.targetProfit > 80) fail("INVALID_INPUT", "期望利润率不得超过 80%", { field: "targetProfit" });
  if (normalized.promoRate + normalized.otherCostRate >= 0.9) fail("INFEASIBLE_RATE", "广告费与其他成本占比合计过高");
  normalized.weightKg = normalized.weightG / 1000;
  normalized.targetMargin = normalized.profitMode === "margin" ? normalized.targetProfit / 100 : 0;
  normalized.targetProfitCny = normalized.profitMode === "fixed" ? normalized.targetProfit : 0;
  return normalized;
}
function routeRows(input, channel = input.channel) {
  ensureCatalogs();
  return LOGISTICS.records.filter((row) => row.country === input.country && row.fulfillment === input.fulfillment && row.providerKey === input.provider && row.channel === channel);
}
function evaluate(input, row, saleRub, { ignoreDimensions = false } = {}) {
  ensureCatalogs();
  if (input.fulfillment === "postal" && input.containsBattery && !row.batteries) {
    return { valid: false, error: { code: "ITEM_RESTRICTION", message: "当前邮政线路不接收含电池商品" }, row };
  }
  if (input.fulfillment === "postal" && input.containsLiquid && !row.liquids) {
    return { valid: false, error: { code: "ITEM_RESTRICTION", message: "当前邮政线路不接收含液体商品" }, row };
  }
  const size = dimensionsValid(row, input);
  if (!ignoreDimensions && !size.valid) return { valid: false, error: size, row };
  const volumeKg = row.volumeDivisor ? input.lengthCm * input.widthCm * input.heightCm / row.volumeDivisor : 0;
  const chargeWeightKg = row.chargeType === "maxActualVolume" ? Math.max(input.weightKg, volumeKg) : input.weightKg;
  const logisticsCny = centsUp(row.baseCny + row.perGramCny * chargeWeightKg * 1000);
  const category = CATEGORY_BY_ID.get(input.categoryId);
  const sourceRates = input.fulfillment === "fbp" && Array.isArray(category.fbp) ? category.fbp : category.rfbs;
  const commissionRate = Number(sourceRates[commissionBand(saleRub)] || 0) / 100;
  const saleCny = saleRub / input.fx, commissionCny = saleCny * commissionRate;
  const lastMileRub = Math.min(200, Math.max(15, saleRub * 0.02)), lastMileCny = lastMileRub / input.fx;
  const advertisingCny = saleCny * input.promoRate, otherCostCny = saleCny * input.otherCostRate;
  const totalCostCny = input.costCny + input.domesticCost + logisticsCny + commissionCny + lastMileCny + advertisingCny + otherCostCny;
  const profitCny = saleCny - totalCostCny, margin = saleCny ? profitCny / saleCny : 0;
  return { valid: true, row, saleRub, saleCny, volumeKg, chargeWeightKg, logisticsCny, commissionRate, commissionCny, lastMileRub, lastMileCny, advertisingCny, otherCostCny, totalCostCny, profitCny, margin };
}
function meets(value, input) { return value.valid && (input.profitMode === "fixed" ? value.profitCny + 0.000001 >= input.targetProfitCny : value.margin + 1e-10 >= input.targetMargin); }
function recommendForChannel(input, channel, options = {}) {
  const rows = routeRows(input, channel);
  if (!rows.length) return null;
  const candidates = [];
  for (const row of rows) {
    const officialGroup = OFFICIAL_GROUP_BY_KEY.get(row.group);
    const isPostal = input.fulfillment === "postal";
    if (!officialGroup && !isPostal) continue;
    if (officialGroup && (input.weightG < officialGroup.weightMinG || input.weightG > officialGroup.weightMaxG)) continue;
    if (input.weightG < row.weightMinG || input.weightG > row.weightMaxG) continue;
    const rowMin = Number.isFinite(Number(row.saleMinRub)) ? Number(row.saleMinRub) : 1;
    const rowMax = row.saleMaxRub == null ? POSTAL_SALE_SEARCH_CEILING_RUB : Number(row.saleMaxRub);
    const min = Math.max(1, rowMin, officialGroup?.saleMinRub || 1);
    const max = Math.min(rowMax, officialGroup?.saleMaxRub ?? POSTAL_SALE_SEARCH_CEILING_RUB);
    if (min > max) continue;
    const commissionRanges = [[1, 1500], [1501, 5000], [5001, POSTAL_SALE_SEARCH_CEILING_RUB]];
    for (const [bandMin, bandMax] of commissionRanges) {
      let low = Math.max(min, bandMin), high = Math.min(max, bandMax), best = null;
      if (low > high) continue;
      while (low <= high) {
        const sale = low + Math.floor((high - low) / 2), matchedGroup = officialGroup ? officialGroupFor(sale, input.weightG) : null;
        if (officialGroup && (!matchedGroup || matchedGroup.group !== row.group)) { low = sale + 1; continue; }
        const value = evaluate(input, row, sale, { ignoreDimensions: Boolean(options.ignoreDimensions) });
        if (meets(value, input)) { best = value; high = sale - 1; } else low = sale + 1;
      }
      if (best) candidates.push(best);
    }
  }
  return candidates.sort((a, b) => a.saleRub - b.saleRub)[0] || null;
}
function recommendForChannelStrict(input, channel) {
  const economicMinimum = recommendForChannel(input, channel, { ignoreDimensions: true });
  if (economicMinimum) {
    const size = dimensionsValid(economicMinimum.row, input);
    if (!size.valid) return { value: null, error: size, row: economicMinimum.row };
  }
  return { value: recommendForChannel(input, channel), error: null, row: null };
}
function serialize(value) {
  const requirements = value.row.fulfillment === "postal" ? {
    batteriesAllowed: value.row.batteries, liquidsAllowed: value.row.liquids, size: value.row.size,
    weightMinG: value.row.weightMinG, weightMaxG: value.row.weightMaxG,
    saleMinRub: value.row.saleMinRub, saleMaxRub: value.row.saleMaxRub, returns: value.row.returns || ""
  } : null;
  return {
    saleRub: value.saleRub, saleCny: value.saleCny, profitCny: value.profitCny, margin: value.margin,
    logistics: {
      providerKey: value.row.providerKey, providerLabel: value.row.providerLabel, channel: value.row.channel,
      channelLabel: value.row.channelLabel || "", group: value.row.group, method: value.row.method, days: value.row.days,
      deliveryPoint: value.row.deliveryPoint || "", chargeWeightKg: value.chargeWeightKg, volumeKg: value.volumeKg,
      feeCny: value.logisticsCny, ...(requirements ? { requirements } : {})
    },
    fees: { purchaseCny: value.input?.costCny, domesticCny: value.input?.domesticCost, logisticsCny: value.logisticsCny, lastMileRub: value.lastMileRub, lastMileCny: value.lastMileCny, commissionRate: value.commissionRate, commissionCny: value.commissionCny, advertisingRate: value.input?.promoRate, advertisingCny: value.advertisingCny, otherCostRate: value.input?.otherCostRate, otherCostCny: value.otherCostCny, totalCostCny: value.totalCostCny }
  };
}
function calculatePricing(rawInput) {
  ensureCatalogs();
  const input = normalize(rawInput);
  const providerRows = LOGISTICS.records.filter((row) => row.country === input.country && row.fulfillment === input.fulfillment && row.providerKey === input.provider);
  if (!providerRows.length) fail("ROUTE_UNAVAILABLE", "当前国家、履约方式与物流商组合暂无报价", { country: input.country, fulfillment: input.fulfillment, provider: input.provider });
  const selectedRows = routeRows(input);
  if (!selectedRows.length) fail("CHANNEL_UNAVAILABLE", "当前物流渠道暂无报价", { channel: input.channel });
  const finiteSaleMaxes = selectedRows.map((row) => row.saleMaxRub).filter(Number.isFinite);
  const maxSaleRub = finiteSaleMaxes.length ? Math.max(...finiteSaleMaxes) : null;
  const weightRows = selectedRows.filter((row) => input.weightG >= row.weightMinG && input.weightG <= row.weightMaxG);
  if (!weightRows.length) {
    const minWeightG = Math.min(...selectedRows.map((row) => row.weightMinG));
    const maxWeightG = Math.max(...selectedRows.map((row) => row.weightMaxG));
    fail("WEIGHT_LIMIT_EXCEEDED", `当前物流渠道仅接收 ${minWeightG}–${maxWeightG}g 的包裹`, { field: "weightG", minWeightG, maxWeightG });
  }
  const compatibleRows = weightRows.filter((row) => !(input.fulfillment === "postal" && input.containsBattery && !row.batteries) && !(input.fulfillment === "postal" && input.containsLiquid && !row.liquids));
  if (!compatibleRows.length && input.fulfillment === "postal") {
    if (input.containsBattery && !weightRows.some((row) => row.batteries)) fail("ITEM_RESTRICTION", "当前邮政线路不接收含电池商品", { field: "containsBattery" });
    if (input.containsLiquid && !weightRows.some((row) => row.liquids)) fail("ITEM_RESTRICTION", "当前邮政线路不接收含液体商品", { field: "containsLiquid" });
  }
  const categoryRates = CATEGORY_BY_ID.get(input.categoryId)[input.fulfillment === "fbp" ? "fbp" : "rfbs"].map(Number);
  const bands = [[1, 1500], [1501, 5000], [5001, POSTAL_SALE_SEARCH_CEILING_RUB]];
  const availableBands = bands.map((band, index) => ({ band, index })).filter(({ band }) => selectedRows.some((row) => (row.saleMinRub ?? 1) <= band[1] && (row.saleMaxRub == null || row.saleMaxRub >= band[0])));
  if (availableBands.length && availableBands.every(({ index }) => categoryRates[index] / 100 + input.promoRate + input.otherCostRate + input.targetMargin >= 1)) {
    fail("INFEASIBLE_RATE", "佣金、费用占比与期望利润率合计过高，无法形成有效售价");
  }
  const strictSelected = recommendForChannelStrict(input, input.channel);
  if (strictSelected.error) fail(strictSelected.error.code, strictSelected.error.message, { channel: input.channel, group: strictSelected.row.group });
  const selected = strictSelected.value;
  if (!selected) {
    if (weightRows.length) {
      const sizeChecks = compatibleRows.map((row) => ({ row, size: dimensionsValid(row, input) }));
      const anySizeValid = sizeChecks.some((item) => item.size.valid);
      if (sizeChecks.length && !anySizeValid) {
        const failed = sizeChecks[0];
        fail(failed.size.code, failed.size.message, { field: "dimensions", channel: input.channel, group: failed.row.group });
      }
    }
    const unconstrained = compatibleRows.some((row) => {
      const atMax = evaluate(input, row, row.saleMaxRub ?? POSTAL_SALE_SEARCH_CEILING_RUB, { ignoreDimensions: true });
      return meets(atMax, input);
    });
    if (!unconstrained && maxSaleRub != null) fail("SALE_LIMIT_EXCEEDED", `所需售价超过当前线路支持的最高货值 ${maxSaleRub}₽`, { maxSaleRub });
    fail("NO_FEASIBLE_SERVICE", "当前重量或尺寸没有可承运服务");
  }
  selected.input = input;
  const channelQuotes = [...new Set(providerRows.map((row) => row.channel))].map((channel) => {
    const strictQuote = recommendForChannelStrict(input, channel);
    if (strictQuote.error) return null;
    const quote = strictQuote.value;
    if (!quote) return null;
    quote.input = input;
    return serialize(quote);
  }).filter(Boolean).sort((a, b) => {
    if (input.fulfillment === "postal") return providerRows.findIndex((row) => row.channel === a.logistics.channel) - providerRows.findIndex((row) => row.channel === b.logistics.channel);
    return ["express", "standard", "economy"].indexOf(a.logistics.channel) - ["express", "standard", "economy"].indexOf(b.logistics.channel);
  });
  return { ok: true, input: { ...input }, recommended: serialize(selected), channelQuotes, limits: { maxSaleRub }, sources: { commission: { version: COMMISSIONS.version, source: COMMISSIONS.source }, logistics: { schemaVersion: LOGISTICS.schemaVersion, generatedAt: LOGISTICS.generatedAt } } };
}

const internals = { normalize, evaluate, recommendForChannel, recommendForChannelStrict, officialGroupFor, centsUp };
Object.defineProperties(internals, {
  COMMISSIONS: { enumerable: true, get: () => ensureCatalogs().commissions },
  LOGISTICS: { enumerable: true, get: () => ensureCatalogs().logistics }
});

module.exports = { calculatePricing, PricingError, _internals: internals };
