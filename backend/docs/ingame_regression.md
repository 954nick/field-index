# Field Index CFB27 In-Game Verification

Backend implementation and automated regression coverage are complete. CFB27 itself is the remaining authority for final save-behavior verification.

## One-command regression generation

On the development PC, run:

```powershell
npm run ingame:generate -- "C:\Users\Administrator\Documents\EA SPORTS College Football 27\Saves\DYNASTY-YOURSAVE"
```

The generator:

- never overwrites the source save,
- automatically captures/merges Head ID profiles from that save,
- auto-builds the portrait index if `assets/player_portraits/` exists locally and an index is not already present,
- creates only short `DYNASTY-FI-*` test filenames,
- reopens each output through the production parser/writer before reporting success,
- writes `data/ingame_regression_report.json` with the exact expected change for each generated save.

## Generated verification coverage

Depending on what the supplied save contains, the generator creates tests for:

- `PLYR` — player scalar/rating editor
- `PCLS` — class/redshirt editor
- `BATCH` — multiple player edits in one save
- `PSKILL` — player skill points / XP
- `PABIL` — physical or mental player ability change
- `PAPPR` — safe player appearance scalar
- `DEPTH` — depth-chart reorder
- `COACH` — coach points / XP
- `CTREE` — coach ability-tree unlock
- `CNODE` — individual named/numeric coach ability unlock
- `CAPPR` — coach appearance scalar
- `GRADE` — team / My School grade edit
- `POLL` — poll ranking reorder
- `CFP` — unplayed CFP participant edit where safely available
- `G2U` — generic -> unique Head ID
- `U2G` — unique -> generic Head ID
- `G2G` — generic -> generic Head ID
- `U2U` — unique -> unique Head ID
- `HMULTI` — multiple Head ID edits in one save
- automated source-overwrite backup byte-comparison regression

Unavailable cases are reported as **skipped with a reason**, not silently treated as passed.

## What you verify in CFB27

For each generated save:

1. it loads without hanging,
2. the report's intended edit appears,
3. unrelated values remain untouched,
4. CFB27 can save the dynasty again.

For Head ID tests specifically, verify the 3D head and portrait changed while helmet, facemask, sleeves, gloves, shoes, towel, body/build, height, weight and tattoos remain the target player's original values.

For coach tests, verify coach points/XP and the reported tree/node state exactly match the report and unrelated coach trees/staff assignments remain intact.

## Failure report

If a test fails, keep the untouched source and send back:

- `data/ingame_regression_report.json`,
- the failing short test label,
- what CFB27 displayed incorrectly.

Do not rename a test to a long diagnostic filename; long CFB27 dynasty filenames are known to cause false loading failures.

## Memory-safe generation

`npm run ingame:generate` runs the regression suite in isolated Node processes instead of retaining every opened dynasty/editor instance in one heap. The phases are player/depth editing, coach/program editing, Head ID editing, and backup verification. Phase reports are merged into `data/ingame_regression_report.json`.

If `assets/mappings/head_catalog.json` already contains at least two usable unique heads and two usable generic heads, the Head phase automatically reuses that cache and does not repeat the full save Head-profile scan. Use `--no-head-auto-build` to force cache-only behavior; use `mapping:prepare` explicitly when a catalog refresh is desired.
