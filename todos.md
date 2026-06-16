# Vacation plans:

ignored sellers are stored in memory. Also use the values in the initial request.

------------

including bargains does not work?

----------

When reoptimizing, also show total price.

----------

Use stuff from https://d-krupke.github.io/cpsat-primer/
- enable logging and graphing using: https://cpsat-log-analyzer.streamlit.app/
- check logs to see which branching methods are most effective
- order the decision vars from expensive to cheap + change the branching method to 'first'
- make this a problem with only bool vars (2x or more speedup --> see if thats the case)

----------

use ortools native, like onlyapplyif on constraints

---------------

investigate the rank of each bought item. If we only get very good items we can prune aggressively

--------------

Add constraints thay say only 1 of a group of sellers can be active; if their offers are very similar

--------------

3. LP Relaxation "Fractional Leak" still exists in Tiers
While our disaggregated constraints forced seller_active to 1, the shipping tier logic within active sellers can still leak fractionally.
An active seller with 3 possible shipping tiers (e.g., Letter, registered, parcel) can select 0.5 of Tier 1 and 0.5 of Tier 2 under LP relaxation, falsely underestimating the true shipping total.

--> might improve lower bound

--------------

Set up donations

--------------

Create possibility to re-optimize, possibly excluding certain sellers

-------------

Publish to Edge

-------------

Improve logging regarding Cart -- auto detect issues

------------

searching specific sets does not work

-------------
