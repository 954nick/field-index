// -------------------- FIELD INDEX BACKEND CONTRACT --------------------

export const BACKEND_CONTRACT_VERSION = 2;

export const BACKEND_DOMAINS = Object.freeze({
    dynasty: {
        status: "implemented",
        read: ["loadDynasty", "importDynasty"],
        session: ["getMetadata", "getAvailability", "getEditingCapabilities", "getDynastyHistory"]
    },
    players: {
        status: "implemented",
        session: [
            "getPlayers", "getPlayer", "getPlayerSeasonStats", "getPlayerCareerStats", "getPlayerRedshirtConsistency",
            "getPlayerHeadId", "getPlayerHeadProfile", "listHeadIds", "getHeadById",
            "getPlayerLeaders", "getPlayerMovement"
        ],
        editor: [
            "editPlayer", "editPlayers", "editPlayerAppearance", "editPlayerAbilities",
            "setPlayerHeadId", "getPlayerEditSchema", "getPlayerAppearance", "getPlayerAbilities", "getPlayerRedshirtConsistency",
            "getPlayerHeadId", "getPlayerHeadProfile", "listHeadIds", "getHeadById"
        ]
    },
    coaches: {
        status: "implemented",
        session: [
            "getCoaches", "getCoach", "getCoachSummary", "getCoachStaff",
            "getCoachTalentCatalog", "getCoachTalentTree", "getCoachArchetypeContext", "getCoachAbilities", "getCoachOwnedAbilities",
            "getCoachPurchasableAbilities", "getCoachUnlockedTrees",
            "getCoachTalentHistory", "getCoachTalentNodeHistory"
        ],
        editor: [
            "editCoach", "editCoachAppearance", "editCoachTalentTree", "setCoachPoints",
            "setCoachExperiencePoints", "setCoachTalentTreeState", "unlockCoachTalentTree",
            "makeCoachTalentTreePurchasable", "lockCoachTalentTree", "setCoachTalentStatus",
            "unlockCoachTalent", "setCoachTalentNodeStatus", "unlockCoachTalentNode",
            "makeCoachTalentNodePurchasable", "lockCoachTalentNode", "setCoachTalentTreePointsSpent",
            "getCoachTalentCatalog", "getCoachTalentTree", "getCoachEditSchema", "getCoachAppearance"
        ]
    },
    depthChart: {
        status: "implemented",
        session: ["getDepthChart", "getDepthChartPosition"],
        editor: ["updateDepthChart", "moveDepthChartPlayer", "getDepthChart"]
    },
    teams: {
        status: "implemented",
        session: ["getTeams", "getTeam", "getTeamSchedule", "getTeamRecruiting", "getTeamKpis"],
        editor: ["editTeamGrades"]
    },
    games: {
        status: "implemented",
        session: ["getSchedule", "getGame", "getBoxScore", "getHistoricalGames"]
    },
    recruiting: {
        status: "implemented",
        session: [
            "getRecruiting", "getRecruitingBoard", "getSigningClass", "getRecruitingClassRankings",
            "getRecruitingClassSummary", "getTransferPortal", "getRecruitingHistory",
            "getRecruitingClasses", "getRecruitingClassRankingHistory"
        ]
    },
    transfersAndHistory: {
        status: "implemented",
        session: [
            "getTransfers", "getCurrentTeamHistory", "getHistoricalPlayerCareer",
            "getHistoricalCoachCareer", "getHistoricalCoachHistory", "getHistoricalTeamHistory",
            "getHistoricalTransfers", "getDepthChartHistory"
        ]
    },
    rankingsAndPostseason: {
        status: "implemented",
        session: [
            "getRankings", "getCfp", "getPostseason", "getAwards", "getRankingHistory",
            "getPostseasonHistory", "getPostseasonGames", "getChampionshipHistory", "getAwardHistory"
        ],
        editor: [
            "editPollTop25", "editCfpGameParticipants",
            "editCfpFirstRoundSeedAssignments", "swapCfpFirstRoundTeams"
        ]
    },
    assets: {
        status: "implemented",
        session: [
            "getAssetSummary", "getAssetTypes", "findAsset", "getTeamAssets", "getCoachAssets",
            "getAwardAssets", "getBowlAssets", "getConferenceChampionshipAssets", "getPlayoffAsset"
        ]
    },
    mappings: {
        status: "implemented",
        session: [
            "getHeadCatalogSummary", "getPortraitIndexSummary", "buildPortraitIndex",
            "buildHeadCatalog", "prepareMappings"
        ]
    },
    persistence: {
        status: "implemented",
        session: [
            "listDynasties", "getDynastySummary", "getDynastyHistory", "getRecentImports",
            "getPlayerCareer", "getCoachHistory", "getCoachCareer", "getTeamHistory",
            "getTransferHistory", "getStoredGames"
        ]
    },
    saveSafety: {
        status: "implemented",
        editor: ["undoLast", "reset", "getPendingChanges", "getPendingWarnings", "getCapabilities", "saveDynasty", "commit"]
    }
});

export const PRODUCT_EXCLUSIONS = Object.freeze([
    "equipment editor (CFB27 already provides equipment editing; Field Index intentionally preserves equipment)",
    "mutating completed CFP game participants (blocked by editing safety rules)",
    "arbitrary CFP team injection/removal (not game-verified; production editor only permutes existing first-round participants)"
]);

export const INTENTIONALLY_OUT_OF_SCOPE = Object.freeze([
    "final desktop UI",
    "Power BI report/dashboard construction",
    "CFB27 in-game verification"
]);

export const POST_UI_RELEASE_WORK = Object.freeze([
    "final self-contained Windows installer/runtime bundle after UI integration"
]);
