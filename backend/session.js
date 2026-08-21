// -------------------- FIELD INDEX BACKEND SESSION --------------------

import { loadParsedDynasty } from "./lib/parser_session.js";
import { EditSession } from "./editing/edit_session.js";
import { AnalyticsService } from "./services/analytics_service.js";
import { AssetService } from "./services/asset_service.js";
import { CoachService } from "./services/coach_service.js";
import { GameService } from "./services/game_service.js";
import { DatabaseHistoryService } from "./services/database_history_service.js";
import { DepthChartService } from "./services/depth_chart_service.js";
import { HistoryService } from "./services/history_service.js";
import { HeadService } from "./services/head_service.js";
import { MappingService } from "./services/mapping_service.js";
import { PlayerService } from "./services/player_service.js";
import { RankingsService } from "./services/rankings_service.js";
import { RecruitingService } from "./services/recruiting_service.js";
import { TeamService } from "./services/team_service.js";

export class FieldIndexBackendSession {
    constructor(parsed, options = {}) {
        this.savePath = parsed.savePath;
        this.data = parsed.data;
        this.accessors = parsed.accessors;
        this.assets = new AssetService(options.assets ?? {});
        this.players = new PlayerService(this.data);
        this.heads = new HeadService(this.data, options.heads ?? {});
        this.mappings = new MappingService(options.mappings ?? {});
        this.teams = new TeamService(this.data, this.assets);
        this.coaches = new CoachService(this.data);
        this.games = new GameService(this.data, this.accessors);
        this.depthCharts = new DepthChartService(this.data);
        this.recruiting = new RecruitingService(this.data);
        this.rankings = new RankingsService(this.data);
        this.history = new HistoryService(this.data);
        this.database = new DatabaseHistoryService();
        this.analytics = new AnalyticsService(this.data);
    }

    static async load(savePath, options = {}) {
        const parsed = await loadParsedDynasty(savePath);
        return new FieldIndexBackendSession(parsed, options);
    }

    getMetadata() {
        return structuredClone(this.data.metadata ?? {});
    }

    getAssetSummary() { return this.assets.getSummary(); }
    getAssetTypes() { return this.assets.listTypes(); }
    findAsset(type, lookup) { return this.assets.find(type, lookup); }
    getTeamAssets(teamIndex) { return this.assets.getTeamAssets(this.teams.require(teamIndex)); }
    getCoachAssets(coachRow) { return this.assets.getCoachAssets(this.coaches.require(coachRow)); }
    getAwardAssets(award) { return this.assets.getAwardAssets(award); }
    getBowlAssets(bowl) { return this.assets.getBowlAssets(bowl); }
    getConferenceChampionshipAssets(conference) { return this.assets.getConferenceChampionshipAssets(conference); }
    getPlayoffAsset(stage) { return this.assets.getPlayoffAsset(stage); }

    getAvailability() {
        return structuredClone(this.data.availability ?? {});
    }

    getEditingCapabilities() {
        return structuredClone(this.data.editingCapabilities ?? {});
    }

    // -------------------- UI-FACING CONVENIENCE API --------------------

    getPlayers(options = {}) { return this.players.list(options); }
    getPlayer(playerRow) { return this.players.get(playerRow); }
    getPlayerSeasonStats(playerRow) { return this.players.getSeasonStats(playerRow); }
    getPlayerCareerStats(playerRow) { return this.players.getCareerStats(playerRow); }
    getPlayerRedshirtConsistency(playerRow) { return this.players.getRedshirtConsistency(playerRow); }
    getPlayerHeadId(playerRow) { return this.heads.getPlayerHeadId(playerRow); }
    getPlayerHeadProfile(playerRow, options = {}) { return this.heads.getPlayerHeadProfile(playerRow, options); }
    getHeadById(headId, options = {}) { return this.heads.get(headId, options); }
    listHeadIds(options = {}) { return this.heads.list(options); }

    getTeams(options = {}) { return this.teams.list(options); }
    getTeam(teamIndex) { return this.teams.get(teamIndex); }
    getTeamSchedule(teamIndex, options = {}) { return this.teams.getSchedule(teamIndex, options); }
    getTeamRecruiting(teamIndex) { return this.teams.getRecruiting(teamIndex); }
    getTeamKpis(teamIndex, seasonIndex) { return this.analytics.getTeamKpis(teamIndex, seasonIndex); }

    getCoaches(options = {}) { return this.coaches.list(options); }
    getCoach(coachRow) { return this.coaches.get(coachRow); }
    getCoachSummary(coachRow) { return this.coaches.getSummary(coachRow); }
    getCoachStaff(teamIndex) { return this.coaches.getStaff(teamIndex); }
    getCoachTalentCatalog(options = {}) { return this.coaches.getTalentCatalog(options); }
    getCoachTalentTree(coachRow) { return this.coaches.getTalentTree(coachRow); }
    getCoachArchetypeContext(coachRow) { return this.coaches.getArchetypeContext(coachRow); }
    getCoachAbilities(coachRow, options = {}) { return this.coaches.getAbilities(coachRow, options); }
    getCoachOwnedAbilities(coachRow) { return this.coaches.getOwnedAbilities(coachRow); }
    getCoachPurchasableAbilities(coachRow) { return this.coaches.getPurchasableAbilities(coachRow); }
    getCoachUnlockedTrees(coachRow) { return this.coaches.getUnlockedTrees(coachRow); }

