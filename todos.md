- fix logging, add S3

- get content from backend? Tips?

- Debug option should include which order should come from which seller.

- Add to tips:
  - Sometimes an order is missing from the filled shopping cart. This is because Cardmarket changes order numbers once in a while. Try to add the missing cards manually!
 

- Tighten CORS. Current default is * for fast bring-up. After Chrome extension ID is stable, redeploy with stricter origin:
```bash
cd infra
npx cdk deploy OptimizerServiceStack \
  -c imageTag=YOUR_IMAGE_TAG \
  -c allowedOrigins=chrome-extension://YOUR_EXTENSION_ID
```

- Betaalverzoek should get a x to close

- Update delivery fee table from https://help.cardmarket.com/en/ShippingCosts

- Optimizer improvement idea: split cards into two piles based on cost. Shipping dominated and item dominated pricing!

- add licence

- rewrite: Connected to artifacts | Cardmarket (/en/Magic/Wants/24333708). to connected to cardmarket tab (...)