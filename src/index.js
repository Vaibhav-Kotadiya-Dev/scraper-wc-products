const config = require("./config");
const logger = require("./utils/logger");
const { ensureDir, writeJson, writeText } = require("./utils/fs");
const { clearResumeState, loadResumeState, saveResumeState } = require("./utils/resume-state");
const { createRequestGate } = require("./utils/retry");
const { createBrowser, createContext } = require("./scraper/browser");
const { crawlCategories } = require("./scraper/category-crawler");
const { scrapeProducts } = require("./scraper/product-crawler");
const { buildWooCommerceCsv } = require("./scraper/woocommerce");

async function persistCategoryArtifacts(categoryState) {
  await writeJson(config.output.categoriesJson, categoryState.categories || []);
  await writeJson(config.output.productUrlsJson, categoryState.productUrls || []);
  await writeJson(`${config.output.debugDir}/product-listings.json`, categoryState.productListings || {});
}

async function persistProductArtifacts(productState) {
  await writeJson(config.output.productsJson, productState.products || []);
  await writeJson(`${config.output.debugDir}/failures.json`, productState.failures || []);
}

async function main() {
  await ensureDir(config.output.dir);
  await ensureDir(config.output.debugDir);

  logger.info("Launching scraper", {
    baseUrl: config.site.baseUrl,
    categoriesPath: config.site.categoriesPath,
  });

  const browser = await createBrowser();
  const context = await createContext(browser);
  const requestGate = createRequestGate(
    config.crawler.requestDelayMs,
    config.crawler.requestJitterMs
  );
  const resumeState = await loadResumeState();
  const resumePhase = resumeState?.phase || "categories";

  try {
    const categoryResult =
      resumePhase === "products" && resumeState?.category
        ? resumeState.category
        : await crawlCategories(context, requestGate, {
            initialState: resumeState?.category,
            onProgress: async (categoryState) => {
              await persistCategoryArtifacts(categoryState);
              await saveResumeState({
                phase: "categories",
                category: categoryState,
                product: resumeState?.product || null,
              });
            },
          });

    await persistCategoryArtifacts(categoryResult);
    await saveResumeState({
      phase: "products",
      category: categoryResult,
      product: resumePhase === "products" ? resumeState?.product || null : null,
    });

    logger.info("Category crawl complete", {
      categoryPages: categoryResult.categories.length,
      productUrls: categoryResult.productUrls.length,
    });

    const productResult = await scrapeProducts(
      context,
      categoryResult.productUrls,
      categoryResult.productListings,
      requestGate,
      {
        initialState: resumePhase === "products" ? resumeState?.product : null,
        onProgress: async (productState) => {
          await persistProductArtifacts(productState);
          await saveResumeState({
            phase: "products",
            category: categoryResult,
            product: productState,
          });
        },
      }
    );
    await persistProductArtifacts(productResult);

    const csv = buildWooCommerceCsv(productResult.products);
    await writeText(config.output.wooCsv, csv);
    if (productResult.failures.length === 0) {
      await clearResumeState();
    } else {
      await saveResumeState({
        phase: "products",
        category: categoryResult,
        product: productResult,
      });
      logger.warn("Resume state kept because some products are still unfinished", {
        failures: productResult.failures.length,
        resumeState: config.output.resumeState,
      });
    }

    logger.info("Scrape complete", {
      products: productResult.products.length,
      failures: productResult.failures.length,
      csv: config.output.wooCsv,
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  logger.error("Scraper failed", { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
