// -------------------- MEMORY-SAFE REGRESSION SUITE TESTS --------------------

import assert from "node:assert/strict";
import test from "node:test";
import { mergeReports, parseArgs } from "../scripts/create_ingame_regression_suite.js";

test("memory-safe suite parses cache and CFP controls", () => {
    const parsed = parseArgs([
        "DYNASTY-TEST",
        "--output-dir", "out",
        "--no-head-auto-build",
        "--skip-cfp-test"
    ]);
    assert.equal(parsed.source, "DYNASTY-TEST");
    assert.equal(parsed.outputDirectory, "out");
    assert.equal(parsed.noHeadAutoBuild, true);
    assert.equal(parsed.skipCfpTest, true);
});

test("memory-safe suite merges phase reports without retaining editor objects", () => {
    const merged = mergeReports([
        {
            outputs: [{ label: "PLYR", outputPath: "DYNASTY-FI-PLYR" }],
            skipped: [],
            expectations: [{ label: "PLYR", checks: [] }],
            automatedBackupRegression: { status: "skipped" },
            localPreparation: null
        },
        {
            outputs: [{ label: "G2U", outputPath: "DYNASTY-FI-G2U" }],
            skipped: [],
            expectations: [{ label: "G2U", checks: [] }],
            headTargets: { example: true },
            automatedBackupRegression: { status: "skipped" },
            localPreparation: null
        },
        {
            outputs: [],
            skipped: [],
            expectations: [],
            automatedBackupRegression: { status: "passed" },
            localPreparation: null
        }
    ], "DYNASTY-SOURCE", "SAVES");

    assert.equal(merged.memorySafePhases, true);
    assert.equal(merged.counts.generatedSaves, 2);
    assert.equal(merged.automatedBackupRegression.status, "passed");
    assert.deepEqual(merged.headTargets, { example: true });
});
