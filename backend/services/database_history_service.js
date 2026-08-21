// -------------------- PERSISTENT HISTORY DATABASE SERVICE --------------------

import * as database from "../../database/query.js";

export class DatabaseHistoryService {
    listDynasties(options = {}) {
        return database.listDynasties(options);
    }

    getDynastySummary(dynastyKey, options = {}) {
        return database.getDynastySummary(dynastyKey, options);
    }

    getDynastyHistory(dynastyKey, options = {}) {
        return database.getDynastyHistory(dynastyKey, options);
    }

    getRecentImports(dynastyKey, limit = 25, options = {}) {
        return database.getRecentImports(dynastyKey, limit, options);
    }

    getPlayerCareer(playerId, options = {}) {
        return database.getPlayerCareer(playerId, options);
    }

    getTeamHistory(dynastyKey, teamIndex, options = {}) {
        return database.getTeamHistory(dynastyKey, teamIndex, options);
    }

    getTransfers(dynastyKey, options = {}) {
        return database.getTransfers(dynastyKey, options);
    }

    getRankingHistory(dynastyKey, options = {}) {
        return database.getRankingHistory(dynastyKey, options);
    }

    getRecruitingHistory(dynastyKey, options = {}) {
        return database.getRecruitingHistory(dynastyKey, options);
    }

    getPostseasonHistory(dynastyKey, options = {}) {
        return database.getPostseasonHistory(dynastyKey, options);
    }
    getCoachHistory(coachId, options = {}) {
        return database.getCoachHistory(coachId, options);
    }

    getCoachCareer(coachId, options = {}) {
        return database.getCoachCareer(coachId, options);
    }

    getRecruitingClasses(dynastyKey, options = {}) {
        return database.getRecruitingClasses(dynastyKey, options);
    }

    getCoachTalentHistory(dynastyKey, options = {}) {
        return database.getCoachTalentHistory(dynastyKey, options);
    }

    getCoachTalentNodeHistory(dynastyKey, options = {}) {
        return database.getCoachTalentNodeHistory(dynastyKey, options);
    }

    getRecruitingClassRankingHistory(dynastyKey, options = {}) {
        return database.getRecruitingClassRankingHistory(dynastyKey, options);
    }

    getDepthChartHistory(dynastyKey, options = {}) {
        return database.getDepthChartHistory(dynastyKey, options);
    }

    getAwardHistory(dynastyKey, options = {}) {
        return database.getAwardHistory(dynastyKey, options);
    }

    getGames(dynastyKey, options = {}) {
        return database.getGames(dynastyKey, options);
    }

    getPostseasonGames(dynastyKey, options = {}) {
        return database.getPostseasonGames(dynastyKey, options);
    }

    getChampionshipHistory(dynastyKey, options = {}) {
        return database.getChampionshipHistory(dynastyKey, options);
    }

}
