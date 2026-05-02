const playwright = require("playwright");
const config = require("../config");

async function createBrowser() {
  const browserType = playwright[config.crawler.browserName];
  if (!browserType) {
    throw new Error(`Unsupported browser: ${config.crawler.browserName}`);
  }

  return browserType.launch({
    headless: config.crawler.headless,
  });
}

async function createContext(browser) {
  return browser.newContext({
    userAgent: config.crawler.userAgent,
    viewport: { width: 1440, height: 1200 },
  });
}

module.exports = {
  createBrowser,
  createContext,
};
