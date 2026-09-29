"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DATA_DIRECTORY = path.join(__dirname, "data");
const COMMISSION_FILE = "ozon-commission-catalog.json";
const LOGISTICS_FILE = "pricing-logistics-catalog.json";

class PricingCatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PricingCatalogError";
    this.code = code;
    this.details = details;
  }
}

function catalogError(code, catalog) {
  return new PricingCatalogError(code, "定价资料暂不可用，请稍后重试。", { catalog });
}

function readCatalog(dataDirectory, fileName, catalog) {
  const filePath = path.join(dataDirectory, fileName);
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") throw catalogError("PRICING_CATALOG_MISSING", catalog);
    throw catalogError("PRICING_CATALOG_UNREADABLE", catalog);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw catalogError("PRICING_CATALOG_INVALID", catalog);
  }
}

function validateCommissionCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.rows) || catalog.rows.length === 0) {
    throw catalogError("PRICING_CATALOG_INVALID", "commission");
  }
  if (catalog.rows.some((row) => !row || row.id === undefined || !Array.isArray(row.rfbs) || !Array.isArray(row.fbp))) {
    throw catalogError("PRICING_CATALOG_INVALID", "commission");
  }
}

function validateLogisticsCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.records) || catalog.records.length === 0) {
    throw catalogError("PRICING_CATALOG_INVALID", "logistics");
  }
  if (catalog.records.some((row) => !row || !row.country || !row.fulfillment || !row.providerKey || !row.channel)) {
    throw catalogError("PRICING_CATALOG_INVALID", "logistics");
  }
}

function loadPricingCatalogs(dataDirectory = process.env.OZON_PRICING_DATA_DIR || DEFAULT_DATA_DIRECTORY) {
  const resolvedDirectory = path.resolve(dataDirectory);
  const commissions = readCatalog(resolvedDirectory, COMMISSION_FILE, "commission");
  const logistics = readCatalog(resolvedDirectory, LOGISTICS_FILE, "logistics");
  validateCommissionCatalog(commissions);
  validateLogisticsCatalog(logistics);
  return { commissions, logistics };
}

let cachedCatalogs = null;

function getPricingCatalogs() {
  if (!cachedCatalogs) cachedCatalogs = loadPricingCatalogs();
  return cachedCatalogs;
}

module.exports = {
  COMMISSION_FILE,
  LOGISTICS_FILE,
  PricingCatalogError,
  getPricingCatalogs,
  loadPricingCatalogs
};
