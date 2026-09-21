# 2.29.1 hosting revision 17 — one publication cache scope

Live verification found that a main release restored an older main-scoped cache,
while the PC-arrival workflow had previously updated a data-updates-scoped cache.
Local timestamp guards passed in each cache but published Statz/Omeda dates moved
backwards when publishers alternated. The observed rollback was minutes, not a
change of patch; Pred observations remained preserved.

The PC-arrival workflow now dispatches publish.yml explicitly on main. Daily runs,
patch checks, releases and PC arrivals therefore share the canonical ref/cache
scope and the existing publication concurrency lock. The dispatcher has only
contents-read and actions-write permissions, and no checkout or deployment step.
GitHub's built-in token supports workflow_dispatch; no PAT, paid API or new service
is added. The collector continues pushing only the dedicated public data branch.

Validation includes a workflow contract regression, current Python/JavaScript and
browser CI, an actual PC-arrival -> main workflow_dispatch receipt, and before/after
source timestamp comparison. The application remains version 2.29.1; this is a
publishing correction, not another UI release.
