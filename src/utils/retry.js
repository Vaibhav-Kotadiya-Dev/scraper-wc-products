const logger = require("./logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestGate(minDelayMs, jitterMs = 0) {
  let nextReadyAt = 0;
  let chain = Promise.resolve();

  return async function waitForTurn() {
    const previous = chain;
    let release;
    chain = new Promise((resolve) => {
      release = resolve;
    });

    await previous;

    const waitMs = Math.max(0, nextReadyAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    nextReadyAt = Date.now() + minDelayMs + jitter;
    release();
  };
}

async function withRetry(taskName, fn, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < retries;
      logger.warn(`${taskName} failed`, {
        attempt,
        retries,
        message: error.message,
      });

      if (!shouldRetry) {
        break;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}

module.exports = {
  createRequestGate,
  sleep,
  withRetry,
};
