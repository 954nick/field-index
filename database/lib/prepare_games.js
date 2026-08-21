// -------------------- GAME STORAGE IMPORT MODEL --------------------

function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function isFinalGame(game) {
    return ["HomeWon", "AwayWon", "Tie"].includes(game.gameStatus);
}

function findStat(gameStats, predicate) {
    return gameStats.find(predicate) ?? null;
}

function buildPlayerCategoryLines(gameStats) {
    const lines = [];

    const offensive = findStat(
        gameStats,
        gameStat => gameStat.statType === "GameOffensiveStats"
    );

    if (offensive && asNumber(offensive.stats.PASSATTEMPTS) > 0) {
        lines.push({
            statCategory: "passing",
            stats: {
                completions: asNumber(offensive.stats.PASSCOMPLETED),
                attempts: asNumber(offensive.stats.PASSATTEMPTS),
                passingYards: asNumber(offensive.stats.PASSYARDS),
                passingTDs: asNumber(offensive.stats.PASSTDS),
                interceptions: asNumber(offensive.stats.PASSINTS),
                sacks: asNumber(offensive.stats.PASSSACKED),
                longestPass: asNumber(offensive.stats.PASSLONGEST)
            }
        });
    }

    if (offensive && asNumber(offensive.stats.RUSHATTEMPTS) > 0) {
        lines.push({
            statCategory: "rushing",
            stats: {
                rushingAttempts: asNumber(offensive.stats.RUSHATTEMPTS),
                rushingYards: asNumber(offensive.stats.RUSHYARDS),
                rushingTDs: asNumber(offensive.stats.RUSHTDS),
                longestRush: asNumber(offensive.stats.RUSHLONGEST),
                fumbles: asNumber(offensive.stats.RUSHFUMBLES),
                rushingBrokenTackles: asNumber(offensive.stats.RUSHBROKENTACKLES)
            }
        });
    }

    const receiving = findStat(
        gameStats,
        gameStat =>
            (gameStat.statType === "GameOffensiveStats" ||
                gameStat.statType === "GameOffensiveKPReturnStats") &&
            asNumber(gameStat.stats.RECEIVECATCHES) > 0
    );

    if (receiving) {
        lines.push({
            statCategory: "receiving",
            stats: {
                receptions: asNumber(receiving.stats.RECEIVECATCHES),
                receivingYards: asNumber(receiving.stats.RECEIVEYARDS),
                receivingTDs: asNumber(receiving.stats.RECEIVETDS),
                yardsAfterCatch: asNumber(receiving.stats.RECEIVEYARDSAFTER),
                longestReception: asNumber(receiving.stats.RECEIVELONGEST),
                drops: asNumber(receiving.stats.RECEIVEDROPS)
            }
        });
    }

    const defensive = findStat(
        gameStats,
        gameStat =>
            gameStat.statType === "GameDefensiveStats" ||
            gameStat.statType === "GameDefensiveKPReturnStats"
    );

    if (defensive) {
        const interceptions = asNumber(defensive.stats.DSECINTS);
        const interceptionYards = asNumber(defensive.stats.DSECINTRETURNYARDS);

        lines.push({
            statCategory: "defense",
            stats: {
                soloTackles: asNumber(defensive.stats.DEFTACKLES),
                assistedTackles: asNumber(defensive.stats.ASSDEFTACKLES),
                totalTackles:
                    asNumber(defensive.stats.DEFTACKLES) +
                    asNumber(defensive.stats.ASSDEFTACKLES),
                tacklesForLoss: asNumber(defensive.stats.DEFTACKLESFORLOSS),
                sacks:
                    asNumber(defensive.stats.DLINESACKS) +
                    asNumber(defensive.stats.DLINEHALFSACK) * 0.5,
                interceptions,
                interceptionYards,
                longestInterception: asNumber(defensive.stats.DSECINTLONGESTRETURN),
                passDeflections: asNumber(defensive.stats.DEFPASSDEFLECTIONS),
                interceptionAverage:
                    interceptions > 0 ? interceptionYards / interceptions : 0,
                forcedFumbles: asNumber(defensive.stats.DLINEFORCEDFUMBLES),
                fumbleRecoveries: asNumber(defensive.stats.DLINEFUMBLERECOVERIES),
                fumbleRecoveryYards: asNumber(defensive.stats.DLINEFUMBLERECOVERYYARDS),
                blockedKicks: asNumber(defensive.stats.DLINEBLOCKS),
                safeties: asNumber(defensive.stats.DLINESAFETIES),
                defensiveTDs:
                    asNumber(defensive.stats.DSECINTTDS) +
                    asNumber(defensive.stats.DLINEFUMBLETDS)
            }
        });
    }

    const oLine = findStat(
        gameStats,
        gameStat => gameStat.statType === "GameOLineStats"
    );

    if (oLine) {
        lines.push({
            statCategory: "o_line",
            stats: {
                pancakes: asNumber(oLine.stats.OLINEPANCAKES),
                sacksAllowed: asNumber(oLine.stats.OLINESACKSALLOWED),
                downsPlayed: asNumber(oLine.stats.DOWNSPLAYED),
                gamesStarted: asNumber(oLine.stats.GAMESSTARTED)
            }
        });
    }

    const kicking = findStat(
        gameStats,
        gameStat => gameStat.statType === "GameKickingStats"
    );

    if (
        kicking &&
        (asNumber(kicking.stats.KICKFGATTEMPTS) > 0 ||
            asNumber(kicking.stats.KICKEPATTEMPTS) > 0)
    ) {
        lines.push({
            statCategory: "kicking",
            stats: {
                fieldGoalsMade: asNumber(kicking.stats.KICKFGMADE),
                fieldGoalsAttempted: asNumber(kicking.stats.KICKFGATTEMPTS),
                longestFieldGoal: asNumber(kicking.stats.KICKFGLONGEST),
                extraPointsMade: asNumber(kicking.stats.KICKEPMADE),
                extraPointsAttempted: asNumber(kicking.stats.KICKEPATTEMPTS),
                gamesStarted: asNumber(kicking.stats.GAMESSTARTED),
                downsPlayed: asNumber(kicking.stats.DOWNSPLAYED)
            }
        });
    }

    if (kicking && asNumber(kicking.stats.PUNTATTEMPTS) > 0) {
        const punts = asNumber(kicking.stats.PUNTATTEMPTS);
        const puntYards = asNumber(kicking.stats.PUNTYARDS);
        const netPuntYards = asNumber(kicking.stats.PUNTNETYARDS);

        lines.push({
            statCategory: "punting",
            stats: {
                punts,
                puntingYards: puntYards,
                puntingAverage: punts > 0 ? puntYards / punts : 0,
                netPuntingYards: netPuntYards,
                netPuntingAverage: punts > 0 ? netPuntYards / punts : 0,
                longestPunt: asNumber(kicking.stats.PUNTLONGEST),
                puntsInside20: asNumber(kicking.stats.PUNTIN20),
                touchbacks: asNumber(kicking.stats.PUNTTOUCHBACKS),
                blockedPunts: asNumber(kicking.stats.PUNTBLOCKED)
            }
        });
    }

    const kickReturn = findStat(
        gameStats,
        gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
                gameStat.statType === "GameDefensiveKPReturnStats") &&
            asNumber(gameStat.stats.KRETATTEMPTS) > 0
    );

    if (kickReturn) {
        const attempts = asNumber(kickReturn.stats.KRETATTEMPTS);
        const yards = asNumber(kickReturn.stats.KRETYARDS);
        lines.push({
            statCategory: "kick_return",
            stats: {
                kickReturns: attempts,
                kickReturnYards: yards,
                kickReturnAverage: attempts > 0 ? yards / attempts : 0,
                longestKickReturn: asNumber(kickReturn.stats.KRETLONGEST),
                kickReturnTDs: asNumber(kickReturn.stats.KRETTDS)
            }
        });
    }

    const puntReturn = findStat(
        gameStats,
        gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
                gameStat.statType === "GameDefensiveKPReturnStats") &&
            asNumber(gameStat.stats.PRETATTEMPTS) > 0
    );

    if (puntReturn) {
        const attempts = asNumber(puntReturn.stats.PRETATTEMPTS);
        const yards = asNumber(puntReturn.stats.PRETYARDS);
        lines.push({
            statCategory: "punt_return",
            stats: {
                puntReturns: attempts,
                puntReturnYards: yards,
                puntReturnAverage: attempts > 0 ? yards / attempts : 0,
                longestPuntReturn: asNumber(puntReturn.stats.PRETLONGEST),
                puntReturnTDs: asNumber(puntReturn.stats.PRETTDS)
            }
        });
    }

    const fumbles = gameStats
        .filter(
            gameStat =>
                (gameStat.statType === "GameOffensiveStats" ||
                    gameStat.statType === "GameOffensiveKPReturnStats") &&
                asNumber(gameStat.stats.RUSHFUMBLES) > 0
        )
        .reduce(
            (total, gameStat) => total + asNumber(gameStat.stats.RUSHFUMBLES),
            0
        );

    if (fumbles > 0) {
        lines.push({
            statCategory: "fumbles",
            stats: { fumbles }
        });
    }

    return lines;
}

