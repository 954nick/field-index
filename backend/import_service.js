// -------------------- DYNASTY IMPORT SERVICE --------------------

import path from "node:path";
import { importSave } from "../database/import_save.js";
import { slugify } from "./lib/slug.js";

function normalizeDynastyKey(value) {
    const key = slugify(value).replace(/_/g, "-").slice(0, 64);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(key)) {
        throw new Error("Dynasty key must resolve to 2-64 letters, numbers, underscores, or hyphens");
    }
    return key;
}

function suggestDynastyKey(displayName) {
    return normalizeDynastyKey(displayName || "dynasty");
}

async function importDynasty(savePath, options = {}) {
    const dynastyName = String(options.dynastyName ?? "").trim();
    if (!dynastyName) {
        throw new Error("importDynasty requires dynastyName the first time a dynasty is registered");
    }
    const dynastyKey = options.dynastyKey
        ? normalizeDynastyKey(options.dynastyKey)
        : suggestDynastyKey(dynastyName);

    return importSave({
        savePath: path.resolve(savePath),
        dynastyKey,
        dynastyName,
        dryRun: options.dryRun === true,
        sqlOut: options.sqlOut ?? null,
        skipMigrations: options.skipMigrations === true,
        forceReimport: options.forceReimport === true,
        skipVerify: options.skipDatabaseVerification === true
    });
}

export {
    importDynasty,
    normalizeDynastyKey,
    suggestDynastyKey
};
