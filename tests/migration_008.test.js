// -------------------- MIGRATION 008 CONTRACT TESTS --------------------
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "database", "migrations", "008_recruiting_class_rankings.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("migration 008 is one explicit transaction", () => {
    assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1);
    assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1);
});

test("migration 008 stores EA recruiting class ranking fields", () => {
    for (const column of [
        "recruiting_class_rank",
        "recruiting_class_conference_rank",
        "recruit_program_points_spent",
        "last_week_committed_recruits"
    ]) {
        assert.match(sql, new RegExp(`ADD COLUMN ${column}\\b`, "i"));
    }
});

test("migration 008 exposes analytics and BI recruiting ranking views", () => {
    for (const view of [
        "analytics.recruiting_class_ranking_history",
        "analytics.latest_recruiting_class_rankings",
        "bi.fact_recruiting_class_ranking",
        "bi.current_recruiting_class_ranking"
    ]) {
        assert.ok(sql.toLowerCase().includes(`create view ${view}`));
    }
});

test("migration 008 contains no unresolved generated placeholders", () => {
    assert.doesNotMatch(sql, /\bTODO\b/i);
    assert.doesNotMatch(sql, /\bFIXME\b/i);
});

test("team import SQL persists recruiting class ranking fields", () => {
    const importer = fs.readFileSync(path.join(root, "database", "lib", "build_import_sql.js"), "utf8");
    for (const field of [
        "team.recruitingClassRank",
        "team.recruitingClassConferenceRank",
        "team.recruitProgramPointsSpent",
        "team.lastWeekCommittedRecruits",
        "recruiting_class_rank",
        "recruiting_class_conference_rank"
    ]) {
        assert.ok(importer.includes(field), `missing import mapping: ${field}`);
    }
});
