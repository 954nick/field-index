// -------------------- HEAD ID CATALOG BUILDER --------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Franchise from "madden-franchise";
import { getPlayerHeadProfile, getPlayerHeadProfilesBatch } from "./character_visuals.js";
import {
    DEFAULT_HEAD_CATALOG_PATH,
    createEmptyHeadCatalog,
    detectHeadIdentity,
    inferGenericHeadProfile,
    mergeCatalogEntries,
    normalizeCatalogEntry,
    readHeadCatalog,
    writeHeadCatalog
} from "./head_catalog.js";
import { TABLE_IDS } from "./table_ids.js";

const PARSER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_DIRECTORY = fileURLToPath(new URL("./schemas/", import.meta.url));

function usage() {
    console.log(`Field Index Head ID catalog builder

Usage:
  node build_head_catalog.js --save "C:\\path\\to\\DYNASTY-SAVE"
  node build_head_catalog.js --recipe-root "C:\\path\\to\\exported\\heads"
  node build_head_catalog.js --recipe-list "C:\\path\\to\\head_asset_paths.txt"

Options:
  --save <path>          Add complete Head ID profiles observed in a CFB27 save. Repeatable.
  --recipe-root <path>   Scan exported HeadstartRecipe filenames/paths. Repeatable.
  --recipe-list <path>   Scan a text/JSON list of HeadstartRecipe paths. Repeatable.
  --portrait-index <p>   Optional Field Index portrait index JSON for portrait asset paths.
  --output <path>        Catalog output. Default: assets/mappings/head_catalog.json
  --replace              Start a new catalog instead of merging the existing catalog.
  --deep-verify          Decode every duplicate player using a Head ID and fail on profile conflicts.
  --help                 Show this help.
`);
}

function parseArgs(argv) {
    const options = {
        saves: [],
        recipeRoots: [],
        recipeLists: [],
        portraitIndex: null,
        output: DEFAULT_HEAD_CATALOG_PATH,
        replace: false,
        deepVerify: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => {
            const next = argv[index + 1];
            if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
            index += 1;
            return next;
        };

        if (arg === "--save") options.saves.push(value());
        else if (arg === "--recipe-root") options.recipeRoots.push(value());
        else if (arg === "--recipe-list") options.recipeLists.push(value());
        else if (arg === "--portrait-index") options.portraitIndex = value();
        else if (arg === "--output") options.output = value();
        else if (arg === "--replace") options.replace = true;
        else if (arg === "--deep-verify") options.deepVerify = true;
        else if (arg === "--help" || arg === "-h") options.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return options;
}

function clone(value) {
    return structuredClone(value);
}

function addSource(catalog, source) {
    const fingerprint = JSON.stringify(source);
    if (!(catalog.sources ?? []).some(existing => JSON.stringify(existing) === fingerprint)) {
        catalog.sources.push(source);
    }
}

function catalogMap(catalog) {
    return new Map((catalog.heads ?? []).map(entry => [entry.canonical_key, normalizeCatalogEntry(entry)]));
}

function mergeIntoMap(entries, incoming) {
    const normalized = normalizeCatalogEntry(incoming);
    const existing = entries.get(normalized.canonical_key);
    entries.set(
        normalized.canonical_key,
        existing ? mergeCatalogEntries(existing, normalized) : normalized
    );
}

function recipeNameFromText(text) {
    const clean = String(text ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (!clean) return null;

    const base = clean.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? clean;
    const withoutItem = base.replace(/_item$/i, "");
    if (/^Generic_\d+(?:_[A-Za-z0-9]+)+$/i.test(withoutItem)) return withoutItem;
    if (/^Unique_.+_\d+$/i.test(withoutItem)) return withoutItem;
    return null;
}

function skeletonFromRecipe(recipeName, sourcePath = null) {
    const identity = detectHeadIdentity({ genericHeadAssetName: recipeName });
    if (!identity.canonicalKey) return null;

    return {
        head_id: identity.headId,
        canonical_key: identity.canonicalKey,
        head_type: identity.headType,
        asset_name: identity.headType === "unique" ? recipeName.replace(/^Unique_/i, "") : "",
        generic_head_asset_name: recipeName,
        portrait_id: null,
        skin_tone: null,
        head_layer: { plus_head_elements: [] },
        profile_complete: false,
        source_display_names: [],
        source_player_rows: [],
        recipe_asset_path: sourcePath,
        portrait_asset_path: null,
        notes: ["Recipe discovered from local Frosty/exported head assets; in-game profile state not captured yet"]
    };
}

function walkFiles(rootPath) {
    const files = [];
    const stack = [path.resolve(rootPath)];
    while (stack.length > 0) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
        } else if (stat.isFile()) {
            files.push(current);
        }
    }
    return files;
}

