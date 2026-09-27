# 2.39.0 — Item taps download a fifth as much

The last of the speed work planned in 2.37. Before this release, tapping an item or loadout on the website downloaded the whole "shared" source-audit file (637 KB compressed on Gold+), just to show that item's Pred.gg fields. It now downloads only the item catalogue: 128 KB compressed. What is shown and how it is labelled do not change.

## What changes for you

- **Items and loadouts open faster the first time.** On Fast 3G (about 180 KB/s), a first item tap waited about 3.5 s for its evidence and now waits under 1 s. This is estimated from the compressed sizes. After that it comes from the phone.
- **Changes, Sources and the reviewed-definition dialog** download their own history file (263 KB compressed) when opened. The rest of the source audit (247 KB) downloads only when Sources opens it.
- **Nothing is recalculated:** these files hold display-only evidence the engine never reads.

## How it works

- **`projection.py` (version 3):** the shared overlay splits by the view that reads it.
  - `catalog`: each item's and perk's `pred_raw` and `previous_source`, plus `pred_game_data.field_protections`. Read by the item and loadout dialog (`predCatalogAudit`) and the Pred.gg audit count.
  - `history`: `official.definition_history`, `official.publisher_news` and `scoped_changes`. Read by `publisherNewsHTML`, `scopedHistoryHTML`, `reviewedDefinitionHTML` and `definitionReviewAuditHTML`.
  - `shared`: the rest (Pred.gg assets, catalogues and fetch records, the image index, Omeda items, unverified changes, official article blocks).
  - As in 2.38.0, the parts rebuild the bundle byte for byte in any order, and the publisher checks this before publishing.
- **`static_client.js`:**
  - accepts versions 1–3;
  - for a saved version 1 or 2 publication, `catalog` and `history` map to the shared file, the same download under the same id;
  - the service worker, the file-name checks, the saved-file cleanup and the export include the new parts.
- **Pages still on 2.38.0** see version 3 and load the full bundle instead.

## Verification

- **Probe first:** PS4 reproduced on the live 2.38.0 site, where tapping Azure Core on Gideon's build downloaded `gold-shared`. Now it downloads `gold-catalog` only. PS1–PS3 (2.38.0's first-screen checks) still pass.
- **`tests/test_static_projection.py`:** an item dialog's fields are in the catalog and the history fields are in history. The parts rebuild the bundle in three different merge orders.
- **`tests/projection.test.cjs`:** the engine parity checks are unchanged, since nothing the engine reads moved, and the rebuild runs in both orders with all five named parts.
- **Other tests:** Python static tests, Node tests and the 11 CI browser suites.
