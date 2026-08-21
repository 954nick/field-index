// -------------------- HEAD REGRESSION LIGHTWEIGHT PLANNER --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Franchise from "madden-franchise";
import { HeadCatalog, detectHeadIdentity } from "./head_catalog.js";
import { TABLE_IDS } from "./table_ids.js";

const schemaDirectory = fileURLToPath(new URL("./schemas/", import.meta.url));

function hasCharacterVisualsReference(record) {
    try {
        const reference = record?.getReferenceDataByKey?.("CharacterVisuals");
        return Boolean(reference && reference.tableId !== 0);
    } catch {
        return false;
    }
}

function displayName(record) {
    return `${record?.FirstName ?? ""} ${record?.LastName ?? ""}`.trim();
}

function normalizeName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function playerSummary(record) {
    const head = detectHeadIdentity(record);
    return {
        playerRow: record.index,
        displayName: displayName(record),
        teamIndex: record.TeamIndex,
        position: record.Position ?? null,
        jerseyNumber: record.JerseyNum ?? null,
        canonicalKey: head.canonicalKey,
        headId: head.headId,
        headType: head.headType
    };
}

function destinationSummary(entry, displayHint = null) {
    return {
        canonicalKey: entry.canonical_key,
        headId: entry.head_id,
        headType: entry.head_type,
        assetName: entry.asset_name,
        genericHeadAssetName: entry.generic_head_asset_name,
        portraitId: entry.portrait_id,
        skinTone: entry.skin_tone,
        displayHint: displayHint ?? entry.source_display_names?.[0] ?? entry.asset_name ?? entry.generic_head_asset_name
    };
}

function preferredGenericDestination(entries, currentKey = null) {
    return entries.find(entry => {
        if (entry.canonical_key === currentKey) return false;
        const finalToken = Number(String(entry.generic_head_asset_name ?? "").split("_").at(-1));
        return Number.isFinite(finalToken) && Number(entry.skin_tone) !== finalToken;
    }) ?? entries.find(entry => entry.canonical_key !== currentKey) ?? null;
}

function findNamedRecord(records, requestedName, options = {}) {
    if (!requestedName) return null;
    const wanted = normalizeName(requestedName);
    const matches = records.filter(record => normalizeName(displayName(record)) === wanted);
    if (matches.length === 0) {
        throw new Error(`Requested player was not found in the current dynasty: ${requestedName}`);
    }

    const eligible = matches.filter(record => {
        const head = detectHeadIdentity(record);
        if (options.headType && head.headType !== options.headType) return false;
        if (options.requireVisuals && !hasCharacterVisualsReference(record)) return false;
        return true;
    });
    if (eligible.length === 0) {
        const expected = options.headType ? ` ${options.headType}` : "";
        const visuals = options.requireVisuals ? " with CharacterVisuals" : "";
        throw new Error(`${requestedName} is not an eligible${expected} Head regression player${visuals}`);
    }

    // Prefer a real assigned team over free-agent/inactive rows if duplicate names exist.
    return eligible.sort((a, b) => {
        const aActive = Number(a.TeamIndex) !== 255 ? 0 : 1;
        const bActive = Number(b.TeamIndex) !== 255 ? 0 : 1;
        return aActive - bActive || Number(a.index) - Number(b.index);
    })[0];
}

function resolveNamedDestination(records, catalog, requestedName, expectedType, currentKey = null) {
    const record = findNamedRecord(records, requestedName, { headType: expectedType, requireVisuals: false });
    const head = detectHeadIdentity(record);
    if (head.canonicalKey === currentKey) {
        throw new Error(`${requestedName} already uses ${currentKey}; choose a different ${expectedType} destination player`);
    }
    const entry = catalog.resolve(head.canonicalKey);
    if (!entry.profile_complete || entry.portrait_id === null || entry.portrait_id === undefined) {
        throw new Error(`Destination player ${requestedName} uses ${head.canonicalKey}, which is not catalog-usable`);
    }
    return { entry, displayHint: displayName(record), record: playerSummary(record) };
}

function parsePlannerArgs(argv) {
    const options = {
        source: null,
        catalog: null,
        output: null,
        genericPlayerName: null,
        uniquePlayerName: null,
        g2gPlayerName: null,
        u2uPlayerName: null
    };
    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => {
            const next = argv[++index];
            if (!next) throw new Error(`${arg} requires a value`);
            return next;
        };
        if (arg === "--generic-player") options.genericPlayerName = value();
        else if (arg === "--unique-player") options.uniquePlayerName = value();
        else if (arg === "--g2g-player") options.g2gPlayerName = value();
        else if (arg === "--u2u-player") options.u2uPlayerName = value();
        else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        else positional.push(arg);
    }
    [options.source, options.catalog, options.output] = positional;
    return options;
}

