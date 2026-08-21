// -------------------- REDSHIRT CONSISTENCY WARNINGS --------------------

const REDSHIRT_GAME_LIMIT = 4;
const REDSHIRT_INELIGIBLE_STATUS = "Ineligible";
const REDSHIRT_WARNING_CODE = "REDSHIRT_INELIGIBLE_WITH_FOUR_OR_FEWER_GAMES";

function normalizeGamesPlayed(value) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.trunc(numeric);
}

function getCurrentSeasonGamesPlayed(seasonStats = [], currentSeasonIndex) {
    if (!Array.isArray(seasonStats) || !Number.isInteger(currentSeasonIndex)) return 0;

    let gamesPlayed = 0;
    for (const seasonStat of seasonStats) {
        if (!seasonStat || seasonStat.seasonYear !== currentSeasonIndex) continue;
        const value = normalizeGamesPlayed(
            seasonStat.gamesPlayed ?? seasonStat.stats?.GAMESPLAYED ?? 0
        );
        gamesPlayed = Math.max(gamesPlayed, value);
    }
    return gamesPlayed;
}

function evaluateRedshirtConsistency({ redshirtStatus, gamesPlayed } = {}) {
    const normalizedGamesPlayed = normalizeGamesPlayed(gamesPlayed);
    const warningApplies =
        redshirtStatus === REDSHIRT_INELIGIBLE_STATUS &&
        normalizedGamesPlayed <= REDSHIRT_GAME_LIMIT;

    const warning = warningApplies
        ? {
            code: REDSHIRT_WARNING_CODE,
            severity: "warning",
            field: "redshirtStatus",
            blocksEdit: false,
            redshirtStatus,
            gamesPlayed: normalizedGamesPlayed,
            gameLimit: REDSHIRT_GAME_LIMIT,
            message:
                `Redshirt status is Ineligible with only ${normalizedGamesPlayed} game${normalizedGamesPlayed === 1 ? "" : "s"} played. ` +
                `CFB27 normally makes a player redshirt-ineligible after more than ${REDSHIRT_GAME_LIMIT} games; verify this override is intentional.`
        }
        : null;

    return {
        redshirtStatus: redshirtStatus ?? null,
        gamesPlayed: normalizedGamesPlayed,
        gameLimit: REDSHIRT_GAME_LIMIT,
        isConsistent: !warningApplies,
        warning
    };
}

export {
    REDSHIRT_GAME_LIMIT,
    REDSHIRT_INELIGIBLE_STATUS,
    REDSHIRT_WARNING_CODE,
    evaluateRedshirtConsistency,
    getCurrentSeasonGamesPlayed
};
