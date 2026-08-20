// -------------------- PRE-GAME DATABASE IMPORT MODEL --------------------

import { buildCoachIdentityRecords, buildPlayerIdentityRecords } from "./identity.js";

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

function preparePregameImport(fieldIndexData, source, options) {
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
                coaches.filter(coach => coach.identityStrategy === "bio_fingerprint").length
        }
    };
}

export {
    preparePregameImport
};
