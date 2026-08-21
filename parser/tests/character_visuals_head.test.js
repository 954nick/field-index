// -------------------- CHARACTER VISUALS HEAD TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { applyHeadProfileToAppearanceJson } from "../character_visuals.js";

function appearanceFixture() {
    return {
        skinTone: 2,
        loadouts: [
            {
                loadoutCategory: "Head",
                loadoutElements: [
                    { slotType: "PlusHead", itemAssetName: "Generic_4757_P_T0225_D_8_3_item" },
                    { slotType: "Hair", itemAssetName: "hair_state" }
                ]
            },
            {
                loadoutCategory: "Base",
                loadoutElements: [{ slotType: "Tattoo", itemAssetName: "tattoo_state" }]
            },
            {
                loadoutCategory: "PlayerOnField",
                loadoutElements: [
                    { slotType: "Helmet", itemAssetName: "gerry_helmet" },
                    { slotType: "Facemask", itemAssetName: "gerry_facemask" },
                    { slotType: "Gloves", itemAssetName: "gerry_gloves" }
                ]
            }
        ]
    };
}

test("generic to unique removes only PlusHead and preserves equipment/base loadouts", () => {
    const before = appearanceFixture();
    const baseBefore = structuredClone(before.loadouts[1]);
    const onFieldBefore = structuredClone(before.loadouts[2]);

    const result = applyHeadProfileToAppearanceJson(before, {
        skinTone: 7,
        plusHeadElements: []
    });

    assert.equal(result.plusHeadBefore, 1);
    assert.equal(result.plusHeadAfter, 0);
    assert.equal(result.appearance.skinTone, 7);
    assert.deepEqual(result.appearance.loadouts[1], baseBefore);
    assert.deepEqual(result.appearance.loadouts[2], onFieldBefore);
    assert.equal(
        result.appearance.loadouts[0].loadoutElements.some(element => element.slotType === "PlusHead"),
        false
    );
    assert.notEqual(result.appearance, before);
    assert.equal(before.skinTone, 2);
});

test("unique to generic adds cataloged PlusHead state without touching gear", () => {
    const before = appearanceFixture();
    before.loadouts[0].loadoutElements = before.loadouts[0].loadoutElements
        .filter(element => element.slotType !== "PlusHead");
    const onFieldBefore = structuredClone(before.loadouts[2]);
    const plusHead = {
        slotType: "PlusHead",
        itemAssetName: "Generic_4757_P_T0225_D_8_3_item"
    };

    const result = applyHeadProfileToAppearanceJson(before, {
        skinTone: 4,
        plusHeadElements: [plusHead]
    });

    assert.equal(result.plusHeadBefore, 0);
    assert.equal(result.plusHeadAfter, 1);
    assert.deepEqual(result.appearance.loadouts[2], onFieldBefore);
    assert.deepEqual(result.appearance.loadouts[0].loadoutElements[0], plusHead);
});

test("generic to generic replaces only PlusHead state", () => {
    const before = appearanceFixture();
    const hairBefore = structuredClone(before.loadouts[0].loadoutElements[1]);
    const onFieldBefore = structuredClone(before.loadouts[2]);
    const replacement = {
        slotType: "PlusHead",
        itemAssetName: "Generic_8123_P_T0100_D_2_1_item"
    };

    const result = applyHeadProfileToAppearanceJson(before, {
        skinTone: 6,
        plusHeadElements: [replacement]
    });

    assert.equal(result.plusHeadBefore, 1);
    assert.equal(result.plusHeadAfter, 1);
    assert.deepEqual(result.appearance.loadouts[0].loadoutElements[0], replacement);
    assert.deepEqual(result.appearance.loadouts[0].loadoutElements[1], hairBefore);
    assert.deepEqual(result.appearance.loadouts[2], onFieldBefore);
});

test("unique to unique preserves non-PlusHead head state and equipment", () => {
    const before = appearanceFixture();
    before.loadouts[0].loadoutElements = before.loadouts[0].loadoutElements
        .filter(element => element.slotType !== "PlusHead");
    const headBefore = structuredClone(before.loadouts[0]);
    const baseBefore = structuredClone(before.loadouts[1]);
    const onFieldBefore = structuredClone(before.loadouts[2]);

    const result = applyHeadProfileToAppearanceJson(before, {
        skinTone: 8,
        plusHeadElements: []
    });

    assert.equal(result.plusHeadBefore, 0);
    assert.equal(result.plusHeadAfter, 0);
    assert.deepEqual(result.appearance.loadouts[0], headBefore);
    assert.deepEqual(result.appearance.loadouts[1], baseBefore);
    assert.deepEqual(result.appearance.loadouts[2], onFieldBefore);
    assert.equal(result.appearance.skinTone, 8);
});

test("multiple sequential Head ID mutations never accumulate PlusHead elements", () => {
    const first = applyHeadProfileToAppearanceJson(appearanceFixture(), {
        skinTone: 7,
        plusHeadElements: []
    });
    const secondPlusHead = {
        slotType: "PlusHead",
        itemAssetName: "Generic_9001_P_T0001_D_1_1_item"
    };
    const second = applyHeadProfileToAppearanceJson(first.appearance, {
        skinTone: 3,
        plusHeadElements: [secondPlusHead]
    });
    const thirdPlusHead = {
        slotType: "PlusHead",
        itemAssetName: "Generic_9002_P_T0001_D_1_2_item"
    };
    const third = applyHeadProfileToAppearanceJson(second.appearance, {
        skinTone: 4,
        plusHeadElements: [thirdPlusHead]
    });

    const headElements = third.appearance.loadouts[0].loadoutElements;
    assert.equal(headElements.filter(element => element.slotType === "PlusHead").length, 1);
    assert.deepEqual(headElements.find(element => element.slotType === "PlusHead"), thirdPlusHead);
    assert.equal(headElements.some(element => element.slotType === "Hair"), true);
    assert.equal(third.appearance.loadouts[2].loadoutElements[0].itemAssetName, "gerry_helmet");
});
