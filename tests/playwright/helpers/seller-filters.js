const {
  normalizeSellerReputation,
  normalizeMaxShippingTime,
} = require('../../../seller-filter-utils');

function readExpectedSellerFilterConfig() {
  const sellerReputationValue = String(process.env.CARDMARKET_SELLER_REPUTATION || '').trim();
  const maxShippingTimeValue = String(process.env.CARDMARKET_MAX_SHIPPING_TIME || '').trim();
  return {
    buyerCountry: String(process.env.CARDMARKET_BUYER_COUNTRY || 'Netherlands').trim(),
    sellerCountry: String(process.env.CARDMARKET_SELLER_COUNTRY || 'Germany').trim(),
    sellerReputationValue,
    sellerReputation: normalizeSellerReputation(sellerReputationValue),
    maxShippingTimeValue,
    maxShippingTime: normalizeMaxShippingTime(maxShippingTimeValue),
  };
}

module.exports = {
  readExpectedSellerFilterConfig,
};