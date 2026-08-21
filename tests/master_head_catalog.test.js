// -------------------- BUNDLED CFB27 MASTER HEAD CATALOG TESTS --------------------

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HeadCatalog } from "../parser/head_catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "assets", "mappings", "head_catalog.json");

test("bundled CFB27 Head catalog contains complete unique and generic baseline", () => {
    const catalog = HeadCatalog.load(catalogPath, { allowMissing: false });
    const counts = catalog.counts;
    assert.equal(counts.total, 13481);
    assert.equal(counts.unique, 9011);
    assert.equal(counts.generic, 4470);
    assert.equal(counts.usable, 13481);
    assert.equal(counts.missing_portrait, 0);
    assert.equal(counts.incomplete, 0);

    assert.equal(catalog.profileFor("unique:107").headType, "unique");
    assert.equal(catalog.profileFor("generic:1").headType, "generic");
});
