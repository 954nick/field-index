// -------------------- CURRENT SAVE HISTORY SERVICE --------------------

export class HistoryService {
    constructor(data) {
        this.data = data;
    }

    getPlayerTransfers(options = {}) {
        let transfers = [...(this.data.transfers?.knownTransfers ?? [])];
        if (options.teamIndex != null) {
            const teamIndex = Number(options.teamIndex);
            transfers = transfers.filter(transfer =>
                transfer.previousTeamIndex === teamIndex || transfer.currentTeamIndex === teamIndex
            );
        }
        if (options.seasonIndex != null) {
            transfers = transfers.filter(transfer => transfer.transferSeasonIndex === Number(options.seasonIndex));
        }
        return transfers;
    }

    getTeamHistory(teamIndex) {
        return (this.data.teamHistory ?? []).filter(entry => entry.teamIndex === Number(teamIndex));
    }

    getPlayerMovement() {
        return this.data.playerMovement ?? {
            leavingPlayers: [],
            transferCandidates: [],
            earlyDraft: []
        };
    }
}
