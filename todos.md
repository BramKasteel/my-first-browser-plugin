- Add to tips:
  - Sometimes an order is missing from the filled shopping cart. This is because Cardmarket changes order numbers once in a while. Try to add the missing cards manually!
 
- Debug option should include which order should come from which seller.

- Tighten CORS. Current default is * for fast bring-up. After Chrome extension ID is stable, redeploy with stricter origin:
```bash
cd infra
npx cdk deploy OptimizerServiceStack \
  -c imageTag=YOUR_IMAGE_TAG \
  -c allowedOrigins=chrome-extension://YOUR_EXTENSION_ID
```

- Betaalverzoek should get a x to close
- Change colors
- Update delivery fee table from https://help.cardmarket.com/en/ShippingCosts
