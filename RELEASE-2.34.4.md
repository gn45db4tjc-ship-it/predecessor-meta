# 2.34.4: Muriel's Sentinel reads as its official values

This is a text fix for one hero kit. The engine, reviewed guidance, statistics and source dates are unchanged.

## What changes for you

Muriel's passive, Sentinel, now reads as its official values:
- **Anti-heal:** "reduce Enemy Healing by 25/35/45% at Muriel levels 1/7/13". Before, it showed the source's raw per-level list: 25 repeated for every level, then two stray values.
- **Heal and shield bonus:** "10% at the affected ally's level 1, plus 0.4 percentage points per level after the first, reaching 16.8% at level 18". This is the 1.17 value.

The same text appears on the website and in the Windows app.

## Why it happened

2.34.0 retired a 1.12-era reconciliation for Sentinel, because its 12%–20.5% numbers no longer hold on 1.17. The 1.17 supplement already had the new heal and shield numbers, but it kept the source's malformed anti-heal list. Nothing readable replaced it, so the raw list showed again. The supplement's Sentinel correction now writes the official text. It uses official 1.12 for the anti-heal tiers and official 1.17 for the healing bonus.

## Verification

- `tests/test_static_muriel_sentinel.py` found the raw list before the fix. It now checks three things:
  - the effective text states the official values;
  - both source forms (the raw Statz text, and the earlier corrected or Pred.gg 1.17 wording) become the reviewed text;
  - every exact citation of the passive agrees.
- Three citations moved with the text: the Muriel support plan's check, Muriel's 1.17 patch note and a Valmont partner note.
- On the Windows Gold+ 1.17 data and on the live Gold data:
  - the text is clean;
  - there are no supplement conflicts;
  - the Muriel support plan and patch note stay active;
  - every other count is unchanged (90 of 97 builds, and all notes, adaptations and compositions).

## Compatibility

App version and service-worker shell cache advance together to 2.34.4. Saved selections, settings, the offline data cache and statistics are unchanged. Publication and Windows installation remain separate approvals.
