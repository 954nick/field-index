// -------------------- RANKINGS / POSTSEASON READ SERVICE --------------------

export class RankingsService {
    constructor(data) {
        this.data = data;
    }

    getPoll(poll = "cfp") {
        const key = {
            cfp: "cfpPoll",
            coaches: "coachesPoll",
            media: "mediaPoll",
            ap: "apPoll"
        }[String(poll).toLowerCase()];
        if (!key) throw new Error(`Unknown poll: ${poll}`);
        return this.data.rankings?.[key] ?? [];
    }

    getCfp() {
        return this.data.cfp ?? null;
    }

    getPostseason() {
        return this.data.postseason ?? null;
    }

    getAwards() {
        return this.data.awards ?? null;
    }
}
