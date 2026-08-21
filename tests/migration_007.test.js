// -------------------- MIGRATION 007 CONTRACT TESTS --------------------
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, "../database/migrations/007_extended_dynasty_history.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

const TABLES = [
    "player_identity_observations",
    "ranking_snapshots",
    "recruiting_prospects",
    "recruiting_prospect_snapshots",
    "recruiting_board_snapshots",
    "recruiting_team_interest_snapshots",
    "depth_chart_snapshots",
    "postseason_import_snapshots",
    "award_snapshots"
];

const ANALYTICS_VIEWS = [
    "ranking_history",
    "recruiting_history",
    "recruiting_roster_matches",
    "recruiting_classes",
    "depth_chart_history",
    "postseason_history",
    "postseason_games",
    "championship_history",
    "award_history"
];

const BI_VIEWS = [
    "fact_ranking_snapshot",
    "fact_recruiting_prospect",
    "fact_recruiting_class",
    "fact_recruiting_roster_match",
    "fact_depth_chart",
    "fact_postseason",
    "fact_postseason_game",
    "fact_championship",
    "fact_award"
];

test("migration 007 is one explicit transaction", () => {
    assert.match(sql, /^--[\s\S]*?\bBEGIN;\s/m);
    assert.match(sql, /\bCOMMIT;\s*$/m);
    assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1);
    assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1);
});

test("migration 007 creates every extended-history table exactly once", () => {
    for (const table of TABLES) {
        const matches = sql.match(new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, "g")) ?? [];
        assert.equal(matches.length, 1, table);
    }
});

test("migration 007 exposes matching analytics and BI history views", () => {
    for (const view of ANALYTICS_VIEWS) {
        assert.match(sql, new RegExp(`CREATE VIEW\\s+analytics\\.${view}\\s+AS`, "g"), view);
    }
    for (const view of BI_VIEWS) {
        assert.match(sql, new RegExp(`CREATE VIEW\\s+bi\\.${view}\\s+AS`, "g"), view);
    }
});

test("migration 007 contains no unresolved generated placeholders", () => {
    assert.doesNotMatch(sql, /\bundefined\b/);
    assert.doesNotMatch(sql, /\bTODO\b/i);
    assert.doesNotMatch(sql, /\bFIXME\b/i);
});