function scanRecipeRoot(rootPath, entries) {
    const resolvedRoot = path.resolve(rootPath);
    if (!fs.existsSync(resolvedRoot)) throw new Error(`Recipe root does not exist: ${resolvedRoot}`);
    let discovered = 0;
    for (const filePath of walkFiles(resolvedRoot)) {
        const recipeName = recipeNameFromText(filePath);
        if (!recipeName) continue;
        const relativePath = path.relative(resolvedRoot, filePath).split(path.sep).join("/");
        const entry = skeletonFromRecipe(recipeName, relativePath);
        if (!entry) continue;
        mergeIntoMap(entries, entry);
        discovered += 1;
    }
    return discovered;
}

function flattenJsonStrings(value, output = []) {
    if (typeof value === "string") output.push(value);
    else if (Array.isArray(value)) value.forEach(item => flattenJsonStrings(item, output));
    else if (value && typeof value === "object") Object.values(value).forEach(item => flattenJsonStrings(item, output));
    return output;
}

function scanRecipeList(listPath, entries) {
    const resolvedPath = path.resolve(listPath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Recipe list does not exist: ${resolvedPath}`);
    const text = fs.readFileSync(resolvedPath, "utf8");
    let lines;
    try {
        lines = flattenJsonStrings(JSON.parse(text));
    } catch {
        lines = text.split(/\r?\n/);
    }

    let discovered = 0;
    for (const line of lines) {
        const recipeName = recipeNameFromText(line);
        if (!recipeName) continue;
        const entry = skeletonFromRecipe(recipeName, String(line).trim());
        if (!entry) continue;
        mergeIntoMap(entries, entry);
        discovered += 1;
    }
    return discovered;
}

function loadPortraitIndex(indexPath) {
    if (!indexPath) return new Map();
    const resolvedPath = path.resolve(indexPath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Portrait index does not exist: ${resolvedPath}`);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    const map = new Map();

    const entries = raw.portraits ?? raw.assets ?? raw.entries ?? [];
    for (const entry of entries) {
        const portraitId = Number(entry.portrait_id ?? entry.portraitId ?? entry.id);
        const assetPath = entry.asset_path ?? entry.assetPath ?? entry.path ?? null;
        if (Number.isSafeInteger(portraitId) && assetPath) map.set(portraitId, assetPath);
    }
    return map;
}

function entryFromProfile(profile, sourceRecord, portraitIndex) {
    if (!profile.canonicalKey || !profile.headId || profile.headType === "unknown") return null;
    const portraitId = profile.portrait === null || profile.portrait === undefined
        ? null
        : Number(profile.portrait);

    return {
        head_id: profile.headId,
        canonical_key: profile.canonicalKey,
        head_type: profile.headType,
        asset_name: profile.assetName ?? "",
        generic_head_asset_name: profile.genericHeadAssetName ?? "",
        portrait_id: Number.isSafeInteger(portraitId) ? portraitId : null,
        skin_tone: clone(profile.skinTone),
        head_layer: { plus_head_elements: clone(profile.plusHeadElements ?? []) },
        profile_complete: Boolean(
            profile.genericHeadAssetName
            && profile.skinTone !== null
            && profile.skinTone !== undefined
            && (profile.headType === "generic" || profile.assetName)
        ),
        source_display_names: [profile.sourcePlayerName].filter(Boolean),
        source_player_rows: [profile.sourcePlayerRow].filter(value => value !== null && value !== undefined),
        recipe_asset_path: null,
        portrait_asset_path: portraitIndex.get(portraitId) ?? null,
        notes: [sourceRecord]
    };
}

