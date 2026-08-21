// -------------------- REDSHIRT CONSISTENCY WARNING TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { PlayerService } from "../backend/services/player_service.js";
import {
    REDSHIRT_GAME_LIMIT,
    REDSHIRT_WARNING_CODE,
    evaluateRedshirtConsistency,
    getCurrentSeasonGamesPlayed
} from "../parser/redshirt_consistency.js";

test("Ineligible with four or fewer games produces a non-blocking warning", () => {
    for (const gamesPlayed of [0, 1, 2, 4]) {
        const result = evaluateRedshirtConsistency({
            redshirtStatus: "Ineligible",
            gamesPlayed
        });
        assert.equal(result.isConsistent, false);
        assert.equal(result.warning?.code, REDSHIRT_WARNING_CODE);
        assert.equal(result.warning?.blocksEdit, false);
        assert.equal(result.warning?.gamesPlayed, gamesPlayed);
        assert.equal(result.gameLimit, REDSHIRT_GAME_LIMIT);
    }
});

test("Ineligible after more than four games is considered consistent", () => {
    const result = evaluateRedshirtConsistency({
        redshirtStatus: "Ineligible",
        gamesPlayed: 5
    });
    assert.equal(result.isConsistent, true);
    assert.equal(result.warning, null);
});

test("Eligible and Previous statuses never trigger the Ineligible warning", () => {
    for (const redshirtStatus of ["Eligible", "Previous"]) {
        const result = evaluateRedshirtConsistency({ redshirtStatus, gamesPlayed: 0 });
        assert.equal(result.isConsistent, true);
        assert.equal(result.warning, null);
    }
});

test("current-season games played uses the maximum duplicated season-stat value instead of summing categories", () => {
    const gamesPlayed = getCurrentSeasonGamesPlayed([
        { seasonYear: 1, stats: { GAMESPLAYED: 12 } },
        { seasonYear: 2, stats: { GAMESPLAYED: 2 } },
        { seasonYear: 2, stats: { GAMESPLAYED: 2 } },
        { seasonYear: 2, gamesPlayed: 1 }
    ], 2);
    assert.equal(gamesPlayed, 2);
});

test("player service exposes and filters redshirt consistency warnings", () => {
    const warning = evaluateRedshirtConsistency({ redshirtStatus: "Ineligible", gamesPlayed: 2 });
    const data = {
        players: [
            {
                playerRow: 1,
                displayName: "David Johnson",
                teamIndex: 10,
                teamName: "Florida",
                redshirtStatus: "Ineligible",
                currentSeasonGamesPlayed: 2,
                redshirtConsistency: warning
            },
            {
                playerRow: 2,
                displayName: "Five Game Player",
                teamIndex: 10,
                teamName: "Florida",
                redshirtStatus: "Ineligible",
                currentSeasonGamesPlayed: 5,
                redshirtConsistency: evaluateRedshirtConsistency({ redshirtStatus: "Ineligible", gamesPlayed: 5 })
            }
        ]
    };
    const service = new PlayerService(data);
    assert.equal(service.getRedshirtConsistency(1).warning.code, REDSHIRT_WARNING_CODE);
    const filtered = service.list({ redshirtWarningsOnly: true });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].displayName, "David Johnson");
});
