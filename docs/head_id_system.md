# Field Index Head ID System

## Purpose

Field Index exposes player appearance as a **Head ID**, not as a donor-player copy
and not as an equipment editor.

A Head ID edit is allowed to change only the verified head identity state:

- `PLYR_ASSETNAME`
- `GenericHeadAssetName`
- matching `PLYR_PORTRAIT` when mapped
- CharacterVisuals `Head`-layer `PlusHead` state
- CharacterVisuals skin tone required by that head profile

It intentionally preserves the player's Base and PlayerOnField loadouts, including
body/build, tattoos, helmet, facemask, sleeves, gloves, shoes, towel, and other
equipment.

## Canonical identity

The visible Head ID stays numeric, matching the CFB27 asset naming convention:

```text
Unique_HendersonKeisean_201504 -> 201504
Generic_4757_P_T0225_D_8_3    -> 4757
```

Field Index also stores an internal canonical key containing the head type:

```text
unique:201504
generic:4757
```

This prevents a future numeric collision between a unique and generic head from
silently resolving to the wrong asset. Numeric API lookups continue to work when
the numeric ID is unambiguous.

## Catalog file

Tracked mapping file:

```text
assets/mappings/head_catalog.json
```

The catalog is intentionally lightweight. Raw Frosty exports remain local and are
not committed.

Each catalog entry can contain:

```text
head_id
a canonical_key
head_type
asset_name
generic_head_asset_name
portrait_id
skin_tone
head_layer.plus_head_elements
profile_complete
source_display_names
source_player_rows
recipe_asset_path
portrait_asset_path
notes
```

For **unique heads**, a Frosty recipe name is enough to discover the Head ID but
not enough by itself to make the ID writable. Field Index keeps that entry
incomplete until it has captured the required live profile metadata from CFB27.

For **generic heads**, CFB27 encodes the complete reusable head recipe directly in
the `Generic_<id>_...` asset name. Field Index deterministically derives the
matching portrait ID, skin tone, and `PlusHead` item from that recipe instead of
requiring a donor player or repeatedly decoding thousands of CharacterVisuals
rows. This makes the generic catalog game-wide, cumulative, and cacheable.

## Production API

`FieldIndexEditor` now exposes:

```text
getPlayerHeadId(playerRow)
getPlayerHeadProfile(playerRow)
getHeadById(headId)
listHeadIds(options)
setPlayerHeadId(playerRow, headId, options)
```

`setPlayerHeadId()` resolves the requested ID through the catalog. It no longer
requires another player record as a donor.

The older `copyPlayerHeadId()` path remains only as a diagnostic/backward-
compatibility helper and is not the product-facing mechanism.

## Build or expand the catalog

From `parser/`:

```powershell
npm run head:catalog -- --save "C:\path\to\DYNASTY-SAVE"
```

The builder groups players by Head ID and records every source player that used the
ID. Generic heads are hydrated directly from their deterministic recipe. Unique
heads reuse an existing complete cached profile when available and otherwise scan
candidate live rows until a usable profile is captured. Existing catalog data is
merged, so future refreshes expand the cache rather than deleting heads from older
seasons.

To add HeadstartRecipe names discovered/exported from Frosty:

```powershell
npm run head:catalog -- --recipe-root "C:\path\to\exported\heads"
```

or from a small text/JSON list of asset paths:

```powershell
npm run head:catalog -- --recipe-list "C:\path\to\head_asset_paths.txt"
```

Sources can be combined and repeated. Existing catalog data is merged unless
`--replace` is supplied.

For an expensive duplicate-state audit:

```powershell
npm run head:catalog -- --save "C:\path\to\DYNASTY-SAVE" --deep-verify
```

## Portrait index

Field Index does not require the multi-GB portrait export to be committed.
Instead, generate a lightweight local mapping:

```powershell
npm run portrait:index -- "C:\path\to\exported\player_portraits"
```

Default output:

```text
assets/mappings/player_portrait_index.json
```

Then enrich/refresh the Head ID catalog while reading a save:

```powershell
npm run head:catalog -- \
  --save "C:\path\to\DYNASTY-SAVE" \
  --portrait-index "..\assets\mappings\player_portrait_index.json"
```

Ambiguous portrait filenames are recorded but not auto-selected.

## Safety behavior

The production Head ID service intentionally fails closed:

- unknown Head ID -> rejected
- incomplete **unique** profile -> rejected
- numeric ID collision -> requires `unique:<id>` or `generic:<id>`
- missing portrait -> rejected by default
- same current Head ID -> no-op unless `force` is requested
- unsupported/unknown current head format -> returned as unknown instead of guessed

`allowMissingPortrait` exists only for deliberate recovery/testing and preserves
the current portrait rather than writing an invented value.

## Regression tests

From `parser/`:

```powershell
npm test
```

Tests cover:

- unique Head ID detection
- generic Head ID detection
- unknown existing heads
- duplicate/colliding IDs
- incomplete profiles
- missing portraits
- catalog deduplication
- generic -> unique Head-layer mutation
- unique -> generic Head-layer mutation
- preservation of Base and PlayerOnField loadouts
- deterministic hydration of generic recipe profiles
- creation of a minimal Head loadout when a valid player CharacterVisuals payload
  contains only GearOnly/PlayerOnField data

A final CFB27 in-game regression matrix is still required after the populated
catalog is generated:

- generic -> unique
- unique -> generic
- generic -> generic
- unique -> unique
- multiple Head ID edits in one save
- invalid ID
- missing portrait
- unknown existing head

## CFB27 bundled master baseline

Field Index now ships a populated CFB27 Head ID baseline built from a fresh default-
roster Dynasty plus additional observed generic HeadstartRecipe IDs. The current
baseline contains:

```text
13,481 total writable Head IDs
9,011 unique Head IDs
4,470 generic Head IDs
13,481 profiles complete
0 missing portraits
0 incomplete profiles
```

The default-roster Dynasty is especially important for unique heads because it
contains players who later graduate, transfer, or leave a long-running Dynasty.
The catalog is cumulative: opening later saves can add newly generated generic
heads or future newly observed identities without removing the bundled baseline.

Unique-profile harvesting uses a bulk CharacterVisuals decoder. The CFB27 zstd
dictionary is loaded once per batch instead of launching one Python process per
Head ID, so a full default-roster baseline can be prepared in practical time.
Normal app startup should load the existing catalog and only process genuinely
new/incomplete identities; it should not rebuild the master catalog.

## Memory-isolated in-game Head verification

The Head ID regression harness runs each edited save in its own process and runs
round-trip verification in a separate process. This avoids keeping multiple full
Dynasty objects in the Node heap while still exercising the production editor and
safe writer.

```powershell
npm run ingame:heads -- "C:\path\to\DYNASTY-SAVE"
```

The harness generates and verifies the five required cases independently:

```text
G2U     generic -> unique
U2G     unique -> generic
G2G     generic -> generic
U2U     unique -> unique
HMULTI  two cross-type Head edits in one save
```
