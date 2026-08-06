- get content from backend? Tips?

- Tighten CORS. Current default is * for fast bring-up. After Chrome extension ID is stable, redeploy with stricter origin:
```bash
cd infra
npx cdk deploy OptimizerServiceStack \
  -c imageTag=YOUR_IMAGE_TAG \
  -c allowedOrigins=chrome-extension://YOUR_EXTENSION_ID
```


- Update delivery fee table from https://help.cardmarket.com/en/ShippingCosts

- Optimizer improvement idea: split cards into two piles based on cost. Shipping dominated and item dominated pricing!