async function createPlan(sourcePath, catalogPath, outputPath, options = {}) {
    const franchise = await Franchise.create(sourcePath, { schemaDirectory });
    const playerTable = franchise.getTableByUniqueId(TABLE_IDS.Player);
    await playerTable.readRecords();

    const currentPlayers = playerTable.records.filter(record => !record.isEmpty && Number(record.TeamIndex) !== 255);
    const sourceCandidates = currentPlayers.filter(record => hasCharacterVisualsReference(record));

    const genericRecord = options.genericPlayerName
        ? findNamedRecord(currentPlayers, options.genericPlayerName, { headType: "generic", requireVisuals: true })
        : sourceCandidates.find(record => detectHeadIdentity(record).headType === "generic") ?? null;
    const uniqueRecord = options.uniquePlayerName
        ? findNamedRecord(currentPlayers, options.uniquePlayerName, { headType: "unique", requireVisuals: true })
        : sourceCandidates.find(record => detectHeadIdentity(record).headType === "unique") ?? null;

    const catalog = HeadCatalog.load(catalogPath, { allowMissing: false });
    const genericHeads = catalog.list({ headType: "generic", usableOnly: true });
    const uniqueHeads = catalog.list({ headType: "unique", usableOnly: true });

    const genericSource = genericRecord ? playerSummary(genericRecord) : null;
    const uniqueSource = uniqueRecord ? playerSummary(uniqueRecord) : null;
    const firstDifferent = (entries, currentKey = null) => entries.find(entry => entry.canonical_key !== currentKey) ?? null;

    let g2u = null;
    let g2uHint = null;
    if (genericSource && uniqueSource && options.uniquePlayerName) {
        const named = resolveNamedDestination(currentPlayers, catalog, options.uniquePlayerName, "unique", genericSource.canonicalKey);
        g2u = named.entry;
        g2uHint = named.displayHint;
    } else if (genericSource) {
        g2u = firstDifferent(uniqueHeads, genericSource.canonicalKey);
    }

    let u2g = null;
    let u2gHint = null;
    if (uniqueSource && genericSource && options.genericPlayerName) {
        const named = resolveNamedDestination(currentPlayers, catalog, options.genericPlayerName, "generic", uniqueSource.canonicalKey);
        u2g = named.entry;
        u2gHint = named.displayHint;
    } else if (uniqueSource) {
        u2g = preferredGenericDestination(genericHeads, uniqueSource.canonicalKey);
    }

    let g2g = null;
    let g2gHint = null;
    if (genericSource && options.g2gPlayerName) {
        const named = resolveNamedDestination(currentPlayers, catalog, options.g2gPlayerName, "generic", genericSource.canonicalKey);
        g2g = named.entry;
        g2gHint = named.displayHint;
    } else if (genericSource) {
        g2g = preferredGenericDestination(genericHeads, genericSource.canonicalKey);
    }

    let u2u = null;
    let u2uHint = null;
    if (uniqueSource && options.u2uPlayerName) {
        const named = resolveNamedDestination(currentPlayers, catalog, options.u2uPlayerName, "unique", uniqueSource.canonicalKey);
        u2u = named.entry;
        u2uHint = named.displayHint;
    } else if (uniqueSource) {
        u2u = firstDifferent(uniqueHeads, uniqueSource.canonicalKey);
    }

    const plan = {
        format: "field_index_head_regression_plan",
        version: 2,
        sourcePath,
        catalogCounts: catalog.counts,
        selection: {
            genericPlayerName: options.genericPlayerName ?? null,
            uniquePlayerName: options.uniquePlayerName ?? null,
            g2gPlayerName: options.g2gPlayerName ?? null,
            u2uPlayerName: options.u2uPlayerName ?? null
        },
        genericSource,
        uniqueSource,
        destinations: {
            G2U: g2u ? destinationSummary(g2u, g2uHint) : null,
            U2G: u2g ? destinationSummary(u2g, u2gHint) : null,
            G2G: g2g ? destinationSummary(g2g, g2gHint) : null,
            U2U: u2u ? destinationSummary(u2u, u2uHint) : null
        }
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    console.log(
        `Head regression plan | usable unique=${uniqueHeads.length} generic=${genericHeads.length} | `
        + `source generic=${genericSource?.displayName ?? "none"} unique=${uniqueSource?.displayName ?? "none"}`
    );
    if (options.genericPlayerName || options.uniquePlayerName || options.g2gPlayerName || options.u2uPlayerName) {
        console.log(
            `Visible-player fixtures | G2U=${g2uHint ?? g2u?.canonical_key ?? "none"} `
            + `U2G=${u2gHint ?? u2g?.canonical_key ?? "none"} `
            + `G2G=${g2gHint ?? g2g?.canonical_key ?? "none"} `
            + `U2U=${u2uHint ?? u2u?.canonical_key ?? "none"}`
        );
    }
    return plan;
}

async function main() {
    const options = parsePlannerArgs(process.argv.slice(2));
    if (!options.source || !options.catalog || !options.output) {
        throw new Error(
            "Usage: node head_regression_plan.js <save> <catalog> <output-json> "
            + "[--generic-player <name>] [--unique-player <name>] [--g2g-player <name>] [--u2u-player <name>]"
        );
    }
    await createPlan(path.resolve(options.source), path.resolve(options.catalog), path.resolve(options.output), options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`Head regression planner failed: ${error.message}`);
        process.exit(1);
    });
}

export { createPlan, findNamedRecord, normalizeName, parsePlannerArgs, resolveNamedDestination };
