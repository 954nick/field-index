// -------------------- COACH TALENT CATALOG TESTS --------------------

import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCoachTalentCatalog,
    enrichCoachTalentTreeSnapshot,
    flattenCoachAbilities,
    getCoachTalentTreeIndex,
    resolveCoachArchetypeContext,
    resolveCoachTalentIdentifier
} from "../coach_talents.js";

class FakeRecord {
    constructor(values = {}, refs = {}, index = 0) {
        Object.assign(this, values);
        this.refs = refs;
        this.index = index;
        this.isEmpty = false;
        this._offsetTable = Object.keys(refs).map(name => ({ name }));
        this.arraySize = this._offsetTable.length;
    }
    getReferenceDataByKey(name) {
        return this.refs[name] ?? { tableId: 0, rowNumber: 0 };
    }
    getFieldByKey(name) {
        return Object.prototype.hasOwnProperty.call(this, name);
    }
}

function table(name, id, records) {
    return { name, records, recordsRead: true, header: { tableId: id }, async readRecords() {} };
}

function fakeFranchise() {
    const talent = new FakeRecord({
        Name: "Quick Study",
        Description: "Improves progression for the selected position group.",
        TalentPosGroup: "QB",
        Behavior: "Permanent",
        Effect: "Progression",
        Duration: "Permanent",
        IconId: 7
    }, {}, 0);
    const branch = new FakeRecord({ Title: "Quarterbacks", Subtitle: "QB Development", IconId: 12 }, {}, 0);
    const prerequisite = new FakeRecord({
        Title: "Level Requirement",
        Description: "Reach coach level 10.",
        MinCoachLevel: 10,
        TotalTalentSpendPoints: 5,
        CompletionValue: 10,
        CoachStat: "CoachLevel"
    }, {}, 0);
    const node = new FakeRecord(
        { StaffPointCost: 8, IsArchetypeNode: false, ProgressLabel: "0/1" },
        {
            Talent: { tableId: 4, rowNumber: 0 },
            BranchInfo: { tableId: 5, rowNumber: 0 },
            Prerequisite: { tableId: 6, rowNumber: 0 }
        },
        0
    );
    const nodeArray = new FakeRecord({}, { TalentNode0: { tableId: 3, rowNumber: 0 } }, 0);
    const subtree = new FakeRecord(
        {
            Name: "Tactician",
            Description: "Tactician ability tree",
            SubtreeArchetype: "Schemer",
            TalentTreeArchetype: "Schemer",
            TreeType: "Base",
            CanBeDominant: true,
            DominantPriority: 1,
            Version: 1
        },
        { OrderedTalentNodeList: { tableId: 2, rowNumber: 0 } },
        0
    );

    const tables = new Map([
        [1, table("TalentSubTree", 1, [subtree])],
        [2, table("TalentNode[]", 2, [nodeArray])],
        [3, table("TalentNode", 3, [node])],
        [4, table("Talent", 4, [talent])],
        [5, table("TalentTreeBranchInfo", 5, [branch])],
        [6, table("CoachTalentPrerequisiteGoal", 6, [prerequisite])]
    ]);
    return {
        gameYear: 27,
        getAllTablesByName(name) { return name === "TalentSubTree" ? [tables.get(1)] : []; },
        getTableById(id) { return tables.get(id) ?? null; }
    };
}

test("Tactician resolves to CFB27 internal Schemer tree index", () => {
    assert.equal(getCoachTalentTreeIndex("Tactician"), 1);
    assert.equal(getCoachTalentTreeIndex("Schemer"), 1);
    assert.equal(getCoachTalentTreeIndex("Program Builder"), 11);
});

test("live save coach talent catalog resolves names, costs, branches and prerequisites", async () => {
    const catalog = await buildCoachTalentCatalog(fakeFranchise());
    assert.equal(catalog.available, true);
    assert.equal(catalog.treeCount, 1);
    assert.equal(catalog.talentCount, 1);
    const tree = catalog.trees[1];
    assert.equal(tree.internalName, "Schemer");
    assert.equal(tree.displayName, "Tactician");
    assert.equal(tree.talents[0].name, "Quick Study");
    assert.equal(tree.talents[0].staffPointCost, 8);
    assert.equal(tree.talents[0].branch.title, "Quarterbacks");
    assert.equal(tree.talents[0].prerequisite.MinCoachLevel, 10);
});

test("named coach ability resolves to TalentStatus index", async () => {
    const catalog = await buildCoachTalentCatalog(fakeFranchise());
    const resolved = resolveCoachTalentIdentifier(catalog, "Tactician", "Quick Study");
    assert.equal(resolved.talentIndex, 0);
    assert.equal(resolved.talent.statusField, "TalentStatus0");
});

test("coach talent snapshot enrichment gives UI named abilities without raw-field knowledge", async () => {
    const catalog = await buildCoachTalentCatalog(fakeFranchise());
    const snapshot = {
        coachPoints: 25,
        trees: [{
            treeIndex: 1,
            treeName: "Schemer",
            available: true,
            unlocked: true,
            talents: [{ talentIndex: 0, field: "TalentStatus0", status: "Owned" }]
        }]
    };
    const enriched = enrichCoachTalentTreeSnapshot(snapshot, catalog);
    assert.equal(enriched.trees[0].displayName, "Tactician");
    const abilities = flattenCoachAbilities(enriched, { status: "Owned" });
    assert.equal(abilities.length, 1);
    assert.equal(abilities[0].name, "Quick Study");
    assert.equal(abilities[0].staffPointCost, 8);
});

test("base Motivator and advanced Master Motivator keep separate display identities", async () => {
    const catalog = await buildCoachTalentCatalog(fakeFranchise());
    const snapshot = {
        dominantArchetype: "MasterMotivator",
        trees: [
            { treeIndex: 0, treeName: "Motivator", available: true, talents: [] },
            { treeIndex: 3, treeName: "MasterMotivator", available: true, talents: [] }
        ]
    };

    const enriched = enrichCoachTalentTreeSnapshot(snapshot, catalog);
    assert.equal(enriched.trees[0].displayName, "Motivator");
    assert.equal(enriched.trees[0].treeIdentity.internalName, "Motivator");
    assert.equal(enriched.trees[0].isDominantArchetype, false);
    assert.equal(enriched.trees[1].displayName, "Master Motivator");
    assert.equal(enriched.trees[1].treeIdentity.internalName, "MasterMotivator");
    assert.equal(enriched.trees[1].isDominantArchetype, true);
    assert.equal(enriched.archetypeContext.treeIndex, 3);
    assert.equal(enriched.archetypeContext.displayName, "Master Motivator");
});

test("coach archetype context preserves unknown raw values instead of relabeling a tree", () => {
    const context = resolveCoachArchetypeContext({ dominantArchetype: "FutureArchetype" }, null);
    assert.equal(context.raw, "FutureArchetype");
    assert.equal(context.resolved, false);
    assert.equal(context.treeIndex, null);
    assert.equal(context.displayName, "Future Archetype");
});

test("unknown named coach ability fails instead of guessing an index", async () => {
    const catalog = await buildCoachTalentCatalog(fakeFranchise());
    assert.throws(
        () => resolveCoachTalentIdentifier(catalog, "Tactician", "Definitely Not An Ability"),
        /Unknown Tactician coach talent/
    );
});
