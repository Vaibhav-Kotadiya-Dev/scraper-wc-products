const config = require("../config");
const logger = require("../utils/logger");
const { withRetry } = require("../utils/retry");
const { extractCategoryPage, setLargestPageSize, unique } = require("./extractors");

function shouldKeepCategory(url, baseUrl) {
  return url.startsWith(baseUrl) && /\/catalog\//i.test(url);
}

function shouldKeepProduct(url, baseUrl) {
  return url.startsWith(baseUrl) && /\/product\//i.test(url);
}

function shouldKeepFilter(url, baseUrl) {
  if (!url.startsWith(baseUrl)) {
    return false;
  }

  return /\/catalog\//i.test(url) && /(\?|#|\/Brands\/)/i.test(url);
}

function createCategorySnapshot(pending, visited, categories, productUrls, productListings) {
  return {
    pending,
    visited: [...visited],
    categories,
    productUrls,
    productListings: Object.fromEntries(productListings),
  };
}

async function crawlCategories(context, requestGate = async () => {}, options = {}) {
  const initialState = options.initialState || {};
  const onProgress = options.onProgress || (async () => {});
  const seedUrl = new URL(config.site.categoriesPath, config.site.baseUrl).toString();
  const pending = initialState.pending?.length ? [...initialState.pending] : [seedUrl];
  const visited = new Set(initialState.visited || []);
  const categoryEntries = [...(initialState.categories || [])];
  const productUrls = new Set(initialState.productUrls || []);
  const productListings = new Map(Object.entries(initialState.productListings || {}));

  await onProgress(
    createCategorySnapshot(
      pending,
      visited,
      categoryEntries,
      config.crawler.maxProducts > 0 ? [...productUrls].slice(0, config.crawler.maxProducts) : [...productUrls],
      productListings
    )
  );

  while (pending.length > 0) {
    if (config.crawler.maxCategoryPages > 0 && categoryEntries.length >= config.crawler.maxCategoryPages) {
      logger.warn("Reached category page limit", {
        maxCategoryPages: config.crawler.maxCategoryPages,
      });
      break;
    }

    const url = pending.shift();
    if (visited.has(url)) {
      continue;
    }

    logger.info("Scanning category page", { url, remaining: pending.length });

    let pageData;
    try {
      pageData = await withRetry(
        `crawl category ${url}`,
        async () => {
          const page = await context.newPage();
          page.setDefaultNavigationTimeout(config.crawler.navigationTimeoutMs);
          try {
            await requestGate();
            const response = await page.goto(url, { waitUntil: "domcontentloaded" });
            const status = response?.status() || 0;
            if (status >= 400) {
              throw new Error(`Category request returned HTTP ${status}`);
            }
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await setLargestPageSize(page);
            return await extractCategoryPage(page, config.site.baseUrl);
          } finally {
            await page.close();
          }
        },
        { retries: config.crawler.maxRetries }
      );
    } catch (error) {
      pending.unshift(url);
      await onProgress(
        createCategorySnapshot(
          pending,
          visited,
          categoryEntries,
          config.crawler.maxProducts > 0 ? [...productUrls].slice(0, config.crawler.maxProducts) : [...productUrls],
          productListings
        )
      );
      throw error;
    }

    visited.add(url);

    categoryEntries.push({
      url,
      title: pageData.title,
      breadcrumbs: pageData.breadcrumbs,
      filters: pageData.filterLabels,
    });

    if (pageData.productCanonicalUrl) {
      productUrls.add(pageData.productCanonicalUrl);
    }

    for (const productUrl of pageData.productUrls.filter((entry) =>
      shouldKeepProduct(entry, config.site.baseUrl)
    )) {
      productUrls.add(productUrl);
    }

    for (const productEntry of pageData.productEntries || []) {
      if (!shouldKeepProduct(productEntry.url, config.site.baseUrl)) {
        continue;
      }

      const current = productListings.get(productEntry.url) || {};
      productListings.set(productEntry.url, {
        url: productEntry.url,
        name: current.name || productEntry.name || "",
        sku: current.sku || productEntry.sku || "",
        manufacturerPartNumber:
          current.manufacturerPartNumber || productEntry.manufacturerPartNumber || "",
        brand: current.brand || productEntry.brand || "",
      });
    }

    const discoveredUrls = unique([
      ...pageData.childCategories.map((entry) => entry.url),
      ...pageData.paginationUrls,
      ...pageData.filterUrls,
    ]);

    for (const discoveredUrl of discoveredUrls) {
      if (visited.has(discoveredUrl)) {
        continue;
      }

      if (shouldKeepCategory(discoveredUrl, config.site.baseUrl) || shouldKeepFilter(discoveredUrl, config.site.baseUrl)) {
        pending.push(discoveredUrl);
      }
    }

    if (categoryEntries.length > 0 && categoryEntries.length % 25 === 0) {
      logger.info("Category crawl progress", {
        categoryPages: categoryEntries.length,
        productUrls: productUrls.size,
      });
    }

    await onProgress(
      createCategorySnapshot(
        pending,
        visited,
        categoryEntries,
        config.crawler.maxProducts > 0 ? [...productUrls].slice(0, config.crawler.maxProducts) : [...productUrls],
        productListings
      )
    );
  }

  return createCategorySnapshot(
    pending,
    visited,
    categoryEntries,
    config.crawler.maxProducts > 0 ? [...productUrls].slice(0, config.crawler.maxProducts) : [...productUrls],
    productListings
  );
}

module.exports = {
  crawlCategories,
};
