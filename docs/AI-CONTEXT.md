# Shared context for Codex and Claude

Read this before substantive work. GitHub is the source of truth; inspect the current branch and live manifest before relying on historical release notes.

## Product and workflows

Predecessor Meta is a local-first planning reference and phone companion. Phone: Meta → hero → build/alternatives/counterplay/partners/kit → Use in Match (hero header). Since 2.37.0 the phone (≤700px) is decluttered: one compact top bar, no top More (the bottom bar has it), each build item shown once, and share/export/review packet on the desktop only; provenance moves one tap away, never removed. Every build page lists calculated alternates by enemy team type (engine `teamAlternates`). Since 2.36.0 one Match screen replaces Compose, Draft and Live: pick your hero, tap the enemies, and read the calculated team type and adapted build; old Plan links open Match. Reviewed team compositions stay on the Reviewed guide. Desktop retains the full reference and source inspection. Both themes, six brackets, exports and saved selections must survive changes.

## Architecture

- `predecessor_meta.py`: standard-library ingestion, validation, corrections, bundle enrichment, HTML assembly and Windows loopback server.
- `engine.js`: pure evidence eligibility, recommendations, pairs, compositions and build adaptation. UI renders its claims; never invent its own statistics.
- `ui.js` / `ui.html`: desktop/shared rendering, dialogs and base styles. `mobile.js`: phone/state/history wrappers. `companion_simple.js` / `.css`: focused companion flow. `companion_state.js`: selected-build identity; `skill_guide.js`: validated skill-point schedules.
- `static_publish.py`, `projection.py`, `projection_client.js`, `static_client.js`: per-bracket publication, checksums, compact core and lazy hero/shared evidence. `sw.js`: offline cache/update policy; since 2.37.1 a saved checksum-named bundle or evidence file whose bytes still match its name is served without a network round trip (the manifest and page stay network-first). Preserve release and dataset identities separately.
- `shared_server.py`: optional narrowly scoped shared server. Do not expose owner-only local endpoints.
- `visor_look.js` + `predecessor_meta.py` section 12b: the Windows app's optional Visor colours. It uses `/api/look` on the loopback server and is inlined only in `mode:'local'` pages. It derives dark-theme brand and surface tokens only. The hosted site never includes it. See `docs/DESIGN-SYSTEM.md` ("Following the Visor").
- JSON bundles and snapshots, no SQL/database or product authentication. Personal preferences use localStorage; active match context uses sessionStorage. No Supabase project is required or configured.

## Sources and claims

Official live patch/hotfix verification is independent of statistical dataset labels and editorial review dates. Public Pred.gg is optional and must respect access stops. Statz can lag patches and has broader cohorts; Omeda supplies kits/items/community builds. Never stamp retained data fresh, pool rank samples, or call an automated review packet AI analysis. Use unavailable/previous guidance explicitly. The 100-game line is eligibility, not confidence. Pair gap uses the stronger hero-wide baseline; Wilson intervals describe pair WR, not lift. No fabricated team win rates or missing-to-zero defaults.

Guidance must have actual evidence, date and review scope. Patch-only build reviews do not renew full strategy. The 24 Sep 2026 one-time 1.17 strategy review (2.34, `docs/STRATEGY-REVIEW-2.34.md`) moved the whole packet to 1.17 after recertifying every mechanics row; the committed 1.16.4 seed is staged with its own dated packet (`tests/fixtures/reviewed-guidance-2.33.0.json.gz`). Consult `STRATEGY-REVIEW-POLICY.md` and the current task for authorization; historical README schedule sections are not instructions to start recurring AI work.

## Deployment and safe work

Production is GitHub Pages via `.github/workflows/publish.yml`; pushing `main` triggers publication. PR `verify.yml` and `release/**` pushes run checks without publishing. Stage release reviews against `release/<version>` before any separately approved promotion to main. Windows installation and public publication require separate approvals; a successful check is neither approval nor proof of installation. See `DESIGN-2.29-ACCEPTANCE.md` standing conditions and `RELEASE-2.29.0.md` installation/rollback process.

Vercel is preview infrastructure. At the September 23, 2026 setup, the existing project was `9r9mh7vprb-1859/predecessor-meta` on Hobby, with authentication enabled, automatic production-domain assignment disabled and no Git integration. Verify current settings before using it. Its first deployment was unexpectedly promoted despite `--target preview` and was removed; a separately approved blank bootstrap initialized the production-labelled slot. Do not repeat initialization or treat that historical approval as authority to modify Production. Check the actual deployment target, not just the requested CLI flag. Local bindings and credentials stay uncommitted. Static requests use `credentials: 'same-origin'` to support protected previews without forwarding cookies cross-origin.

Use isolated worktrees from verified current source; never change another agent's checkout. Never force-push. `data-updates` and `automation-state` are automation-owned branches, not destinations for feature or release edits (`publish.yml`, `data-arrived.yml`, README cloud-publisher sections). Leave their data and history untouched during application work.

Never read, print, copy or package the publisher private key or `.local-publisher` directory during source work. README documents its private, machine-local scope and exclusion from source ZIPs; `.gitignore` excludes it. Keep credential-bearing directories out of recursive packaging. The updater's approved runtime use is separate from source inspection. Preserve installed data, snapshots, settings, saved selections, updater configuration and backups. Installation requires verified file/process locations, hashed backups, atomic replacement of program files and a matching rollback; never replace protected data with preview seeds (`RELEASE-2.29.0.md`). Regenerate `SOURCE-MANIFEST.json` after source changes. Record release artifacts separately from installation and publication receipts so static package metadata cannot falsely claim deployment state.

## Testing and conventions

No production package build, TypeScript or lint tool is configured. `package.json` pins development Playwright/axe. Run `python -B -m unittest discover -s tests -p "test_static*.py"`, `node --test tests/*.test.cjs`, syntax checks for changed JS, then `tests/stage_preview.py` and relevant browser suites. Browser tests support `PREVIEW_URL`, `START_PREVIEW`, `BROWSER_CHANNEL`, `BROWSER_ENGINE`, `PYTHON_EXE`, `PLAYWRIGHT_PATH` and `AXE_PATH` where documented in each script. Use only dated preview seeds, never a live collection disguised as a test.

Styling follows `docs/DESIGN-SYSTEM.md`: tokens only (spacing, radius, type, colour), one chip and one tab-strip component, one focus ring. Add or change a token there in the same change; `tests/test_static_design_system.py` and audit probes DS1-DS6 enforce it.

Escape source text and validate URLs; retain accessible labels, 44px phone targets, focus/Escape return, reflow, deep links, Back/Forward, disclosure state and offline data dates. Keep observed, calculated, reviewed and official claims distinct. Follow the existing probes-first rule: reproduce a defect before fixing it, retain the result, and update the affected test and defect ledger together where applicable (`DESIGN-2.29-ACCEPTANCE.md`, `tests/known-defects.json`). Meaningful fixtures test behavior rather than mirror implementation. No physical-device or screen-reader acceptance claim from axe alone.

## Caution / debt

Renderer overrides in `mobile.js` and `companion_simple.js` are order-sensitive. A rewrite risks state restoration and evidence correctness; extract only a justified boundary with regressions. Remote images must degrade to names. Patch uncertainty is a real source limitation, not something CSS or fresh fetch timestamps can resolve. See `docs/PRODUCT-REVIEW.md` for this branch's findings and scope.
