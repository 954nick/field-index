// -------------------- BACKEND SERVICE TESTS --------------------
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AssetService } from "../backend/services/asset_service.js";
import { AnalyticsService } from "../backend/services/analytics_service.js";
import { PlayerService } from "../backend/services/player_service.js";
import { RecruitingService } from "../backend/services/recruiting_service.js";
import { CoachService } from "../backend/services/coach_service.js";
import { TeamService } from "../backend/services/team_service.js";
import { buildHeadCatalog, captureHeadProfileFromRecords } from "../parser/build_head_catalog.js";
import { writePortraitIndex } from "../parser/build_portrait_index.js";
import {
    generateSafeSaveFilename,
    isSafeCfb27SaveFilename,
    MAX_CFB27_SAVE_FILENAME_LENGTH
} from "../backend/lib/save_names.js";

test("safe CFB27 output names stay short and sanitized", () => {
    const name = generateSafeSaveFilename({ purpose: "Head Swap Debug Long Name", token: "a1b2c3" });
    assert.equal(isSafeCfb27SaveFilename(name), true);
    assert.ok(name.length <= MAX_CFB27_SAVE_FILENAME_LENGTH);
    assert.match(name, /^DYNASTY-FI-/);
});

test("unsafe long dynasty output names are rejected", () => {
    assert.equal(isSafeCfb27SaveFilename("DYNASTY-GATORSDYNASTY-SAFE-HEADSWAP-TOO-LONG"), false);
    assert.equal(isSafeCfb27SaveFilename("not a dynasty save"), false);
});

test("asset service resolves lightweight team mappings without requiring raw assets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-assets-"));
    const mappingDir = path.join(root, "assets", "mappings");
    fs.mkdirSync(mappingDir, { recursive: true });
    const manifestPath = path.join(mappingDir, "asset_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
        format: "field_index_asset_manifest",
        version: 1,
        counts: { team_icon: 1 },
        assets: [
            { type: "team_icon", field_index_path: "teams/icons/florida.webp" }
        ]
    }));

    const service = new AssetService({ projectDirectory: root, manifestPath });
    const assets = service.getTeamAssets({ teamName: "Florida", schoolName: "Florida" });
    assert.equal(assets.icon.field_index_path, "teams/icons/florida.webp");
    assert.equal(assets.icon.exists, false);
});

test("player and team services filter and enrich current-save data", () => {
    const data = {
        players: [
            { playerRow: 1, displayName: "Aaron Alpha", position: "QB", teamIndex: 10, teamName: "Florida", overallRating: 90 },
            { playerRow: 2, displayName: "Bobby Beta", position: "HB", teamIndex: 20, teamName: "Georgia", overallRating: 85 }
        ],
        teams: [
            { teamIndex: 10, teamName: "Florida" },
            { teamIndex: 20, teamName: "Georgia" }
        ],
        conferences: [
            { name: "SEC", conferenceEnum: "SEC", assetName: "sec", teams: [{ teamIndex: 10 }, { teamIndex: 20 }] }
        ],
        schedule: [],
        depthCharts: [],
        coaching: [],
        recruiting: { boards: [], signingClassesByTeam: {} },
        transfers: { portal: { incomingByTeam: {}, outgoingByTeam: {} } }
    };

    const players = new PlayerService(data).list({ teamIndex: 10 });
    assert.equal(players.total, 1);
    assert.equal(players.items[0].displayName, "Aaron Alpha");

    const florida = new TeamService(data).require(10);
    assert.equal(florida.conference.name, "SEC");
});

test("analytics service calculates team KPIs from completed games only", () => {
    const data = {
        metadata: { currentSeasonIndex: 2 },
        teams: [{ teamIndex: 10, teamName: "Florida", overallRating: 92, offensiveRating: 94, defensiveRating: 90, teamRank: 1 }],
        schedule: [
            { seasonIndex: 2, gameStatus: "HomeWon", homeTeamIndex: 10, awayTeamIndex: 20, homeScore: 35, awayScore: 14 },
            { seasonIndex: 2, gameStatus: "AwayWon", homeTeamIndex: 30, awayTeamIndex: 10, homeScore: 28, awayScore: 31 },
            { seasonIndex: 2, gameStatus: "Unplayed", homeTeamIndex: 10, awayTeamIndex: 40, homeScore: null, awayScore: null }
        ],
        players: []
    };
    const kpis = new AnalyticsService(data).getTeamKpis(10);
    assert.equal(kpis.gamesPlayed, 2);
    assert.equal(kpis.wins, 2);
    assert.equal(kpis.pointsFor, 66);
    assert.equal(kpis.pointsAgainst, 42);
    assert.equal(kpis.averageMargin, 12);
});