    getSchedule(options = {}) { return this.games.list(options); }
    getGame(identifier) { return this.games.getDetail(identifier); }
    getBoxScore(identifier) { return this.games.getDetail(identifier).boxScore; }
    getDepthChart(teamIndex) { return this.depthCharts.get(teamIndex); }
    getDepthChartPosition(teamIndex, position) { return this.depthCharts.getPosition(teamIndex, position); }

    getRankings(poll = "cfp") { return this.rankings.getPoll(poll); }
    getCfp() { return this.rankings.getCfp(); }
    getPostseason() { return this.rankings.getPostseason(); }
    getAwards() { return this.rankings.getAwards(); }

    getRecruiting(options = {}) { return this.recruiting.listRecruits(options); }
    getRecruitingBoard(teamIndex) { return this.recruiting.getBoard(teamIndex); }
    getSigningClass(teamIndex) { return this.recruiting.getSigningClass(teamIndex); }
    getRecruitingClassRankings(options = {}) { return this.recruiting.getClassRankings(options); }
    getRecruitingClassSummary(teamIndex) { return this.recruiting.getTeamClassSummary(teamIndex); }
    getTransferPortal() { return this.recruiting.getPortal(); }
    getTransfers(options = {}) { return this.history.getPlayerTransfers(options); }
    getPlayerMovement() { return this.history.getPlayerMovement(); }
    getCurrentTeamHistory(teamIndex) { return this.history.getTeamHistory(teamIndex); }
    getPlayerLeaders(options = {}) { return this.analytics.getPlayerLeaders(options); }

    getHeadCatalogSummary() { return this.mappings.getHeadCatalogSummary(); }
    getPortraitIndexSummary() { return this.mappings.getPortraitIndexSummary(); }
    buildPortraitIndex(portraitRoot, options = {}) { return this.mappings.buildPortraitIndex(portraitRoot, options); }
    async buildHeadCatalog(options = {}) {
        const result = await this.mappings.buildHeadCatalog({ save: this.savePath, ...options });
        this.heads.refresh(result.catalogPath);
        return result;
    }
    async prepareMappings(options = {}) {
        const result = await this.mappings.prepareForSave(this.savePath, options);
        this.heads.refresh(result.head.catalogPath);
        return result;
    }

    listDynasties(options = {}) { return this.database.listDynasties(options); }
    getDynastySummary(dynastyKey, options = {}) { return this.database.getDynastySummary(dynastyKey, options); }
    getDynastyHistory(dynastyKey, options = {}) { return this.database.getDynastyHistory(dynastyKey, options); }
    getRecentImports(dynastyKey, limit = 25, options = {}) { return this.database.getRecentImports(dynastyKey, limit, options); }
    getHistoricalPlayerCareer(playerId, options = {}) { return this.database.getPlayerCareer(playerId, options); }
    getHistoricalCoachCareer(coachId, options = {}) { return this.database.getCoachCareer(coachId, options); }
    getHistoricalCoachHistory(coachId, options = {}) { return this.database.getCoachHistory(coachId, options); }
    getCoachTalentHistory(dynastyKey, options = {}) { return this.database.getCoachTalentHistory(dynastyKey, options); }
    getCoachTalentNodeHistory(dynastyKey, options = {}) { return this.database.getCoachTalentNodeHistory(dynastyKey, options); }
    getHistoricalTeamHistory(dynastyKey, teamIndex, options = {}) { return this.database.getTeamHistory(dynastyKey, teamIndex, options); }
    getHistoricalTransfers(dynastyKey, options = {}) { return this.database.getTransfers(dynastyKey, options); }
    getRankingHistory(dynastyKey, options = {}) { return this.database.getRankingHistory(dynastyKey, options); }
    getRecruitingHistory(dynastyKey, options = {}) { return this.database.getRecruitingHistory(dynastyKey, options); }
    getRecruitingClasses(dynastyKey, options = {}) { return this.database.getRecruitingClasses(dynastyKey, options); }
    getRecruitingClassRankingHistory(dynastyKey, options = {}) { return this.database.getRecruitingClassRankingHistory(dynastyKey, options); }
    getDepthChartHistory(dynastyKey, options = {}) { return this.database.getDepthChartHistory(dynastyKey, options); }
    getPostseasonHistory(dynastyKey, options = {}) { return this.database.getPostseasonHistory(dynastyKey, options); }
    getPostseasonGames(dynastyKey, options = {}) { return this.database.getPostseasonGames(dynastyKey, options); }
    getChampionshipHistory(dynastyKey, options = {}) { return this.database.getChampionshipHistory(dynastyKey, options); }
    getAwardHistory(dynastyKey, options = {}) { return this.database.getAwardHistory(dynastyKey, options); }
    getHistoricalGames(dynastyKey, options = {}) { return this.database.getGames(dynastyKey, options); }
    getPlayerCareer(playerId, options = {}) { return this.getHistoricalPlayerCareer(playerId, options); }
    getCoachHistory(coachId, options = {}) { return this.getHistoricalCoachHistory(coachId, options); }
    getCoachCareer(coachId, options = {}) { return this.getHistoricalCoachCareer(coachId, options); }
    getTeamHistory(dynastyKey, teamIndex, options = {}) { return this.getHistoricalTeamHistory(dynastyKey, teamIndex, options); }
    getTransferHistory(dynastyKey, options = {}) { return this.getHistoricalTransfers(dynastyKey, options); }
    getStoredGames(dynastyKey, options = {}) { return this.getHistoricalGames(dynastyKey, options); }

    async createEditSession(options = {}) {
        return EditSession.open(this.savePath, options);
    }
}
