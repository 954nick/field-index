// -------------------- REGRESSION / LOCAL PREP TOOL TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { alternateEnum, chooseCfpFirstRoundSwap, chooseVisibleRegressionFixtures, chooseVisibleRatingEdit, findPlayer, nextInteger, parseArgs as parseRegressionArgs, planHeadMatrix, requiresPrimarySession } from "../scripts/create_ingame_regression_saves.js";
import { parseArgs as parseLocalPrepArgs } from "../scripts/prepare_local_backend_data.js";

test("regression helper picks validated alternate enum and bounded numbers", () => {
    assert.equal(alternateEnum({ enumValues: ["A", "B", "C"] }, "A"), "B");
    assert.equal(alternateEnum({ enumValues: ["None", "Bronze"] }, "None", { blocked: ["None"] }), "Bronze");
    assert.equal(nextInteger(99, { minValue: 1, maxValue: 99 }, 1), 98);
    assert.equal(nextInteger(5, { minValue: 0, maxValue: 10 }, 1), 6);
});


test("CFP regression fixture prefers the game-proven 9/10 cross-matchup swap", () => {
    const bracket = [
        { seasonGameRow: 1, bracketSlot: 0, played: false, homeSeed: 5, homeTeamIndex: 105, homeTeamName: "Seed 5", awaySeed: 12, awayTeamIndex: 112, awayTeamName: "Seed 12" },
        { seasonGameRow: 2, bracketSlot: 1, played: false, homeSeed: 6, homeTeamIndex: 106, homeTeamName: "Seed 6", awaySeed: 11, awayTeamIndex: 111, awayTeamName: "Seed 11" },
        { seasonGameRow: 3, bracketSlot: 2, played: false, homeSeed: 7, homeTeamIndex: 207, homeTeamName: "Ohio State", awaySeed: 10, awayTeamIndex: 210, awayTeamName: "Alabama" },
        { seasonGameRow: 4, bracketSlot: 3, played: false, homeSeed: 8, homeTeamIndex: 308, homeTeamName: "Nebraska", awaySeed: 9, awayTeamIndex: 309, awayTeamName: "Clemson" }
    ];
    const swap = chooseCfpFirstRoundSwap(bracket);
    assert.equal(swap.seedA, 9);
    assert.equal(swap.seedB, 10);
    assert.equal(swap.teamNameA, "Clemson");
    assert.equal(swap.teamNameB, "Alabama");
    assert.equal(swap.assignmentsAfter[9], 210);
    assert.equal(swap.assignmentsAfter[10], 309);
});

test("regression generator CLI keeps head auto-build on by default", () => {
    const parsed = parseRegressionArgs(["DYNASTY-TEST", "--output-dir", "out"]);
    assert.equal(parsed.source, "DYNASTY-TEST");
    assert.equal(parsed.autoBuildHeads, true);
    assert.equal(parsed.outputDirectory, "out");
});

test("local backend preparation accepts one save plus optional asset roots", () => {
    const parsed = parseLocalPrepArgs([
        "--save", "DYNASTY-TEST",
        "--portrait-root", "portraits",
        "--recipe-root", "unique",
        "--recipe-root", "generic",
        "--deep-verify"
    ]);
    assert.equal(parsed.save, "DYNASTY-TEST");
    assert.equal(parsed.portraitRoot, "portraits");
    assert.deepEqual(parsed.recipeRoots, ["unique", "generic"]);
    assert.equal(parsed.deepVerify, true);
});

test("regression generator supports memory-safe phase selection", () => {
    const parsed = parseRegressionArgs([
        "DYNASTY-TEST",
        "--only-labels", "PLYR,DEPTH",
        "--skip-backup-test",
        "--report-path", "phase.json"
    ]);
    assert.deepEqual([...parsed.onlyLabels], ["PLYR", "DEPTH"]);
    assert.equal(parsed.skipBackupTest, true);
    assert.equal(parsed.reportPath, "phase.json");
});


