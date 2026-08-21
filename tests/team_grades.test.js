import test from "node:test";
import assert from "node:assert/strict";
import {
    MY_SCHOOL_DISPLAY_GRADE_ALIASES,
    resolveFlatTeamGradeTarget
} from "../parser/editor.js";

test("Stadium Atmosphere display alias routes to the game-verified My School authority", () => {
    assert.equal(MY_SCHOOL_DISPLAY_GRADE_ALIASES.stadiumAtmosphere, "StadiumAtmosphereGrade");
    assert.deepEqual(resolveFlatTeamGradeTarget("stadiumAtmosphere"), {
        group: "mySchool",
        field: "StadiumAtmosphereGrade"
    });
});

test("legacy non-verified program-point aliases still resolve to their raw Team fields", () => {
    assert.deepEqual(resolveFlatTeamGradeTarget("budget"), {
        group: "programPoints",
        field: "ProgramPointsBudgetGrade"
    });
    assert.equal(resolveFlatTeamGradeTarget("notARealGrade"), null);
});
