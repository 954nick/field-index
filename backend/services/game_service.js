// -------------------- GAME / BOX SCORE SERVICE --------------------

export class GameService {
    constructor(data, accessors = {}) {
        this.data = data;
        this.accessors = accessors;
        this.schedule = Array.isArray(data?.schedule) ? data.schedule : [];
    }

    list(options = {}) {
        return this.schedule.filter(game => {
            if (options.seasonIndex != null && game.seasonIndex !== Number(options.seasonIndex)) return false;
            if (options.week != null && game.week !== Number(options.week)) return false;
            if (options.weekType && game.weekType !== options.weekType) return false;
            if (options.teamIndex != null) {
                const teamIndex = Number(options.teamIndex);
                if (game.homeTeamIndex !== teamIndex && game.awayTeamIndex !== teamIndex) return false;
            }
            if (options.finalOnly && !["HomeWon", "AwayWon", "Tie"].includes(game.gameStatus)) return false;
            return true;
        });
    }

    get(identifier) {
        const numeric = Number(identifier);
        return this.schedule.find(game =>
            game.seasonGameReference === identifier ||
            (Number.isInteger(numeric) && game.seasonGameRow === numeric)
        ) ?? null;
    }

    getDetail(identifier) {
        const game = this.get(identifier);
        if (!game) throw new Error(`Game ${identifier} was not found`);
        const reference = game.seasonGameReference;
        return {
            game,
            context: this.accessors.getGameContext?.(reference) ?? null,
            lineScore: this.accessors.getGameLineScore?.(reference) ?? game.lineScore ?? null,
            boxScore: this.accessors.getGameBoxScoreData?.(reference) ?? null,
            scoringSummary: this.accessors.getGameScoringSummary?.(reference) ?? []
        };
    }
}