function scalarSignature(record) {
    return JSON.stringify({
        assetName: record.PLYR_ASSETNAME,
        genericHeadAssetName: record.GenericHeadAssetName,
        portrait: record.PLYR_PORTRAIT
    });
}

// -------------------- CHARACTER VISUALS PROFILE SELECTION --------------------
function hasCharacterVisualsReference(record) {
    try {
        const reference = record?.getReferenceDataByKey?.("CharacterVisuals");
        return Boolean(reference && reference.tableId !== 0);
    } catch {
        return false;
    }
}

function isSkippableVisualProfileError(error) {
    const message = String(error?.message ?? error ?? "");
    return /no CharacterVisuals reference/i.test(message)
        || /no CharacterVisuals Head loadout/i.test(message)
        || /CharacterVisuals row .* was not found/i.test(message)
        || /CharacterVisuals RawData table3 field is unavailable/i.test(message)
        || /CharacterVisuals zstd frame magic was not found/i.test(message)
        || /CharacterVisuals compressed frame is truncated/i.test(message);
}

async function captureHeadProfileFromRecords(franchise, records, options = {}) {
    const profileLoader = options.profileLoader ?? getPlayerHeadProfile;
    let missingReferenceRows = 0;
    let unusableVisualRows = 0;
    const skipped = [];

    for (const record of records) {
        if (!hasCharacterVisualsReference(record)) {
            missingReferenceRows += 1;
            skipped.push({ row: record?.index ?? null, reason: "missing CharacterVisuals reference" });
            continue;
        }

        try {
            const profile = await profileLoader(franchise, record);
            return {
                profile,
                representative: record,
                missingReferenceRows,
                unusableVisualRows,
                skipped
            };
        } catch (error) {
            if (!isSkippableVisualProfileError(error)) throw error;
            unusableVisualRows += 1;
            skipped.push({ row: record?.index ?? null, reason: String(error.message ?? error) });
        }
    }

    return {
        profile: null,
        representative: records[0] ?? null,
        missingReferenceRows,
        unusableVisualRows,
        skipped
    };
}

function incompleteEntryFromRecords(records, canonicalKey, reason) {
    const representative = records[0];
    const identity = detectHeadIdentity(representative);
    return {
        head_id: identity.headId,
        canonical_key: identity.canonicalKey ?? canonicalKey,
        head_type: identity.headType,
        asset_name: representative?.PLYR_ASSETNAME ?? "",
        generic_head_asset_name: representative?.GenericHeadAssetName ?? "",
        portrait_id: Number.isSafeInteger(Number(representative?.PLYR_PORTRAIT))
            ? Number(representative.PLYR_PORTRAIT)
            : null,
        skin_tone: null,
        head_layer: { plus_head_elements: [] },
        profile_complete: false,
        source_display_names: records.map(record => `${record.FirstName ?? ""} ${record.LastName ?? ""}`.trim()).filter(Boolean),
        source_player_rows: records.map(record => record.index).filter(value => value !== null && value !== undefined),
        recipe_asset_path: null,
        portrait_asset_path: null,
        notes: [reason]
    };
}

function sourceNames(records) {
    return records
        .map(record => `${record.FirstName ?? ""} ${record.LastName ?? ""}`.trim())
        .filter(Boolean);
}

function sourceRows(records) {
    return records
        .map(record => record.index)
        .filter(value => value !== null && value !== undefined);
}

