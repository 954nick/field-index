// -------------------- PLAYER READ SERVICE --------------------

import { findByNumericKey, paginate, sortBy } from "../lib/query.js";
import { normalizeLookupText } from "../lib/slug.js";

export class PlayerService {
    constructor(data) {
        this.data = data;
        this.players = Array.isArray(data?.players) ? data.players : [];
    }

    list(options = {}) {
        let players = [...this.players];
        if (options.teamIndex != null) {
            const teamIndex = Number(options.teamIndex);
            players = players.filter(player => player.teamIndex === teamIndex);
        }
        if (options.position) {
            const position = String(options.position).toLowerCase();
            players = players.filter(player => String(player.position).toLowerCase() === position);
        }
        if (options.search) {
            const search = normalizeLookupText(options.search);
            players = players.filter(player =>
                normalizeLookupText(`${player.displayName} ${player.position} ${player.teamName}`).includes(search)
            );
        }
        if (options.transfersOnly) players = players.filter(player => player.isTransfer);

        if (options.redshirtWarningsOnly) players = players.filter(player => Boolean(player.redshirtConsistency?.warning));

        const sortField = options.sort ?? "overallRating";
        const direction = options.direction ?? (sortField === "displayName" ? "asc" : "desc");
        players = sortBy(players, player => player?.[sortField], direction);
        return paginate(players, options);
    }

    get(playerRow) {
        return findByNumericKey(this.players, "playerRow", playerRow);
    }

    require(playerRow) {
        const player = this.get(playerRow);
        if (!player) throw new Error(`Player row ${playerRow} was not found`);
        return player;
    }

    getRedshirtConsistency(playerRow) {
        const player = this.require(playerRow);
        return structuredClone(player.redshirtConsistency ?? {
            redshirtStatus: player.redshirtStatus ?? null,
            gamesPlayed: player.currentSeasonGamesPlayed ?? 0,
            gameLimit: 4,
            isConsistent: true,
            warning: null
        });
    }

    getSeasonStats(playerRow) {
        const player = this.require(playerRow);
        return {
            passing: player.seasonPassingStats ?? [],
            rushing: player.seasonRushingStats ?? [],
            receiving: player.seasonReceivingStats ?? [],
            defense: player.seasonDefensiveStats ?? [],
            offensiveLine: player.seasonOLineStats ?? [],
            kicking: player.seasonKickingStats ?? [],
            punting: player.seasonPuntingStats ?? [],
            kickReturn: player.seasonKickReturnStats ?? [],
            puntReturn: player.seasonPuntReturnStats ?? []
        };
    }

    getCareerStats(playerRow) {
        const player = this.require(playerRow);
        return {
            passing: player.careerPassingStats ?? [],
            rushing: player.careerRushingStats ?? [],
            receiving: player.careerReceivingStats ?? [],
            defense: player.careerDefensiveStats ?? [],
            offensiveLine: player.careerOLineStats ?? [],
            kicking: player.careerKickingStats ?? [],
            punting: player.careerPuntingStats ?? [],
            kickReturn: player.careerKickReturnStats ?? [],
            puntReturn: player.careerPuntReturnStats ?? []
        };
    }
}
