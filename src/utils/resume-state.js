const config = require("../config");
const logger = require("./logger");
const { readJson, removeFile, writeJson } = require("./fs");

const STATE_VERSION = 1;

function buildRunSignature() {
  return {
    baseUrl: config.site.baseUrl,
    categoriesPath: config.site.categoriesPath,
    maxCategoryPages: config.crawler.maxCategoryPages,
    maxProducts: config.crawler.maxProducts,
  };
}

function signaturesMatch(state) {
  return (
    state?.signature?.baseUrl === config.site.baseUrl &&
    state?.signature?.categoriesPath === config.site.categoriesPath &&
    state?.signature?.maxCategoryPages === config.crawler.maxCategoryPages &&
    state?.signature?.maxProducts === config.crawler.maxProducts
  );
}

async function loadResumeState() {
  if (!config.crawler.resumeEnabled) {
    return null;
  }

  const state = await readJson(config.output.resumeState, null);
  if (!state) {
    return null;
  }

  if (state.version !== STATE_VERSION) {
    logger.warn("Ignoring resume state with unsupported version", {
      version: state.version,
      expected: STATE_VERSION,
    });
    return null;
  }

  if (!signaturesMatch(state)) {
    logger.warn("Ignoring resume state for different run settings", {
      saved: state.signature,
      current: buildRunSignature(),
    });
    return null;
  }

  logger.info("Loaded resume state", {
    phase: state.phase,
    categoryPages: state.category?.categories?.length || 0,
    discoveredProducts: state.category?.productUrls?.length || 0,
    completedProducts: state.product?.products?.length || 0,
  });

  return state;
}

async function saveResumeState(state) {
  if (!config.crawler.resumeEnabled) {
    return;
  }

  await writeJson(config.output.resumeState, {
    version: STATE_VERSION,
    signature: buildRunSignature(),
    updatedAt: new Date().toISOString(),
    ...state,
  });
}

async function clearResumeState() {
  await removeFile(config.output.resumeState);
}

module.exports = {
  clearResumeState,
  loadResumeState,
  saveResumeState,
};
