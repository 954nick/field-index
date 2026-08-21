// -------------------- COACH BACKEND TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { CoachService } from "../backend/services/coach_service.js";
import { EditSession } from "../backend/editing/edit_session.js";
import {
    coachTalentTreeIndex,
    getCoachTalentNodeDefinition,
    getCoachTalentStatus,
    getCoachTalentTreeDefinition,
    listCoachTalentDefinitions
} from "../parser/coach_talents.js";

test("coach talent model resolves internal and game-facing tree names", () => {
    assert.equal(coachTalentTreeIndex("Schemer"), 1);
    assert.equal(coachTalentTreeIndex("Tactician"), 1);
    assert.equal(coachTalentTreeIndex("Program Builder"), 11);
    assert.equal(getCoachTalentTreeDefinition(1).displayName, "Tactician");
    const node = getCoachTalentNodeDefinition("Recruiter", 7);
    assert.equal(node.canonicalKey, "Recruiter:7");
    assert.equal(node.field, "TalentStatus7");
});

test("coach service filters and returns persistent talent-tree snapshots", () => {
    const data = {
        coaches: [
            { coachRow: 1, displayName: "A Coach", teamIndex: 10, teamName: "Florida", role: "Head Coach", position: "HeadCoach", dominantArchetype: "Recruiter", isUserControlled: true, talentTree: { trees: [{ treeIndex: 2 }] } },
            { coachRow: 2, displayName: "B Coach", teamIndex: 20, teamName: "Georgia", role: "Offensive Coordinator", position: "OffensiveCoordinator", dominantArchetype: "Schemer", isUserControlled: false, talentTree: { trees: [] } }
        ],
        coaching: []
    };
    const service = new CoachService(data);
    assert.equal(service.list({ teamIndex: 10 }).length, 1);
    assert.equal(service.list({ role: "head" }).length, 1);
    assert.equal(service.list({ archetype: "recruit" }).length, 1);
    assert.equal(service.list({ userControlled: true }).length, 1);
    assert.equal(service.getTalentTree(1).trees[0].treeIndex, 2);
});

test("edit session exposes coach points, XP, tree and node staging helpers", async () => {
    const session = new EditSession("dummy-save");
    const calls = [];
    session.editor = {
        editCoach: (coachRow, changes) => { calls.push(["coach", coachRow, changes]); return changes; },
        editCoachTalentTree: (coachRow, changes) => { calls.push(["talent", coachRow, changes]); return changes; },
        getCapabilities: () => ({ coachEditing: true })
    };

    await session.setCoachPoints(4, 99);
    await session.setCoachExperiencePoints(4, 12345);
    await session.unlockCoachTalentTree(4, "Recruiter");
    await session.unlockCoachTalentNode(4, "Recruiter", 5);

    assert.deepEqual(calls[0], ["coach", 4, { coachPoints: 99 }]);
    assert.deepEqual(calls[1], ["coach", 4, { experiencePoints: 12345 }]);
    assert.equal(calls[2][2].trees.Recruiter.state, "Unlocked");
    assert.equal(calls[3][2].trees.Recruiter.talents[5], "Owned");
    assert.equal(session.getPendingChanges().length, 4);
});


test("coach talent catalog exposes all 13 trees and all raw status nodes", () => {
    const catalog = listCoachTalentDefinitions();
    assert.equal(catalog.length, 13);
    assert.equal(catalog.reduce((sum, tree) => sum + tree.nodes.length, 0), 13 * 33);
    assert.equal(catalog[1].displayName, "Tactician");
    assert.equal(catalog[2].nodes[32].field, "TalentStatus32");

    const status = getCoachTalentStatus({
        trees: [{ treeIndex: 2, state: "Unlocked", available: true, coachPointsSpent: 20, talents: [{ talentIndex: 5, status: "Owned" }] }]
    }, "Recruiter", 5);
    assert.equal(status.canonicalKey, "Recruiter:5");
    assert.equal(status.status, "Owned");
});
