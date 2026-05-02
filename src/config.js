const path = require("path");
const fs = require("fs");

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, "output");

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquoted = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

    if (!(key in process.env)) {
      process.env[key] = unquoted;
    }
  }
}

loadEnvFile();

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(String(value))) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(String(value))) {
    return false;
  }

  return fallback;
}

module.exports = {
  site: {
    baseUrl: process.env.BASE_URL || "https://www.aquiferdist.com",
    categoriesPath: process.env.CATEGORIES_PATH || "/Categories",
  },
  output: {
    dir: OUTPUT_DIR,
    productsJson: path.join(OUTPUT_DIR, "products.json"),
    categoriesJson: path.join(OUTPUT_DIR, "categories.json"),
    productUrlsJson: path.join(OUTPUT_DIR, "product-urls.json"),
    wooCsv: path.join(OUTPUT_DIR, "woocommerce-products.csv"),
    debugDir: path.join(OUTPUT_DIR, "debug"),
    resumeState: path.join(OUTPUT_DIR, "debug", "resume-state.json"),
  },
  crawler: {
    headless: process.env.HEADLESS !== "false",
    browserName: process.env.BROWSER || "chromium",
    categoryConcurrency: parseInteger(process.env.CATEGORY_CONCURRENCY, 3),
    productConcurrency: parseInteger(process.env.PRODUCT_CONCURRENCY, 4),
    maxCategoryPages: parseInteger(process.env.MAX_CATEGORY_PAGES, 0),
    maxProducts: parseInteger(process.env.MAX_PRODUCTS, 0),
    maxRetries: parseInteger(process.env.MAX_RETRIES, 4),
    navigationTimeoutMs: parseInteger(process.env.NAVIGATION_TIMEOUT_MS, 45000),
    requestDelayMs: parseInteger(process.env.REQUEST_DELAY_MS, 750),
    requestJitterMs: parseInteger(process.env.REQUEST_JITTER_MS, 400),
    maxPagesPerListing: parseInteger(process.env.MAX_PAGES_PER_LISTING, 250),
    resumeEnabled: parseBoolean(process.env.RESUME_ENABLED, true),
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
};