test("Head regression source player does not need its current head to be catalog-usable", () => {
    const players = [
        { playerRow: 1, displayName: "Generic Source", head: { headType: "generic", canonicalKey: "generic:111" } },
        { playerRow: 2, displayName: "Unique Source", head: { headType: "unique", canonicalKey: "unique:222" } }
    ];
    const usableHeads = [
        { canonical_key: "generic:999", head_type: "generic" },
        { canonical_key: "unique:888", head_type: "unique" }
    ];

    assert.equal(findPlayer(players, "generic").playerRow, 1);
    const plan = planHeadMatrix(players, usableHeads);
    assert.equal(plan.g2u.canonical_key, "unique:888");
    assert.equal(plan.u2g.canonical_key, "generic:999");
    assert.equal(plan.g2g.canonical_key, "generic:999");
    assert.equal(plan.u2u.canonical_key, "unique:888");
});

test("Head regression plans available cases independently instead of skipping the whole matrix", () => {
    const players = [
        { playerRow: 1, displayName: "Generic Source", head: { headType: "generic", canonicalKey: "generic:111" } }
    ];
    const usableHeads = [
        { canonical_key: "unique:888", head_type: "unique" }
    ];
    const plan = planHeadMatrix(players, usableHeads);
    assert.equal(plan.g2u.canonical_key, "unique:888");
    assert.equal(plan.u2g, null);
    assert.equal(plan.g2g, null);
    assert.equal(plan.u2u, null);
});

test("backup-only regression does not load the primary dynasty session", () => {
    assert.equal(requiresPrimarySession({ backupOnly: true }), false);
    assert.equal(requiresPrimarySession({ backupOnly: false }), true);
});

test("Head-only regression CLI accepts exact visible-player fixtures", async () => {
    const { parseArgs: parseHeadSuiteArgs } = await import("../scripts/create_head_regression_suite.js");
    const parsed = parseHeadSuiteArgs([
        "DYNASTY-TEST",
        "--generic-player", "Gerry Bailey",
        "--unique-player", "Keisean Henderson",
        "--g2g-player", "Nick Gayot",
        "--u2u-player", "Malachi Toney"
    ]);
    assert.equal(parsed.genericPlayerName, "Gerry Bailey");
    assert.equal(parsed.uniquePlayerName, "Keisean Henderson");
    assert.equal(parsed.g2gPlayerName, "Nick Gayot");
    assert.equal(parsed.u2uPlayerName, "Malachi Toney");
});


test("non-Head regression fixtures prefer visible players and the user-controlled team", () => {
    const teams = [
        { teamIndex: 1, teamName: "Air Force" },
        { teamIndex: 26, teamName: "Florida" }
    ];
    const coaches = [
        { coachRow: 1, displayName: "Other Coach", teamIndex: 1, position: "HC", isUserControlled: false },
        { coachRow: 2, displayName: "User Coach", teamIndex: 26, position: "HC", isUserControlled: true }
    ];
    const players = [
        { playerRow: 1, displayName: "Hidden Player", overallRating: 99 },
        { playerRow: 10, displayName: "Visible Gator", overallRating: 90 },
        { playerRow: 11, displayName: "Visible Gator Two", overallRating: 88 }
    ];
    const depthCharts = [
        { teamIndex: 1, positions: { QB: [{ playerRow: 99 }] } },
        { teamIndex: 26, positions: { QB: [{ playerRow: 10 }, { playerRow: 11 }] } }
    ];
    const fixtures = chooseVisibleRegressionFixtures({ teams, coaches, players, depthCharts });
    assert.equal(fixtures.team.teamName, "Florida");
    assert.equal(fixtures.coach.displayName, "User Coach");
    assert.deepEqual(fixtures.visiblePlayers.map(player => player.playerRow), [10, 11]);
});


test("player regression prefers a directly displayed SPD rating over OverallRating", () => {
    const edit = chooseVisibleRatingEdit({
        ratings: [
            { field: "OverallRating", value: 74, minValue: 0, maxValue: 127 },
            { field: "AwarenessRating", value: 60, minValue: 0, maxValue: 127 },
            { field: "SpeedRating", value: 94, minValue: 0, maxValue: 127 }
        ]
    });
    assert.deepEqual(edit, { field: "SpeedRating", before: 94, after: 95 });
});
