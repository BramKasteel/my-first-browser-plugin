function readExpectedSellerFilterConfig() {
  return {
    sellerCountry: String(process.env.CARDMARKET_SELLER_COUNTRY || 'Germany').trim(),
    sellerReputation: String(process.env.CARDMARKET_SELLER_REPUTATION || 'Good').trim(),
    maxShippingTime: String(process.env.CARDMARKET_MAX_SHIPPING_TIME || '7').trim(),
  };
}

module.exports = {
  readExpectedSellerFilterConfig,
};