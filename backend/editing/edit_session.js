// -------------------- STAGED SAVE EDIT SESSION --------------------

import path from "node:path";
import { openFieldIndexEditor } from "../../parser/editor.js";
import { chooseAvailableSafeOutputPath, isSafeCfb27SaveFilename } from "../lib/save_names.js";

function clone(value) {
    return structuredClone(value);
}

export class EditSession {
    constructor(savePath, options = {}) {
        this.savePath = path.resolve(savePath);
        this.options = options;
        this.editor = null;
        this.operations = [];
    }

    static async open(savePath, options = {}) {
        const session = new EditSession(savePath, options);
        session.editor = await openFieldIndexEditor(session.savePath, options.editorOptions ?? {});
        return session;
    }

    async #rebuild() {
        this.editor = await openFieldIndexEditor(this.savePath, this.options.editorOptions ?? {});
        const operations = [...this.operations];
        this.operations = [];
        for (const operation of operations) {
            await this.#applyOperation(operation, { record: true });
        }
    }

    async #decoratePlayerOperationWithWarnings(operation) {
        if (operation?.type !== "player" || operation.changes?.redshirtStatus === undefined) {
            return operation;
        }
        const consistency = await this.editor.getPlayerRedshirtConsistency(
            operation.playerRow,
            operation.changes.redshirtStatus
        );
        if (consistency.warning) {
            return { ...operation, warnings: [clone(consistency.warning)] };
        }
        return operation;
    }

    async #stage(operation) {
        const checkpoint = this.operations.length;
        try {
            return await this.#applyOperation(operation, { record: true });
        } catch (error) {
            this.operations = this.operations.slice(0, checkpoint);
            await this.#rebuild();
            throw error;
        }
    }

    async #applyOperation(operation, options = {}) {
        let result;
        switch (operation.type) {
            case "player":
                result = this.editor.editPlayer(operation.playerRow, clone(operation.changes));
                break;
            case "playerAppearance":
                result = this.editor.editPlayerAppearance(operation.playerRow, clone(operation.changes));
                break;
            case "playerAbilities":
                result = this.editor.editPlayerAbilities(operation.playerRow, clone(operation.changes));
                break;
            case "playerHeadId":
                result = await this.editor.setPlayerHeadId(operation.playerRow, operation.headId, clone(operation.options ?? {}));
                break;
            case "depthChartPosition":
                result = await this.editor.editDepthChartPosition(operation.teamIndex, operation.position, [...operation.orderedPlayerRows]);
                break;
            case "depthChartMove":
                result = await this.editor.moveDepthChartPlayer(operation.teamIndex, operation.position, operation.playerRow, operation.targetDepth);
                break;
            case "coach":
                result = this.editor.editCoach(operation.coachRow, clone(operation.changes));
                break;
            case "coachAppearance":
                result = this.editor.editCoachAppearance(operation.coachRow, clone(operation.changes));
                break;
            case "coachTalentTree":
                result = this.editor.editCoachTalentTree(operation.coachRow, clone(operation.changes));
                break;
            case "teamGrades":
                result = this.editor.editTeamGrades(operation.teamIndex, clone(operation.changes));
                break;
            case "pollTop25":
                result = this.editor.editPollTop25(operation.poll, [...operation.teamIndexes], clone(operation.options ?? {}));
                break;
            case "cfpGameParticipants":
                result = this.editor.editCfpGameParticipants(operation.seasonGameRow, clone(operation.changes));
                break;
            case "cfpFirstRoundSeedAssignments":
                result = this.editor.editCfpFirstRoundSeedAssignments(clone(operation.assignments));
                break;
            case "cfpFirstRoundTeamSwap":
                result = this.editor.swapCfpFirstRoundTeams(operation.teamIndexA, operation.teamIndexB);
                break;
            default:
                throw new Error(`Unsupported staged edit operation: ${operation.type}`);
        }

        if (options.record !== false) this.operations.push(clone(operation));
        return result;
    }

    async stagePlayerEdit(playerRow, changes) {
        const operation = await this.#decoratePlayerOperationWithWarnings({
            type: "player",
            playerRow,
            changes
        });
        return this.#stage(operation);
    }

    stagePlayerAppearanceEdit(playerRow, changes) {
        return this.#stage({ type: "playerAppearance", playerRow, changes });
    }

    stagePlayerAbilityEdit(playerRow, changes) {
        return this.#stage({ type: "playerAbilities", playerRow, changes });
    }

    stagePlayerHeadId(playerRow, headId, options = {}) {
        return this.#stage({ type: "playerHeadId", playerRow, headId, options });
    }

    async stagePlayerBatch(edits = []) {
        if (!Array.isArray(edits)) throw new Error("Player batch edits must be an array");
        const checkpoint = this.operations.length;
        const results = [];
        try {
            for (const edit of edits) {
                const operation = await this.#decoratePlayerOperationWithWarnings({
                    type: "player",
                    playerRow: edit.playerRow,
                    changes: edit.changes ?? {}
                });
                results.push(await this.#applyOperation(operation, { record: true }));
            }
            return results;
        } catch (error) {
            this.operations = this.operations.slice(0, checkpoint);
            await this.#rebuild();
            throw error;
        }
    }

    stageDepthChartPosition(teamIndex, position, orderedPlayerRows) {
        return this.#stage({ type: "depthChartPosition", teamIndex, position, orderedPlayerRows });
    }

    stageDepthChartMove(teamIndex, position, playerRow, targetDepth) {
        return this.#stage({ type: "depthChartMove", teamIndex, position, playerRow, targetDepth });
    }

    stageCoachEdit(coachRow, changes) {
        return this.#stage({ type: "coach", coachRow, changes });
    }

    stageCoachAppearanceEdit(coachRow, changes) {
        return this.#stage({ type: "coachAppearance", coachRow, changes });
    }

    stageCoachTalentTreeEdit(coachRow, changes) {
        return this.#stage({ type: "coachTalentTree", coachRow, changes });
    }

    stageTeamGrades(teamIndex, changes) {
        return this.#stage({ type: "teamGrades", teamIndex, changes });
    }

    stagePollTop25(poll, teamIndexes, options = {}) {
        return this.#stage({ type: "pollTop25", poll, teamIndexes, options });
    }

    stageCfpGameParticipants(seasonGameRow, changes) {
        return this.#stage({ type: "cfpGameParticipants", seasonGameRow, changes });
    }

    stageCfpFirstRoundSeedAssignments(assignments) {
        return this.#stage({ type: "cfpFirstRoundSeedAssignments", assignments });
    }

    stageCfpFirstRoundTeamSwap(teamIndexA, teamIndexB) {
        return this.#stage({ type: "cfpFirstRoundTeamSwap", teamIndexA, teamIndexB });
    }

    updateDepthChart(teamIndex, position, orderedPlayerRows) {
        return this.stageDepthChartPosition(teamIndex, position, orderedPlayerRows);
    }

    setPlayerHeadId(playerRow, headId, options = {}) {
        return this.stagePlayerHeadId(playerRow, headId, options);
    }

    editPlayer(playerRow, changes) {
        return this.stagePlayerEdit(playerRow, changes);
    }

    editPlayers(edits = []) {
        return this.stagePlayerBatch(edits);
    }

    editPlayerAppearance(playerRow, changes) {
        return this.stagePlayerAppearanceEdit(playerRow, changes);
    }

    editPlayerAbilities(playerRow, changes) {
        return this.stagePlayerAbilityEdit(playerRow, changes);
    }

    moveDepthChartPlayer(teamIndex, position, playerRow, targetDepth) {
        return this.stageDepthChartMove(teamIndex, position, playerRow, targetDepth);
    }

    editCoach(coachRow, changes) {
        return this.stageCoachEdit(coachRow, changes);
    }

    editCoachAppearance(coachRow, changes) {
        return this.stageCoachAppearanceEdit(coachRow, changes);
    }

    editCoachTalentTree(coachRow, changes) {
        return this.stageCoachTalentTreeEdit(coachRow, changes);
    }

    setCoachPoints(coachRow, coachPoints) {
        return this.editCoach(coachRow, { coachPoints });
    }

    setCoachExperiencePoints(coachRow, experiencePoints) {
        return this.editCoach(coachRow, { experiencePoints });
    }

    setCoachTalentTreeState(coachRow, tree, state, options = {}) {
        return this.editCoachTalentTree(coachRow, {
            trees: { [tree]: { state, force: options.force === true } }
        });
    }

    unlockCoachTalentTree(coachRow, tree) {
        return this.setCoachTalentTreeState(coachRow, tree, "Unlocked");
    }

    makeCoachTalentTreePurchasable(coachRow, tree, options = {}) {
        return this.setCoachTalentTreeState(coachRow, tree, "Purchasable", options);
    }

    lockCoachTalentTree(coachRow, tree, options = {}) {
        return this.setCoachTalentTreeState(coachRow, tree, "Locked", options);
    }

    setCoachTalentStatus(coachRow, tree, talent, status) {
        return this.editCoachTalentTree(coachRow, {
            trees: { [tree]: { talents: { [talent]: status } } }
        });
    }

    unlockCoachTalent(coachRow, tree, talent) {
        return this.setCoachTalentStatus(coachRow, tree, talent, "Owned");
    }

    // Backward-compatible numeric node APIs used by automated regression generation.
    setCoachTalentNodeStatus(coachRow, tree, talentIndex, status) {
        return this.setCoachTalentStatus(coachRow, tree, talentIndex, status);
    }

    unlockCoachTalentNode(coachRow, tree, talentIndex) {
        return this.setCoachTalentNodeStatus(coachRow, tree, talentIndex, "Owned");
    }

    makeCoachTalentNodePurchasable(coachRow, tree, talentIndex) {
        return this.setCoachTalentNodeStatus(coachRow, tree, talentIndex, "Purchasable");
    }

    lockCoachTalentNode(coachRow, tree, talentIndex) {
        return this.setCoachTalentNodeStatus(coachRow, tree, talentIndex, "Locked");
    }

    setCoachTalentTreePointsSpent(coachRow, tree, coachPointsSpent) {
        return this.editCoachTalentTree(coachRow, {
            trees: { [tree]: { coachPointsSpent } }
        });
    }

    editTeamGrades(teamIndex, changes) {
        return this.stageTeamGrades(teamIndex, changes);
    }

    editPollTop25(poll, teamIndexes, options = {}) {
        return this.stagePollTop25(poll, teamIndexes, options);
    }

    editCfpGameParticipants(seasonGameRow, changes) {
        return this.stageCfpGameParticipants(seasonGameRow, changes);
    }

    editCfpFirstRoundSeedAssignments(assignments) {
        return this.stageCfpFirstRoundSeedAssignments(assignments);
    }

    swapCfpFirstRoundTeams(teamIndexA, teamIndexB) {
        return this.stageCfpFirstRoundTeamSwap(teamIndexA, teamIndexB);
    }

    getCoachTalentCatalog() {
        return this.editor.getCoachTalentCatalog();
    }

    getCoachTalentTree(coachRow) {
        return this.editor.getCoachTalentTree(coachRow);
    }

    getPlayerRedshirtConsistency(playerRow, proposedRedshirtStatus = undefined) {
        return this.editor.getPlayerRedshirtConsistency(playerRow, proposedRedshirtStatus);
    }

    getPlayerAppearance(playerRow) {
        return this.editor.getPlayerAppearance(playerRow);
    }

    getPlayerAbilities(playerRow) {
        return this.editor.getPlayerAbilities(playerRow);
    }

    getCoachAppearance(coachRow) {
        return this.editor.getCoachAppearance(coachRow);
    }

    getDepthChart(teamIndex) {
        return this.editor.getDepthChart(teamIndex);
    }

    getEditableCfpBracket() {
        return this.editor.getEditableCfpBracket();
    }

    getCfpFirstRoundSeedAssignments() {
        return this.editor.getCfpFirstRoundSeedAssignments();
    }

    getPlayerHeadId(playerRow) {
        return this.editor.getPlayerHeadId(playerRow);
    }

    getPlayerHeadProfile(playerRow) {
        return this.editor.getPlayerHeadProfile(playerRow);
    }

    getHeadById(headId, options = {}) {
        return this.editor.getHeadById(headId, options);
    }

    listHeadIds(options = {}) {
        return this.editor.listHeadIds(options);
    }

    getPlayer(playerRow) {
        return this.editor.getPlayer(playerRow);
    }

    getCoach(coachRow) {
        return this.editor.getCoach(coachRow);
    }

    getPlayerEditSchema(playerRow) {
        return this.editor.getPlayerEditSchema(playerRow);
    }

    getCoachEditSchema(coachRow) {
        return this.editor.getCoachEditSchema(coachRow);
    }

    getTeamGrades(teamIndex) {
        return this.editor.getTeamGrades(teamIndex);
    }

    getPollRankings(poll = "cfp") {
        return this.editor.getPollRankings(poll);
    }

    async undoLast() {
        if (this.operations.length === 0) return null;
        const removed = this.operations.pop();
        await this.#rebuild();
        return removed;
    }

    async reset() {
        this.operations = [];
        await this.#rebuild();
    }

    getPendingChanges() {
        return clone(this.operations);
    }

    getPendingWarnings() {
        return clone(this.operations.flatMap(operation => operation.warnings ?? []));
    }

    getCapabilities() {
        return this.editor.getCapabilities();
    }

    async saveDynasty(options = {}) {
        return this.commit(options);
    }

    async commit(options = {}) {
        if (this.operations.length === 0 && options.allowNoop !== true) {
            throw new Error("There are no staged edits to save");
        }

        let outputPath = options.outputPath ? path.resolve(options.outputPath) : null;
        if (!outputPath && options.overwriteOriginal !== true) {
            outputPath = chooseAvailableSafeOutputPath(this.savePath, {
                directory: options.outputDirectory,
                purpose: options.purpose ?? "EDIT"
            });
        }
        if (options.overwriteOriginal === true) outputPath = this.savePath;

        if (outputPath !== this.savePath && !isSafeCfb27SaveFilename(path.basename(outputPath))) {
            throw new Error(
                "Edited CFB27 output filenames must use a short DYNASTY-* name. " +
                "Omit outputPath to let Field Index generate one automatically."
            );
        }

        const result = await this.editor.commit({
            ...options,
            outputPath
        });
        return {
            ...result,
            pendingOperationCount: this.operations.length,
            generatedSafeName: options.outputPath == null && options.overwriteOriginal !== true
        };
    }
}
