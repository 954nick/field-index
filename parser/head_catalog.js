// -------------------- HEAD ID CATALOG --------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PARSER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HEAD_CATALOG_PATH = path.resolve(
    PARSER_DIRECTORY,
    "..",
    "assets",
    "mappings",
    "head_catalog.json"
);

const HEAD_CATALOG_FORMAT = "field_index_head_catalog";
const HEAD_CATALOG_VERSION = 1;
const HEAD_TYPES = Object.freeze(["unique", "generic"]);

function clone(value) {
    return structuredClone(value);
}

function normalizeHeadType(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!HEAD_TYPES.includes(text)) {
        throw new Error(`Head type must be one of: ${HEAD_TYPES.join(", ")}`);
    }
    return text;
}

function normalizeNumericHeadId(value) {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) {
        throw new Error(`Invalid Head ID: ${value}`);
    }
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < 0) {
        throw new Error(`Invalid Head ID: ${value}`);
    }
    return number;
}

function canonicalHeadKey(headType, headId) {
    return `${normalizeHeadType(headType)}:${normalizeNumericHeadId(headId)}`;
}

function parseCanonicalHeadKey(value) {
    const match = String(value ?? "").trim().match(/^(unique|generic):(\d+)$/i);
    if (!match) return null;
    const headType = normalizeHeadType(match[1]);
    const headId = normalizeNumericHeadId(match[2]);
    return { headType, headId, canonicalKey: canonicalHeadKey(headType, headId) };
}

function detectHeadIdentity(input = {}) {
    const assetName = String(input.assetName ?? input.PLYR_ASSETNAME ?? "").trim();
    const genericHeadAssetName = String(
        input.genericHeadAssetName ?? input.GenericHeadAssetName ?? ""
    ).trim();

    const genericMatch = genericHeadAssetName.match(/^Generic_(\d+)(?:_|$)/i);
    if (genericMatch) {
        const headId = normalizeNumericHeadId(genericMatch[1]);
        return {
            headId,
            headType: "generic",
            canonicalKey: canonicalHeadKey("generic", headId),
            assetName,
            genericHeadAssetName,
            knownFormat: true
        };
    }

    const uniqueMatch = genericHeadAssetName.match(/^Unique_.+_(\d+)$/i);
    if (uniqueMatch) {
        const headId = normalizeNumericHeadId(uniqueMatch[1]);
        return {
            headId,
            headType: "unique",
            canonicalKey: canonicalHeadKey("unique", headId),
            assetName,
            genericHeadAssetName,
            knownFormat: true
        };
    }

    return {
        headId: null,
        headType: "unknown",
        canonicalKey: null,
        assetName,
        genericHeadAssetName,
        knownFormat: false
    };
}

function inferGenericHeadProfile(genericHeadAssetName) {
    const recipeName = String(genericHeadAssetName ?? "").trim();
    // CFB27 generic recipes end in _<skin tone>_<variant>. Example:
    // Generic_4757_P_T0225_D_8_3 -> skin tone 8, variant 3.
    const match = recipeName.match(/^Generic_(\d+)(?:_[A-Za-z0-9]+)*_(\d+)_(\d+)$/i);
    if (!match) return null;

    const headId = normalizeNumericHeadId(match[1]);
    const skinTone = Number(match[2]);
    if (!Number.isSafeInteger(skinTone)) return null;

    const itemAssetName = `${recipeName}_item`;
    return {
        headId,
        skinTone,
        portraitId: headId,
        plusHeadElements: [
            {
                blends: [{}],
                itemInstanceTag: itemAssetName,
                itemAssetName,
                slotType: "PlusHead",
                transforms: [{}]
            }
        ]
    };
}

function isProfileComplete(headType, assetName, genericHeadAssetName, skinTone, plusHeadElements) {
    const hasVisualState = skinTone !== null
        && skinTone !== undefined
        && Array.isArray(plusHeadElements);
    if (!genericHeadAssetName || !hasVisualState) return false;
    if (headType === "unique") return Boolean(assetName);
    return true;
}

function normalizeCatalogEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== "object") {
        throw new Error("Head catalog entries must be objects");
    }

    const headType = normalizeHeadType(rawEntry.head_type ?? rawEntry.headType);
    const headId = normalizeNumericHeadId(rawEntry.head_id ?? rawEntry.headId);
    const canonicalKey = canonicalHeadKey(headType, headId);
    const suppliedCanonicalKey = rawEntry.canonical_key ?? rawEntry.canonicalKey;
    if (suppliedCanonicalKey && suppliedCanonicalKey !== canonicalKey) {
        throw new Error(
            `Head catalog canonical key mismatch: expected ${canonicalKey}, received ${suppliedCanonicalKey}`
        );
    }

    let plusHeadElements = clone(
        rawEntry.head_layer?.plus_head_elements
        ?? rawEntry.headLayer?.plusHeadElements
        ?? rawEntry.plus_head_elements
        ?? rawEntry.plusHeadElements
        ?? []
    );

    const portraitIdRaw = rawEntry.portrait_id ?? rawEntry.portraitId;
    let portraitId = portraitIdRaw === null || portraitIdRaw === undefined || portraitIdRaw === ""
        ? null
        : Number(portraitIdRaw);
    if (portraitId !== null && (!Number.isSafeInteger(portraitId) || portraitId < 0)) {
        throw new Error(`${canonicalKey} has an invalid portrait ID`);
    }

    let assetName = String(rawEntry.asset_name ?? rawEntry.assetName ?? "").trim();
    const genericHeadAssetName = String(
        rawEntry.generic_head_asset_name ?? rawEntry.genericHeadAssetName ?? ""
    ).trim();
    let skinTone = rawEntry.skin_tone ?? rawEntry.skinTone ?? null;
    let notes = Array.isArray(rawEntry.notes) ? [...rawEntry.notes] : [];

    // Generic CFB27 HeadstartRecipe names fully encode the reusable face profile.
    // PLYR_ASSETNAME is player-specific for generic players and is intentionally
    // not part of generic Head ID identity. The matching generic portrait ID is
    // the numeric Head ID itself.
    if (headType === "generic") {
        const inferred = inferGenericHeadProfile(genericHeadAssetName);
        if (inferred && inferred.headId === headId) {
            assetName = "";
            portraitId = inferred.portraitId;
            skinTone = inferred.skinTone;
            plusHeadElements = clone(inferred.plusHeadElements);
            notes = notes.filter(note => !/runtime use is disabled/i.test(String(note)));
        }
    }

    const profileComplete = isProfileComplete(
        headType,
        assetName,
        genericHeadAssetName,
        skinTone,
        plusHeadElements
    );

    return {
        head_id: headId,
        canonical_key: canonicalKey,
        head_type: headType,
        asset_name: assetName,
        generic_head_asset_name: genericHeadAssetName,
        portrait_id: portraitId,
        skin_tone: skinTone,
        head_layer: {
            plus_head_elements: Array.isArray(plusHeadElements) ? plusHeadElements : []
        },
        profile_complete: profileComplete,
        source_display_names: [...new Set(rawEntry.source_display_names ?? rawEntry.sourceDisplayNames ?? [])],
        source_player_rows: [...new Set(rawEntry.source_player_rows ?? rawEntry.sourcePlayerRows ?? [])],
        recipe_asset_path: rawEntry.recipe_asset_path ?? rawEntry.recipeAssetPath ?? null,
        portrait_asset_path: rawEntry.portrait_asset_path ?? rawEntry.portraitAssetPath ?? null,
        notes
    };
}

function profileFingerprint(entry) {
    return JSON.stringify({
        head_type: entry.head_type,
        asset_name: entry.asset_name,
        generic_head_asset_name: entry.generic_head_asset_name,
        portrait_id: entry.portrait_id,
        skin_tone: entry.skin_tone,
        plus_head_elements: entry.head_layer.plus_head_elements
    });
}

function mergeCatalogEntries(existingRaw, incomingRaw) {
    const existing = normalizeCatalogEntry(existingRaw);
    const incoming = normalizeCatalogEntry(incomingRaw);
    if (existing.canonical_key !== incoming.canonical_key) {
        throw new Error("Cannot merge different Head IDs");
    }

    const existingComplete = existing.profile_complete;
    const incomingComplete = incoming.profile_complete;
    if (existingComplete && incomingComplete && profileFingerprint(existing) !== profileFingerprint(incoming)) {
        throw new Error(`Conflicting complete profiles for ${existing.canonical_key}`);
    }

    const primary = incomingComplete && !existingComplete ? incoming : existing;
    const secondary = primary === existing ? incoming : existing;

    return {
        ...clone(primary),
        source_display_names: [...new Set([
            ...primary.source_display_names,
            ...secondary.source_display_names
        ])].sort(),
        source_player_rows: [...new Set([
            ...primary.source_player_rows,
            ...secondary.source_player_rows
        ])].sort((a, b) => Number(a) - Number(b)),
        recipe_asset_path: primary.recipe_asset_path ?? secondary.recipe_asset_path,
        portrait_asset_path: primary.portrait_asset_path ?? secondary.portrait_asset_path,
        notes: [...new Set([...primary.notes, ...secondary.notes])]
    };
}

