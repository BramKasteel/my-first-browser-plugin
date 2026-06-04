(function (root, factory) {
  const utils = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
  }
  root.SellerFilterUtils = utils;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function textOf(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeSellerReputation(value) {
    const normalized = textOf(value).toLowerCase();
    const aliases = {
      outstanding: 'Outstanding',
      excellent: 'Very good',
      'very good': 'Very good',
      good: 'Good',
      average: 'Average',
      bad: 'Bad',
    };
    return aliases[normalized] || '';
  }

  function normalizeSellerType(value) {
    const normalized = textOf(value).toLowerCase();
    const aliases = {
      private: 'Private',
      professional: 'Professional',
      pro: 'Professional',
      'power seller': 'Power Seller',
      powerseller: 'Power Seller',
    };
    return aliases[normalized] || '';
  }

  function normalizeMaxShippingTime(value) {
    const normalized = textOf(value).toLowerCase();
    const aliases = {
      '2': '2',
      '2 days': '2',
      '3': '3',
      '3 days': '3',
      '4': '4',
      '4 days': '4',
      '5': '5',
      '5 days': '5',
      '6': '6',
      '6 days': '6',
      '7': '7',
      '7+': '7',
      '7+ days': '7',
    };
    return aliases[normalized] || '';
  }

  function getCardmarketSellerReputationId(value) {
    const normalized = normalizeSellerReputation(value);
    const ids = {
      Outstanding: '1',
      'Very good': '2',
      Good: '3',
      Average: '4',
      Bad: '5',
    };
    return ids[normalized] || '';
  }

  function getCardmarketMaxShippingTimeId(value) {
    return normalizeMaxShippingTime(value);
  }

  function getCardmarketSellerTypeId(value) {
    const normalized = normalizeSellerType(value);
    const ids = {
      Private: '0',
      Professional: '1',
      'Power Seller': '2',
    };
    return ids[normalized] || '';
  }

  return {
    normalizeSellerReputation,
    normalizeSellerType,
    normalizeMaxShippingTime,
    getCardmarketSellerReputationId,
    getCardmarketMaxShippingTimeId,
    getCardmarketSellerTypeId,
  };
});