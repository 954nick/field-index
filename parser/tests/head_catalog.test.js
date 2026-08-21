// -------------------- HEAD ID CATALOG TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import {
    HeadCatalog,
    canonicalHeadKey,
    createEmptyHeadCatalog,
    detectHeadIdentity,
    inferGenericHeadProfile,
    normalizeHeadCatalog
} from "../head_catalog.js";

function completeEntry(overrides = {}) {
    return {
        head_id: 201504,
        canonical_key: "unique:201504",
        head_type: "unique",
        asset_name: "HendersonKeisean_201504",
        generic_head_asset_name: "Unique_HendersonKeisean_201504",
        portrait_id: 24089,
        skin_tone: 5,
        head_layer: { plus_head_elements: [] },
        profile_complete: true,
        source_display_names: ["Keisean Henderson"],
        source_player_rows: [1],
        recipe_asset_path: null,
        portrait_asset_path: "nilpp24089.dds",
        notes: [],
        ...overrides
    };
}

test("detects unique Head IDs", () => {
    const identity = detectHeadIdentity({
        PLYR_ASSETNAME: "HendersonKeisean_201504",
        GenericHeadAssetName: "Unique_HendersonKeisean_201504"
    });
    assert.equal(identity.headId, 201504);
    assert.equal(identity.headType, "unique");
    assert.equal(identity.canonicalKey, "unique:201504");
});

test("detects generic Head IDs", () => {
    const identity = detectHeadIdentity({
        GenericHeadAssetName: "Generic_4757_P_T0225_D_8_3"
    });
    assert.equal(identity.headId, 4757);
    assert.equal(identity.headType, "generic");
    assert.equal(identity.canonicalKey, "generic:4757");
});

test("unknown existing heads are explicit instead of guessed", () => {
    const identity = detectHeadIdentity({ GenericHeadAssetName: "UnexpectedHeadFormat" });
    assert.equal(identity.headId, null);
    assert.equal(identity.headType, "unknown");
    assert.equal(identity.canonicalKey, null);
});

test("catalog resolves numeric and canonical Head IDs", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(completeEntry());
    const catalog = new HeadCatalog(raw);
    assert.equal(catalog.resolve(201504).canonical_key, "unique:201504");
    assert.equal(catalog.resolve("unique:201504").head_id, 201504);
    assert.equal(catalog.profileFor(201504).portrait, 24089);
});

test("numeric collisions require an explicit canonical key", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(
        completeEntry(),
        completeEntry({
            head_type: "generic",
            canonical_key: "generic:201504",
            asset_name: "GenericAsset",
            generic_head_asset_name: "Generic_201504_P_T0001_D_1_1",
            portrait_id: 201504,
            head_layer: {
                plus_head_elements: [{ slotType: "PlusHead", itemAssetName: "Generic_201504_item" }]
            }
        })
    );
    const catalog = new HeadCatalog(raw);
    assert.throws(() => catalog.resolve(201504), /ambiguous/i);
    assert.equal(catalog.resolve("generic:201504").head_type, "generic");
});

test("generic profiles are hydrated deterministically from the HeadstartRecipe name", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(completeEntry({
        head_id: 4757,
        canonical_key: "generic:4757",
        head_type: "generic",
        asset_name: "SomePlayerSpecificAsset",
        generic_head_asset_name: "Generic_4757_P_T0225_D_8_3",
        portrait_id: null,
        skin_tone: null,
        head_layer: { plus_head_elements: [] },
        profile_complete: false
    }));
    const catalog = new HeadCatalog(raw);
    const entry = catalog.resolve("generic:4757");
    const profile = catalog.profileFor("generic:4757");
    assert.equal(entry.profile_complete, true);
    assert.equal(entry.asset_name, "");
    assert.equal(profile.portrait, 4757);
    assert.equal(profile.skinTone, 8);
    assert.equal(profile.plusHeadElements[0].itemAssetName, "Generic_4757_P_T0225_D_8_3_item");
});

test("incomplete unique profiles remain blocked until skin tone is captured", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(completeEntry({ skin_tone: null, profile_complete: false }));
    const catalog = new HeadCatalog(raw);
    assert.equal(catalog.resolve(201504).profile_complete, false);
    assert.throws(() => catalog.profileFor(201504), /complete in-game head profile/i);
});

test("generic HeadstartRecipe inference uses numeric Head ID for portrait and penultimate token for skin tone", () => {
    const inferred = inferGenericHeadProfile("Generic_0169_P_T0008_D_8_1");
    assert.equal(inferred.headId, 169);
    assert.equal(inferred.portraitId, 169);
    assert.equal(inferred.skinTone, 8);
    assert.equal(inferred.plusHeadElements.length, 1);
});

test("missing portraits fail safely by default", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(completeEntry({ portrait_id: null }));
    const catalog = new HeadCatalog(raw);
    assert.throws(() => catalog.profileFor(201504), /no mapped portrait ID/i);
    assert.equal(catalog.profileFor(201504, { allowMissingPortrait: true }).portrait, null);
});

test("duplicate canonical entries merge identical profiles and source metadata", () => {
    const raw = createEmptyHeadCatalog();
    raw.heads.push(
        completeEntry(),
        completeEntry({ source_display_names: ["Another Source"], source_player_rows: [9] })
    );
    const normalized = normalizeHeadCatalog(raw);
    assert.equal(normalized.heads.length, 1);
    assert.deepEqual(normalized.heads[0].source_display_names, ["Another Source", "Keisean Henderson"]);
});

test("canonical key helper normalizes type and numeric ID", () => {
    assert.equal(canonicalHeadKey("UNIQUE", "201504"), "unique:201504");
});
