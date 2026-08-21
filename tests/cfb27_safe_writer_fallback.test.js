import test from "node:test";
import assert from "node:assert/strict";
import { compressEditedChunkToFit } from "../parser/cfb27_safe_writer.js";

test("edited CFB27 compression keeps EA level 6 when it fits", () => {
    const calls = [];
    const result = compressEditedChunkToFit(Buffer.from("edited"), 100, (_input, level) => {
        calls.push(level);
        return { compressed: Buffer.alloc(level === 6 ? 99 : 80), detail: `fake-${level}` };
    });

    assert.equal(result.level, 6);
    assert.deepEqual(calls, [6]);
    assert.deepEqual(result.attempts.map(attempt => [attempt.level, attempt.size]), [[6, 99]]);
});

test("edited CFB27 compression falls forward to the lowest classic-zlib level that fits", () => {
    const sizes = new Map([[6, 105], [7, 95], [8, 90], [9, 85]]);
    const calls = [];
    const result = compressEditedChunkToFit(Buffer.from("edited"), 100, (_input, level) => {
        calls.push(level);
        return { compressed: Buffer.alloc(sizes.get(level)), detail: `fake-${level}` };
    });

    assert.equal(result.level, 7);
    assert.deepEqual(calls, [6, 7]);
    assert.deepEqual(result.attempts.map(attempt => [attempt.level, attempt.size]), [[6, 105], [7, 95]]);
});
