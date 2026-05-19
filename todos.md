Create a bipartite graph of sellers and items. Decompose it and solve the sub problems.
You can also remove leaf nodes if they are more expensive then others:
price(item, leaf) + shipping(leaf) >= max(price(item, other nodes))

---------------

Shipping costs might actually differ: in Germany there is a 'large letter' which is absent from the tables
Asked a seller, should ask more
---------

what to do which different currencies. delevery costs is in multiple currencies.
For now: only deal with countries that use euros

--------

Do not require to be on a specific wants list page.
Instead -- show a drop-down to load a wants list.

---------

Get an estimate for the shopping wizard prices:
- reduced price
- reduced shipments
- if you come from a shopping wizard result -- take that information

---------
for a certain query cache the results for 5 minutes

----------

if an order cannot be filled -- remove the articleid that wasn't available.
Run the optimizer again.

----------

Try to make the scraping faster

----------

create light mode / dark mode

---------

create a default settings tab that hides much of the stuff

---------

searching for foils doesnt work

----------

currently implemented: if we have >300 results for a country, only query powersellers
This causes the search to be not full

---------

try to get flow frontend-backend-frontend-cart working