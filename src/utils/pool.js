async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const size = Math.max(1, concurrency);

  async function drain() {
    while (queue.length > 0) {
      const item = queue.shift();
      const result = await worker(item);
      results.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length || 1) }, drain));
  return results;
}

module.exports = {
  runPool,
};
