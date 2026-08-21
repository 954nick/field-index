// -------------------- DEPTH CHART READ SERVICE --------------------

export class DepthChartService {
    constructor(data) {
        this.data = data;
        this.charts = Array.isArray(data?.depthCharts) ? data.depthCharts : [];
    }

    get(teamIndex) {
        const index = Number(teamIndex);
        return this.charts.find(chart => chart.teamIndex === index) ?? null;
    }

    require(teamIndex) {
        const chart = this.get(teamIndex);
        if (!chart) throw new Error(`Depth chart for team index ${teamIndex} was not found`);
        return chart;
    }

    getPosition(teamIndex, position) {
        const chart = this.require(teamIndex);
        const key = String(position ?? "").trim().toUpperCase();
        const players = chart.positions?.[key];
        if (!players) throw new Error(`Depth-chart position ${position} was not found for team index ${teamIndex}`);
        return players;
    }

    listTeams() {
        return this.charts.map(chart => ({
            teamIndex: chart.teamIndex,
            teamName: chart.teamName,
            positionCount: Object.keys(chart.positions ?? {}).length,
            slotCount: Object.values(chart.positions ?? {}).reduce((sum, players) => sum + (players?.length ?? 0), 0)
        }));
    }
}
