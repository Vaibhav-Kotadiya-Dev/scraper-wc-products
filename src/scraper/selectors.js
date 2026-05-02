module.exports = {
  productLinkPatterns: [
    'a[href*="/Product/"]',
    'a[href*="/product/"]',
  ],
  categoryLinkPatterns: [
    'a[href*="/Catalog/"]',
    'a[href*="/catalog/"]',
  ],
  paginationLinkPatterns: [
    'a[rel="next"]',
    'a[aria-label*="Next" i]',
    'a[title*="Next" i]',
    'a[href*="page="]',
    'a[href*="Page="]',
  ],
  filterContainers: [
    '[data-testid*="filter" i]',
    ".filter",
    ".filters",
    ".refine",
    "#facetPanel",
    "aside",
  ],
};
