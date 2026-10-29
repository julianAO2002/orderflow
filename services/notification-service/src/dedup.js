// Remembers the last processed message ids so a redelivered message does not
// send the same email twice.
function createDedup(limit = 10000) {
  const ids = new Set();
  return {
    seen: (id) => ids.has(id),
    remember(id) {
      ids.add(id);
      if (ids.size > limit) ids.delete(ids.values().next().value);
    },
  };
}

module.exports = { createDedup };