test("coach service exposes named talent trees and owned abilities", () => {
    const data = {
        coaches: [{
            coachRow: 7,
            displayName: "Coach Example",
            position: "HeadCoach",
            teamIndex: 10,
            teamName: "Florida",
            level: 25,
            coachPoints: 40,
            experiencePoints: 1200,
            dominantArchetype: "MasterMotivator",
            talentTree: {
                catalogAvailable: true,
                archetypeContext: {
                    sourceField: "Coach.DominantArchetype",
                    raw: "MasterMotivator",
                    resolved: true,
                    treeIndex: 3,
                    internalName: "MasterMotivator",
                    displayName: "Master Motivator"
                },
                trees: [{
                    treeIndex: 2,
                    treeName: "Recruiter",
                    displayName: "Recruiter",
                    available: true,
                    unlocked: true,
                    talents: [{
                        talentIndex: 0,
                        field: "TalentStatus0",
                        status: "Owned",
                        definition: { name: "Always Be Crootin'", staffPointCost: 5, branch: { title: "Quarterbacks" }, talent: { positionGroup: "QB" } }
                    }]
                }]
            }
        }],
        coaching: [],
        coachTalentCatalog: { available: true, trees: [{ treeIndex: 2, available: true, talentCount: 1 }], treeCount: 1, talentCount: 1 }
    };
    const service = new CoachService(data);
    assert.equal(service.getTalentCatalog().available, true);
    assert.equal(service.getOwnedAbilities(7)[0].name, "Always Be Crootin'");
    assert.equal(service.getSummary(7).ownedAbilityCount, 1);
    assert.equal(service.getSummary(7).dominantArchetypeDisplayName, "Master Motivator");
    assert.equal(service.getArchetypeContext(7).treeIndex, 3);
});


test("recruiting service exposes EA class rankings with class composition metrics", () => {
    const data = {
        teams: [
            { teamIndex: 10, teamName: "Florida", recruitingClassRank: 1, recruitingClassConferenceRank: 1, recruitProgramPointsSpent: 250, lastWeekCommittedRecruits: 2 },
            { teamIndex: 20, teamName: "Georgia", recruitingClassRank: 2, recruitingClassConferenceRank: 2, recruitProgramPointsSpent: 210, lastWeekCommittedRecruits: 1 }
        ],
        recruiting: {
            recruits: [],
            boards: [],
            signingClassesByTeam: {
                "10": [
                    { isHighSchool: true, isTransfer: false, isJuniorCollege: false, player: { prospectStarRating: 5, overallRating: 82 } },
                    { isHighSchool: true, isTransfer: false, isJuniorCollege: false, player: { prospectStarRating: 4, overallRating: 78 } },
                    { isHighSchool: false, isTransfer: true, isJuniorCollege: false, player: { prospectStarRating: 4, overallRating: 84 } }
                ],
                "20": []
            }
        },
        transfers: { portal: {} }
    };
    const service = new RecruitingService(data);
    const rankings = service.getClassRankings();
    assert.equal(rankings[0].teamName, "Florida");
    assert.equal(rankings[0].rank, 1);
    assert.equal(rankings[0].classSize, 3);
    assert.equal(rankings[0].fiveStar, 1);
    assert.equal(rankings[0].fourStar, 2);
    assert.equal(rankings[0].transferCount, 1);
    assert.equal(service.getTeamClassSummary(10).conferenceRank, 1);
});

test("asset service exposes coach, award and postseason mappings through domain helpers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-domain-assets-"));
    const mappingDir = path.join(root, "assets", "mappings");
    fs.mkdirSync(mappingDir, { recursive: true });
    const manifestPath = path.join(mappingDir, "asset_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
        format: "field_index_asset_manifest",
        version: 1,
        assets: [
            { type: "coach_portrait", field_index_path: "coaches/portraits/generic_0001_c_t0000_d_3_4.webp" },
            { type: "coach_polo", field_index_path: "coaches/polos/florida.webp" },
            { type: "award_trophy", field_index_path: "awards/trophies/heisman.webp" },
            { type: "bowl_branding", field_index_path: "postseason/bowls/branding/orange_bowl.webp" },
            { type: "bowl_trophy", field_index_path: "postseason/bowls/trophies/orange_bowl.webp" },
            { type: "conference_championship_branding", field_index_path: "postseason/conference_championships/branding/sec_championship.webp" },
            { type: "playoff_branding", field_index_path: "postseason/playoffs/national_championship.webp" }
        ]
    }));

    const service = new AssetService({ projectDirectory: root, manifestPath });
    const coach = service.getCoachAssets({
        teamName: "Florida",
        appearance: { GenericHeadAssetName: "Generic_0001_C_T0000_D_3_4" }
    });
    assert.equal(coach.portrait.field_index_path, "coaches/portraits/generic_0001_c_t0000_d_3_4.webp");
    assert.equal(coach.polo.field_index_path, "coaches/polos/florida.webp");
    assert.equal(service.getAwardAssets("Heisman").trophy.type, "award_trophy");
    assert.equal(service.getBowlAssets("Orange Bowl").branding.type, "bowl_branding");
    assert.equal(service.getConferenceChampionshipAssets("SEC").branding.type, "conference_championship_branding");
    assert.equal(service.getPlayoffAsset("championship").type, "playoff_branding");
});


