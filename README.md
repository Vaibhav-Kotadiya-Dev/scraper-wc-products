# Playwright Scraper

Production-oriented Playwright scraper for `https://www.xyz.com/Categories` that:

- crawls top-level categories and nested subcategories
- follows catalog pagination and refinement/filter URLs
- collects all discovered product URLs
- scrapes product details including name, description, images, attributes, specs, and tabs
- exports the final dataset as a WooCommerce-compatible CSV
- persists intermediate JSON artifacts for recovery and QA

## Folder structure

```text
.
├── output/
│   ├── categories.json
│   ├── product-urls.json
│   ├── products.json
│   ├── woocommerce-products.csv
│   └── debug/
│       └── failures.json
├── src/
│   ├── scraper/
│   │   ├── browser.js
│   │   ├── category-crawler.js
│   │   ├── extractors.js
│   │   ├── product-crawler.js
│   │   ├── selectors.js
│   │   └── woocommerce.js
│   ├── utils/
│   │   ├── csv.js
│   │   ├── fs.js
│   │   ├── logger.js
│   │   ├── pool.js
│   │   └── retry.js
│   ├── config.js
│   └── index.js
├── .gitignore
├── package.json
└── README.md
```

## Install

```bash
npm install
npx playwright install chromium
```

## Environment

The scraper reads settings from `.env`. A starter template is included in `.env.example`.

```bash
cp .env.example .env
```

## Run

```bash
npm run scrape
```

Optional environment variables:

```bash
HEADLESS=false
PRODUCT_CONCURRENCY=4
CATEGORY_CONCURRENCY=3
MAX_RETRIES=4
NAVIGATION_TIMEOUT_MS=45000
REQUEST_DELAY_MS=750
REQUEST_JITTER_MS=400
RESUME_ENABLED=true
CATEGORIES_PATH=/Categories
MAX_CATEGORY_PAGES=0
MAX_PRODUCTS=0
```

Example:

```bash
HEADLESS=false PRODUCT_CONCURRENCY=4 npm run scrape
MAX_CATEGORY_PAGES=10 MAX_PRODUCTS=20 npm run scrape
```

## Smoke tests

Test a few catalog pages:

```bash
MAX_CATEGORY_PAGES=2 MAX_PRODUCTS=5 npm run scrape
```

Test a known category/listing only:

```bash
CATEGORIES_PATH=/Catalog/Water-Filters-And-Dispensers/Replacement-Filters-Cartridges MAX_CATEGORY_PAGES=2 MAX_PRODUCTS=5 npm run scrape
```

Test visually in a browser:

```bash
HEADLESS=false CATEGORIES_PATH=/Catalog/Water-Filters-And-Dispensers/Replacement-Filters-Cartridges MAX_CATEGORY_PAGES=2 MAX_PRODUCTS=5 npm run scrape
```

After the run, verify:

- `output/product-urls.json` for discovered product URLs
- `output/products.json` for extracted fields
- `output/woocommerce-products.csv` for WooCommerce import format
- `output/debug/failures.json` for any failed pages
- `output/debug/resume-state.json` if a run was interrupted or finished with failed products

## Output files

- `output/categories.json`: crawled category/filter pages
- `output/product-urls.json`: deduplicated product URLs
- `output/products.json`: normalized product payloads
- `output/woocommerce-products.csv`: WooCommerce import file
- `output/debug/failures.json`: failed product pages for retry
- `output/debug/resume-state.json`: persisted checkpoint used to resume category discovery or unfinished products

## Notes on resilience

- Every category and product request is retried with backoff.
- Intermediate artifacts are written to disk so the run can be audited.
- Category discovery checkpoints its pending queue, so a blocked run can resume without re-scraping completed category and subcategory listings.
- Product scraping checkpoints completed products, so the next run resumes only the remaining unfinished product URLs.
- Product export includes custom WooCommerce meta columns for source URL, manufacturer part number, specs, raw tabs, and documents.
- The scraper uses broad selectors and URL pattern matching so it can tolerate minor layout changes.

## Resume behavior

Resume is enabled by default. If a run is interrupted, or if it finishes with failed products, rerun the same command and the scraper will continue from `output/debug/resume-state.json`.

To force a fresh run and ignore any saved checkpoint:

```bash
RESUME_ENABLED=false npm run scrape
```

## package scripts

After installation, use these commands:

```bash
npm run scrape
npm run scrape:headed
```
