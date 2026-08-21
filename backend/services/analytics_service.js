// -------------------- CURRENT SAVE ANALYTICS SERVICE --------------------

function finalGame(game) {
    return ["HomeWon", "AwayWon", "Tie"].includes(game.gameStatus);
}

function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
}

export class AnalyticsService {
    constructor(data) {
        this.data = data;
    }

    getTeamKpis(teamIndex, seasonIndex = this.data.metadata?.currentSeasonIndex) {
        const team = (this.data.teams ?? []).find(item => item.teamIndex === Number(teamIndex));
        if (!team) throw new Error(`Team index ${teamIndex} was not found`);

        const games = (this.data.schedule ?? []).filter(game =>
            game.seasonIndex === Number(seasonIndex) &&
            finalGame(game) &&
            (game.homeTeamIndex === Number(teamIndex) || game.awayTeamIndex === Number(teamIndex))
        );

        let pointsFor = 0;
        let pointsAgainst = 0;
        let wins = 0;
        let losses = 0;
        let ties = 0;

        for (const game of games) {
            const home = game.homeTeamIndex === Number(teamIndex);
            const scored = home ? game.homeScore : game.awayScore;
            const allowed = home ? game.awayScore : game.homeScore;
            pointsFor += Number(scored ?? 0);
            pointsAgainst += Number(allowed ?? 0);
            if (scored > allowed) wins += 1;
            else if (scored < allowed) losses += 1;
            else ties += 1;
        }

        return {
            teamIndex: team.teamIndex,
            teamName: team.teamName,
            seasonIndex: Number(seasonIndex),
            gamesPlayed: games.length,
            wins,
            losses,
            ties,
            winPercentage: safeDivide(wins + ties * 0.5, games.length),
            pointsFor,
            pointsAgainst,
            pointsPerGame: safeDivide(pointsFor, games.length),
            pointsAllowedPerGame: safeDivide(pointsAgainst, games.length),
            averageMargin: safeDivide(pointsFor - pointsAgainst, games.length),
            overallRating: team.overallRating,
            offensiveRating: team.offensiveRating,
            defensiveRating: team.defensiveRating,
            currentRank: team.teamRank
        };
    }

    getPlayerLeaders(options = {}) {
        const seasonIndex = Number(options.seasonIndex ?? this.data.metadata?.currentSeasonIndex);
        const teamIndex = options.teamIndex == null ? null : Number(options.teamIndex);
        const players = (this.data.players ?? []).filter(player => teamIndex == null || player.teamIndex === teamIndex);

        const categories = [
            ["passingYards", "seasonPassingStats", "passingYards"],
            ["passingTDs", "seasonPassingStats", "passingTDs"],
            ["rushingYards", "seasonRushingStats", "rushingYards"],
            ["rushingTDs", "seasonRushingStats", "rushingTDs"],
            ["receivingYards", "seasonReceivingStats", "receivingYards"],
            ["receivingTDs", "seasonReceivingStats", "receivingTDs"],
            ["tackles", "seasonDefensiveStats", "totalTackles"],
            ["sacks", "seasonDefensiveStats", "sacks"],
            ["interceptions", "seasonDefensiveStats", "interceptions"]
        ];

        const result = {};
        for (const [label, arrayKey, statKey] of categories) {
            result[label] = players
                .flatMap(player => (player[arrayKey] ?? [])
                    .filter(stats => stats.seasonYear === seasonIndex)
                    .map(stats => ({
                        playerRow: player.playerRow,
                        displayName: player.displayName,
                        teamIndex: player.teamIndex,
                        teamName: player.teamName,
                        position: player.position,
                        value: Number(stats[statKey] ?? 0)
                    })))
                .sort((a, b) => b.value - a.value)
                .slice(0, Number(options.limit ?? 10));
        }
        return result;
    }
}
