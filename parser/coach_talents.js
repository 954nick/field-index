// -------------------- CFB27 COACH TALENT CATALOG --------------------

const INTERNAL_TREE_NAMES = [
    "Motivator",
    "Schemer",
    "Recruiter",
    "MasterMotivator",
    "Architect",
    "SchemeGuru",
    "Strategist",
    "EliteRecruiter",
    "TalentDeveloper",
    "Rainmaker",
    "Visionary",
    "ProgramBuilder",
    "CEO"
];

const TREE_ALIASES = new Map([
    ["tactician", "Schemer"],
    ["schemer", "Schemer"],
    ["mastermotivator", "MasterMotivator"],
    ["schemeguru", "SchemeGuru"],
    ["eliterecruiter", "EliteRecruiter"],
    ["talentdeveloper", "TalentDeveloper"],
    ["programbuilder", "ProgramBuilder"]
]);

function normalized(value) {
    return String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function displayTreeName(internalName, fallback = null) {
    if (fallback && String(fallback).trim()) return String(fallback).trim();
    if (internalName === "Schemer") return "Tactician";
    return String(internalName ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function treeIndexFromIdentifier(value) {
    if (Number.isInteger(value)) {
        if (value < 0 || value >= INTERNAL_TREE_NAMES.length) {
            throw new Error(`Invalid coach talent tree index: ${value}`);
        }
        return value;
    }
    const key = normalized(value);
    const aliased = TREE_ALIASES.get(key);
    if (aliased) return INTERNAL_TREE_NAMES.indexOf(aliased);
    const index = INTERNAL_TREE_NAMES.findIndex(name => normalized(name) === key);
    if (index < 0) throw new Error(`Unknown coach talent tree: ${value}`);
    return index;
}

async function ensureTableRead(table) {
    if (table && !table.recordsRead && typeof table.readRecords === "function") {
        await table.readRecords();
    }
    return table;
}

async function resolveReferenceRecord(franchise, ownerRecord, fieldName) {
    if (!ownerRecord || !fieldName || typeof ownerRecord.getReferenceDataByKey !== "function") return null;
    const reference = ownerRecord.getReferenceDataByKey(fieldName);
    if (!reference || reference.tableId === 0) return null;
    const table = franchise.getTableById(reference.tableId);
    if (!table) return null;
    await ensureTableRead(table);
    return table.records?.[reference.rowNumber] ?? null;
}

async function resolveArrayRecords(franchise, arrayRecord) {
    if (!arrayRecord || !Array.isArray(arrayRecord._offsetTable)) return [];
    const size = Number.isInteger(arrayRecord.arraySize)
        ? Math.min(arrayRecord.arraySize, arrayRecord._offsetTable.length)
        : arrayRecord._offsetTable.length;
    const records = [];
    for (const field of arrayRecord._offsetTable.slice(0, size)) {
        const record = await resolveReferenceRecord(franchise, arrayRecord, field.name);
        if (record && !record.isEmpty) records.push(record);
    }
    return records;
}

function primitiveRecordSnapshot(record, fieldNames) {
    if (!record) return null;
    const result = {};
    for (const field of fieldNames) {
        try {
            if (typeof record.getFieldByKey === "function" && !record.getFieldByKey(field)) continue;
            const value = record[field];
            if (["string", "number", "boolean"].includes(typeof value) || value == null) result[field] = value;
        } catch {
            // Ignore a field that is unavailable in this particular save/table variant.
        }
    }
    return Object.keys(result).length ? result : null;
}

async function buildPrerequisite(franchise, nodeRecord) {
    const prerequisite = await resolveReferenceRecord(franchise, nodeRecord, "Prerequisite");
    if (!prerequisite || prerequisite.isEmpty) return null;
    return primitiveRecordSnapshot(prerequisite, [
        "Title",
        "Description",
        "CoachStat",
        "CompletionValue",
        "MinCoachLevel",
        "TotalTalentSpendPoints",
        "TeamStat",
        "UseStatRanking",
        "IsInverted",
        "IsRepeatable",
        "EvaluateAtEndOfSeason",
        "StatPeriod",
        "CoachExperienceAward",
        "CoachPrestigeScore",
        "StaffPointAward",
        "DynastyPointAward"
    ]);
}

async function buildTalentNode(franchise, nodeRecord, talentIndex) {
    const talent = await resolveReferenceRecord(franchise, nodeRecord, "Talent");
    const branch = await resolveReferenceRecord(franchise, nodeRecord, "BranchInfo");
    const prerequisite = await buildPrerequisite(franchise, nodeRecord);

    const name = talent?.Name || branch?.Title || nodeRecord?.ProgressLabel || `Talent ${talentIndex}`;
    const branchTitle = branch?.Title || null;
    const branchSubtitle = branch?.Subtitle || null;

    return {
        talentIndex,
        statusField: `TalentStatus${talentIndex}`,
        name,
        canonicalName: normalized(name),
        description: talent?.Description || null,
        staffPointCost: Number(nodeRecord?.StaffPointCost ?? 0),
        isArchetypeNode: Boolean(nodeRecord?.IsArchetypeNode),
        progressLabel: nodeRecord?.ProgressLabel || null,
        branch: branch ? {
            title: branchTitle,
            subtitle: branchSubtitle,
            iconId: branch.IconId ?? null
        } : null,
        talent: talent ? {
            name: talent.Name || null,
            description: talent.Description || null,
            positionGroup: talent.TalentPosGroup ?? null,
            behavior: talent.Behavior ?? null,
            effect: talent.Effect ?? null,
            duration: talent.Duration ?? null,
            iconId: talent.IconId ?? null
        } : null,
        prerequisite
    };
}

async function buildSubTreeDefinition(franchise, record) {
    const nodeArray = await resolveReferenceRecord(franchise, record, "OrderedTalentNodeList");
    const nodeRecords = nodeArray ? await resolveArrayRecords(franchise, nodeArray) : [];
    const talents = [];
    for (let index = 0; index < nodeRecords.length && index < 33; index++) {
        talents.push(await buildTalentNode(franchise, nodeRecords[index], index));
    }

    const internalName = record.SubtreeArchetype || record.TalentTreeArchetype || record.Name || "Unknown";
    let treeIndex = -1;
    try {
        treeIndex = treeIndexFromIdentifier(internalName);
    } catch {
        treeIndex = INTERNAL_TREE_NAMES.findIndex(name => normalized(name) === normalized(record.Name));
    }

    return {
        sourceRow: record.index ?? null,
        treeIndex,
        internalName: treeIndex >= 0 ? INTERNAL_TREE_NAMES[treeIndex] : String(internalName),
        displayName: displayTreeName(treeIndex >= 0 ? INTERNAL_TREE_NAMES[treeIndex] : internalName, record.Name),
        description: record.Description || null,
        subtreeArchetype: record.SubtreeArchetype ?? null,
        talentTreeArchetype: record.TalentTreeArchetype ?? null,
        treeType: record.TreeType ?? null,
        canBeDominant: Boolean(record.CanBeDominant),
        dominantPriority: record.DominantPriority ?? null,
        version: record.Version ?? null,
        talents,
        talentCount: talents.length
    };
}

function candidateScore(candidate) {
    let score = candidate.talentCount * 100;
    if (candidate.description) score += 5;
    if (candidate.canBeDominant) score += 2;
    if (candidate.displayName) score += 1;
    return score;
}

export async function buildCoachTalentCatalog(franchise) {
    const tables = typeof franchise?.getAllTablesByName === "function"
        ? franchise.getAllTablesByName("TalentSubTree")
        : [];
    if (!tables?.length) {
        return {
            format: "field_index_coach_talent_catalog",
            version: 1,
            source: "live_save",
            available: false,
            reason: "TalentSubTree table is unavailable in this save",
            trees: [],
            definitions: [],
            treeCount: 0,
            talentCount: 0
        };
    }

    const definitions = [];
    for (const table of tables) {
        await ensureTableRead(table);
        for (const record of table.records ?? []) {
            if (!record || record.isEmpty) continue;
            const definition = await buildSubTreeDefinition(franchise, record);
            if (definition.talentCount === 0 && definition.treeIndex < 0) continue;
            definitions.push(definition);
        }
    }

    const trees = INTERNAL_TREE_NAMES.map((internalName, treeIndex) => {
        const candidates = definitions
            .filter(item => item.treeIndex === treeIndex)
            .sort((a, b) => candidateScore(b) - candidateScore(a));
        const selected = candidates[0] ?? null;
        return {
            treeIndex,
            internalName,
            displayName: selected?.displayName || displayTreeName(internalName),
            available: Boolean(selected),
            description: selected?.description ?? null,
            treeType: selected?.treeType ?? null,
            talents: selected?.talents ?? [],
            talentCount: selected?.talentCount ?? 0,
            sourceRow: selected?.sourceRow ?? null,
            candidateCount: candidates.length,
            alternateDefinitions: candidates.slice(1).map(candidate => ({
                sourceRow: candidate.sourceRow,
                displayName: candidate.displayName,
                treeType: candidate.treeType,
                talentCount: candidate.talentCount
            }))
        };
    });

    return {
        format: "field_index_coach_talent_catalog",
        version: 1,
        source: "live_save",
        available: trees.some(tree => tree.available),
        generatedFromGameYear: Number(franchise?.gameYear ?? 27),
        trees,
        definitions,
        treeCount: trees.filter(tree => tree.available).length,
        talentCount: trees.reduce((sum, tree) => sum + tree.talentCount, 0)
    };
}

export function resolveCoachTalentTree(catalog, identifier) {
    const treeIndex = treeIndexFromIdentifier(identifier);
    const tree = catalog?.trees?.find(item => item.treeIndex === treeIndex) ?? null;
    if (!tree) throw new Error(`Coach talent tree ${identifier} is not present in the live catalog`);
    return tree;
}

export function resolveCoachTalentIdentifier(catalog, treeIdentifier, talentIdentifier) {
    const tree = resolveCoachTalentTree(catalog, treeIdentifier);
    if (Number.isInteger(talentIdentifier) || /^\d+$/.test(String(talentIdentifier ?? ""))) {
        const talentIndex = Number(talentIdentifier);
        if (!Number.isInteger(talentIndex) || talentIndex < 0 || talentIndex > 32) {
            throw new Error("Coach talent node index must be 0-32");
        }
        const talent = tree.talents?.find(item => item.talentIndex === talentIndex) ?? null;
        return { tree, talentIndex, talent };
    }

    const statusMatch = /^TalentStatus(\d+)$/i.exec(String(talentIdentifier ?? ""));
    if (statusMatch) return resolveCoachTalentIdentifier(catalog, treeIdentifier, Number(statusMatch[1]));

    const key = normalized(talentIdentifier);
    const matches = (tree.talents ?? []).filter(talent => {
        const keys = [
            talent.name,
            talent.canonicalName,
            talent.branch?.title,
            talent.branch?.subtitle,
            talent.progressLabel,
            talent.talent?.name
        ].map(normalized).filter(Boolean);
        return keys.includes(key);
    });
    if (matches.length === 0) {
        throw new Error(`Unknown ${tree.displayName} coach talent: ${talentIdentifier}`);
    }
    if (matches.length > 1) {
        throw new Error(
            `Ambiguous ${tree.displayName} coach talent "${talentIdentifier}". ` +
            `Use a numeric talent index. Matches: ${matches.map(item => item.talentIndex).join(", ")}`
        );
    }
    return { tree, talentIndex: matches[0].talentIndex, talent: matches[0] };
}

export function resolveCoachArchetypeContext(snapshot, catalog) {
    const raw = snapshot?.dominantArchetype ?? null;
    if (raw == null || String(raw).trim() === "") {
        return {
            sourceField: "Coach.DominantArchetype",
            raw: null,
            resolved: false,
            treeIndex: null,
            internalName: null,
            displayName: null
        };
    }

    let treeIndex = null;
    try {
        treeIndex = treeIndexFromIdentifier(raw);
    } catch {
        // Preserve unknown raw archetypes instead of guessing a tree identity.
    }

    const definition = treeIndex == null
        ? null
        : catalog?.trees?.find(item => item.treeIndex === treeIndex) ?? null;
    const internalName = treeIndex == null
        ? String(raw)
        : definition?.internalName ?? INTERNAL_TREE_NAMES[treeIndex];

    return {
        sourceField: "Coach.DominantArchetype",
        raw,
        resolved: treeIndex != null,
        treeIndex,
        internalName,
        displayName: definition?.displayName ?? displayTreeName(internalName)
    };
}

export function enrichCoachTalentTreeSnapshot(snapshot, catalog) {
    if (!snapshot) return null;
    const archetypeContext = resolveCoachArchetypeContext(snapshot, catalog);
    const trees = (snapshot.trees ?? []).map(tree => {
        const definition = catalog?.trees?.find(item => item.treeIndex === tree.treeIndex) ?? null;
        const internalName = definition?.internalName ?? tree.treeName;
        const displayName = definition?.displayName ?? displayTreeName(tree.treeName);
        const byIndex = new Map((definition?.talents ?? []).map(talent => [talent.talentIndex, talent]));
        return {
            ...tree,
            internalName,
            displayName,
            description: definition?.description ?? null,
            treeIdentity: {
                treeIndex: tree.treeIndex,
                internalName,
                displayName
            },
            isDominantArchetype: archetypeContext.treeIndex === tree.treeIndex,
            talents: (tree.talents ?? []).map(talent => ({
                ...talent,
                definition: byIndex.get(talent.talentIndex) ?? null
            }))
        };
    });

    return {
        ...clone(snapshot),
        catalogAvailable: Boolean(catalog?.available),
        archetypeContext,
        trees
    };
}

export function flattenCoachAbilities(snapshot, options = {}) {
    const rows = [];
    for (const tree of snapshot?.trees ?? []) {
        if (options.availableTreesOnly && !tree.available) continue;
        for (const talent of tree.talents ?? []) {
            if (options.status && talent.status !== options.status) continue;
            rows.push({
                treeIndex: tree.treeIndex,
                treeName: tree.treeName,
                treeDisplayName: tree.displayName ?? displayTreeName(tree.treeName),
                talentIndex: talent.talentIndex,
                statusField: talent.field ?? talent.definition?.statusField ?? `TalentStatus${talent.talentIndex}`,
                status: talent.status,
                name: talent.definition?.name ?? `Talent ${talent.talentIndex}`,
                description: talent.definition?.description ?? null,
                branch: talent.definition?.branch ?? null,
                staffPointCost: talent.definition?.staffPointCost ?? null,
                positionGroup: talent.definition?.talent?.positionGroup ?? null,
                prerequisite: talent.definition?.prerequisite ?? null
            });
        }
    }
    return rows;
}

export {
    INTERNAL_TREE_NAMES as COACH_TALENT_TREE_NAMES,
    displayTreeName,
    normalized as normalizeCoachTalentText,
    treeIndexFromIdentifier as getCoachTalentTreeIndex
};

// -------------------- STRUCTURAL COACH TALENT COMPATIBILITY API --------------------
// Numeric TalentStatus index is always the write-safe identity. These helpers
// expose the complete 13 x 33 structural catalog even before a live save has
// supplied the game-facing names/descriptions used by buildCoachTalentCatalog().

export function coachTalentTreeIndex(identifier) {
    return treeIndexFromIdentifier(identifier);
}

export function getCoachTalentTreeDefinition(identifier) {
    const treeIndex = treeIndexFromIdentifier(identifier);
    const internalName = INTERNAL_TREE_NAMES[treeIndex];
    return {
        treeIndex,
        internalName,
        displayName: displayTreeName(internalName),
        canonicalKey: internalName,
        nodes: Array.from({ length: 33 }, (_, talentIndex) => ({
            treeIndex,
            treeInternalName: internalName,
            talentIndex,
            field: `TalentStatus${talentIndex}`,
            canonicalKey: `${internalName}:${talentIndex}`,
            isTreeRoot: talentIndex === 0
        }))
    };
}

export function getCoachTalentNodeDefinition(treeIdentifier, talentIndex) {
    const tree = getCoachTalentTreeDefinition(treeIdentifier);
    const index = Number(talentIndex);
    if (!Number.isInteger(index) || index < 0 || index > 32) {
        throw new Error("Coach talent node index must be 0-32");
    }
    return tree.nodes[index];
}

export function listCoachTalentDefinitions() {
    return INTERNAL_TREE_NAMES.map((_, index) => getCoachTalentTreeDefinition(index));
}

export function getCoachTalentStatus(snapshot, treeIdentifier, talentIndex) {
    const definition = getCoachTalentNodeDefinition(treeIdentifier, talentIndex);
    const tree = (snapshot?.trees ?? []).find(item => item.treeIndex === definition.treeIndex);
    const node = (tree?.talents ?? []).find(item => Number(item.talentIndex) === definition.talentIndex);
    return {
        ...definition,
        treeState: tree?.state ?? (tree?.available === false ? "Unavailable" : null),
        coachPointsSpent: tree?.coachPointsSpent ?? null,
        status: node?.status ?? null
    };
}
