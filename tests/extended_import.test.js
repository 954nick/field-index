// -------------------- EXTENDED IMPORT TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { prepareExtendedHistory } from "../database/lib/prepare_extended.js";
import { buildExtendedImportSql } from "../database/lib/build_extended_import_sql.js";

function fixture() {
    const players = [{
        identityKey: "presentation:100",
        playerRow: 7,
        firstName: "Test",
        lastName: "Player",
        displayName: "Test Player",
        position: "QB",
        teamIndex: 10,
        hometown: "Gainesville",
        homeState: "FL",
        heightInches: 74,
        identity: { presentationId: 100, birthDateRaw: 123 }
    }];
    const coaches = [{
        identityKey: "coach-row:2", coachRow: 2,
        talentTree: { trees: [{
            treeIndex: 2, treeName: "Recruiter", internalName: "Recruiter", displayName: "Recruiter",
            description: "Recruiting tree", available: true, state: "Unlocked", rootStatus: "Owned",
            coachPointsSpent: 5, ownedCount: 2, purchasableCount: 1, notOwnedCount: 1, lockedCount: 0,
            talents: [{ talentIndex: 1, status: "Owned", definition: {
                name: "Strong Start", description: "Test ability", staffPointCost: 3, isArchetypeNode: false,
                progressLabel: "1/1", branch: { title: "QB Recruiting", subtitle: "Quarterbacks" },
                talent: { positionGroup: "QB", effect: "Test Effect", duration: "Permanent" },
                prerequisite: { MinCoachLevel: 1 }
            }}]
        }] }
    }];
    const data = {
        metadata: { currentSeasonIndex: 2, currentSeasonYear: 2028 },
        rankings: {
            mediaPoll: [{ rank: 1, lastWeekRank: 2, pointsRaw: 1000, firstPlaceVotes: 50, teamIndex: 10, teamName: "Florida" }],
            coachesPoll: [],
            cfpPoll: []
        },
        recruiting: {
            recruits: [{
                recruitRow: 3,
                player: {
                    playerRow: 7,
                    firstName: "Test",
                    lastName: "Player",
                    displayName: "Test Player",
                    position: "QB",
                    teamIndex: 10,
                    hometown: "Gainesville",
                    homeState: "FL",
                    heightInches: 74,
                    weight: 220,
                    overallRating: 80,
                    prospectStarRating: 5
                },
                recruitStage: "Committed",
                recruitClass: "HighSchool",
                isSigned: true,
                isTransfer: false,
                isHighSchool: true,
                isJuniorCollege: false,
                signedTeamIndex: 10,
                signedTeamName: "Florida",
                destinationResolved: true,
                destinationResolution: "signed_team_index",
                destinationCandidates: [],
                nationalRank: 1,
                positionRank: 1,
                stateRank: 1,
                topSchools: []
            }],
            boards: [{
                teamIndex: 10,
                teamName: "Florida",
                recruitingHoursProcessed: 10,
                recruitingHoursTotal: 100,
                recruitingHoursAssigned: 20,
                targets: [{ recruitRow: 3, targetRow: 4, targetType: "Recruit", scholarshipStatus: "Offered", isFavorite: true }]
            }]
        },
        depthCharts: [{
            teamIndex: 10,
            teamName: "Florida",
            positions: { QB: [{ depth: 1, playerRow: 7, displayName: "Test Player", position: "QB", jerseyNumber: 1, overallRating: 80 }] }
        }],
        postseason: { cfpComplete: false, cfpRounds: {} },
        cfp: { isComplete: false, rounds: {} },
        awards: {
            currentSeasonPlayerAwards: [{ awardType: "HEISMAN", awardRow: 1, player: players[0], teamIndex: 10, teamName: "Florida" }],
            currentSeasonCoachAwards: []
        }
    };
    return { data, players, coaches };
}

test("extended history prepares rankings, recruiting, depth chart and identity evidence", () => {
    const { data, players, coaches } = fixture();
    const history = prepareExtendedHistory(data, players, coaches);
    assert.equal(history.rankings.length, 1);
    assert.equal(history.recruiting.prospects.length, 1);
    assert.equal(history.recruiting.prospects[0].classSeasonYear, 2029);
    assert.equal(history.recruiting.prospects[0].matchedPlayerIdentityKey, "presentation:100");
    assert.equal(history.recruiting.interests.length, 1);
    assert.equal(history.depthCharts.length, 1);
    assert.equal(history.identityObservations.length, 1);
    assert.match(history.identityObservations[0].rosterFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(history.coachTalents.trees.length, 1);
    assert.equal(history.coachTalents.nodes.length, 1);
    assert.equal(history.coachTalents.nodes[0].abilityName, "Strong Start");
    assert.equal(history.coachTalents.nodes[0].staffPointCost, 3);
});

test("extended import SQL covers every new persistent history area", () => {
    const { data, players, coaches } = fixture();
    const extendedHistory = prepareExtendedHistory(data, players, coaches);
    const model = {
        dynastyKey: "test-dynasty",
        source: { fileHash: "abc123" },
        metadata: { currentSeasonIndex: 2 },
        extendedHistory
    };
    const sql = buildExtendedImportSql(model);
    for (const table of [
        "player_identity_observations",
        "ranking_snapshots",
        "recruiting_prospects",
        "recruiting_prospect_snapshots",
        "recruiting_board_snapshots",
        "recruiting_team_interest_snapshots",
        "depth_chart_snapshots",
        "postseason_import_snapshots",
        "award_snapshots",
        "coach_talent_tree_snapshots",
        "coach_talent_node_snapshots"
    ]) {
        assert.match(sql, new RegExp(table));
    }
    assert.doesNotMatch(sql, /\bundefined\b/);
});


test("coach talent node SQL types an all-null archetype flag as boolean", () => {
    const { data, players, coaches } = fixture();
    coaches[0].talentTree.trees[0].talents[0].definition.isArchetypeNode = null;
    const extendedHistory = prepareExtendedHistory(data, players, coaches);
    const model = {
        dynastyKey: "test-dynasty",
        source: { fileHash: "abc123" },
        metadata: { currentSeasonIndex: 2 },
        extendedHistory
    };
    const sql = buildExtendedImportSql(model);
    assert.match(sql, /NULL::boolean/);
    assert.doesNotMatch(sql, /staff_point_cost,\s*is_archetype_node[\s\S]*?\bNULL\b(?!::boolean)/);
});