function createEmptyHeadCatalog() {
    return {
        format: HEAD_CATALOG_FORMAT,
        version: HEAD_CATALOG_VERSION,
        game: {
            game_year: 27,
            schema_major: 486,
            schema_minor: 1
        },
        generated_at: null,
        sources: [],
        counts: {
            total: 0,
            unique: 0,
            generic: 0,
            usable: 0,
            missing_portrait: 0,
            incomplete: 0
        },
        heads: []
    };
}

function updateCatalogCounts(catalog) {
    const heads = catalog.heads ?? [];
    catalog.counts = {
        total: heads.length,
        unique: heads.filter(entry => entry.head_type === "unique").length,
        generic: heads.filter(entry => entry.head_type === "generic").length,
        usable: heads.filter(entry => entry.profile_complete && entry.portrait_id !== null).length,
        missing_portrait: heads.filter(entry => entry.portrait_id === null).length,
        incomplete: heads.filter(entry => !entry.profile_complete).length
    };
    return catalog;
}

function normalizeHeadCatalog(rawCatalog) {
    const raw = rawCatalog ?? createEmptyHeadCatalog();
    if (raw.format !== HEAD_CATALOG_FORMAT) {
        throw new Error(`Unsupported Head ID catalog format: ${raw.format ?? "missing"}`);
    }
    if (raw.version !== HEAD_CATALOG_VERSION) {
        throw new Error(`Unsupported Head ID catalog version: ${raw.version}`);
    }

    const byCanonicalKey = new Map();
    for (const rawEntry of raw.heads ?? []) {
        const entry = normalizeCatalogEntry(rawEntry);
        const existing = byCanonicalKey.get(entry.canonical_key);
        byCanonicalKey.set(
            entry.canonical_key,
            existing ? mergeCatalogEntries(existing, entry) : entry
        );
    }

    const catalog = {
        format: HEAD_CATALOG_FORMAT,
        version: HEAD_CATALOG_VERSION,
        game: {
            game_year: raw.game?.game_year ?? 27,
            schema_major: raw.game?.schema_major ?? 486,
            schema_minor: raw.game?.schema_minor ?? 1
        },
        generated_at: raw.generated_at ?? null,
        sources: Array.isArray(raw.sources) ? clone(raw.sources) : [],
        counts: {},
        heads: [...byCanonicalKey.values()].sort((a, b) => {
            if (a.head_type !== b.head_type) return a.head_type.localeCompare(b.head_type);
            return a.head_id - b.head_id;
        })
    };

    return updateCatalogCounts(catalog);
}

function readHeadCatalog(catalogPath = DEFAULT_HEAD_CATALOG_PATH, options = {}) {
    const resolvedPath = path.resolve(catalogPath);
    if (!fs.existsSync(resolvedPath)) {
        if (options.allowMissing !== false) {
            return {
                catalogPath: resolvedPath,
                exists: false,
                catalog: createEmptyHeadCatalog()
            };
        }
        throw new Error(`Head ID catalog was not found: ${resolvedPath}`);
    }

    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    return {
        catalogPath: resolvedPath,
        exists: true,
        catalog: normalizeHeadCatalog(raw)
    };
}

