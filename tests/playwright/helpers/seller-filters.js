function readExpectedSellerFilterConfig() {
  return {
    buyerCountry: String(process.env.CARDMARKET_BUYER_COUNTRY || 'Netherlands').trim(),
    sellerCountry: String(process.env.CARDMARKET_SELLER_COUNTRY || 'Germany').trim(),
    sellerReputation: String(process.env.CARDMARKET_SELLER_REPUTATION || 'Good').trim(),
    maxShippingTime: String(process.env.CARDMARKET_MAX_SHIPPING_TIME || '7').trim(),
  };
}

module.exports = {
  readExpectedSellerFilterConfig,
};