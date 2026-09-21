# Predecessor Meta 2.29.0 — design review candidate

This candidate is staged for review. It has not been installed or published.

The app now has four destinations: **Meta, Plan, Reference and Sources**. Existing hero
links and older route links remain usable. Plan contains optional Compose, Draft and Live
stages sharing the same picks, enemy roles and bans.

## Changes

- Phone Meta opens the complete role list. You can order it by active reviewed tier,
  observed win rate or hero name. Small and missing samples remain visible and labelled.
- Hero pages show Build, Partners, Counters and Kit as sections with a jump row. Searches
  keep every source row available, restore disclosures correctly and remain scoped to
  the selected hero, role and rank.
- Builds distinguish reviewed choices, observed choices, calculated selections, reordered
  items and actual substitutions. Loadout parts keep their own evidence; crest upgrades
  do not borrow their parent's sample. Pair comparisons use the engine's actual record.
- Plan has a compact shared roster and editor. Its main action follows the combination
  size. Changes cannot silently evict your Live hero or assign an unsupported allied role.
  The explicit Live replacement flow is available on both layouts and retains inventory
  separately for each hero and role.
- Reference has expandable composition plans and a searchable catalog that opens 40
  entries at a time. Search covers the entire collected catalog, including unloaded pages.
- Sources shows each source's scope, status and original date. Detailed audits fold without
  hiding evidence failures or description-review status. Full history, rank comparison,
  corrections, export, sharing, offline support and app settings remain available.

## Data and release boundaries

The recommendation engine, reviewed guidance, source observations, collection schedules
and storage formats are unchanged. Tests use saved source bundles with their original
dates. This is not a fresh collection or a new strategic review; dated evidence must not
be represented as newly fetched because the presentation changed.

The release-specific shell cache advances to 2.29.0. The permanent verified-data cache
keeps its existing name and format, preserving saved ranks through the update.

The Windows installed copy and public site remain untouched. The source package includes
the public Gold test seed so the browser checks can run without collecting data. It excludes
the installed app's data, settings, local profiles and credentials.

## Verification

The final machine-readable receipt is `DESIGN-2.29-VERIFICATION.json`. It distinguishes
automated checks, GitHub receipts, source-package checks and remaining human validation.
The change-by-change acceptance record is `DESIGN-2.29-ACCEPTANCE.md`.

Browser coverage uses Microsoft Edge and Playwright WebKit on Windows. WebKit is not
native iPhone Safari. Simulated narrow/short viewports and large text do not substitute
for testing a real screen reader, actual phone touch interaction or Windows OS scaling.

## Installation and rollback after approval

The coding agent should finish checking the exact release commit, then merge the staged
reviews in dependency order into `release/2.29.0`. Installing locally and merging to `main`
for publication require the release approval recorded in the acceptance plan.

Before replacing the installed program, verify its actual location and running process,
create a timestamped backup of every replaced program file, and record SHA-256 hashes.
Retain `data`, snapshots, settings, saved selections and updater configuration. Stop only
the verified app instance, install the verified files atomically, then reopen it and test
the existing launcher. Record the backup path and add the matching rollback launcher.

For rollback, stop that app instance, verify the backup hashes, and restore only the
replaced program files. Do not restore older statistics or erase browser storage. Revert
the approved source release merge to roll back the website, then verify its deployment
receipt and reopening of saved ranks. The daily collection and patch-check workflows
remain in place.
