// -------------------- CFP FIRST-ROUND CONSISTENCY TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import {
    planCfpFirstRoundSeedAssignments,
    planCfpFirstRoundTeamSwap,
    planCfpGameParticipantPermutation,
    validateCfpFirstRoundSlots
} from "../parser/cfp_bracket.js";

function provenStyleSlots() {
    return [
        { seed: 5, teamIndex: 105, teamName: "Seed 5", seasonGameRow: 1000, bracketSlot: 0, side: "home", played: false, bowlSeedMarkers: [5, 12] },
        { seed: 12, teamIndex: 112, teamName: "Seed 12", seasonGameRow: 1000, bracketSlot: 0, side: "away", played: false, bowlSeedMarkers: [5, 12] },
        { seed: 6, teamIndex: 106, teamName: "Seed 6", seasonGameRow: 1001, bracketSlot: 1, side: "home", played: false, bowlSeedMarkers: [6, 11] },
        { seed: 11, teamIndex: 111, teamName: "Seed 11", seasonGameRow: 1001, bracketSlot: 1, side: "away", played: false, bowlSeedMarkers: [6, 11] },
        { seed: 7, teamIndex: 207, teamName: "Ohio State", seasonGameRow: 1002, bracketSlot: 2, side: "home", played: false, bowlSeedMarkers: [7, 10] },
        { seed: 10, teamIndex: 210, teamName: "Alabama", seasonGameRow: 1002, bracketSlot: 2, side: "away", played: false, bowlSeedMarkers: [7, 10] },
        { seed: 8, teamIndex: 308, teamName: "Nebraska", seasonGameRow: 1003, bracketSlot: 3, side: "home", played: false, bowlSeedMarkers: [8, 9] },
        { seed: 9, teamIndex: 309, teamName: "Clemson", seasonGameRow: 1003, bracketSlot: 3, side: "away", played: false, bowlSeedMarkers: [8, 9] }
    ];
}

test("CFP first round validates one existing team in each seed 5-12", () => {
    const validated = validateCfpFirstRoundSlots(provenStyleSlots());
    assert.equal(validated.slots.length, 8);
    assert.equal(validated.bySeed.get(9).teamName, "Clemson");
    assert.equal(validated.bySeed.get(10).teamName, "Alabama");
});

test("game-proven Clemson/Alabama-style swap moves ranks and SeasonGame slots together", () => {
    const plan = planCfpFirstRoundTeamSwap(provenStyleSlots(), 309, 210);

    assert.equal(plan.desiredAssignments[9], 210);
    assert.equal(plan.desiredAssignments[10], 309);
    assert.deepEqual(
        plan.rankChanges.sort((a, b) => a.teamIndex - b.teamIndex),
        [
            { teamIndex: 210, beforeSeed: 10, afterSeed: 9, beforeCfpRank: 10, afterCfpRank: 9 },
            { teamIndex: 309, beforeSeed: 9, afterSeed: 10, beforeCfpRank: 9, afterCfpRank: 10 }
        ]
    );
    assert.deepEqual(
        plan.participantChanges.map(change => ({
            seed: change.seed,
            game: change.seasonGameRow,
            side: change.side,
            before: change.beforeTeamIndex,
            after: change.afterTeamIndex,
            bowlSeedMarkers: change.bowlSeedMarkers
        })).sort((a, b) => a.seed - b.seed),
        [
            { seed: 9, game: 1003, side: "away", before: 309, after: 210, bowlSeedMarkers: [8, 9] },
            { seed: 10, game: 1002, side: "away", before: 210, after: 309, bowlSeedMarkers: [7, 10] }
        ]
    );
});



test("CFP playoff seed may differ from CFP poll rank for an automatic qualifier", () => {
    const slots = provenStyleSlots();
    const seed12 = slots.find(slot => slot.seed === 12);
    seed12.cfpRank = 16;

    const validated = validateCfpFirstRoundSlots(slots);
    assert.equal(validated.bySeed.get(12).seed, 12);
    assert.equal(validated.bySeed.get(12).cfpRank, 16);

    const plan = planCfpFirstRoundTeamSwap(slots, 309, 210);
    assert.equal(plan.desiredAssignments[9], 210);
    assert.equal(plan.desiredAssignments[10], 309);
    assert.equal(plan.rankChanges.find(change => change.teamIndex === 210).afterCfpRank, 9);
    assert.equal(plan.rankChanges.find(change => change.teamIndex === 309).afterCfpRank, 10);
});

test("CFP production planner blocks arbitrary team injection", () => {
    const assignments = Object.fromEntries(provenStyleSlots().map(slot => [slot.seed, slot.teamIndex]));
    assignments[9] = 9999;
    assert.throws(
        () => planCfpFirstRoundSeedAssignments(provenStyleSlots(), assignments),
        /not already in the current CFP first round/i
    );
});

test("CFP production planner blocks mutation once the first round has started", () => {
    const slots = provenStyleSlots();
    slots[0].played = true;
    assert.throws(
        () => planCfpFirstRoundTeamSwap(slots, 309, 210),
        /will not mutate completed CFP game/i
    );
});

test("legacy matchup participant API becomes a consistent permutation instead of team injection", () => {
    const plan = planCfpGameParticipantPermutation(provenStyleSlots(), 1003, {
        homeTeamIndex: 308,
        awayTeamIndex: 210
    });

    assert.equal(plan.desiredAssignments[8], 308);
    assert.equal(plan.desiredAssignments[9], 210);
    assert.equal(plan.desiredAssignments[10], 309);
    assert.equal(new Set(Object.values(plan.desiredAssignments)).size, 8);
});
