// -------------------- DATABASE IMPORT MODEL --------------------

import { buildCoachIdentityRecords, buildPlayerIdentityRecords } from "./identity.js";
import { prepareGameStorage } from "./prepare_games.js";
import { prepareExtendedHistory } from "./prepare_extended.js";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function buildConferenceByTeamIndex(conferences) {
    const conferenceByTeamIndex = new Map();

    for (const conference of conferences) {
        for (const team of conference.teams ?? []) {
            if (conferenceByTeamIndex.has(team.teamIndex)) {
                throw new Error(
                    `Team index ${team.teamIndex} appears in more than one conference`
                );
            }
            conferenceByTeamIndex.set(team.teamIndex, conference);
        }
    }

    return conferenceByTeamIndex;
}

function buildAssignedCoachByRow(coaching) {
    const assignedCoachByRow = new Map();

    for (const staff of coaching) {
        for (const coach of staff.coaches ?? []) {
            if (assignedCoachByRow.has(coach.coachRow)) {
                throw new Error(
                    `Coach row ${coach.coachRow} is assigned to more than one staff role`
                );
            }
            assignedCoachByRow.set(coach.coachRow, coach);
        }
    }

    return assignedCoachByRow;
}

function preparePregameImport(fieldIndexData, source, options, gameAccess = {}) {
    const metadata = fieldIndexData.metadata ?? {};

    assert(metadata.gameType === "college", "Database import requires a college dynasty save");
    assert(metadata.gameYear === 27, "Database import requires CFB27 data");
    assert(metadata.schema?.major === 486, "Unexpected CFB27 schema major version");
    assert(metadata.schema?.minor === 1, "Unexpected CFB27 schema minor version");
    assert(Number.isInteger(metadata.currentSeasonIndex), "Current season index is missing");
    assert(Number.isInteger(metadata.currentSeasonYear), "Current season year is missing");
    assert(Number.isInteger(metadata.rosterSeasonIndex), "Roster season index is missing");
    assert(Number.isInteger(metadata.rosterSeasonYear), "Roster season year is missing");

    assert(Array.isArray(fieldIndexData.teams) && fieldIndexData.teams.length > 0, "No teams available");
    assert(Array.isArray(fieldIndexData.conferences) && fieldIndexData.conferences.length > 0, "No conferences available");
    assert(Array.isArray(fieldIndexData.players) && fieldIndexData.players.length > 0, "No FBS players available");
    assert(Array.isArray(fieldIndexData.coaches) && fieldIndexData.coaches.length > 0, "No coaches available");

    const conferenceByTeamIndex = buildConferenceByTeamIndex(fieldIndexData.conferences);
    const missingConferenceTeams = fieldIndexData.teams.filter(
        team => !conferenceByTeamIndex.has(team.teamIndex)
    );
    assert(
        missingConferenceTeams.length === 0,
        `Conference assignment missing for ${missingConferenceTeams.length} teams`
    );

    const teamIndexSet = new Set(fieldIndexData.teams.map(team => team.teamIndex));
    const invalidPlayers = fieldIndexData.players.filter(player => !teamIndexSet.has(player.teamIndex));
    assert(invalidPlayers.length === 0, `Found ${invalidPlayers.length} players with invalid FBS team assignments`);

    const players = buildPlayerIdentityRecords(fieldIndexData.players);
    for (const player of players) {
        assert(player.attributes && typeof player.attributes === "object", `Ratings missing for ${player.displayName}`);
        assert(player.abilities && typeof player.abilities === "object", `Abilities missing for ${player.displayName}`);
    }

    const assignedCoachByRow = buildAssignedCoachByRow(fieldIndexData.coaching ?? []);
    const coaches = buildCoachIdentityRecords(fieldIndexData.coaches).map(coach => {
        const assigned = assignedCoachByRow.get(coach.coachRow) ?? null;
        return {
            ...coach,
            role: assigned?.role ?? null,
            teamIndex: assigned?.teamIndex ?? coach.teamIndex,
            teamName: assigned?.teamName ?? coach.teamName,
            seasonStats: assigned?.seasonStats ?? null,
            careerStats: assigned?.careerStats ?? null,
            contractStatus: assigned?.contractStatus ?? coach.contractStatus ?? null,
            contractYearsRemaining:
                assigned?.contractYearsRemaining ?? coach.contractYearsRemaining ?? null,
            jobSecurityStatus:
                assigned?.jobSecurityStatus ?? coach.jobSecurityStatus ?? null,
            jobSecurityPercentage:
                assigned?.jobSecurityPercentage ?? coach.jobSecurityPercentage ?? null,
            isUserControlled:
                assigned?.isUserControlled ?? coach.isUserControlled ?? false
        };
    });

    const assignedFbsCoaches = coaches.filter(coach => teamIndexSet.has(coach.teamIndex));

    const playerIdentityByRow = new Map(
        players.map(player => [player.playerRow, player.identityKey])
    );

    const hasGameAccess =
        Array.isArray(gameAccess.cleanPlayers) &&
        typeof gameAccess.getTeamBoxScoreStats === "function" &&
        typeof gameAccess.getGameScoringSummary === "function";

    assert(hasGameAccess, "Game storage accessors are unavailable");

    const gameStorage = prepareGameStorage({
        schedule: fieldIndexData.schedule ?? [],
        cleanPlayers: gameAccess.cleanPlayers,
        playerIdentityByRow,
        getTeamBoxScoreStats: gameAccess.getTeamBoxScoreStats,
        getGameScoringSummary: gameAccess.getGameScoringSummary
    });

    const extendedHistory = prepareExtendedHistory(fieldIndexData, players, coaches);

    return {
        dynastyKey: options.dynastyKey,
        dynastyName: options.dynastyName,
        source,
        metadata,
        teams: fieldIndexData.teams,
        conferences: fieldIndexData.conferences,
        conferenceByTeamIndex,
        players,
        coaches,
        gameStorage,
        extendedHistory,
        assignedFbsCoachCount: assignedFbsCoaches.length,
        summary: {
            teams: fieldIndexData.teams.length,
            conferences: fieldIndexData.conferences.length,
            players: players.length,
            coaches: coaches.length,
            assignedFbsCoaches: assignedFbsCoaches.length,
            playerPresentationIdentities:
                players.filter(player => player.identityStrategy === "presentation_id").length,
            playerBioFallbackIdentities:
                players.filter(player => player.identityStrategy === "bio_fingerprint").length,
            coachPresentationIdentities:
                coaches.filter(coach => coach.identityStrategy === "presentation_id").length,
            coachRowIdentities:
                coaches.filter(coach => coach.identityStrategy === "coach_row").length,
            coachBioFallbackIdentities:
                coaches.filter(coach => coach.identityStrategy === "bio_fingerprint").length,
            games: gameStorage.summary.games,
            completedGames: gameStorage.summary.completedGames,
            unplayedGames: gameStorage.summary.unplayedGames,
            gamesWithPlayerStats: gameStorage.summary.gamesWithPlayerStats,
            teamBoxScoreRows: gameStorage.summary.teamBoxScoreRows,
            playerGameStatLines: gameStorage.summary.playerStatLines,
            playerGameStatFacts: gameStorage.summary.playerStatFacts,
            scoringEvents: gameStorage.summary.scoringEvents,
            rankingSnapshots: extendedHistory.rankings.length,
            recruitingProspects: extendedHistory.recruiting.prospects.length,
            recruitingBoardTargets: extendedHistory.recruiting.interests.length,
            recruitingClassRankedTeams: fieldIndexData.teams.filter(team => Number.isInteger(team.recruitingClassRank)).length,
            depthChartSlots: extendedHistory.depthCharts.length,
            awardSnapshots: extendedHistory.awards.length,
            coachTalentTrees: extendedHistory.coachTalents.trees.length,
            coachTalentNodes: extendedHistory.coachTalents.nodes.length
        }
    };
}

export {
    preparePregameImport
};