function writeHeadCatalog(catalog, catalogPath = DEFAULT_HEAD_CATALOG_PATH) {
    const normalized = normalizeHeadCatalog(catalog);
    normalized.generated_at = new Date().toISOString();
    updateCatalogCounts(normalized);

    const resolvedPath = path.resolve(catalogPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return { catalogPath: resolvedPath, catalog: normalized };
}

export class HeadCatalog {
    constructor(rawCatalog = createEmptyHeadCatalog(), options = {}) {
        this.catalogPath = options.catalogPath ?? null;
        this.catalog = normalizeHeadCatalog(rawCatalog);
        this.byCanonicalKey = new Map();
        this.byNumericId = new Map();

        for (const entry of this.catalog.heads) {
            this.byCanonicalKey.set(entry.canonical_key, entry);
            const entries = this.byNumericId.get(entry.head_id) ?? [];
            entries.push(entry);
            this.byNumericId.set(entry.head_id, entries);
        }
    }

    static load(catalogPath = DEFAULT_HEAD_CATALOG_PATH, options = {}) {
        const loaded = readHeadCatalog(catalogPath, options);
        const instance = new HeadCatalog(loaded.catalog, { catalogPath: loaded.catalogPath });
        instance.exists = loaded.exists;
        return instance;
    }

    get size() {
        return this.catalog.heads.length;
    }

    get counts() {
        return clone(this.catalog.counts);
    }

    resolve(headIdOrKey, options = {}) {
        const canonical = parseCanonicalHeadKey(headIdOrKey);
        if (canonical) {
            const entry = this.byCanonicalKey.get(canonical.canonicalKey);
            if (!entry) throw new Error(`Unknown Head ID: ${canonical.canonicalKey}`);
            return clone(entry);
        }

        const headId = normalizeNumericHeadId(headIdOrKey);
        const candidates = this.byNumericId.get(headId) ?? [];
        const headType = options.headType ? normalizeHeadType(options.headType) : null;
        const filtered = headType
            ? candidates.filter(entry => entry.head_type === headType)
            : candidates;

        if (filtered.length === 0) {
            throw new Error(`Unknown Head ID: ${headId}`);
        }
        if (filtered.length > 1) {
            throw new Error(
                `Head ID ${headId} is ambiguous. Use one of: ${filtered.map(entry => entry.canonical_key).join(", ")}`
            );
        }
        return clone(filtered[0]);
    }

    list(options = {}) {
        const headType = options.headType ? normalizeHeadType(options.headType) : null;
        const usableOnly = Boolean(options.usableOnly);
        const query = String(options.query ?? "").trim().toLowerCase();

        return this.catalog.heads
            .filter(entry => !headType || entry.head_type === headType)
            .filter(entry => !usableOnly || (entry.profile_complete && entry.portrait_id !== null))
            .filter(entry => {
                if (!query) return true;
                return [
                    entry.head_id,
                    entry.canonical_key,
                    entry.asset_name,
                    entry.generic_head_asset_name,
                    ...entry.source_display_names
                ].some(value => String(value ?? "").toLowerCase().includes(query));
            })
            .map(entry => clone(entry));
    }

    profileFor(headIdOrKey, options = {}) {
        const entry = this.resolve(headIdOrKey, options);
        if (!entry.profile_complete) {
            throw new Error(`${entry.canonical_key} is known but does not yet have a complete in-game head profile`);
        }
        if (!entry.generic_head_asset_name || (entry.head_type === "unique" && !entry.asset_name)) {
            throw new Error(`${entry.canonical_key} is missing required player head fields`);
        }
        if (entry.skin_tone === null || entry.skin_tone === undefined) {
            throw new Error(`${entry.canonical_key} is missing required CharacterVisuals skin tone state`);
        }
        if (entry.portrait_id === null && !options.allowMissingPortrait) {
            throw new Error(
                `${entry.canonical_key} has no mapped portrait ID. Pass allowMissingPortrait only if preserving the current portrait is intentional.`
            );
        }

        return {
            headId: entry.head_id,
            canonicalKey: entry.canonical_key,
            headType: entry.head_type,
            assetName: entry.asset_name,
            genericHeadAssetName: entry.generic_head_asset_name,
            portrait: entry.portrait_id,
            skinTone: clone(entry.skin_tone),
            plusHeadElements: clone(entry.head_layer.plus_head_elements),
            portraitAssetPath: entry.portrait_asset_path,
            sourceDisplayNames: clone(entry.source_display_names)
        };
    }
}

export {
    DEFAULT_HEAD_CATALOG_PATH,
    HEAD_CATALOG_FORMAT,
    HEAD_CATALOG_VERSION,
    HEAD_TYPES,
    canonicalHeadKey,
    createEmptyHeadCatalog,
    detectHeadIdentity,
    inferGenericHeadProfile,
    mergeCatalogEntries,
    normalizeCatalogEntry,
    normalizeHeadCatalog,
    parseCanonicalHeadKey,
    readHeadCatalog,
    writeHeadCatalog
};
