# 2.30.1 — Keep dated role statistics visible after a patch change

The published patch check reported 1.17 while all six Statz datasets still carried
the 1.16 label. Collection had succeeded: the checksum-verified public bundles
contained 437 successful hero/role records across six separate brackets. The UI
used recommendation eligibility to decide whether any role numbers could be
displayed, so it hid every one.

## Repair

- Meta and hero screens now show valid prior Statz role observations with their
  original patch, source, sample and dates. The phone cards explicitly identify
  the previous dataset. Missing, conflicting, invalid and future-dated fallback
  records stay missing.
- Desktop automatic source selection opens the labelled previous dataset when
  current recommendation statistics are unavailable. The phone defaults to
  alphabetical order in this state; choosing observed win-rate order compares
  only the displayed prior dataset.
- Display and recommendation policies are separate. Old observations never
  reactivate editorial tiers or feed current recommendation scoring. An eligible
  current source still takes precedence. A missing row from an eligible exact
  cohort does not borrow a row from another source.
- No data values, source dates, patch labels, reviewed guidance or schedules
  were changed. This is a presentation repair, not a new statistical collection
  or an AI strategy review.

## Verification

218 JavaScript tests passed. Python ran 199 tests with one existing skip.
The new regression exercises patch rollover, absent/invalid samples, six-bracket
separation, source precedence, retained data and withheld verification.
The browser regression checks 30 role/theme/width combinations, plus hero source
dates and accessibility, in Edge and WebKit. The actual published datasets also
passed 60 rank/role/layout checks in each browser. The regression runs in PR CI.
Installation and publication receipts are recorded separately after completion.

## Remaining evidence limits

Latest-patch statistical samples remain unavailable until a source provides
them. The displayed fallback is still labelled 1.16, regardless of when it was
downloaded. The official article announces September 22 without a precise
go-live time; the collector's existing date-based patch classification is not
independent proof of server rollout. This repair does not change that policy.
Physical-device and screen-reader acceptance were not performed for this fix.

## Rollback

The Windows upgrade makes a hashed backup of changed program files and preserves
data, snapshots, settings and guidance. Use `Roll Back 2.30.1.bat` in the installed
app folder after quitting the local app. For the website, revert this repair's
merge through the normal PR workflow; preserve collected data and its timestamps.
