// -------------------- MIGRATION 009 CONTRACT TESTS --------------------
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "database", "migrations", "009_coach_talent_history.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("migration 009 is one explicit transaction", () => {
    assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1);
    assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1);
});

test("migration 009 stores coach tree state and named ability metadata", () => {
    for (const token of [
        "coach_talent_tree_snapshots", "coach_talent_node_snapshots", "tree_description",
        "ability_name", "ability_description", "staff_point_cost", "prerequisite_json"
    ]) assert.ok(sql.includes(token), `missing ${token}`);
});

test("migration 009 exposes analytics and BI coach talent views", () => {
    for (const view of [
        "analytics.coach_talent_tree_history", "analytics.coach_talent_node_history",
        "analytics.latest_coach_talent_nodes", "bi.fact_coach_talent_tree",
        "bi.fact_coach_talent_node", "bi.current_coach_talent_node"
    ]) assert.ok(sql.toLowerCase().includes(`create view ${view}`));
});

test("migration 009 contains no unresolved placeholders", () => {
    assert.doesNotMatch(sql, /\bTODO\b/i);
    assert.doesNotMatch(sql, /\bFIXME\b/i);
});


test("migration 009 uses the canonical teams.school_name column", () => {
    assert.doesNotMatch(sql, /\bt\.display_name\b/);
    assert.equal((sql.match(/t\.school_name AS team_name/g) ?? []).length, 2);
});
