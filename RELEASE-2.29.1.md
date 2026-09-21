# 2.29.1 — free automatic fallback and patch coverage

The Windows updater can now be explicitly enabled at sign-in with `-Automatic`.
It checks every three hours while signed in, collects daily or when a live patch/hotfix changes,
and publishes only the dedicated public data branch. GitHub checks continue independently.
Use `-PythonPath` for a verified interpreter and `-PublisherDirectory` to reuse the existing
private connection without copying credentials. Default installation remains manual recovery.
Use the installer with `-Uninstall` and the same publisher directory to stop and remove its shortcuts;
data and connection files remain intact.

Recent retained exact-patch, same-rank Pred observations take priority over a broader Statz dataset
for up to 30 hours. They remain labelled saved, not a successful fresh collection. Older, future-dated,
wrong-rank or wrong-patch retained observations cannot take that priority. No samples are pooled.

Each screen offers separate patch coverage for role/recommendation statistics, pair statistics and
written guidance. Overdue strategy reviews are disclosed independently of fresh statistics. Previous
build guidance is open when current advice is unavailable; changed mechanics and incompatible choices
remain inspection-only. Collection never invents an editorial review date or rewrites guidance.

Patch 1.17 is announced for September 22; the September 21 official check identifies 1.16.4 as live.
The system waits for live patch verification and matching source data rather than relabelling old data.

Validation: Python and JavaScript suites plus browser regressions; see the accompanying release receipt
for final counts and deployment verification. Saved source data, settings and planner selections are preserved.