function uniqueExpectedAssetName(genericHeadAssetName) {
    return String(genericHeadAssetName ?? "").replace(/^Unique_/i, "");
}

function profileCandidateScore(record, expectedAssetName = "") {
    let score = 0;
    if (hasCharacterVisualsReference(record)) score += 10;
    if (expectedAssetName && String(record?.PLYR_ASSETNAME ?? "") === expectedAssetName) score += 5;
    if (String(record?.PLYR_ASSETNAME ?? "").trim()) score += 2;
    if (Number.isSafeInteger(Number(record?.PLYR_PORTRAIT))) score += 1;
    return score;
}

function modeInteger(values) {
    const counts = new Map();
    for (const value of values) {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) continue;
        counts.set(number, (counts.get(number) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

function genericEntryFromRecords(records, identity, portraitIndex) {
    const inferred = inferGenericHeadProfile(identity.genericHeadAssetName);
    if (!inferred || inferred.headId !== identity.headId) return null;

    return {
        head_id: identity.headId,
        canonical_key: identity.canonicalKey,
        head_type: "generic",
        asset_name: "",
        generic_head_asset_name: identity.genericHeadAssetName,
        portrait_id: inferred.portraitId,
        skin_tone: inferred.skinTone,
        head_layer: { plus_head_elements: clone(inferred.plusHeadElements) },
        profile_complete: true,
        source_display_names: sourceNames(records),
        source_player_rows: sourceRows(records),
        recipe_asset_path: null,
        portrait_asset_path: portraitIndex.get(inferred.portraitId) ?? null,
        notes: [
            "Generic CFB27 head profile inferred from canonical HeadstartRecipe name; "
            + "portrait ID equals numeric Head ID and PlusHead/skin tone are deterministic."
        ]
    };
}

async function scanSave(savePath, entries, portraitIndex, options = {}) {
    const resolvedPath = path.resolve(savePath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Dynasty save does not exist: ${resolvedPath}`);

    const franchise = await Franchise.create(resolvedPath, { schemaDirectory: DEFAULT_SCHEMA_DIRECTORY });
    if (franchise.gameType !== "college" || franchise.gameYear !== 27) {
        throw new Error(`Head catalog builder requires a CFB27 Dynasty save: ${resolvedPath}`);
    }

    const playerTable = franchise.getTableByUniqueId(TABLE_IDS.Player);
    await playerTable.readRecords();

    const groups = new Map();
    let unknown = 0;
    for (const record of playerTable.records) {
        if (record.isEmpty) continue;
        const identity = detectHeadIdentity(record);
        if (!identity.canonicalKey) {
            unknown += 1;
            continue;
        }
        const group = groups.get(identity.canonicalKey) ?? [];
        group.push(record);
        groups.set(identity.canonicalKey, group);
    }

    let completed = 0;
    let conflicts = 0;
    let processed = 0;
    let missingVisualRows = 0;
    let unusableVisualRows = 0;
    let incompleteVisualGroups = 0;
    const pendingUnique = [];

    // First pass: generic heads are deterministic and already-complete unique
    // profiles are retained. Only unresolved unique heads enter the bulk decoder.
    for (const [canonicalKey, records] of groups) {
        processed += 1;
        const identity = detectHeadIdentity(records[0]);

        if (identity.headType === "generic") {
            const entry = genericEntryFromRecords(records, identity, portraitIndex);
            if (entry) {
                mergeIntoMap(entries, entry);
                completed += 1;
            } else {
                incompleteVisualGroups += 1;
                mergeIntoMap(entries, incompleteEntryFromRecords(
                    records,
                    canonicalKey,
                    `Generic HeadstartRecipe could not be interpreted for ${canonicalKey}`
                ));
            }
            continue;
        }

        const existing = entries.get(canonicalKey);
        if (existing?.profile_complete && !options.deepVerify) {
            mergeIntoMap(entries, {
                ...existing,
                source_display_names: [...new Set([...(existing.source_display_names ?? []), ...sourceNames(records)])],
                source_player_rows: [...new Set([...(existing.source_player_rows ?? []), ...sourceRows(records)])]
            });
            completed += 1;
            continue;
        }

        const expectedAssetName = uniqueExpectedAssetName(identity.genericHeadAssetName);
        const orderedRecords = [...records].sort(
            (a, b) => profileCandidateScore(b, expectedAssetName) - profileCandidateScore(a, expectedAssetName)
        );
        const portraitValues = [...new Set(
            orderedRecords
                .map(record => Number(record.PLYR_PORTRAIT))
                .filter(value => Number.isSafeInteger(value) && value >= 0)
        )];
        if (portraitValues.length > 1) conflicts += 1;

        pendingUnique.push({
            canonicalKey,
            records,
            identity,
            expectedAssetName,
            orderedRecords,
            portraitValues
        });
    }

    const batchSize = Math.max(1, Number(options.bulkBatchSize ?? 250));
    let uniqueProcessed = 0;

    async function commitCaptured(item, captured) {
        missingVisualRows += captured.missingReferenceRows ?? 0;
        unusableVisualRows += captured.unusableVisualRows ?? 0;

        if (!captured.profile) {
            incompleteVisualGroups += 1;
            const incomplete = incompleteEntryFromRecords(
                item.records,
                item.canonicalKey,
                `No usable CharacterVisuals profile was found for ${item.canonicalKey}; `
                + `${captured.missingReferenceRows ?? 0} row(s) lacked a CharacterVisuals reference and `
                + `${captured.unusableVisualRows ?? 0} row(s) had unusable visual data. Runtime use is disabled until a complete profile is captured.`
            );
            incomplete.asset_name = item.expectedAssetName;
            incomplete.portrait_id = modeInteger(item.records.map(record => record.PLYR_PORTRAIT));
            mergeIntoMap(entries, incomplete);
            return;
        }

        const representative = captured.representative;
        const profile = captured.profile;
        profile.assetName = item.expectedAssetName || profile.assetName;
        if (profile.portrait === null || profile.portrait === undefined) {
            profile.portrait = modeInteger(item.records.map(record => record.PLYR_PORTRAIT));
        }
        const entry = entryFromProfile(
            profile,
            `Observed in CFB27 save ${path.basename(resolvedPath)}`,
            portraitIndex
        );
        if (!entry) return;

        entry.asset_name = item.expectedAssetName || entry.asset_name;
        entry.source_display_names = sourceNames(item.records);
        entry.source_player_rows = sourceRows(item.records);
        if (item.portraitValues.length > 1) {
            entry.notes.push(
                `Multiple player-specific portrait values were observed for ${item.canonicalKey}; `
                + `selected portrait ${entry.portrait_id} from the preferred live profile.`
            );
        }
        if ((captured.missingReferenceRows ?? 0) > 0 || (captured.unusableVisualRows ?? 0) > 0) {
            entry.notes.push(
                `Profile captured from player row ${representative.index}; skipped `
                + `${captured.missingReferenceRows ?? 0} row(s) without CharacterVisuals and `
                + `${captured.unusableVisualRows ?? 0} row(s) with unusable visual data for the same Head ID.`
            );
        }

        if (options.deepVerify && item.records.length > 1) {
            const expected = JSON.stringify({ skinTone: profile.skinTone });
            for (const duplicate of item.orderedRecords) {
                if (duplicate === representative || !hasCharacterVisualsReference(duplicate)) continue;
                let duplicateProfile;
                try {
                    duplicateProfile = await getPlayerHeadProfile(franchise, duplicate);
                } catch (error) {
                    if (isSkippableVisualProfileError(error)) continue;
                    throw error;
                }
                const actual = JSON.stringify({ skinTone: duplicateProfile.skinTone });
                if (actual !== expected) {
                    throw new Error(
                        `${item.canonicalKey} has conflicting CharacterVisuals skin tone state between player rows `
                        + `${representative.index} and ${duplicate.index}`
                    );
                }
            }
        }

        mergeIntoMap(entries, entry);
        completed += 1;
    }

    for (let offset = 0; offset < pendingUnique.length; offset += batchSize) {
        const chunk = pendingUnique.slice(offset, offset + batchSize);
        const bulkItems = [];
        const fallbackItems = [];

        for (const item of chunk) {
            const representative = item.orderedRecords.find(hasCharacterVisualsReference) ?? null;
            if (representative) bulkItems.push({ item, representative });
            else fallbackItems.push(item);
        }

        if (bulkItems.length > 0) {
            try {
                const profiles = await getPlayerHeadProfilesBatch(
                    franchise,
                    bulkItems.map(value => value.representative)
                );
                for (let index = 0; index < bulkItems.length; index += 1) {
                    const value = bulkItems[index];
                    await commitCaptured(value.item, {
                        profile: profiles[index],
                        representative: value.representative,
                        missingReferenceRows: 0,
                        unusableVisualRows: 0,
                        skipped: []
                    });
                }
            } catch (error) {
                // A malformed row should not poison the whole batch. Fall back to
                // the proven per-record decoder for this small chunk only.
                for (const value of bulkItems) {
                    const captured = await captureHeadProfileFromRecords(franchise, value.item.orderedRecords);
                    await commitCaptured(value.item, captured);
                }
            }
        }

        for (const item of fallbackItems) {
            const captured = await captureHeadProfileFromRecords(franchise, item.orderedRecords);
            await commitCaptured(item, captured);
        }

        uniqueProcessed += chunk.length;
        const totalProcessed = groups.size - pendingUnique.length + uniqueProcessed;
        if (uniqueProcessed % 500 < chunk.length || uniqueProcessed === pendingUnique.length) {
            console.log(`  Captured ${totalProcessed}/${groups.size} distinct Head IDs...`);
        }
    }

    return {
        savePath: resolvedPath,
        playerRows: playerTable.records.filter(record => !record.isEmpty).length,
        distinctHeadIds: groups.size,
        completeProfiles: completed,
        scalarConflicts: conflicts,
        unknownHeadRows: unknown,
        missingVisualRows,
        unusableVisualRows,
        incompleteVisualGroups
    };
}

async function buildHeadCatalog(options = {}) {
    const resolvedOptions = {
        saves: Array.isArray(options.saves) ? options.saves : options.save ? [options.save] : [],
        recipeRoots: Array.isArray(options.recipeRoots) ? options.recipeRoots : [],
        recipeLists: Array.isArray(options.recipeLists) ? options.recipeLists : [],
        portraitIndex: options.portraitIndex ?? null,
        output: options.output ?? DEFAULT_HEAD_CATALOG_PATH,
        replace: options.replace === true,
        deepVerify: options.deepVerify === true
    };
    if (resolvedOptions.saves.length + resolvedOptions.recipeRoots.length + resolvedOptions.recipeLists.length === 0) {
        throw new Error("Provide at least one save, recipe root, or recipe list source");
    }

    const existing = resolvedOptions.replace
        ? { catalog: createEmptyHeadCatalog(), exists: false }
        : readHeadCatalog(resolvedOptions.output, { allowMissing: true });
    const catalog = clone(existing.catalog);
    const entries = catalogMap(catalog);
    const portraitIndex = loadPortraitIndex(resolvedOptions.portraitIndex);
    const results = { recipeRoots: [], recipeLists: [], saves: [] };

    for (const recipeRoot of resolvedOptions.recipeRoots) {
        const count = scanRecipeRoot(recipeRoot, entries);
        addSource(catalog, { type: "head_recipe_root", source_name: path.basename(path.resolve(recipeRoot)), discovered: count });
        results.recipeRoots.push({ path: path.resolve(recipeRoot), discovered: count });
    }
    for (const recipeList of resolvedOptions.recipeLists) {
        const count = scanRecipeList(recipeList, entries);
        addSource(catalog, { type: "head_recipe_list", source_name: path.basename(path.resolve(recipeList)), discovered: count });
        results.recipeLists.push({ path: path.resolve(recipeList), discovered: count });
    }
    for (const savePath of resolvedOptions.saves) {
        const result = await scanSave(savePath, entries, portraitIndex, { deepVerify: resolvedOptions.deepVerify });
        addSource(catalog, {
            type: "cfb27_save",
            source_name: path.basename(result.savePath),
            distinct_head_ids: result.distinctHeadIds,
            complete_profiles: result.completeProfiles,
            scalar_conflicts: result.scalarConflicts,
            unknown_head_rows: result.unknownHeadRows,
            missing_visual_rows: result.missingVisualRows,
            unusable_visual_rows: result.unusableVisualRows,
            incomplete_visual_groups: result.incompleteVisualGroups
        });
        results.saves.push(result);
    }

    catalog.heads = [...entries.values()];
    const written = writeHeadCatalog(catalog, resolvedOptions.output);
    return { ...written, results };
}

// -------------------- MAIN --------------------
async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return;
    }
    if (options.saves.length + options.recipeRoots.length + options.recipeLists.length === 0) {
        usage();
        throw new Error("Provide at least one --save, --recipe-root, or --recipe-list source");
    }

    const existing = options.replace
        ? { catalog: createEmptyHeadCatalog(), exists: false }
        : readHeadCatalog(options.output, { allowMissing: true });
    const catalog = clone(existing.catalog);
    const entries = catalogMap(catalog);
    const portraitIndex = loadPortraitIndex(options.portraitIndex);

    for (const recipeRoot of options.recipeRoots) {
        const count = scanRecipeRoot(recipeRoot, entries);
        addSource(catalog, { type: "head_recipe_root", source_name: path.basename(path.resolve(recipeRoot)), discovered: count });
        console.log(`Scanned ${count} HeadstartRecipe files from ${recipeRoot}`);
    }

    for (const recipeList of options.recipeLists) {
        const count = scanRecipeList(recipeList, entries);
        addSource(catalog, { type: "head_recipe_list", source_name: path.basename(path.resolve(recipeList)), discovered: count });
        console.log(`Scanned ${count} HeadstartRecipe entries from ${recipeList}`);
    }

    for (const savePath of options.saves) {
        console.log(`Reading Head ID profiles from ${savePath}`);
        const result = await scanSave(savePath, entries, portraitIndex, { deepVerify: options.deepVerify });
        addSource(catalog, {
            type: "cfb27_save",
            source_name: path.basename(result.savePath),
            distinct_head_ids: result.distinctHeadIds,
            complete_profiles: result.completeProfiles,
            scalar_conflicts: result.scalarConflicts,
            unknown_head_rows: result.unknownHeadRows,
            missing_visual_rows: result.missingVisualRows,
            unusable_visual_rows: result.unusableVisualRows,
            incomplete_visual_groups: result.incompleteVisualGroups
        });
        console.log(
            `Captured ${result.completeProfiles} complete profiles from ${result.distinctHeadIds} distinct Head IDs `
            + `(${result.scalarConflicts} conflicts, ${result.unknownHeadRows} unknown-format rows, `
            + `${result.missingVisualRows} rows without CharacterVisuals, `
            + `${result.incompleteVisualGroups} incomplete visual groups)`
        );
    }

    catalog.heads = [...entries.values()];
    const written = writeHeadCatalog(catalog, options.output);
    console.log(`Head catalog written: ${written.catalogPath}`);
    console.log(JSON.stringify(written.catalog.counts, null, 2));
}

const directExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (directExecution) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

export {
    buildHeadCatalog,
    captureHeadProfileFromRecords,
    hasCharacterVisualsReference,
    isSkippableVisualProfileError,
    recipeNameFromText,
    scanRecipeList,
    scanRecipeRoot,
    scanSave
};
