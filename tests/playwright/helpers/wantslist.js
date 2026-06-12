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

function readWantListSizeLimitConfig() {
  const under30DistinctCount = Number.parseInt(String(process.env.CARDMARKET_WANTLIST_UNDER_30_DISTINCT_COUNT || process.env.CARDMARKET_WANTLIST_UNDER_30_COUNT || ''), 10);
  const between31And100DistinctCount = Number.parseInt(String(
    process.env.CARDMARKET_WANTLIST_31_TO_100_DISTINCT_COUNT
    || process.env.CARDMARKET_WANTLIST_31_TO_100_COUNT
    || process.env.CARDMARKET_WANTLIST_31_TO_70_DISTINCT_COUNT
    || process.env.CARDMARKET_WANTLIST_31_TO_70_COUNT
    || ''
  ), 10);
  const over100DistinctCount = Number.parseInt(String(
    process.env.CARDMARKET_WANTLIST_OVER_100_DISTINCT_COUNT
    || process.env.CARDMARKET_WANTLIST_OVER_100_COUNT
    || process.env.CARDMARKET_WANTLIST_OVER_70_DISTINCT_COUNT
    || process.env.CARDMARKET_WANTLIST_OVER_70_COUNT
    || ''
  ), 10);

  return {
    under30: {
      wantListName: normalizeName(process.env.CARDMARKET_WANTLIST_UNDER_30_NAME || ''),
      expectedDistinctCount: Number.isFinite(under30DistinctCount) ? under30DistinctCount : 0,
    },
    between31And100: {
      wantListName: normalizeName(process.env.CARDMARKET_WANTLIST_31_TO_100_NAME || process.env.CARDMARKET_WANTLIST_31_TO_70_NAME || ''),
      expectedDistinctCount: Number.isFinite(between31And100DistinctCount) ? between31And100DistinctCount : 0,
    },
    over100: {
      wantListName: normalizeName(process.env.CARDMARKET_WANTLIST_OVER_100_NAME || process.env.CARDMARKET_WANTLIST_OVER_70_NAME || ''),
      expectedDistinctCount: Number.isFinite(over100DistinctCount) ? over100DistinctCount : 0,
    },
  };
}

function hasWantListSizeLimitConfig() {
  const config = readWantListSizeLimitConfig();
  return !!config.under30.wantListName
    && config.under30.expectedDistinctCount > 0
    && config.under30.expectedDistinctCount < 30
    && !!config.between31And100.wantListName
    && config.between31And100.expectedDistinctCount > 30
    && config.between31And100.expectedDistinctCount <= 100
    && !!config.over100.wantListName
    && config.over100.expectedDistinctCount > 100;
}

function assertWantListSizeLimitConfig() {
  const config = readWantListSizeLimitConfig();

  if (!config.under30.wantListName || config.under30.expectedDistinctCount <= 0 || config.under30.expectedDistinctCount >= 30) {
    throw new Error('Set CARDMARKET_WANTLIST_UNDER_30_NAME and CARDMARKET_WANTLIST_UNDER_30_DISTINCT_COUNT (<30) in .env.playwright.local.');
  }

  if (!config.between31And100.wantListName || config.between31And100.expectedDistinctCount <= 30 || config.between31And100.expectedDistinctCount > 100) {
    throw new Error('Set CARDMARKET_WANTLIST_31_TO_100_NAME and CARDMARKET_WANTLIST_31_TO_100_DISTINCT_COUNT (31-100) in .env.playwright.local.');
  }

  if (!config.over100.wantListName || config.over100.expectedDistinctCount <= 100) {
    throw new Error('Set CARDMARKET_WANTLIST_OVER_100_NAME and CARDMARKET_WANTLIST_OVER_100_DISTINCT_COUNT (>100) in .env.playwright.local.');
  }

  return config;
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
  assertWantListSizeLimitConfig,
  assertExpectedWantListConfig,
  hasWantListSizeLimitConfig,
  hasExpectedWantListConfig,
  normalizeName,
  normalizeNames,
  readExpectedWantListConfig,
  readWantListSizeLimitConfig,
};