# 2.43.1 — Pred.gg API: GraphQL refusals are denials, and the API waits for Pred.gg's approval

On 2 Oct 2026 Rocket verified pred.gg/gql: anonymous hero metadata works, but `hero.generalStatistic` returns null with a GraphQL "Forbidden" error under HTTP 200. The OAuth grant, quotas and permission to publish statistics are still unconfirmed. Nothing on the site changes: no API credentials are set, and Pred.gg data still comes from the public pages read by the PC collector.

## What changes

- **GraphQL errors decide, not the HTTP status.** Any "Forbidden" in a response is a denial, even beside other errors (before, only when every error was "Forbidden"). A statistics field that comes back null without an error is treated as withheld, never as an empty sample.
- **Stop on denied fields.** A denial moves the rest of the run to the public pages, as before. It is now also remembered, as a short hash of the credentials, never the credentials themselves, so later runs don't ask again until the credentials change.
- **The API waits for Pred.gg's approval.**
  - It is used only when credentials exist *and* `free_hosting.json` records `pred_api_approved: true` in a reviewed commit.
  - It is `false` today, so adding secrets alone does nothing.
  - The published source note keeps saying "public pages" until then.

## Verification

- **Probe first** (commit e908038, failing on main 93aed6b): `tests/test_static_pred_api_denied.py`.
  - A Forbidden beside another error was not a denial.
  - A null statistic passed as data.
  - Credentials alone enabled the API.
  - A denial was retried every run.

  All pass now.
- **Existing API tests** now grant the approval explicitly and keep any remembered denial in a temporary folder. A new test checks that without approval the site still says "public pages only".
- **Python static and Node tests pass.**
