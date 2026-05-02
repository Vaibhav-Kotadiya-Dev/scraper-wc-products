const config = require("../config");
const logger = require("../utils/logger");
const { withRetry } = require("../utils/retry");
const { runPool } = require("../utils/pool");
const { extractProductPage, unique } = require("./extractors");

function mergeProductData(product, listingEntry = {}) {
  return {
    ...product,
    name: product.name || listingEntry.name || "",
    sku: product.sku || listingEntry.sku || "",
    manufacturerPartNumber: product.manufacturerPartNumber || listingEntry.manufacturerPartNumber || "",
    brand: product.brand || listingEntry.brand || "",
  };
}

function createProductSnapshot(productsByUrl, failuresByUrl) {
  return {
    products: [...productsByUrl.values()],
    failures: [...failuresByUrl.values()],
    completedUrls: [...productsByUrl.keys()],
  };
}

async function scrapeProducts(
  context,
  productUrls,
  productListings = {},
  requestGate = async () => {},
  options = {}
) {
  const initialState = options.initialState || {};
  const onProgress = options.onProgress || (async () => {});
  const failuresByUrl = new Map((initialState.failures || []).map((entry) => [entry.url, entry]));
  const productsByUrl = new Map((initialState.products || []).map((entry) => [entry.url, entry]));
  const pendingUrls = productUrls.filter((url) => !productsByUrl.has(url));

  await onProgress(createProductSnapshot(productsByUrl, failuresByUrl));

  await runPool(pendingUrls, config.crawler.productConcurrency, async (url) => {
    try {
      const product = await withRetry(
        `scrape product ${url}`,
        async () => {
          const page = await context.newPage();
          page.setDefaultNavigationTimeout(config.crawler.navigationTimeoutMs);
          try {
            await requestGate();
            const response = await page.goto(url, { waitUntil: "domcontentloaded" });
            const status = response?.status() || 0;
            if (status >= 400) {
              throw new Error(`Product request returned HTTP ${status}`);
            }
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            const result = await extractProductPage(page, url);
            result.images = unique(result.images);
            result.categoryPath = result.breadcrumbs.filter((item) => item !== "Home");
            return mergeProductData(result, productListings[url]);
          } finally {
            await page.close();
          }
        },
        { retries: config.crawler.maxRetries }
      );

      productsByUrl.set(url, product);
      failuresByUrl.delete(url);
      logger.info("Scraped product", { url, count: productsByUrl.size });
      await onProgress(createProductSnapshot(productsByUrl, failuresByUrl));
    } catch (error) {
      logger.error("Failed product scrape", { url, message: error.message });
      failuresByUrl.set(url, {
        url,
        error: error.message,
      });
      await onProgress(createProductSnapshot(productsByUrl, failuresByUrl));
    }
  });

  return createProductSnapshot(productsByUrl, failuresByUrl);
}

module.exports = {
  scrapeProducts,
};
