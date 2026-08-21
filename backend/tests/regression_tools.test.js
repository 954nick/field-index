// -------------------- REGRESSION / LOCAL PREP TOOL TESTS --------------------
import assert from "node:assert/strict";
import test from "node:test";
import { alternateEnum, nextInteger, parseArgs as parseRegressionArgs } from "../scripts/create_ingame_regression_saves.js";
import { parseArgs as parseLocalPrepArgs } from "../scripts/prepare_local_backend_data.js";

test("regression helper picks validated alternate enum and bounded numbers", () => {
    assert.equal(alternateEnum({ enumValues: ["A", "B", "C"] }, "A"), "B");
    assert.equal(alternateEnum({ enumValues: ["None", "Bronze"] }, "None", { blocked: ["None"] }), "Bronze");
    assert.equal(nextInteger(99, { minValue: 1, maxValue: 99 }, 1), 98);
    assert.equal(nextInteger(5, { minValue: 0, maxValue: 10 }, 1), 6);
});

test("regression generator CLI keeps head auto-build on by default", () => {
    const parsed = parseRegressionArgs(["DYNASTY-TEST", "--output-dir", "out"]);
    assert.equal(parsed.source, "DYNASTY-TEST");
    assert.equal(parsed.autoBuildHeads, true);
    assert.equal(parsed.outputDirectory, "out");
});

test("local backend preparation accepts one save plus optional asset roots", () => {
    const parsed = parseLocalPrepArgs([
        "--save", "DYNASTY-TEST",
        "--portrait-root", "portraits",
        "--recipe-root", "unique",
        "--recipe-root", "generic",
        "--deep-verify"
    ]);
    assert.equal(parsed.save, "DYNASTY-TEST");
    assert.equal(parsed.portraitRoot, "portraits");
    assert.deepEqual(parsed.recipeRoots, ["unique", "generic"]);
    assert.equal(parsed.deepVerify, true);
});

test("regression generator supports memory-safe phase selection", () => {
    const parsed = parseRegressionArgs([
        "DYNASTY-TEST",
        "--only-labels", "PLYR,DEPTH",
        "--skip-backup-test",
        "--report-path", "phase.json"
    ]);
    assert.deepEqual([...parsed.onlyLabels], ["PLYR", "DEPTH"]);
    assert.equal(parsed.skipBackupTest, true);
    assert.equal(parsed.reportPath, "phase.json");
});
