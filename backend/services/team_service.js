// -------------------- TEAM READ SERVICE --------------------

import { findByNumericKey, sortBy } from "../lib/query.js";

export class TeamService {
    constructor(data, assetService = null) {
        this.data = data;
        this.assetService = assetService;
        this.teams = Array.isArray(data?.teams) ? data.teams : [];
    }

    list(options = {}) {
        let teams = [...this.teams];
        if (options.conference) {
            const conference = this.data.conferences?.find(item =>
                item.name === options.conference || item.conferenceEnum === options.conference
            );
            const indexes = new Set((conference?.teams ?? []).map(team => team.teamIndex));
            teams = teams.filter(team => indexes.has(team.teamIndex));
        }
        return sortBy(teams, team => team.teamName, "asc").map(team => this.#enrich(team));
    }

    get(teamIndex) {
        const team = findByNumericKey(this.teams, "teamIndex", teamIndex);
        return team ? this.#enrich(team) : null;
    }

    require(teamIndex) {
        const team = this.get(teamIndex);
        if (!team) throw new Error(`Team index ${teamIndex} was not found`);
        return team;
    }

    getSchedule(teamIndex, options = {}) {
        this.require(teamIndex);
        return (this.data.schedule ?? [])
            .filter(game => game.homeTeamIndex === Number(teamIndex) || game.awayTeamIndex === Number(teamIndex))
            .filter(game => options.seasonIndex == null || game.seasonIndex === Number(options.seasonIndex));
    }

    getDepthChart(teamIndex) {
        this.require(teamIndex);
        return (this.data.depthCharts ?? []).find(chart => chart.teamIndex === Number(teamIndex)) ?? null;
    }

    getStaff(teamIndex) {
        this.require(teamIndex);
        return (this.data.coaching ?? []).find(staff => staff.teamIndex === Number(teamIndex)) ?? null;
    }

    getRecruiting(teamIndex) {
        this.require(teamIndex);
        const key = String(teamIndex);
        return {
            board: (this.data.recruiting?.boards ?? []).find(board => board.teamIndex === Number(teamIndex)) ?? null,
            signedClass: this.data.recruiting?.signingClassesByTeam?.[key] ?? [],
            transfersIn: this.data.transfers?.portal?.incomingByTeam?.[key] ?? [],
            transfersOut: this.data.transfers?.portal?.outgoingByTeam?.[key] ?? []
        };
    }

    #enrich(team) {
        const conference = (this.data.conferences ?? []).find(item =>
            (item.teams ?? []).some(member => member.teamIndex === team.teamIndex)
        );
        return {
            ...team,
            conference: conference
                ? {
                    name: conference.name,
                    conferenceEnum: conference.conferenceEnum,
                    assetName: conference.assetName
                }
                : null,
            assets: this.assetService?.getTeamAssets(team) ?? null
        };
    }
}
