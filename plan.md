## Plan: Solver Convergence Options

Analyze current CP-SAT model in /home/bram/repos/my-first-browser-plugin/optimizer-api/app/solver.py, identify true convergence and build-time bottlenecks from current fixtures, and prioritize solver changes that improve solution quality and wall time without widening scope beyond optimizer-api/. Recommended path: first tighten current formulation and Python build path, then add staged seller shortlisting, then only if needed try structural decomposition.

**Current findings**
- Exact model growth is driven mainly by per-seller shipping tier choice variables and their bound constraints. Fixture ceilings in /home/bram/repos/my-first-browser-plugin/optimizer-api/tests/test_api.py show warm-start at 17649 vars / 5105 constraints and exact at 20685 vars / 13595 constraints for big_list.
- Python/model-build overhead is also likely material: solver.py repeatedly rescans offer lists per item and per seller, recomputes cents and capped quantities, and rebuilds maps during warm start, exact solve, and response assembly.
- Warm start exists but is relatively weak as search guidance. It optimizes item cost plus per-seller minimum shipping floor, then tier hints are inferred by matching exact shipping price; if no tier price matches, all hints for that seller go to zero.
- Current exact tier logic appears to rely on objective discouragement rather than an explicit per-seller at-most-one-tier constraint, which may weaken propagation.
- big_list appears to have wanted quantity 1 throughout or almost throughout, which means same-seller same-item duplicate offers are likely already mostly eliminated after existing dominated-offer pruning. This reduces priority of seller-item compression unless measured otherwise.

**Steps**
1. Instrument current solver split into prune time, model-build time, solve time, and response assembly time using optimize_order in /home/bram/repos/my-first-browser-plugin/optimizer-api/app/solver.py. This establishes whether current pain is search, Python overhead, or both.
2. Tighten current formulation with safe low-risk changes: explicit tier exclusivity, capped exact quantity domains, stronger tier hints based on feasibility rather than price equality, and cached per-offer cents/capped quantities. These changes preserve current semantics and should be cheap to validate.
3. Remove avoidable Python overhead by pre-indexing offers once into offers_by_item, offers_by_seller, and optionally offers_by_seller_item. Replace repeated full-list scans in warm-start build, exact model build, and result assembly.
4. Measure impact on model size, build time, first feasible time, and final objective for big_list, ob_nixilis_improvements, and small_wantslist. If this materially improves runtime, stop there.
5. If exact solve still struggles, add staged seller shortlisting / iterative deepening. First solve on warm-start sellers plus top-k alternatives per item, then expand neighborhood only if result quality is weak. This matches user preference for strong heuristics that beat Cardmarket without one-shot irreversible pruning.
6. If seller shortlisting works but loses quality on some fixtures, evolve it into expanding neighborhoods or LNS-style repair rather than jumping straight to full decomposition.
7. Only after the above, evaluate structural changes such as tier shortlisting, seller-item compression, two-stage item-vs-shipping repair, or master/subproblem decomposition.

**Ranked options**
3. Pre-index offers and stop rescanning full offer list for each item and seller in /home/bram/repos/my-first-browser-plugin/optimizer-api/app/solver.py. Targets user suspicion that build/preprocessing is major pain.
6. Add timing instrumentation and maybe solver log hooks so future work can distinguish build slowdown from CP-SAT search slowdown.
8. Extend pruning ideas from single-item sellers to small sellers with 2-3 wanted items, but only inside staged search. Avoid one-shot deletion of globally optimal combinations.
9. Keep only 1-2 tier candidates per seller when safe after order-bound pruning, e.g. cheapest tier plus cheapest tier that materially expands value/card capacity. Could cut exact constraints a lot if many sellers still have multiple tiers.
13. Apply LNS-style repair around incumbent neighborhoods if exact solve improves slowly after finding a feasible solution.
14. Consider seller-item compression only if post-prune analysis shows many same-seller same-item duplicate buckets still survive. Current expectation is low priority for big_list because wanted quantities are mostly 1.
15. Consider master/subproblem decomposition only if lighter-weight heuristics fail. High complexity, harder to validate, not first move.

**Options by category**
- Fewer variables:
	- Cap exact quantity domains.
	- Seller shortlisting / iterative deepening.
	- Tier shortlisting per seller after safe pruning.
	- Seller-item compression only if duplicate buckets persist post-prune.
- Fewer constraints:
	- Explicit tier exclusivity to strengthen propagation.
	- Reduce number of tier candidates per seller.
	- Two-stage or neighborhood exact solve on fewer sellers.
- Smart structural ideas:
	- Iterative deepening on shortlisted sellers.
	- LNS / repair around incumbent.
	- Two-stage item selection then exact shipping repair.
	- Master/subproblem decomposition only as late option.

**Assumptions and simplifications worth testing**
- Many sellers are likely non-competitive once shipping is considered. If true, staged seller shortlisting can cut both build time and search time heavily.
- big_list likely contains mostly quantity-1 wanted items. If true, current dominated-offer pruning already collapses most same-seller same-item duplicates, reducing value of seller-item compression.
- High-quality heuristic output that beats Cardmarket is more important than proof of optimality. This favors staged search and incumbent-driven methods.

**Relevant files**
- /home/bram/repos/my-first-browser-plugin/optimizer-api/app/shipping.py — route-tier pruning, dominance logic, card-limit abstraction, and shipping floors.
- /home/bram/repos/my-first-browser-plugin/optimizer-api/app/models.py — request size limits and existing knobs like max_sellers.
- /home/bram/repos/my-first-browser-plugin/optimizer-api/tests/test_api.py — fixture-driven model-size ceilings and fixture acceptance tests.
- /home/bram/repos/my-first-browser-plugin/optimizer-api/tests/fixtures/requests/big_list.json — large-scale representative fixture for build-time and convergence experiments.

**Verification**
1. Add timing instrumentation around prune, build, solve, and response phases and capture results on big_list, ob_nixilis_improvements, and small_wantslist.
2. Compare model sizes before and after changes using current test pattern in /home/bram/repos/my-first-browser-plugin/optimizer-api/tests/test_api.py.
3. For safe formulation changes, confirm exact totals and allocations remain unchanged on existing solver correctness tests.
4. For heuristic shortlist / staged-search changes, compare grand total and seller count against current solver and against Cardmarket baseline where available.
5. Track not only final wall time but also time to first feasible solution and objective quality at timeout.

**Decisions**
- Excluded for now: browser extension scraping changes, API contract changes, infra changes, and broad product-scope work.
- User prefers high-quality heuristic output that reliably beats Cardmarket website over strict proof of optimality.
- User allows iterative deepening and more aggressive seller pruning, including possibly sellers with 2-3 wanted items, but is wary of one-shot heuristic pruning that could permanently remove true optimum.
- User suspects current pain is model build / preprocessing on large instances similar to big_list.json.

**Open questions**
1. After current dominated-offer pruning, how many same-seller same-item duplicate buckets actually survive on big_list? If near zero, seller-item compression should stay low priority.
2. For real scraped requests beyond big_list, do wanted quantities usually stay at 1, or are multi-copy items common enough to change pruning value?
3. Does current solver typically find a feasible solution quickly and then stall, or is first feasible itself slow once instrumentation is added?
4. After shipping tier dominance pruning in /home/bram/repos/my-first-browser-plugin/optimizer-api/app/shipping.py, how many sellers still have multiple tier options on big_list? This determines whether tier shortlisting is major lever or marginal lever.