test("portrait indexer creates a lightweight local portrait mapping", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-portraits-"));
    fs.writeFileSync(path.join(root, "nilpp24089.dds"), "fixture");
    fs.writeFileSync(path.join(root, "portrait_4757.png"), "fixture");
    fs.writeFileSync(path.join(root, "README.txt"), "ignored");
    const output = path.join(root, "out", "index.json");
    const result = writePortraitIndex(root, output);
    assert.equal(result.index.counts.mapped_ids, 2);
    assert.equal(result.index.counts.unmatched_files, 0);
    assert.equal(result.index.portraits.find(entry => entry.portrait_id === 24089).asset_path, "nilpp24089.dds");
    assert.equal(fs.existsSync(output), true);
});

test("head catalog builder indexes generic and unique Frosty recipe names without requiring raw assets in Git", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-head-recipes-"));
    const list = path.join(root, "recipes.txt");
    const output = path.join(root, "head_catalog.json");
    fs.writeFileSync(list, [
        "content/characters/hs/hs_playerrecipe/unique/Unique_HendersonKeisean_201504",
        "content/characters/hs/hs_playerrecipe/generic/Generic_4757_P_T0225_D_8_3"
    ].join("\n"));
    const result = await buildHeadCatalog({ recipeLists: [list], output, replace: true });
    assert.equal(result.catalog.counts.total, 2);
    assert.equal(result.catalog.heads.some(entry => entry.canonical_key === "unique:201504"), true);
    assert.equal(result.catalog.heads.some(entry => entry.canonical_key === "generic:4757"), true);
    assert.equal(result.catalog.counts.usable, 1);
    const generic = result.catalog.heads.find(entry => entry.canonical_key === "generic:4757");
    assert.equal(generic.profile_complete, true);
    assert.equal(generic.portrait_id, 4757);
    assert.equal(generic.skin_tone, 8);
});


test("head profile capture skips players without CharacterVisuals and uses a valid duplicate", async () => {
    const missing = {
        index: 10, FirstName: "Perry", LastName: "Rudolph",
        getReferenceDataByKey: () => null
    };
    const valid = {
        index: 11, FirstName: "Valid", LastName: "Player",
        getReferenceDataByKey: () => ({ tableId: 77, rowNumber: 2 })
    };
    const result = await captureHeadProfileFromRecords({}, [missing, valid], {
        profileLoader: async (_franchise, record) => ({ sourcePlayerRow: record.index, canonicalKey: "generic:4757" })
    });
    assert.equal(result.profile.sourcePlayerRow, 11);
    assert.equal(result.representative, valid);
    assert.equal(result.missingReferenceRows, 1);
    assert.equal(result.unusableVisualRows, 0);
});

test("head profile capture records an unusable visual row instead of aborting the catalog", async () => {
    const noHead = {
        index: 12, FirstName: "No", LastName: "HeadLoadout",
        getReferenceDataByKey: () => ({ tableId: 77, rowNumber: 3 })
    };
    const result = await captureHeadProfileFromRecords({}, [noHead], {
        profileLoader: async () => { throw new Error("No HeadLoadout has no CharacterVisuals Head loadout"); }
    });
    assert.equal(result.profile, null);
    assert.equal(result.missingReferenceRows, 0);
    assert.equal(result.unusableVisualRows, 1);
});

test("head profile capture still hard-fails codec/runtime errors", async () => {
    const validRef = {
        index: 13, FirstName: "Codec", LastName: "Failure",
        getReferenceDataByKey: () => ({ tableId: 77, rowNumber: 4 })
    };
    await assert.rejects(
        captureHeadProfileFromRecords({}, [validRef], {
            profileLoader: async () => { throw new Error("CharacterVisuals codec failed: missing zstandard"); }
        }),
        /codec failed/i
    );
});
