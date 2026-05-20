function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readExpectedWantListConfig() {
  const wantListName = normalizeName(process.env.CARDMARKET_WANTLIST_NAME || 'last');
  const expectedNames = String(process.env.CARDMARKET_WANTLIST_EXPECTED_NAMES || '')
    .split('|')
    .map((entry) => normalizeName(entry))
    .filter(Boolean);
  const parsedCount = Number.parseInt(String(process.env.CARDMARKET_WANTLIST_EXPECTED_COUNT || ''), 10);
  const expectedCount = Number.isFinite(parsedCount) ? parsedCount : expectedNames.length;

  return {
    wantListName,
    expectedNames,
    expectedCount,
  };
}

function hasExpectedWantListConfig() {
  const config = readExpectedWantListConfig();
  return config.expectedCount > 0 && config.expectedNames.length === config.expectedCount;
}

function assertExpectedWantListConfig() {
  const config = readExpectedWantListConfig();

  if (config.expectedCount <= 0) {
    throw new Error('Set CARDMARKET_WANTLIST_EXPECTED_COUNT to a positive integer in .env.playwright.local.');
  }

  if (config.expectedNames.length !== config.expectedCount) {
    throw new Error(`Set CARDMARKET_WANTLIST_EXPECTED_NAMES with exactly ${config.expectedCount} names separated by | in .env.playwright.local.`);
  }

  return config;
}

function normalizeNames(values) {
  return values.map((value) => normalizeName(value));
}

module.exports = {
  assertExpectedWantListConfig,
  hasExpectedWantListConfig,
  normalizeName,
  normalizeNames,
  readExpectedWantListConfig,
};