function prepareGameStorage({
    schedule,
    cleanPlayers,
    playerIdentityByRow,
    getTeamBoxScoreStats,
    getGameScoringSummary
}) {
    const logicalKeys = new Set();
    for (const game of schedule) {
        if (!Number.isInteger(game.seasonIndex) || game.seasonIndex < 0) {
            throw new Error(`Invalid game season index at SeasonGame row ${game.seasonGameRow}`);
        }
        if (!game.weekType || !Number.isInteger(game.week) || game.week < 0) {
            throw new Error(`Invalid game week at SeasonGame row ${game.seasonGameRow}`);
        }
        if (!Number.isInteger(game.gameNumber) || game.gameNumber < 0) {
            throw new Error(`Invalid game number at SeasonGame row ${game.seasonGameRow}`);
        }

        const logicalKey = [
            game.seasonIndex,
            game.weekType,
            game.week,
            game.gameNumber
        ].join("|");

        if (logicalKeys.has(logicalKey)) {
            throw new Error(`Duplicate logical game slot ${logicalKey}`);
        }
        logicalKeys.add(logicalKey);
    }

    const scheduleByReference = new Map(
        schedule.map(game => [game.seasonGameReference, game])
    );

    const playerStatLines = [];

    for (const player of cleanPlayers) {
        const identityKey = playerIdentityByRow.get(player.playerRow);
        if (!identityKey) {
            throw new Error(
                `Game stat player row ${player.playerRow} has no persistent player identity`
            );
        }

        const byGame = new Map();
        for (const gameStat of player.gameStats ?? []) {
            if (!scheduleByReference.has(gameStat.seasonGameReference)) continue;
            if (!byGame.has(gameStat.seasonGameReference)) {
                byGame.set(gameStat.seasonGameReference, []);
            }
            byGame.get(gameStat.seasonGameReference).push(gameStat);
        }

        for (const [seasonGameReference, gameStats] of byGame) {
            const game = scheduleByReference.get(seasonGameReference);
            const playerTeamIndex = gameStats[0]?.playerTeamIndex;
            const opponentTeamIndex = gameStats[0]?.opponentTeamIndex;
            const side = playerTeamIndex === game.homeTeamIndex
                ? "home"
                : playerTeamIndex === game.awayTeamIndex
                    ? "away"
                    : null;

            if (!side) continue;

            for (const category of buildPlayerCategoryLines(gameStats)) {
                playerStatLines.push({
                    seasonGameReference,
                    identityKey,
                    playerRow: player.playerRow,
                    side,
                    teamIndex: playerTeamIndex,
                    teamName: gameStats[0]?.playerTeamName ?? null,
                    opponentTeamIndex,
                    opponentTeamName: gameStats[0]?.opponentTeamName ?? null,
                    statCategory: category.statCategory,
                    stats: category.stats
                });
            }
        }
    }

    const gameDetails = schedule.map(game => {
        const final = isFinalGame(game);
        const teamStats = final ? getTeamBoxScoreStats(game.seasonGameReference) : null;
        const scoringSummary = final
            ? getGameScoringSummary(game.seasonGameReference)
            : [];

        return {
            ...game,
            teamBoxScoreStats: teamStats,
            scoringSummary
        };
    });

    return {
        games: gameDetails,
        playerStatLines,
        summary: {
            games: gameDetails.length,
            completedGames: gameDetails.filter(isFinalGame).length,
            unplayedGames: gameDetails.filter(game => !isFinalGame(game)).length,
            gamesWithPlayerStats: gameDetails.filter(game => game.playerStatsAvailable).length,
            teamBoxScoreRows: gameDetails.reduce(
                (total, game) =>
                    total +
                    (game.teamBoxScoreStats?.home ? 1 : 0) +
                    (game.teamBoxScoreStats?.away ? 1 : 0),
                0
            ),
            playerStatLines: playerStatLines.length,
            playerStatFacts: playerStatLines.reduce(
                (total, line) => total + Object.keys(line.stats ?? {}).length,
                0
            ),
            scoringEvents: gameDetails.reduce(
                (total, game) => total + (game.scoringSummary?.length ?? 0),
                0
            )
        }
    };
}

export {
    buildPlayerCategoryLines,
    prepareGameStorage
};
