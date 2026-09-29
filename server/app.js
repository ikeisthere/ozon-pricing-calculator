"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MIME = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".txt", "text/plain; charset=utf-8"]
]);

process.env.OZON_PRICING_DATA_DIR ||= path.join(__dirname, "data");
const { calculatePricing, PricingError } = require("./pricing-engine");
const { getPricingCatalogs } = require("./pricing-catalog");

let cachedRate = null;
const CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
const RATE_CACHE_MS = 6 * 60 * 60 * 1000;
const PRICING_SOURCE_URLS = {
  commission: "https://docs.ozon.ru/global/zh/",
  "rfbs-ru": "https://cdn.ozone.ru/s3/ozon-disk-api/Partner_Delivery/China_scoring_ENG_CN_24_07_26_1784197567.xlsx",
  fbp: "https://cdn.ozone.ru/s3/ozon-disk-api/Partner_Delivery/FBP_List_of_services_24_07_26_1784197567.xlsx",
  "rfbs-cis": "https://docs.ozon.ru/global/zh/fulfillment/rfbs/logistic-settings/partner-delivery-ozon/"
};

async function getExchangeRate() {
  if (cachedRate && Date.now() - cachedRate.fetchedAtMs < RATE_CACHE_MS) return cachedRate;
  const response = await fetch(CBR_URL, { headers: { Accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error("俄罗斯央行汇率暂时无法读取，请稍后重试或手动输入汇率。"), { status: 502 });
  const xml = await response.text();
  const quoteDate = xml.match(/<ValCurs\s+Date="([^"]+)"/)?.[1];
  const cny = xml.match(/<Valute\b[^>]*>[\s\S]*?<CharCode>CNY<\/CharCode>[\s\S]*?<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d,]+)<\/Value>[\s\S]*?<\/Valute>/);
  const nominal = Number(cny?.[1]);
  const value = Number(String(cny?.[2] || "").replace(",", "."));
  if (!quoteDate || !(nominal > 0) || !(value > 0)) throw Object.assign(new Error("俄罗斯央行返回的人民币汇率格式暂不可识别。"), { status: 502 });
  cachedRate = { rate: Number((value / nominal).toFixed(4)), quoteDate, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now(), source: "俄罗斯央行（CBR）" };
  return cachedRate;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req, maxBytes = 8192) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error("请求内容过大。"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("请求内容不是有效的 JSON。"), { status: 400 }); }
}

function createServer({ exchangeRateProvider = getExchangeRate } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(302, { Location: "/pricing-calculator/", "Cache-Control": "no-store" });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/api/pricing/exchange-rate") {
        const quote = await exchangeRateProvider();
        return json(res, 200, { rate: quote.rate, quoteDate: quote.quoteDate, fetchedAt: quote.fetchedAt, source: quote.source });
      }
      if (req.method === "GET" && url.pathname === "/api/pricing/catalog/commission") {
        const catalog = getPricingCatalogs().commissions;
        return json(res, 200, { source: catalog.source, version: catalog.version, rows: catalog.rows.map(({ id, top, middle, leaf }) => ({ id, top, middle, leaf })) });
      }
      if (req.method === "GET" && url.pathname === "/api/pricing/catalog/logistics") {
        const catalog = getPricingCatalogs().logistics;
        const records = [...new Map(catalog.records.map(({ country, fulfillment, providerKey, providerLabel, channel }) => [`${country}|${fulfillment}|${providerKey}|${channel}`, { country, fulfillment, providerKey, providerLabel, channel }])).values()];
        const sources = catalog.sources.map((source) => ({ ...source, url: PRICING_SOURCE_URLS[source.key] || "https://docs.ozon.ru/global/zh/" }));
        return json(res, 200, { schemaVersion: catalog.schemaVersion, generatedAt: catalog.generatedAt, countries: catalog.countries, sources, records });
      }
      if (req.method === "POST" && url.pathname === "/api/pricing/calculate") return json(res, 200, calculatePricing(await readBody(req)));
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "不支持此请求方式。" } });

      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const target = path.resolve(ROOT, `.${pathname}`);
      if (!target.startsWith(`${ROOT}${path.sep}`) || /(^|\\|\/)(server|tests|scripts|\.git)(\\|\/|$)/i.test(target.slice(ROOT.length))) return json(res, 404, { error: { code: "NOT_FOUND", message: "页面不存在。" } });
      const stat = fs.statSync(target);
      if (!stat.isFile()) return json(res, 404, { error: { code: "NOT_FOUND", message: "页面不存在。" } });
      res.writeHead(200, { "Content-Type": MIME.get(path.extname(target)) || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Length": stat.size });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(target).pipe(res);
    } catch (error) {
      const status = Number(error.status) || (error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : error instanceof PricingError ? error.code === "CATEGORY_NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : 422 : 500);
      json(res, status, { error: { code: error.code || "INTERNAL_ERROR", message: error.message || "服务暂时不可用。", ...(error.details ? { details: error.details } : {}) } });
    }
  });
}

if (require.main === module) {
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT || 8080)));
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => process.stdout.write(`Ozon 定价计算器运行于 http://${host}:${port}/\n`));
}

module.exports = { createServer, getExchangeRate };
