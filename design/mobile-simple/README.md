# Mobile simplification: design review gate

This is an isolated prototype, not an installed or published upgrade. Production
application files, saved selections, source bundles and collection schedules are unchanged.
The prototype uses its own browser storage key and an unchanged copy of `engine.js`.

## Review

The generated package is `qa/mobile-review/index.html`. Serve `qa/mobile-review`
on loopback to use both the prototype and its full-reference links. The prototype
itself also opens from disk; the full-reference application needs HTTP.

Try these three tasks:

1. Meta → Khaimera → Build → Alternatives → choose a playstyle.
2. Adapt to my match → add an enemy or completed item → compare the original build.
3. Plan → choose a role/personal pool → Show my shortlist → preview setup → continue.
   Ban a suggested hero and confirm the list stays put while that choice becomes disabled.

The review question is whether the build screen and quick-draft interaction are
clear enough to port. The agreed plan explicitly requires this review before the
hero/draft layouts are ported. No production rollout is implied by approving the prototype.

## Real depth retained

- All heroes and source build variants from the input bundle, not three fake cards.
- Production role performance, sample counts, source date and retention labels.
- Full six-item path and augment, Eternal, two blessings, crest; missing choices stay missing.
- Engine-selected recommendations, current-matchup eligibility, kit partners and full kit.
- Engine live adaptation using the selected observed variant, picks and owned items.
- Original full reference interface generated from the exact same saved bundle,
  including community builds, purchase-position evidence, crest evolution,
  corrections, patch history, Sources and every original route.
- Build explanations and advanced evidence are deferred, not deleted.

## Deliberate prototype boundaries

- Gold+ only; input source dates are preserved. No refresh, new strategic review or rank comparison is performed.
- Real statistics are saved observations, not proof of today's live meta.
- Variant identity is perk/Eternal/core sequence in this preview. The production port
  still needs a publication-aware validated build reference and invalidation tests.
- Prototype storage and navigation are separate; production Back/Forward, deep links,
  saved settings and undo will be reused during the port, not replaced by this prototype.
- This preview adds no offline guarantee, installation, automatic game detection,
  account system, analytics or public hosting.
- Remote art may fail offline; names remain visible. No load-time comparison is claimed:
  the prototype embeds a full saved bundle instead of production's lazy loading.
- No physical phone, screen reader, or assistive-technology acceptance is claimed.
- Counters show up to five eligible observations; all evidence is reachable in Full details.
- The draft preview uses the existing kit ordering. It adds no new ranking or win-rate arithmetic.

## Reproduce

```
python -B design/mobile-simple/build_preview.py --seed PATH_TO_SAVED_BUNDLE.json
node design/mobile-simple/verify.cjs
python -B -m http.server 12967 --bind 127.0.0.1 --directory qa/mobile-review
```

The verifier uses the existing Playwright and axe dependencies; `PREVIEW_DEPS`
overrides their local directory. It writes `TEST-RESULTS.json` and screenshots only
inside the ignored review package. `BUILD-RECEIPT.json` fingerprints input and engine.

## Port sequence after design review

1. Navigation branch: map mobile Meta/Builds/Plan/More while preserving all legacy routes,
   desktop references, one current-page marker, shared links and history restoration.
2. Hero presentation branch: one active phone section, full loadout, alternatives,
   source-specific warnings, counter/partner evidence and context-specific disclosure state.
3. Match continuity branch: stable publication-aware selected-build identity, owned-item
   validation, saved-state migration and truthful offline readiness after evidence is cached.
4. Quick draft branch: per-role personal pool, eligible shortlist, explicit recalculation,
   immediate blocking of unavailable candidates, full pre-match setup and Live handoff.

Run the complete production Python/Node/browser/rank/offline/a11y suites for those
ports. Regenerate SOURCE-MANIFEST.json only when production source changes. Create
hashed backups and rollback instructions before any separately approved install/publish.
