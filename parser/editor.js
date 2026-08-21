// Field Index Save Editing Backend
import Franchise from "madden-franchise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TABLE_IDS } from "./table_ids.js";
import { ensureCoachTableSchema } from "./coach_schema_compat.js";
import { writeCfb27DynastySave } from "./cfb27_safe_writer.js";
import { getPlayerHeadProfile, applyPlayerHeadProfilePreserveGear } from "./character_visuals.js";
import { DEFAULT_HEAD_CATALOG_PATH, HeadCatalog, detectHeadIdentity } from "./head_catalog.js";
import {
    CFP_FIRST_ROUND_BRACKET_SLOTS,
    CFP_FIRST_ROUND_SEEDS,
    planCfpFirstRoundSeedAssignments,
    planCfpFirstRoundTeamSwap,
    planCfpGameParticipantPermutation,
    validateCfpFirstRoundSlots
} from "./cfp_bracket.js";
import {
    buildCoachTalentCatalog,
    enrichCoachTalentTreeSnapshot,
    getCoachTalentTreeIndex,
    resolveCoachTalentIdentifier
} from "./coach_talents.js";
import { evaluateRedshirtConsistency, getCurrentSeasonGamesPlayed } from "./redshirt_consistency.js";

const DEFAULT_SCHEMA_DIRECTORY = fileURLToPath(new URL("./schemas/", import.meta.url));
const ZERO_REFERENCE = "0".repeat(32);
const MAX_CFB27_SAVE_FILENAME_LENGTH = 31;

const PLAYER_APPEARANCE_FIELDS = [
    "PLYR_ASSETNAME",
    "GenericHeadAssetName",
    "PLYR_GENERICHEAD",
    "PLYR_PORTRAIT",
    "PortraitSwappableLibraryPath",
    "PortraitForceSilhouette",
    "CharacterBodyType",
    "Height",
    "Weight",
    "PLYR_STYLE",
    "PLYR_QBSTYLE",
    "PLYR_STANCE",
    "PLYR_HANDEDNESS",
    "PLYR_SLEEVETEMPERATURE"
];

const COACH_APPEARANCE_FIELDS = [
    "AssetName",
    "GenericHeadAssetName",
    "Portrait",
    "Portrait_Swappable_Library_Path",
    "Portrait_Force_Silhouette",
    "CharacterBodyType",
    "Height",
    "Weight",
    "HatType",
    "COACH_STANCE"
];

const PLAYER_PHYSICAL_ABILITY_RANK_FIELDS = [
    "PhysicalAbility1",
    "PhysicalAbility2",
    "PhysicalAbility3",
    "PhysicalAbility4",
    "PhysicalAbility5"
];

const PLAYER_MENTAL_ABILITY_FIELDS = [
    "MentalAbility1",
    "MentalAbility2",
    "MentalAbility3"
];

const PLAYER_MENTAL_ABILITY_RANK_FIELDS = [
    "MentalAbilityRank1",
    "MentalAbilityRank2",
    "MentalAbilityRank3"
];

// CFB27 stores coach subtree statuses in the same order as the CoachTalentArcheType enum.
// Coordinators normally expose the first 11. Head coaches can expose Program Builder and CEO too.
const COACH_TALENT_TREE_NAMES = [
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

const TALENT_STATUS_VALUES = ["NotOwned", "Purchasable", "Owned", "Locked"];

const TEAM_PROGRAM_POINT_GRADE_FIELDS = {
    stadiumAtmosphere: "ProgramPointsStadiumAtmosphereGrade",
    brandExposure: "ProgramPointsBrandExposureGrade",
    budget: "ProgramPointsBudgetGrade",
    programTraditions: "ProgramPointsProgramTraditionsGrade",
    conferencePrestige: "ProgramPointsConferencePrestigeGrade"
};

// -------------------- GAME-VERIFIED MY SCHOOL GRADE AUTHORITY --------------------
// The CFB27 My School screen does not use Team.ProgramPointsStadiumAtmosphereGrade
// as the displayed Stadium Atmosphere authority. A real-save isolated test proved
// MySchoolTrackingTable.StadiumAtmosphereGrade controls the visible grade.
const MY_SCHOOL_DISPLAY_GRADE_ALIASES = {
    stadiumAtmosphere: "StadiumAtmosphereGrade"
};

function resolveFlatTeamGradeTarget(key) {
    if (Object.hasOwn(MY_SCHOOL_DISPLAY_GRADE_ALIASES, key)) {
        return { group: "mySchool", field: MY_SCHOOL_DISPLAY_GRADE_ALIASES[key] };
    }
    const field = TEAM_PROGRAM_POINT_GRADE_FIELDS[key] ?? key;
    if (Object.values(TEAM_PROGRAM_POINT_GRADE_FIELDS).includes(field)) {
        return { group: "programPoints", field };
    }
    return null;
}

// These are the direct grades shown by the CFB27 My School recruiting system.
// Pro Potential is position-specific in the save, so all stored position groups are retained.
const MY_SCHOOL_GRADE_FIELDS = [
    "AcademicPrestigeGrade",
    "AthleticFacilitiesGrade",
    "BrandExposureGrade",
    "CampusLifestyleGrade",
    "ChampionshipContenderGrade",
    "CoachPrestigeGrade",
    "CoachStabilityGrade",
    "ConferencePrestigeGrade",
    "ProgramTraditionGrade",
    "StadiumAtmosphereGrade",
    "ProPotentialGradeQB",
    "ProPotentialGradeRB",
    "ProPotentialGradeWR",
    "ProPotentialGradeTE",
    "ProPotentialGradeOL",
    "ProPotentialGradeDL",
    "ProPotentialGradeLB",
    "ProPotentialGradeDB",
    "ProPotentialGradeK",
    "ProPotentialGradeP"
];

// Backward-compatible name used by the read backend.
const TEAM_GRADE_FIELDS = TEAM_PROGRAM_POINT_GRADE_FIELDS;

const POLL_FIELDS = {
    media: {
        label: "Media/AP Poll",
        rank: "MediaPoll_CurrentRank",
        hiddenRank: "MediaPoll_HiddenCurrentRank",
        lastRank: "MediaPoll_LastWeeksRank",
        points: "MediaPoll_CurrentPoints",
        firstPlaceVotes: "MediaPoll_FirstPlaceVotes"
    },
    coaches: {
        label: "Coaches Poll",
        rank: "CoachesPoll_CurrentRank",
        hiddenRank: "CoachesPoll_HiddenCurrentRank",
        lastRank: "CoachesPoll_LastWeeksRank",
        points: "CoachesPoll_CurrentPoints",
        firstPlaceVotes: "CoachesPoll_FirstPlaceVotes"
    },
    cfp: {
        label: "CFP Poll",
        rank: "CFPPoll_CurrentRank",
        hiddenRank: null,
        lastRank: "CFPPoll_LastWeeksRank",
        points: "CFPPoll_CurrentPoints",
        firstPlaceVotes: null
    }
};

const PLAYER_ALIAS_FIELDS = {
    firstName: "FirstName",
    lastName: "LastName",
    position: "Position",
    overallRating: "OverallRating",
    jerseyNumber: "JerseyNum",
    heightInches: "Height",
    classYear: "SchoolYear",
    redshirtStatus: "RedshirtStatus",
    developmentTrait: "TraitDevelopment",
    skillPoints: "SkillPoints",
    experiencePoints: "ExperiencePoints"
};

const PLAYER_HEAD_IDENTITY_FIELDS = new Set([
    "PLYR_ASSETNAME",
    "GenericHeadAssetName",
    "PLYR_GENERICHEAD",
    "PLYR_PORTRAIT",
    "PortraitSwappableLibraryPath",
    "PortraitForceSilhouette"
]);

const PLAYER_SAFE_APPEARANCE_FIELDS = PLAYER_APPEARANCE_FIELDS.filter(
    fieldName => !PLAYER_HEAD_IDENTITY_FIELDS.has(fieldName)
);

const COACH_ALIAS_FIELDS = {
    firstName: "FirstName",
    lastName: "LastName",
    age: "Age",
    level: "Level",
    coachPrestige: "CoachPrestige",
    coachPrestigeScore: "CoachPrestigeScore",
    coachPoints: "CoachPoints",
    experiencePoints: "ExperiencePoints",
    yearsCoaching: "YearsCoaching",
    seasonsWithTeam: "SeasonsWithTeam",
    specialty: "COACH_SPECIALTY",
    dominantArchetype: "DominantArchetype",
    contractYearsRemaining: "ContractYearsRemaining",
    contractSalary: "ContractSalary",
    personality: "Personality",
    primaryPipeline: "PrimaryPipeline",
    homeState: "HomeState",
    bodyType: "CharacterBodyType",
    genericHeadAssetName: "GenericHeadAssetName",
    hatType: "HatType",
    stance: "COACH_STANCE",
    heightInches: "Height",
    weight: "Weight"
};

function isSentinelEnumValue(value) {
    if (!value) return true;
    if (/^(First_|Last_|Max_|COUNT|Count_|Invalid|Invalid_|FirstMain_|LastMain_|FirstAlternate_|LastAlternate_)$/i.test(value)) return true;
    if (/^Reserved/i.test(value)) return true;
    return false;
}

function enumValues(offset) {
    const members = offset?.enum?._members ?? offset?.enum?.members ?? [];
    return members
        .map(member => member.name)
        .filter(value => value && !isSentinelEnumValue(value));
}

function fieldMetadata(record, fieldName) {
    const field = record?.getFieldByKey(fieldName);
    if (!field) return null;
    const offset = field.offset;
    return {
        field: fieldName,
        type: offset.type,
        isReference: Boolean(offset.isReference),
        minValue: Number.isFinite(offset.minValue) ? offset.minValue : null,
        maxValue: Number.isFinite(offset.maxValue) ? offset.maxValue : null,
        maxLength: offset.maxLength ?? null,
        enumValues: enumValues(offset)
    };
}

function normalizeNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error(`${label} must be a number`);
    }
    return number;
}

function validateFieldValue(record, fieldName, value) {
    const meta = fieldMetadata(record, fieldName);
    if (!meta) throw new Error(`Unknown field: ${fieldName}`);
    if (meta.isReference) throw new Error(`${fieldName} is a reference field and cannot be edited with a scalar value`);

    if (meta.enumValues.length > 0) {
        if (!meta.enumValues.includes(value)) {
            throw new Error(`${fieldName} must be one of: ${meta.enumValues.join(", ")}`);
        }
        return value;
    }

    if (["int", "s_int", "float"].includes(meta.type)) {
        const number = normalizeNumber(value, fieldName);
        if (meta.minValue !== null && number < meta.minValue) {
            throw new Error(`${fieldName} must be at least ${meta.minValue}`);
        }
        if (meta.maxValue !== null && number > meta.maxValue) {
            throw new Error(`${fieldName} must be at most ${meta.maxValue}`);
        }
        return number;
    }

    if (meta.type === "bool") return Boolean(value);

    if (meta.type === "string") {
        const text = String(value);
        if (meta.maxLength !== null && Buffer.byteLength(text, "utf8") > meta.maxLength) {
            throw new Error(`${fieldName} exceeds max length ${meta.maxLength}`);
        }
        return text;
    }

    return value;
}

function validatePlayerBusinessRule(key, value) {
    if (["firstName", "lastName"].includes(key) && !String(value ?? "").trim()) {
        throw new Error(`${key} cannot be blank`);
    }
    if (key === "jerseyNumber") {
        const number = normalizeNumber(value, key);
        if (!Number.isInteger(number) || number < 0 || number > 99) {
            throw new Error("jerseyNumber must be an integer from 0 to 99");
        }
    }
    if (key === "overallRating") {
        const number = normalizeNumber(value, key);
        if (!Number.isInteger(number) || number < 0 || number > 99) {
            throw new Error("overallRating must be an integer from 0 to 99");
        }
    }
    if (key === "heightInches") {
        const number = normalizeNumber(value, key);
        if (!Number.isInteger(number) || number < 60 || number > 90) {
            throw new Error("heightInches must be an integer from 60 to 90");
        }
    }
    return value;
}

function createReference(table, rowNumber) {
    if (!table?.header?.tableId) throw new Error("Cannot create reference without table id");
    if (!Number.isInteger(rowNumber) || rowNumber < 0 || rowNumber > 131071) {
        throw new Error(`Invalid reference row: ${rowNumber}`);
    }
    return table.header.tableId.toString(2).padStart(15, "0") + rowNumber.toString(2).padStart(17, "0");
}

function timestampForFilename() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function copyJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function coachTalentTreeIndex(value) {
    return getCoachTalentTreeIndex(value);
}

export class FieldIndexEditor {
    constructor(franchise, savePath, schemaDirectory, options = {}) {
        this.franchise = franchise;
        this.savePath = savePath;
        this.schemaDirectory = schemaDirectory;
        this.changeLog = [];
        this.tables = {};
        this.allowUnsafeRawFields = options.allowUnsafeRawFields === true;
        this.headCatalog = HeadCatalog.load(
            options.headCatalogPath ?? DEFAULT_HEAD_CATALOG_PATH,
            { allowMissing: true }
        );
        this.coachTalentCatalog = {
            format: "field_index_coach_talent_catalog",
            version: 1,
            source: "live_save",
            available: false,
            trees: [],
            definitions: [],
            treeCount: 0,
            talentCount: 0
        };
    }

    static async open(savePath, options = {}) {
        if (!savePath || !fs.existsSync(savePath)) {
            throw new Error("Dynasty save file does not exist");
        }
        const schemaDirectory = options.schemaDirectory ?? DEFAULT_SCHEMA_DIRECTORY;
        const franchise = await Franchise.create(savePath, { schemaDirectory });
        if (franchise.gameType !== "college" || franchise.gameYear !== 27) {
            throw new Error("Field Index editor requires a valid CFB27 Dynasty save");
        }
        const editor = new FieldIndexEditor(franchise, savePath, schemaDirectory, options);
        await editor.#loadCoreTables();
        editor.coachTalentCatalog = await buildCoachTalentCatalog(franchise);
        return editor;
    }

    async #readTable(uniqueId) {
        const table = this.franchise.getTableByUniqueId(uniqueId);
        if (!table) throw new Error(`Required table not found: ${uniqueId}`);
        if (!table.recordsRead) await table.readRecords();
        return table;
    }

    async #loadCoreTables() {
        this.tables.player = await this.#readTable(TABLE_IDS.Player);
        this.tables.seasonInfo = await this.#readTable(TABLE_IDS.SeasonInfo);

        const rawCoachTable = this.franchise.getTableByUniqueId(TABLE_IDS.Coach);
        this.coachSchemaCompatibility = ensureCoachTableSchema(this.franchise, rawCoachTable);
        this.tables.coach = await this.#readTable(TABLE_IDS.Coach);
        this.tables.team = await this.#readTable(TABLE_IDS.Team);
        this.tables.mySchool = await this.#readTable(TABLE_IDS.MySchoolTrackingTable);
        this.tables.seasonGame = await this.#readTable(TABLE_IDS.SeasonGame);
        this.tables.bowlGame = await this.#readTable(TABLE_IDS.BowlGame);
        this.tables.activeTalentTree = await this.#readTable(TABLE_IDS.ActiveTalentTree);
        this.tables.talentSubTreeStatusArray = await this.#readTable(TABLE_IDS.TalentSubTreeStatusArray);
        this.tables.talentSubTreeStatus = await this.#readTable(TABLE_IDS.TalentSubTreeStatus);

        // Playing Style grades live in a referenced PlayerTypeGradeTable rather than directly on Team.
        const sampleMySchool = this.tables.mySchool.records.find(record => !record.isEmpty);
        const playingStyleRef = sampleMySchool?.getReferenceDataByKey("PlayingStyleGradeByPlayerTypeTable");
        if (playingStyleRef?.tableId) {
            const table = this.franchise.getTableById(playingStyleRef.tableId);
            if (table && !table.recordsRead) await table.readRecords();
            this.tables.playerTypeGrade = table ?? null;
        } else {
            this.tables.playerTypeGrade = null;
        }
    }

    #playerRecord(playerRow) {
        const record = this.tables.player.records[playerRow];
        if (!record || record.isEmpty) throw new Error(`Player row ${playerRow} not found`);
        return record;
    }

    #currentSeasonIndex() {
        const seasonInfo = this.tables.seasonInfo?.records?.find(record => !record.isEmpty) ?? null;
        const currentSeasonYear = seasonInfo?.CurrentSeasonYear;
        return Number.isInteger(currentSeasonYear) ? currentSeasonYear - 2026 : null;
    }

    async #playerSeasonStats(playerRow) {
        const player = this.#playerRecord(playerRow);
        const seasonStatsArray = await this.#referencedRecord(player, "SeasonStats");
        if (!seasonStatsArray || seasonStatsArray.isEmpty) return [];

        const seasonStats = [];
        for (let index = 0; index < seasonStatsArray.arraySize; index++) {
            const fieldName = `SeasonStats${index}`;
            const reference = seasonStatsArray.getReferenceDataByKey(fieldName);
            if (!reference || reference.tableId === 0) continue;
            const table = this.franchise.getTableById(reference.tableId);
            if (!table) continue;
            if (!table.recordsRead) await table.readRecords();
            const statRecord = table.records[reference.rowNumber];
            if (!statRecord || statRecord.isEmpty) continue;
            seasonStats.push({
                seasonYear: statRecord.SEAS_YEAR,
                teamIndex: statRecord.YEARBYYEARTEAMINDEX,
                gamesPlayed: statRecord.GAMESPLAYED ?? 0,
                statType: statRecord._parent?.name ?? null
            });
        }
        return seasonStats;
    }

    #coachRecord(coachRow) {
        const record = this.tables.coach.records[coachRow];
        if (!record || record.isEmpty) throw new Error(`Coach row ${coachRow} not found`);
        return record;
    }

    #teamRecord(teamIndex) {
        const record = this.tables.team.records.find(team => !team.isEmpty && team.TeamIndex === teamIndex);
        if (!record) throw new Error(`Team index ${teamIndex} not found`);
        return record;
    }

    #teamName(teamIndex) {
        if (teamIndex === 255) return "Unassigned";
        return this.#teamRecord(teamIndex).DisplayName;
    }

    async #referencedRecord(record, fieldName) {
        const reference = record?.getReferenceDataByKey(fieldName);
        if (!reference || reference.tableId === 0) return null;
        const table = this.franchise.getTableById(reference.tableId);
        if (!table) return null;
        if (!table.recordsRead) await table.readRecords();
        return table.records[reference.rowNumber] ?? null;
    }

    async #depthChartRecord(teamIndex) {
        const teamRecord = this.#teamRecord(teamIndex);
        const depthChartRecord = await this.#referencedRecord(teamRecord, "DepthChart");
        if (!depthChartRecord || depthChartRecord.isEmpty) {
            throw new Error(`Team ${teamIndex} has no depth chart`);
        }
        return { teamRecord, depthChartRecord };
    }

    async #depthChartPositionArray(teamIndex, position) {
        const normalizedPosition = String(position ?? "").trim().toUpperCase();
        if (!normalizedPosition) throw new Error("Depth-chart position is required");

        const { teamRecord, depthChartRecord } = await this.#depthChartRecord(teamIndex);
        const positionField = depthChartRecord.getFieldByKey(normalizedPosition);
        if (!positionField || !positionField.isReference || normalizedPosition === "LOCKEDENTRIES") {
            throw new Error(`Unknown depth-chart position: ${position}`);
        }

        const playerArray = await this.#referencedRecord(depthChartRecord, normalizedPosition);
        if (!playerArray || playerArray.isEmpty) {
            throw new Error(`Depth-chart position ${normalizedPosition} is unavailable for team ${teamIndex}`);
        }

        const slotFields = playerArray._offsetTable
            .filter(field => field.isReference && /^Player\d+$/i.test(field.name))
            .sort((a, b) => Number(a.name.replace(/\D/g, "")) - Number(b.name.replace(/\D/g, "")));

        if (slotFields.length === 0) {
            throw new Error(`Depth-chart position ${normalizedPosition} has no player slots`);
        }

        return { teamRecord, depthChartRecord, playerArray, slotFields, position: normalizedPosition };
    }

    #mySchoolRecord(teamRecord) {
        const reference = teamRecord?.getReferenceDataByKey("MySchoolTrackingTable");
        if (!reference || reference.tableId === 0) return null;
        return this.tables.mySchool?.records?.[reference.rowNumber] ?? null;
    }

    #playingStyleGradeRecord(mySchoolRecord) {
        const reference = mySchoolRecord?.getReferenceDataByKey("PlayingStyleGradeByPlayerTypeTable");
        if (!reference || reference.tableId === 0) return null;
        const table = this.franchise.getTableById(reference.tableId);
        return table?.recordsRead ? table.records[reference.rowNumber] ?? null : null;
    }

    #recordScalarSchema(record, fields) {
        return fields
            .map(name => fieldMetadata(record, name))
            .filter(Boolean)
            .map(meta => ({ ...meta, value: record[meta.field] }));
    }

    #playerAttributeSnapshot(record) {
        return Object.fromEntries(
            record._offsetTable
                .filter(field => field.name === "OverallRating" || field.name.endsWith("Rating"))
                .map(field => [field.name, record[field.name]])
        );
    }

    #playerAbilitySnapshot(record) {
        const physical = PLAYER_PHYSICAL_ABILITY_RANK_FIELDS
            .filter(fieldName => Boolean(record.getFieldByKey(fieldName)))
            .map((fieldName, index) => ({
                slot: index + 1,
                field: fieldName,
                rank: record[fieldName]
            }));

        const mental = PLAYER_MENTAL_ABILITY_FIELDS.map((abilityField, index) => {
            const rankField = PLAYER_MENTAL_ABILITY_RANK_FIELDS[index];
            if (!record.getFieldByKey(abilityField) || !record.getFieldByKey(rankField)) return null;
            return {
                slot: index + 1,
                abilityField,
                rankField,
                ability: record[abilityField],
                rank: record[rankField]
            };
        }).filter(Boolean);

        return {
            skillPoints: record.getFieldByKey("SkillPoints") ? record.SkillPoints : null,
            experiencePoints: record.getFieldByKey("ExperiencePoints") ? record.ExperiencePoints : null,
            developmentTrait: record.getFieldByKey("TraitDevelopment") ? record.TraitDevelopment : null,
            physical,
            mental
        };
    }

    #coachTalentTreeRecord(coachRecord, treeIndex) {
        if (!Number.isInteger(treeIndex) || treeIndex < 0 || treeIndex >= COACH_TALENT_TREE_NAMES.length) {
            throw new Error(`Invalid coach talent tree index: ${treeIndex}`);
        }

        const activeTreeRef = coachRecord.getReferenceDataByKey("ActiveTalentTree");
        if (!activeTreeRef || activeTreeRef.tableId === 0) return null;
        const activeTree = this.tables.activeTalentTree.records[activeTreeRef.rowNumber];
        if (!activeTree || activeTree.isEmpty) return null;

        const listRef = activeTree.getReferenceDataByKey("TalentSubTreeStatusList");
        if (!listRef || listRef.tableId === 0) return null;
        const listRecord = this.tables.talentSubTreeStatusArray.records[listRef.rowNumber];
        if (!listRecord || listRecord.isEmpty) return null;

        const fieldName = `TalentSubTreeStatus${treeIndex}`;
        const subTreeRef = listRecord.getReferenceDataByKey(fieldName);
        if (!subTreeRef || subTreeRef.tableId === 0) {
            return {
                treeIndex,
                treeName: COACH_TALENT_TREE_NAMES[treeIndex],
                available: false,
                listRecord,
                fieldName,
                record: null
            };
        }

        const subTreeRecord = this.tables.talentSubTreeStatus.records[subTreeRef.rowNumber];
        if (!subTreeRecord || subTreeRecord.isEmpty) return null;
        return {
            treeIndex,
            treeName: COACH_TALENT_TREE_NAMES[treeIndex],
            available: true,
            listRecord,
            fieldName,
            record: subTreeRecord
        };
    }

    #coachTalentTreeSnapshot(coachRecord) {
        const trees = [];
        for (let treeIndex = 0; treeIndex < COACH_TALENT_TREE_NAMES.length; treeIndex++) {
            const tree = this.#coachTalentTreeRecord(coachRecord, treeIndex);
            if (!tree || !tree.available || !tree.record) {
                trees.push({
                    treeIndex,
                    treeName: COACH_TALENT_TREE_NAMES[treeIndex],
                    available: false,
                    unlocked: false,
                    coachPointsSpent: null,
                    talents: []
                });
                continue;
            }

            const talents = Array.from({ length: 33 }, (_, talentIndex) => {
                const field = `TalentStatus${talentIndex}`;
                return { talentIndex, field, status: tree.record[field] };
            });
            const rootStatus = talents[0]?.status ?? "Locked";
            const state = rootStatus === "Owned"
                ? "Unlocked"
                : rootStatus === "Purchasable"
                    ? "Purchasable"
                    : "Locked";
            trees.push({
                treeIndex,
                treeName: tree.treeName,
                available: true,
                state,
                rootStatus,
                unlocked: state === "Unlocked",
                purchasable: state === "Purchasable",
                locked: state === "Locked",
                coachPointsSpent: tree.record.CoachPointsSpent ?? 0,
                ownedCount: talents.filter(talent => talent.status === "Owned").length,
                purchasableCount: talents.filter(talent => talent.status === "Purchasable").length,
                notOwnedCount: talents.filter(talent => talent.status === "NotOwned").length,
                lockedCount: talents.filter(talent => talent.status === "Locked").length,
                talents
            });
        }

        return {
            coachPoints: coachRecord.CoachPoints ?? 0,
            experiencePoints: coachRecord.ExperiencePoints ?? 0,
            dominantArchetype: coachRecord.DominantArchetype,
            trees
        };
    }

    async getPlayerRedshirtConsistency(playerRow, proposedRedshirtStatus = undefined) {
        const record = this.#playerRecord(playerRow);
        const currentSeasonIndex = this.#currentSeasonIndex();
        const seasonStats = await this.#playerSeasonStats(playerRow);
        const gamesPlayed = getCurrentSeasonGamesPlayed(seasonStats, currentSeasonIndex);
        return {
            playerRow,
            currentSeasonIndex,
            ...evaluateRedshirtConsistency({
                redshirtStatus: proposedRedshirtStatus ?? record.RedshirtStatus,
                gamesPlayed
            })
        };
    }

    async getPlayer(playerRow) {
        const record = this.#playerRecord(playerRow);
        const redshirtConsistency = await this.getPlayerRedshirtConsistency(playerRow);
        return {
            playerRow: record.index,
            firstName: record.FirstName,
            lastName: record.LastName,
            displayName: `${record.FirstName} ${record.LastName}`.trim(),
            teamIndex: record.TeamIndex,
            teamName: record.TeamIndex === 255 ? "Unassigned" : this.#teamName(record.TeamIndex),
            position: record.Position,
            overallRating: record.OverallRating,
            jerseyNumber: record.JerseyNum,
            heightInches: record.Height,
            weight: (record.Weight ?? 0) + 160,
            classYear: record.SchoolYear,
            redshirtStatus: record.RedshirtStatus,
            currentSeasonGamesPlayed: redshirtConsistency.gamesPlayed,
            redshirtConsistency,
            developmentTrait: record.TraitDevelopment,
            attributes: this.#playerAttributeSnapshot(record),
            abilities: this.#playerAbilitySnapshot(record),
            head: this.getPlayerHeadId(playerRow),
            appearance: await this.getPlayerAppearance(playerRow)
        };
    }

    async getPlayerAppearance(playerRow) {
        const record = this.#playerRecord(playerRow);
        const fields = {};
        for (const fieldName of PLAYER_APPEARANCE_FIELDS) {
            if (!record.getFieldByKey(fieldName)) continue;
            if (fieldName === "Weight") fields.weight = (record.Weight ?? 0) + 160;
            else if (fieldName === "Height") fields.heightInches = record.Height;
            else fields[fieldName] = record[fieldName];
        }
        return {
            fields,
            schema: this.#recordScalarSchema(record, PLAYER_APPEARANCE_FIELDS),
            equipmentEditing: false
        };
    }

    async getCoach(coachRow) {
        const record = this.#coachRecord(coachRow);
        return {
            coachRow: record.index,
            firstName: record.FirstName,
            lastName: record.LastName,
            displayName: `${record.FirstName} ${record.LastName}`.trim(),
            teamIndex: record.TeamIndex,
            teamName: record.TeamIndex === 255 ? "Unassigned" : this.#teamName(record.TeamIndex),
            position: record.Position,
            age: record.Age,
            level: record.Level,
            coachPrestige: record.CoachPrestige,
            coachPrestigeScore: record.CoachPrestigeScore,
            coachPoints: record.CoachPoints ?? 0,
            experiencePoints: record.ExperiencePoints ?? 0,
            talentTree: enrichCoachTalentTreeSnapshot(
                this.#coachTalentTreeSnapshot(record),
                this.coachTalentCatalog
            ),
            heightInches: record.Height,
            weight: (record.Weight ?? 0) + 160,
            appearance: await this.getCoachAppearance(coachRow)
        };
    }

    async getCoachAppearance(coachRow) {
        const record = this.#coachRecord(coachRow);
        const fields = {};
        for (const fieldName of COACH_APPEARANCE_FIELDS) {
            if (!record.getFieldByKey(fieldName)) continue;
            if (fieldName === "Weight") fields.weight = (record.Weight ?? 0) + 160;
            else if (fieldName === "Height") fields.heightInches = record.Height ?? 0;
            else fields[fieldName] = record[fieldName];
        }
        return {
            fields,
            schema: this.#recordScalarSchema(record, COACH_APPEARANCE_FIELDS),
            equipmentEditing: false
        };
    }

    getPlayerEditSchema(playerRow) {
        const record = this.#playerRecord(playerRow);
        const aliases = {};
        for (const [alias, fieldName] of Object.entries(PLAYER_ALIAS_FIELDS)) {
            const meta = fieldMetadata(record, fieldName);
            if (meta) aliases[alias] = { ...meta, value: alias === "weight" ? (record.Weight ?? 0) + 160 : record[fieldName] };
        }
        const weightMeta = fieldMetadata(record, "Weight");
        if (weightMeta) aliases.weight = {
            ...weightMeta,
            minValue: 160,
            maxValue: 415,
            value: (record.Weight ?? 0) + 160,
            storedOffset: -160
        };
        const ratings = record._offsetTable
            .filter(field => field.name === "OverallRating" || field.name.endsWith("Rating"))
            .map(field => ({ ...fieldMetadata(record, field.name), value: record[field.name] }));
        const physicalAbilities = PLAYER_PHYSICAL_ABILITY_RANK_FIELDS
            .map(fieldName => fieldMetadata(record, fieldName))
            .filter(Boolean)
            .map((meta, index) => ({ slot: index + 1, ...meta, value: record[meta.field] }));
        const mentalAbilities = PLAYER_MENTAL_ABILITY_FIELDS.map((abilityField, index) => {
            const rankField = PLAYER_MENTAL_ABILITY_RANK_FIELDS[index];
            const abilityMeta = fieldMetadata(record, abilityField);
            const rankMeta = fieldMetadata(record, rankField);
            if (!abilityMeta || !rankMeta) return null;
            return {
                slot: index + 1,
                ability: { ...abilityMeta, value: record[abilityField] },
                rank: { ...rankMeta, value: record[rankField] }
            };
        }).filter(Boolean);
        return {
            aliases,
            ratings,
            abilities: {
                skillPoints: fieldMetadata(record, "SkillPoints")
                    ? { ...fieldMetadata(record, "SkillPoints"), value: record.SkillPoints }
                    : null,
                experiencePoints: fieldMetadata(record, "ExperiencePoints")
                    ? { ...fieldMetadata(record, "ExperiencePoints"), value: record.ExperiencePoints }
                    : null,
                physical: physicalAbilities,
                mental: mentalAbilities
            },
            appearance: this.#recordScalarSchema(record, PLAYER_SAFE_APPEARANCE_FIELDS)
        };
    }

    getPlayerAbilities(playerRow) {
        return this.#playerAbilitySnapshot(this.#playerRecord(playerRow));
    }

    getCoachTalentCatalog() {
        return copyJson(this.coachTalentCatalog);
    }

    getCoachTalentTree(coachRow) {
        return enrichCoachTalentTreeSnapshot(
            this.#coachTalentTreeSnapshot(this.#coachRecord(coachRow)),
            this.coachTalentCatalog
        );
    }

    getCoachEditSchema(coachRow) {
        const record = this.#coachRecord(coachRow);
        const aliases = {};
        for (const [alias, fieldName] of Object.entries(COACH_ALIAS_FIELDS)) {
            const meta = fieldMetadata(record, fieldName);
            if (meta) {
                aliases[alias] = {
                    ...meta,
                    value: alias === "weight" ? (record.Weight ?? 0) + 160 : record[fieldName]
                };
            }
        }
        return {
            aliases,
            talentTree: enrichCoachTalentTreeSnapshot(
                this.#coachTalentTreeSnapshot(record),
                this.coachTalentCatalog
            ),
            talentCatalog: copyJson(this.coachTalentCatalog),
            appearance: this.#recordScalarSchema(record, COACH_APPEARANCE_FIELDS)
        };
    }

    #applyScalarChanges(record, changes, aliases, entityLabel) {
        const applied = [];
        for (const [key, requestedValue] of Object.entries(changes ?? {})) {
            if (["ratings", "rawFields", "weight", "abilities", "talentTree"].includes(key)) continue;
            const fieldName = aliases[key];
            if (!fieldName) {
                throw new Error(`${entityLabel}: unsupported production edit field ${key}`);
            }
            if (!record.getFieldByKey(fieldName)) {
                throw new Error(`${entityLabel}: field ${fieldName} is unavailable in this save`);
            }
            const businessValidated = aliases === PLAYER_ALIAS_FIELDS
                ? validatePlayerBusinessRule(key, requestedValue)
                : requestedValue;
            const value = validateFieldValue(record, fieldName, businessValidated);
            const before = record[fieldName];
            record[fieldName] = value;
            applied.push({ field: fieldName, alias: key, before, after: record[fieldName] });
        }
        return applied;
    }

    #applyPlayerAbilityChanges(record, changes = {}) {
        const applied = [];

        for (const fieldName of ["SkillPoints", "ExperiencePoints"]) {
            const key = fieldName === "SkillPoints" ? "skillPoints" : "experiencePoints";
            if (changes[key] === undefined) continue;
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, changes[key]);
            applied.push({ group: "abilities", field: fieldName, before, after: record[fieldName] });
        }

        const physicalChanges = changes.physical ?? changes.physicalRanks ?? {};
        for (const [slotKey, requestedRank] of Object.entries(physicalChanges)) {
            const slot = Number(slotKey);
            if (!Number.isInteger(slot) || slot < 1 || slot > PLAYER_PHYSICAL_ABILITY_RANK_FIELDS.length) {
                throw new Error(`Physical ability slot must be 1-${PLAYER_PHYSICAL_ABILITY_RANK_FIELDS.length}`);
            }
            const fieldName = PLAYER_PHYSICAL_ABILITY_RANK_FIELDS[slot - 1];
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, requestedRank);
            applied.push({ group: "physicalAbility", slot, field: fieldName, before, after: record[fieldName] });
        }

        const mentalChanges = changes.mental ?? {};
        for (const [slotKey, requested] of Object.entries(mentalChanges)) {
            const slot = Number(slotKey);
            if (!Number.isInteger(slot) || slot < 1 || slot > PLAYER_MENTAL_ABILITY_FIELDS.length) {
                throw new Error(`Mental ability slot must be 1-${PLAYER_MENTAL_ABILITY_FIELDS.length}`);
            }
            if (!requested || typeof requested !== "object") {
                throw new Error(`Mental ability slot ${slot} must be an object with ability and/or rank`);
            }
            const abilityField = PLAYER_MENTAL_ABILITY_FIELDS[slot - 1];
            const rankField = PLAYER_MENTAL_ABILITY_RANK_FIELDS[slot - 1];
            let finalAbility = requested.ability !== undefined
                ? validateFieldValue(record, abilityField, requested.ability)
                : record[abilityField];
            let finalRank = requested.rank !== undefined
                ? validateFieldValue(record, rankField, requested.rank)
                : record[rankField];

            // CFB27 stores empty mental slots as None/None. Keep the pair internally consistent.
            if (finalAbility === "None" && requested.rank === undefined) finalRank = "None";
            if (finalRank === "None" && requested.ability === undefined) finalAbility = "None";
            if ((finalAbility === "None") !== (finalRank === "None")) {
                throw new Error(`Mental ability slot ${slot} must use None/None or a named ability with a non-None rank`);
            }

            if (record[abilityField] !== finalAbility) {
                const before = record[abilityField];
                record[abilityField] = finalAbility;
                applied.push({ group: "mentalAbility", slot, field: abilityField, before, after: finalAbility });
            }
            if (record[rankField] !== finalRank) {
                const before = record[rankField];
                record[rankField] = finalRank;
                applied.push({ group: "mentalAbility", slot, field: rankField, before, after: finalRank });
            }
        }

        return applied;
    }

    editPlayerAbilities(playerRow, changes = {}) {
        const record = this.#playerRecord(playerRow);
        const applied = this.#applyPlayerAbilityChanges(record, changes);
        this.changeLog.push({ type: "playerAbilities", playerRow, changes: applied });
        return applied;
    }

    #applyCoachTalentTreeChanges(record, changes = {}) {
        const applied = [];
        const treeChanges = changes.trees ?? changes;

        for (const [treeKey, requested] of Object.entries(treeChanges ?? {})) {
            if (!requested || typeof requested !== "object") {
                throw new Error(`Coach talent tree ${treeKey} changes must be an object`);
            }
            const treeIndex = coachTalentTreeIndex(/^\d+$/.test(String(treeKey)) ? Number(treeKey) : treeKey);
            const tree = this.#coachTalentTreeRecord(record, treeIndex);
            if (!tree || !tree.available || !tree.record) {
                throw new Error(`Coach does not have an editable ${COACH_TALENT_TREE_NAMES[treeIndex]} subtree record`);
            }

            const subTree = tree.record;
            const talentFields = Array.from({ length: 33 }, (_, index) => `TalentStatus${index}`);
            const rootStatus = subTree.TalentStatus0;
            const currentState = rootStatus === "Owned"
                ? "Unlocked"
                : rootStatus === "Purchasable"
                    ? "Purchasable"
                    : "Locked";

            let requestedState = requested.state;
            if (requested.unlocked !== undefined) {
                requestedState = requested.unlocked ? "Unlocked" : "Locked";
            }
            if (requestedState !== undefined) {
                const normalizedState = String(requestedState).toLowerCase();
                const state = normalizedState === "unlocked" || normalizedState === "owned"
                    ? "Unlocked"
                    : normalizedState === "purchasable" || normalizedState === "available"
                        ? "Purchasable"
                        : normalizedState === "locked"
                            ? "Locked"
                            : null;
                if (!state) {
                    throw new Error(`Talent tree state must be Unlocked, Purchasable, or Locked`);
                }

                const hasOwnedTalent = talentFields.some(field => subTree[field] === "Owned");
                if (state !== "Unlocked" && hasOwnedTalent && requested.force !== true) {
                    throw new Error(`Changing ${tree.treeName} from Unlocked would remove owned talents; pass force: true to confirm`);
                }

                if (state === "Unlocked" && currentState !== "Unlocked") {
                    // In populated CFB27 saves, an owned archetype stores the root as Owned
                    // and its remaining usable nodes as Purchasable until they are bought.
                    for (let index = 0; index < talentFields.length; index++) {
                        const fieldName = talentFields[index];
                        const desired = index === 0
                            ? "Owned"
                            : ["Owned", "Purchasable"].includes(subTree[fieldName])
                                ? subTree[fieldName]
                                : "Purchasable";
                        if (subTree[fieldName] === desired) continue;
                        const before = subTree[fieldName];
                        subTree[fieldName] = validateFieldValue(subTree, fieldName, desired);
                        applied.push({
                            group: "coachTalentTree",
                            treeIndex,
                            treeName: tree.treeName,
                            field: fieldName,
                            before,
                            after: subTree[fieldName],
                            action: "unlock"
                        });
                    }
                } else if (state === "Purchasable" && currentState !== "Purchasable") {
                    for (let index = 0; index < talentFields.length; index++) {
                        const fieldName = talentFields[index];
                        const desired = index === 0 ? "Purchasable" : "NotOwned";
                        if (subTree[fieldName] === desired) continue;
                        const before = subTree[fieldName];
                        subTree[fieldName] = validateFieldValue(subTree, fieldName, desired);
                        applied.push({
                            group: "coachTalentTree",
                            treeIndex,
                            treeName: tree.treeName,
                            field: fieldName,
                            before,
                            after: subTree[fieldName],
                            action: "makePurchasable"
                        });
                    }
                    if (subTree.CoachPointsSpent !== 0) {
                        const before = subTree.CoachPointsSpent;
                        subTree.CoachPointsSpent = validateFieldValue(subTree, "CoachPointsSpent", 0);
                        applied.push({
                            group: "coachTalentTree",
                            treeIndex,
                            treeName: tree.treeName,
                            field: "CoachPointsSpent",
                            before,
                            after: 0,
                            action: "makePurchasable"
                        });
                    }
                } else if (state === "Locked" && currentState !== "Locked") {
                    for (const fieldName of talentFields) {
                        if (subTree[fieldName] === "Locked") continue;
                        const before = subTree[fieldName];
                        subTree[fieldName] = validateFieldValue(subTree, fieldName, "Locked");
                        applied.push({
                            group: "coachTalentTree",
                            treeIndex,
                            treeName: tree.treeName,
                            field: fieldName,
                            before,
                            after: subTree[fieldName],
                            action: "lock"
                        });
                    }
                    if (subTree.CoachPointsSpent !== 0) {
                        const before = subTree.CoachPointsSpent;
                        subTree.CoachPointsSpent = validateFieldValue(subTree, "CoachPointsSpent", 0);
                        applied.push({
                            group: "coachTalentTree",
                            treeIndex,
                            treeName: tree.treeName,
                            field: "CoachPointsSpent",
                            before,
                            after: 0,
                            action: "lock"
                        });
                    }
                }
            }

            if (requested.coachPointsSpent !== undefined) {
                const before = subTree.CoachPointsSpent;
                subTree.CoachPointsSpent = validateFieldValue(
                    subTree,
                    "CoachPointsSpent",
                    requested.coachPointsSpent
                );
                applied.push({
                    group: "coachTalentTree",
                    treeIndex,
                    treeName: tree.treeName,
                    field: "CoachPointsSpent",
                    before,
                    after: subTree.CoachPointsSpent
                });
            }

            for (const [talentKey, requestedStatus] of Object.entries(requested.talents ?? {})) {
                const numericKey = /^\d+$/.test(String(talentKey));
                let talentIndex;
                let talentDefinition = null;
                if (numericKey) {
                    talentIndex = Number(talentKey);
                    if (!Number.isInteger(talentIndex) || talentIndex < 0 || talentIndex > 32) {
                        throw new Error("Coach talent node index must be 0-32");
                    }
                } else {
                    if (!this.coachTalentCatalog?.available) {
                        throw new Error(
                            `Named coach talent editing requires the live CFB27 TalentSubTree catalog; ` +
                            `use a numeric talent index when the catalog is unavailable`
                        );
                    }
                    const resolved = resolveCoachTalentIdentifier(
                        this.coachTalentCatalog,
                        treeIndex,
                        talentKey
                    );
                    talentIndex = resolved.talentIndex;
                    talentDefinition = resolved.talent;
                }
                if (!TALENT_STATUS_VALUES.includes(requestedStatus)) {
                    throw new Error(`Talent status must be one of: ${TALENT_STATUS_VALUES.join(", ")}`);
                }
                const fieldName = `TalentStatus${talentIndex}`;
                const before = subTree[fieldName];
                subTree[fieldName] = validateFieldValue(subTree, fieldName, requestedStatus);
                applied.push({
                    group: "coachTalentTree",
                    treeIndex,
                    treeName: tree.treeName,
                    talentIndex,
                    talentName: talentDefinition?.name ?? null,
                    field: fieldName,
                    before,
                    after: subTree[fieldName]
                });
            }
        }

        return applied;
    }

    editCoachTalentTree(coachRow, changes = {}) {
        const record = this.#coachRecord(coachRow);
        const applied = this.#applyCoachTalentTreeChanges(record, changes);
        this.changeLog.push({ type: "coachTalentTree", coachRow, changes: applied });
        return applied;
    }

    setCoachPoints(coachRow, coachPoints) {
        return this.editCoach(coachRow, { coachPoints });
    }

    setCoachExperiencePoints(coachRow, experiencePoints) {
        return this.editCoach(coachRow, { experiencePoints });
    }

    setCoachTalentTreeState(coachRow, tree, state, options = {}) {
        return this.editCoachTalentTree(coachRow, {
            trees: {
                [tree]: { state, force: options.force === true }
            }
        });
    }

    unlockCoachTalentTree(coachRow, tree) {
        return this.setCoachTalentTreeState(coachRow, tree, "Unlocked");
    }

    makeCoachTalentTreePurchasable(coachRow, tree, options = {}) {
        return this.setCoachTalentTreeState(coachRow, tree, "Purchasable", options);
    }

    lockCoachTalentTree(coachRow, tree, options = {}) {
        return this.setCoachTalentTreeState(coachRow, tree, "Locked", options);
    }

    setCoachTalentStatus(coachRow, tree, talent, status) {
        return this.editCoachTalentTree(coachRow, {
            trees: {
                [tree]: { talents: { [talent]: status } }
            }
        });
    }

    unlockCoachTalent(coachRow, tree, talent) {
        return this.setCoachTalentStatus(coachRow, tree, talent, "Owned");
    }

    editPlayer(playerRow, changes = {}) {
        const record = this.#playerRecord(playerRow);
        const applied = [];

        const scalarChanges = { ...changes };
        delete scalarChanges.ratings;
        delete scalarChanges.rawFields;
        delete scalarChanges.weight;
        delete scalarChanges.abilities;
        applied.push(...this.#applyScalarChanges(record, scalarChanges, PLAYER_ALIAS_FIELDS, `Player ${playerRow}`));
        if (changes.abilities) {
            applied.push(...this.#applyPlayerAbilityChanges(record, changes.abilities));
        }

        if (changes.weight !== undefined) {
            const displayWeight = normalizeNumber(changes.weight, "weight");
            if (displayWeight < 160 || displayWeight > 415) throw new Error("weight must be between 160 and 415 pounds");
            const rawWeight = displayWeight - 160;
            const before = record.Weight;
            record.Weight = validateFieldValue(record, "Weight", rawWeight);
            applied.push({ field: "Weight", before, after: record.Weight, displayAfter: displayWeight });
        }

        for (const [fieldName, requestedValue] of Object.entries(changes.ratings ?? {})) {
            if (!(fieldName === "OverallRating" || fieldName.endsWith("Rating"))) {
                throw new Error(`Player ${playerRow}: ${fieldName} is not a rating field`);
            }
            if (!record.getFieldByKey(fieldName)) throw new Error(`Player ${playerRow}: unknown rating ${fieldName}`);
            const rating = normalizeNumber(requestedValue, fieldName);
            if (!Number.isInteger(rating) || rating < 0 || rating > 99) {
                throw new Error(`${fieldName} must be an integer from 0 to 99`);
            }
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, rating);
            applied.push({ field: fieldName, before, after: record[fieldName] });
        }

        const rawFieldEntries = Object.entries(changes.rawFields ?? {});
        if (rawFieldEntries.length > 0 && !this.allowUnsafeRawFields) {
            throw new Error("rawFields are disabled in production editing. Use the supported player edit whitelist.");
        }
        for (const [fieldName, requestedValue] of rawFieldEntries) {
            const field = record.getFieldByKey(fieldName);
            if (!field) throw new Error(`Player ${playerRow}: unknown raw field ${fieldName}`);
            if (field.isReference) throw new Error(`Player ${playerRow}: reference field ${fieldName} is not allowed in rawFields`);
            if (["CharacterVisuals", "CharacterGameplay"].includes(fieldName)) throw new Error(`${fieldName} must use the appearance editor`);
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, requestedValue);
            applied.push({ field: fieldName, before, after: record[fieldName] });
        }

        this.changeLog.push({ type: "player", playerRow, changes: applied });
        return applied;
    }

    editPlayerAppearance(playerRow, changes = {}) {
        const record = this.#playerRecord(playerRow);
        const applied = [];
        for (const [key, requestedValue] of Object.entries(changes)) {
            let fieldName = key;
            let value = requestedValue;
            if (key === "weight") {
                const displayWeight = normalizeNumber(requestedValue, "weight");
                if (displayWeight < 160 || displayWeight > 415) throw new Error("weight must be between 160 and 415 pounds");
                fieldName = "Weight";
                value = displayWeight - 160;
            } else if (key === "heightInches") {
                fieldName = "Height";
            }
            if (!PLAYER_APPEARANCE_FIELDS.includes(fieldName)) {
                throw new Error(`Player appearance field ${key} is not supported`);
            }
            if (PLAYER_HEAD_IDENTITY_FIELDS.has(fieldName)) {
                throw new Error(`${fieldName} is controlled by the Head ID service and cannot be edited directly`);
            }
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, value);
            applied.push({ field: fieldName, before, after: record[fieldName] });
        }
        this.changeLog.push({ type: "playerAppearance", playerRow, changes: applied });
        return applied;
    }

    // -------------------- PLAYER HEAD ID SERVICE --------------------
    getPlayerHeadId(playerRow) {
        const record = this.#playerRecord(playerRow);
        const identity = detectHeadIdentity(record);
        let catalogEntry = null;

        if (identity.canonicalKey) {
            try {
                catalogEntry = this.headCatalog.resolve(identity.canonicalKey);
            } catch {
                catalogEntry = null;
            }
        }

        return {
            headId: identity.headId,
            headType: identity.headType,
            canonicalKey: identity.canonicalKey,
            assetName: identity.assetName,
            genericHeadAssetName: identity.genericHeadAssetName,
            knownFormat: identity.knownFormat,
            catalogKnown: Boolean(catalogEntry),
            catalogUsable: Boolean(
                catalogEntry?.profile_complete
                && catalogEntry?.portrait_id !== null
            ),
            portraitId: record.PLYR_PORTRAIT ?? null,
            portraitAssetPath: catalogEntry?.portrait_asset_path ?? null
        };
    }

    getHeadById(headId, options = {}) {
        return this.headCatalog.resolve(headId, options);
    }

    listHeadIds(options = {}) {
        return this.headCatalog.list(options);
    }

    async getPlayerHeadProfile(playerRow) {
        const record = this.#playerRecord(playerRow);
        return getPlayerHeadProfile(this.franchise, record);
    }

    async setPlayerHeadProfile(playerRow, headProfile, options = {}) {
        const record = this.#playerRecord(playerRow);
        const beforeIdentity = detectHeadIdentity(record);
        const requestedHeadType = String(headProfile?.headType ?? "").trim().toLowerCase();
        if (!["unique", "generic"].includes(requestedHeadType)) {
            throw new Error("Head profile must identify a unique or generic destination head type");
        }

        const profileValues = {
            GenericHeadAssetName: headProfile?.genericHeadAssetName
        };

        if (requestedHeadType === "unique") {
            profileValues.PLYR_ASSETNAME = headProfile?.assetName;
        } else if (beforeIdentity.headType === "unique") {
            // Generic heads do not have a canonical PLYR_ASSETNAME. Clear a stale
            // unique-head asset when crossing unique -> generic; preserve an
            // existing generic player's player-specific asset name otherwise.
            profileValues.PLYR_ASSETNAME = "";
        }

        if (headProfile?.portrait !== null && headProfile?.portrait !== undefined) {
            profileValues.PLYR_PORTRAIT = headProfile.portrait;
        } else if (!options.allowMissingPortrait) {
            throw new Error("Head profile is missing PLYR_PORTRAIT");
        }

        if (profileValues.GenericHeadAssetName === undefined || profileValues.GenericHeadAssetName === null) {
            throw new Error("Head profile is missing GenericHeadAssetName");
        }
        if (requestedHeadType === "unique" && (profileValues.PLYR_ASSETNAME === undefined || profileValues.PLYR_ASSETNAME === null)) {
            throw new Error("Unique Head profile is missing PLYR_ASSETNAME");
        }

        const validatedValues = Object.fromEntries(
            Object.entries(profileValues).map(([fieldName, requestedValue]) => [
                fieldName,
                validateFieldValue(record, fieldName, requestedValue)
            ])
        );
        const scalarBefore = Object.fromEntries(
            Object.keys(validatedValues).map(fieldName => [fieldName, record[fieldName]])
        );
        const applied = [];
        let visuals;

        try {
            for (const [fieldName, validatedValue] of Object.entries(validatedValues)) {
                record[fieldName] = validatedValue;
                applied.push({
                    field: fieldName,
                    before: scalarBefore[fieldName],
                    after: record[fieldName]
                });
            }

            visuals = await applyPlayerHeadProfilePreserveGear(
                this.franchise,
                record,
                headProfile
            );
        } catch (error) {
            for (const [fieldName, beforeValue] of Object.entries(scalarBefore)) {
                record[fieldName] = beforeValue;
            }
            throw error;
        }

        applied.push({
            field: "CharacterVisuals.Head",
            before: { plusHeadCount: visuals.plusHeadBefore },
            after: {
                plusHeadCount: visuals.plusHeadAfter,
                skinTone: headProfile.skinTone
            },
            preservesGear: true,
            headLoadoutCreated: visuals.headLoadoutCreated
        });

        return {
            playerRow,
            headId: headProfile.headId ?? null,
            canonicalKey: headProfile.canonicalKey ?? null,
            sourcePlayerRow: headProfile.sourcePlayerRow ?? null,
            sourcePlayerName: headProfile.sourcePlayerName ?? null,
            changes: applied,
            characterVisuals: visuals,
            missingPortraitPreserved: headProfile?.portrait === null || headProfile?.portrait === undefined
        };
    }

    async setPlayerHeadId(playerRow, headId, options = {}) {
        const before = this.getPlayerHeadId(playerRow);
        const profile = this.headCatalog.profileFor(headId, {
            headType: options.headType,
            allowMissingPortrait: Boolean(options.allowMissingPortrait)
        });

        if (!options.force && before.canonicalKey === profile.canonicalKey) {
            return {
                playerRow,
                headId: profile.headId,
                canonicalKey: profile.canonicalKey,
                noOp: true,
                reason: "Player already uses this Head ID",
                changes: []
            };
        }

        const result = await this.setPlayerHeadProfile(playerRow, profile, {
            allowMissingPortrait: Boolean(options.allowMissingPortrait)
        });

        this.changeLog.push({
            type: "playerHeadId",
            playerRow,
            beforeHeadId: before.headId,
            beforeCanonicalKey: before.canonicalKey,
            afterHeadId: profile.headId,
            afterCanonicalKey: profile.canonicalKey,
            changes: result.changes
        });

        return {
            ...result,
            before,
            after: this.getPlayerHeadId(playerRow),
            noOp: false
        };
    }

    async copyPlayerHeadId(playerRow, donorPlayerRow) {
        const donorRecord = this.#playerRecord(donorPlayerRow);
        const profile = await getPlayerHeadProfile(this.franchise, donorRecord);
        const result = await this.setPlayerHeadProfile(playerRow, profile);
        this.changeLog.push({
            type: "playerHeadIdDiagnosticCopy",
            playerRow,
            donorPlayerRow,
            changes: result.changes
        });
        return result;
    }

    editCoach(coachRow, changes = {}) {
        const record = this.#coachRecord(coachRow);
        const applied = [];
        const scalarChanges = { ...changes };
        delete scalarChanges.rawFields;
        delete scalarChanges.talentTree;
        applied.push(...this.#applyScalarChanges(record, scalarChanges, COACH_ALIAS_FIELDS, `Coach ${coachRow}`));
        if (changes.talentTree) {
            applied.push(...this.#applyCoachTalentTreeChanges(record, changes.talentTree));
        }

        if (changes.weight !== undefined) {
            const displayWeight = normalizeNumber(changes.weight, "weight");
            if (displayWeight < 160 || displayWeight > 415) throw new Error("weight must be between 160 and 415 pounds");
            const before = record.Weight;
            record.Weight = displayWeight - 160;
            applied.push({ field: "Weight", before, after: record.Weight, displayAfter: displayWeight });
        }

        const rawFieldEntries = Object.entries(changes.rawFields ?? {});
        if (rawFieldEntries.length > 0 && !this.allowUnsafeRawFields) {
            throw new Error("rawFields are disabled in production editing. Use the supported coach edit whitelist.");
        }
        for (const [fieldName, requestedValue] of rawFieldEntries) {
            const field = record.getFieldByKey(fieldName);
            if (!field) throw new Error(`Coach ${coachRow}: unknown raw field ${fieldName}`);
            if (field.isReference) throw new Error(`Coach ${coachRow}: reference field ${fieldName} is not allowed in rawFields`);
            if (fieldName === "CharacterVisuals") throw new Error("CharacterVisuals must use the appearance editor");
            const before = record[fieldName];
            record[fieldName] = validateFieldValue(record, fieldName, requestedValue);
            applied.push({ field: fieldName, before, after: record[fieldName] });
        }
        this.changeLog.push({ type: "coach", coachRow, changes: applied });
        return applied;
    }

    editCoachAppearance(coachRow, changes = {}) {
        const record = this.#coachRecord(coachRow);
        const applied = [];
        for (const [key, requestedValue] of Object.entries(changes)) {
            let fieldName = key;
            let value = requestedValue;
            if (key === "weight") {
                const displayWeight = normalizeNumber(requestedValue, "weight");
                if (displayWeight < 160 || displayWeight > 415) throw new Error("weight must be between 160 and 415 pounds");
                fieldName = "Weight";
                value = displayWeight - 160;
            } else if (key === "heightInches") {
                fieldName = "Height";
            }
            if (!COACH_APPEARANCE_FIELDS.includes(fieldName)) {
                throw new Error(`Coach appearance field ${key} is not supported`);
            }
            const before = record[fieldName];
            if (fieldName === "Weight") record[fieldName] = value;
            else record[fieldName] = validateFieldValue(record, fieldName, value);
            applied.push({ field: fieldName, before, after: record[fieldName] });
        }
        this.changeLog.push({ type: "coachAppearance", coachRow, changes: applied });
        return applied;
    }

    async getDepthChart(teamIndex) {
        const { teamRecord, depthChartRecord } = await this.#depthChartRecord(teamIndex);
        const positions = {};

        for (const field of depthChartRecord._offsetTable) {
            if (!field.isReference || field.name === "LockedEntries") continue;

            const playerArray = await this.#referencedRecord(depthChartRecord, field.name);
            if (!playerArray || playerArray.isEmpty) continue;

            const players = [];
            const slotFields = playerArray._offsetTable
                .filter(slot => slot.isReference && /^Player\d+$/i.test(slot.name))
                .sort((a, b) => Number(a.name.replace(/\D/g, "")) - Number(b.name.replace(/\D/g, "")));

            for (let index = 0; index < slotFields.length; index++) {
                const slotField = slotFields[index];
                const reference = playerArray[slotField.name];
                if (!reference || reference === ZERO_REFERENCE) continue;
                const player = this.franchise.getReferencedRecord(reference);
                if (!player || player.isEmpty || player.TeamIndex !== teamIndex) continue;
                players.push({
                    depth: index + 1,
                    playerRow: player.index,
                    firstName: player.FirstName,
                    lastName: player.LastName,
                    displayName: `${player.FirstName ?? ""} ${player.LastName ?? ""}`.trim(),
                    position: player.Position,
                    jerseyNumber: player.JerseyNum,
                    overallRating: player.OverallRating,
                    teamIndex: player.TeamIndex
                });
            }

            positions[field.name] = players;
        }

        return {
            teamIndex,
            teamName: teamRecord.DisplayName,
            positions
        };
    }

    async editDepthChartPosition(teamIndex, position, orderedPlayerRows = []) {
        if (!Array.isArray(orderedPlayerRows)) {
            throw new Error("Depth-chart player order must be an array of player rows");
        }

        const { teamRecord, playerArray, slotFields, position: normalizedPosition } =
            await this.#depthChartPositionArray(teamIndex, position);

        if (orderedPlayerRows.length > slotFields.length) {
            throw new Error(`Depth-chart position ${normalizedPosition} supports at most ${slotFields.length} players`);
        }

        const normalizedRows = orderedPlayerRows.map((value, index) => {
            const row = Number(value);
            if (!Number.isInteger(row) || row < 0) {
                throw new Error(`Depth-chart player row at index ${index} is invalid`);
            }
            return row;
        });

        if (new Set(normalizedRows).size !== normalizedRows.length) {
            throw new Error(`Depth-chart position ${normalizedPosition} contains duplicate players`);
        }

        const players = normalizedRows.map(row => {
            const player = this.#playerRecord(row);
            if (player.TeamIndex !== teamIndex) {
                throw new Error(`Player row ${row} does not belong to ${teamRecord.DisplayName}`);
            }
            return player;
        });

        const before = slotFields.map(slotField => {
            const reference = playerArray[slotField.name];
            if (!reference || reference === ZERO_REFERENCE) return null;
            const player = this.franchise.getReferencedRecord(reference);
            return player && !player.isEmpty ? player.index : null;
        });

        slotFields.forEach((slotField, index) => {
            const player = players[index];
            playerArray[slotField.name] = player
                ? createReference(this.tables.player, player.index)
                : ZERO_REFERENCE;
        });

        const after = slotFields.map((slotField, index) => {
            const player = players[index];
            return player ? player.index : null;
        });

        const applied = {
            teamIndex,
            teamName: teamRecord.DisplayName,
            position: normalizedPosition,
            slotCount: slotFields.length,
            beforePlayerRows: before,
            afterPlayerRows: after,
            players: players.map((player, index) => ({
                depth: index + 1,
                playerRow: player.index,
                displayName: `${player.FirstName ?? ""} ${player.LastName ?? ""}`.trim(),
                position: player.Position,
                jerseyNumber: player.JerseyNum
            }))
        };

        this.changeLog.push({ type: "depthChart", changes: [applied] });
        return applied;
    }

    async moveDepthChartPlayer(teamIndex, position, playerRow, targetDepth) {
        const chart = await this.getDepthChart(teamIndex);
        const normalizedPosition = String(position ?? "").trim().toUpperCase();
        const current = chart.positions[normalizedPosition];
        if (!current) throw new Error(`Unknown depth-chart position: ${position}`);

        const rows = current.map(player => player.playerRow);
        const row = Number(playerRow);
        const currentIndex = rows.indexOf(row);
        if (currentIndex === -1) {
            throw new Error(`Player row ${playerRow} is not currently in ${normalizedPosition}`);
        }

        const depth = Number(targetDepth);
        if (!Number.isInteger(depth) || depth < 1 || depth > rows.length) {
            throw new Error(`targetDepth must be between 1 and ${rows.length}`);
        }

        rows.splice(currentIndex, 1);
        rows.splice(depth - 1, 0, row);
        return this.editDepthChartPosition(teamIndex, normalizedPosition, rows);
    }

    getTeamGrades(teamIndex) {
        const teamRecord = this.#teamRecord(teamIndex);
        const mySchoolRecord = this.#mySchoolRecord(teamRecord);
        const playingStyleRecord = this.#playingStyleGradeRecord(mySchoolRecord);

        const programPointGrades = {};
        const programPointSchema = {};
        for (const [key, fieldName] of Object.entries(TEAM_PROGRAM_POINT_GRADE_FIELDS)) {
            programPointGrades[key] = teamRecord[fieldName];
            programPointSchema[key] = fieldMetadata(teamRecord, fieldName);
        }

        const mySchoolGrades = {};
        const mySchoolSchema = {};
        if (mySchoolRecord) {
            for (const fieldName of MY_SCHOOL_GRADE_FIELDS) {
                if (!mySchoolRecord.getFieldByKey(fieldName)) continue;
                mySchoolGrades[fieldName] = mySchoolRecord[fieldName];
                mySchoolSchema[fieldName] = fieldMetadata(mySchoolRecord, fieldName);
            }
        }

        const playingStyleGrades = {};
        const playingStyleSchema = {};
        if (playingStyleRecord) {
            for (const field of playingStyleRecord._offsetTable) {
                if (field.type !== "LetterGrade") continue;
                playingStyleGrades[field.name] = playingStyleRecord[field.name];
                playingStyleSchema[field.name] = fieldMetadata(playingStyleRecord, field.name);
            }
        }

        const displayGrades = { ...programPointGrades };
        const displaySchema = { ...programPointSchema };
        for (const [alias, fieldName] of Object.entries(MY_SCHOOL_DISPLAY_GRADE_ALIASES)) {
            if (!Object.hasOwn(mySchoolGrades, fieldName)) continue;
            displayGrades[alias] = mySchoolGrades[fieldName];
            displaySchema[alias] = mySchoolSchema[fieldName];
        }

        return {
            teamIndex,
            teamName: teamRecord.DisplayName,
            teamPrestige: teamRecord.TeamPrestige,
            facilitiesLevel: teamRecord.FacilitiesLevel,

            // Legacy/display aliases prefer game-verified My School authorities.
            // Raw Team.ProgramPoints* values remain available under programPointGrades.
            grades: displayGrades,
            schema: displaySchema,

            programPointGrades,
            programPointSchema,
            mySchoolGrades,
            mySchoolSchema,
            playingStyleGrades,
            playingStyleSchema,
            mySchoolRecordRow: mySchoolRecord?.index ?? null,
            playingStyleGradeRecordRow: playingStyleRecord?.index ?? null
        };
    }

    editTeamGrades(teamIndex, grades = {}) {
        const teamRecord = this.#teamRecord(teamIndex);
        const mySchoolRecord = this.#mySchoolRecord(teamRecord);
        const playingStyleRecord = this.#playingStyleGradeRecord(mySchoolRecord);
        const applied = [];

        // Backward-compatible flat display-grade API: { stadiumAtmosphere: "Aplus" }.
        // Game-verified display aliases route to the authoritative My School field;
        // explicit { programPoints: ... } remains available for raw Team.ProgramPoints*.
        const reservedKeys = new Set(["programPoints", "programPointGrades", "mySchool", "mySchoolGrades", "playingStyle", "playingStyleGrades"]);
        for (const [key, requestedValue] of Object.entries(grades)) {
            if (reservedKeys.has(key)) continue;
            const target = resolveFlatTeamGradeTarget(key);
            if (!target) throw new Error(`Unknown team grade: ${key}`);

            if (target.group === "mySchool") {
                if (!mySchoolRecord) throw new Error(`Team ${teamIndex} has no My School tracking record`);
                const before = mySchoolRecord[target.field];
                mySchoolRecord[target.field] = validateFieldValue(mySchoolRecord, target.field, requestedValue);
                applied.push({ group: "mySchool", field: target.field, alias: key, authority: "gameVerifiedDisplay", before, after: mySchoolRecord[target.field] });
                continue;
            }

            const before = teamRecord[target.field];
            teamRecord[target.field] = validateFieldValue(teamRecord, target.field, requestedValue);
            applied.push({ group: "programPoints", field: target.field, before, after: teamRecord[target.field] });
        }

        const programPointChanges = grades.programPoints ?? grades.programPointGrades ?? {};
        for (const [key, requestedValue] of Object.entries(programPointChanges)) {
            const fieldName = TEAM_PROGRAM_POINT_GRADE_FIELDS[key] ?? key;
            if (!Object.values(TEAM_PROGRAM_POINT_GRADE_FIELDS).includes(fieldName)) {
                throw new Error(`Unknown program-point team grade: ${key}`);
            }
            const before = teamRecord[fieldName];
            teamRecord[fieldName] = validateFieldValue(teamRecord, fieldName, requestedValue);
            applied.push({ group: "programPoints", field: fieldName, before, after: teamRecord[fieldName] });
        }

        const mySchoolChanges = grades.mySchool ?? grades.mySchoolGrades ?? {};
        if (Object.keys(mySchoolChanges).length > 0 && !mySchoolRecord) {
            throw new Error(`Team ${teamIndex} has no My School tracking record`);
        }
        for (const [fieldName, requestedValue] of Object.entries(mySchoolChanges)) {
            if (!MY_SCHOOL_GRADE_FIELDS.includes(fieldName)) {
                throw new Error(`Unknown My School grade: ${fieldName}`);
            }
            const before = mySchoolRecord[fieldName];
            mySchoolRecord[fieldName] = validateFieldValue(mySchoolRecord, fieldName, requestedValue);
            applied.push({ group: "mySchool", field: fieldName, before, after: mySchoolRecord[fieldName] });
        }

        const playingStyleChanges = grades.playingStyle ?? grades.playingStyleGrades ?? {};
        if (Object.keys(playingStyleChanges).length > 0 && !playingStyleRecord) {
            throw new Error(`Team ${teamIndex} has no Playing Style grade record`);
        }
        for (const [fieldName, requestedValue] of Object.entries(playingStyleChanges)) {
            const meta = fieldMetadata(playingStyleRecord, fieldName);
            if (!meta || meta.type !== "LetterGrade") {
                throw new Error(`Unknown Playing Style grade: ${fieldName}`);
            }
            const before = playingStyleRecord[fieldName];
            playingStyleRecord[fieldName] = validateFieldValue(playingStyleRecord, fieldName, requestedValue);
            applied.push({ group: "playingStyle", field: fieldName, before, after: playingStyleRecord[fieldName] });
        }

        this.changeLog.push({ type: "teamGrades", teamIndex, changes: applied });
        return applied;
    }

    getPollRankings(poll = "cfp") {
        const config = POLL_FIELDS[poll];
        if (!config) throw new Error(`Unknown poll: ${poll}`);
        return this.tables.team.records
            .filter(team => !team.isEmpty && team.TeamIndex !== 255)
            .map(team => ({
                teamIndex: team.TeamIndex,
                teamName: team.DisplayName,
                rank: team[config.rank],
                hiddenRank: config.hiddenRank ? team[config.hiddenRank] : null,
                lastRank: config.lastRank ? team[config.lastRank] : null,
                points: config.points ? team[config.points] : null,
                firstPlaceVotes: config.firstPlaceVotes ? team[config.firstPlaceVotes] : null
            }))
            .sort((a, b) => a.rank - b.rank);
    }

    editPollTop25(poll, orderedTeamIndexes, options = {}) {
        const config = POLL_FIELDS[poll];
        if (!config) throw new Error(`Unknown poll: ${poll}`);
        if (!Array.isArray(orderedTeamIndexes) || orderedTeamIndexes.length !== 25) {
            throw new Error("Top 25 editor requires exactly 25 team indexes");
        }
        if (new Set(orderedTeamIndexes).size !== 25) throw new Error("Top 25 contains duplicate teams");
        orderedTeamIndexes.forEach(teamIndex => this.#teamRecord(teamIndex));

        const currentOrder = this.getPollRankings(poll).map(team => team.teamIndex);
        const selected = new Set(orderedTeamIndexes);
        const fullOrder = [...orderedTeamIndexes, ...currentOrder.filter(teamIndex => !selected.has(teamIndex))];
        const applied = [];

        fullOrder.forEach((teamIndex, index) => {
            const record = this.#teamRecord(teamIndex);
            const newRank = index + 1;
            const before = record[config.rank];
            record[config.rank] = validateFieldValue(record, config.rank, newRank);
            if (config.hiddenRank && record.getFieldByKey(config.hiddenRank)) {
                record[config.hiddenRank] = validateFieldValue(record, config.hiddenRank, newRank);
            }
            if (poll === "cfp" && options.syncTeamRank !== false && record.getFieldByKey("TeamRank")) {
                record.TeamRank = validateFieldValue(record, "TeamRank", newRank);
            }
            applied.push({ teamIndex, teamName: record.DisplayName, beforeRank: before, afterRank: newRank });
        });

        this.changeLog.push({ type: "pollTop25", poll, changes: applied.slice(0, 25) });
        return applied.slice(0, 25);
    }

    // -------------------- CFP ATOMIC BRACKET EDITING --------------------

    #bowlRecordForGame(gameRecord) {
        const ref = gameRecord.getReferenceDataByKey("BowlGame");
        if (!ref || ref.tableId === 0 || gameRecord.BowlGame === ZERO_REFERENCE) return null;
        const table = this.franchise.getTableById(ref.tableId);
        return table?.records?.[ref.rowNumber] ?? null;
    }

    #cfpTeamSeedSnapshot(teamRecord) {
        if (!teamRecord) return { teamRank: null, cfpRank: null, seed: null, valid: false };
        const teamRank = Number(teamRecord.TeamRank);
        const cfpRank = Number(teamRecord.CFPPoll_CurrentRank);
        const normalizedTeamRank = Number.isInteger(teamRank) ? teamRank : null;
        const normalizedCfpRank = Number.isInteger(cfpRank) ? cfpRank : null;
        const seed = CFP_FIRST_ROUND_SEEDS.includes(normalizedTeamRank) ? normalizedTeamRank : null;
        return {
            teamRank: normalizedTeamRank,
            cfpRank: normalizedCfpRank,
            seed,
            valid: seed != null && normalizedCfpRank != null,
            pollRankMatchesSeed: seed != null && normalizedCfpRank === seed
        };
    }

    #cfpFirstRoundSeedSlots() {
        const slots = [];
        for (const game of this.tables.seasonGame.records) {
            if (game.isEmpty) continue;
            const bowl = this.#bowlRecordForGame(game);
            if (!bowl || !bowl.IsPlayoffBowl || !CFP_FIRST_ROUND_BRACKET_SLOTS.includes(Number(bowl.PlayoffBracketSlot))) continue;

            const played = ["HomeWon", "AwayWon", "Tie"].includes(game.GameStatus);
            const home = this.franchise.getReferencedRecord(game.HomeTeam);
            const away = this.franchise.getReferencedRecord(game.AwayTeam);
            if (!home || !away) throw new Error(`CFP first-round game row ${game.index} has an unresolved participant`);

            const homeSeed = this.#cfpTeamSeedSnapshot(home);
            const awaySeed = this.#cfpTeamSeedSnapshot(away);
            if (!homeSeed.valid || !awaySeed.valid) {
                throw new Error(
                    `CFP first-round game row ${game.index} is missing a valid TeamRank seed or CFP poll rank. ` +
                    "Field Index will not guess through incomplete playoff state."
                );
            }

            const bowlSeedMarkers = [Number(bowl.Conference1Rank), Number(bowl.Conference2Rank)]
                .filter(Number.isInteger);
            slots.push({
                seed: homeSeed.seed,
                cfpRank: homeSeed.cfpRank,
                teamIndex: home.TeamIndex,
                teamName: home.DisplayName,
                seasonGameRow: game.index,
                bracketSlot: Number(bowl.PlayoffBracketSlot),
                side: "home",
                played,
                bowlSeedMarkers
            });
            slots.push({
                seed: awaySeed.seed,
                cfpRank: awaySeed.cfpRank,
                teamIndex: away.TeamIndex,
                teamName: away.DisplayName,
                seasonGameRow: game.index,
                bracketSlot: Number(bowl.PlayoffBracketSlot),
                side: "away",
                played,
                bowlSeedMarkers
            });
        }
        return validateCfpFirstRoundSlots(slots).slots;
    }

    #resetUnplayedCfpGameState(game) {
        for (const fieldName of [
            "HomePlayerStatCache",
            "AwayPlayerStatCache",
            "HomeTeamStatCache",
            "AwayTeamStatCache",
            "ScoringSummaries"
        ]) {
            if (game.getFieldByKey(fieldName)) game[fieldName] = ZERO_REFERENCE;
        }
        for (const fieldName of [
            "HomeScore", "AwayScore", "HomeScoreOT", "AwayScoreOT",
            "HomeScoreQuarter1", "AwayScoreQuarter1",
            "HomeScoreQuarter2", "AwayScoreQuarter2",
            "HomeScoreQuarter3", "AwayScoreQuarter3",
            "HomeScoreQuarter4", "AwayScoreQuarter4"
        ]) {
            if (game.getFieldByKey(fieldName)) game[fieldName] = 0;
        }
        if (game.getFieldByKey("IsOvertimeGame")) game.IsOvertimeGame = false;
    }

    #validateFixedBowlSeedMarkers(slots, changedGameRows) {
        const preserved = [];
        for (const seasonGameRow of changedGameRows) {
            const gameSlots = slots.filter(slot => slot.seasonGameRow === seasonGameRow);
            const game = this.tables.seasonGame.records[seasonGameRow];
            const bowl = this.#bowlRecordForGame(game);
            const expectedSeeds = gameSlots.map(slot => slot.seed).sort((a, b) => a - b);
            // CFB27 stores these BowlGame values as zero-based seed-slot markers:
            // playoff seeds 5-12 are represented as 4-11. They describe the fixed
            // bracket locations and are preserved when teams are permuted between them.
            const expectedMarkers = expectedSeeds.map(seed => seed - 1);
            const markers = [Number(bowl?.Conference1Rank), Number(bowl?.Conference2Rank)]
                .filter(value => Number.isInteger(value) && value >= 4 && value <= 11)
                .sort((a, b) => a - b);

            if (markers.length !== 2 || markers[0] !== expectedMarkers[0] || markers[1] !== expectedMarkers[1]) {
                throw new Error(
                    `CFP BowlGame slot markers for SeasonGame row ${seasonGameRow} do not match its fixed seed slots ` +
                    `(${markers.join("/")} vs ${expectedMarkers.join("/")} for seeds ${expectedSeeds.join("/")})`
                );
            }
            preserved.push({
                seasonGameRow,
                bracketSlot: gameSlots[0]?.bracketSlot ?? null,
                expectedSeeds,
                expectedConferenceRankMarkers: expectedMarkers,
                conferenceRankMarkers: markers,
                preserved: true
            });
        }
        return preserved;
    }

    #applyCfpFirstRoundPlan(slots, plan, metadata = {}) {
        // Preflight every write before mutating any record. EditSession will also rebuild
        // from the untouched source if a staged operation ever throws.
        for (const change of plan.rankChanges) {
            const team = this.#teamRecord(change.teamIndex);
            if (!team.getFieldByKey("TeamRank") || !team.getFieldByKey("CFPPoll_CurrentRank")) {
                throw new Error(`Team ${change.teamIndex} is missing required CFP rank fields`);
            }
            validateFieldValue(team, "TeamRank", change.afterSeed);
            validateFieldValue(team, "CFPPoll_CurrentRank", change.afterCfpRank);
        }

        const changedGameRows = [...new Set(plan.participantChanges.map(change => change.seasonGameRow))];
        for (const change of plan.participantChanges) {
            const game = this.tables.seasonGame.records[change.seasonGameRow];
            if (!game || game.isEmpty) throw new Error(`SeasonGame row ${change.seasonGameRow} not found`);
            const bowl = this.#bowlRecordForGame(game);
            if (!bowl || !bowl.IsPlayoffBowl || !CFP_FIRST_ROUND_BRACKET_SLOTS.includes(Number(bowl.PlayoffBracketSlot))) {
                throw new Error(`SeasonGame row ${change.seasonGameRow} is not a CFP first-round game`);
            }
            if (["HomeWon", "AwayWon", "Tie"].includes(game.GameStatus)) {
                throw new Error("Field Index will not change participants in an already completed CFP game");
            }
            this.#teamRecord(change.afterTeamIndex);
        }

        // BowlGame Conference1Rank / Conference2Rank are fixed seed-slot markers in the
        // verified first-round case. They must stay attached to the slot; changing only
        // those markers was proven ineffective in-game, so we validate and preserve them.
        const bowlSeedMarkers = this.#validateFixedBowlSeedMarkers(slots, changedGameRows);

        const rankChanges = plan.rankChanges.map(change => {
            const team = this.#teamRecord(change.teamIndex);
            team.TeamRank = validateFieldValue(team, "TeamRank", change.afterSeed);
            team.CFPPoll_CurrentRank = validateFieldValue(team, "CFPPoll_CurrentRank", change.afterCfpRank);
            return {
                ...change,
                teamName: team.DisplayName,
                afterTeamRank: team.TeamRank,
                afterCfpRank: team.CFPPoll_CurrentRank
            };
        });

        const participantChanges = plan.participantChanges.map(change => {
            const game = this.tables.seasonGame.records[change.seasonGameRow];
            const beforeTeam = this.#teamRecord(change.beforeTeamIndex);
            const afterTeam = this.#teamRecord(change.afterTeamIndex);
            const fieldName = change.side === "home" ? "HomeTeam" : "AwayTeam";
            game[fieldName] = createReference(this.tables.team, afterTeam.index);
            return {
                ...change,
                beforeTeamName: beforeTeam.DisplayName,
                afterTeamName: afterTeam.DisplayName
            };
        });

        for (const seasonGameRow of changedGameRows) {
            this.#resetUnplayedCfpGameState(this.tables.seasonGame.records[seasonGameRow]);
        }

        const applied = {
            operation: metadata.operation ?? "seedAssignments",
            mechanic: "verified_first_round_seed_permutation",
            currentAssignments: plan.currentAssignments,
            desiredAssignments: plan.desiredAssignments,
            rankChanges,
            participantChanges,
            changedGameRows,
            bowlSeedMarkers,
            arbitraryTeamInjection: false,
            completedGamesProtected: true
        };
        this.changeLog.push({
            type: metadata.changeLogType ?? "cfpFirstRoundSeedAssignments",
            changes: [...rankChanges, ...participantChanges],
            cfp: applied
        });
        return applied;
    }

    getEditableCfpBracket() {
        const games = [];
        for (const game of this.tables.seasonGame.records) {
            if (game.isEmpty) continue;
            const bowl = this.#bowlRecordForGame(game);
            if (!bowl || !bowl.IsPlayoffBowl) continue;
            const home = this.franchise.getReferencedRecord(game.HomeTeam);
            const away = this.franchise.getReferencedRecord(game.AwayTeam);
            const homeSeed = this.#cfpTeamSeedSnapshot(home);
            const awaySeed = this.#cfpTeamSeedSnapshot(away);
            games.push({
                seasonGameRow: game.index,
                bracketSlot: bowl.PlayoffBracketSlot,
                bowlName: bowl.Name,
                seasonYear: game.SeasonYear,
                week: game.SeasonWeek,
                gameStatus: game.GameStatus,
                played: ["HomeWon", "AwayWon", "Tie"].includes(game.GameStatus),
                homeTeamIndex: home?.TeamIndex ?? null,
                homeTeamName: home?.DisplayName ?? null,
                homeSeed: homeSeed.seed,
                homeTeamRank: homeSeed.teamRank,
                homeCfpRank: homeSeed.cfpRank,
                awayTeamIndex: away?.TeamIndex ?? null,
                awayTeamName: away?.DisplayName ?? null,
                awaySeed: awaySeed.seed,
                awayTeamRank: awaySeed.teamRank,
                awayCfpRank: awaySeed.cfpRank,
                conference1Rank: Number.isInteger(Number(bowl.Conference1Rank)) ? Number(bowl.Conference1Rank) : null,
                conference2Rank: Number.isInteger(Number(bowl.Conference2Rank)) ? Number(bowl.Conference2Rank) : null
            });
        }
        return games.sort((a, b) => a.bracketSlot - b.bracketSlot);
    }

    getCfpFirstRoundSeedAssignments() {
        const slots = this.#cfpFirstRoundSeedSlots();
        return {
            mechanic: "verified_first_round_seed_permutation",
            assignments: Object.fromEntries(slots.map(slot => [slot.seed, slot.teamIndex])),
            slots: copyJson(slots),
            arbitraryTeamInjection: false,
            completedGamesProtected: true
        };
    }

    editCfpFirstRoundSeedAssignments(assignments) {
        const slots = this.#cfpFirstRoundSeedSlots();
        const plan = planCfpFirstRoundSeedAssignments(slots, assignments);
        return this.#applyCfpFirstRoundPlan(slots, plan, { operation: "seedAssignments" });
    }

    swapCfpFirstRoundTeams(teamIndexA, teamIndexB) {
        const slots = this.#cfpFirstRoundSeedSlots();
        const plan = planCfpFirstRoundTeamSwap(slots, teamIndexA, teamIndexB);
        return this.#applyCfpFirstRoundPlan(slots, plan, { operation: "teamSwap" });
    }

    editCfpGameParticipants(seasonGameRow, { homeTeamIndex, awayTeamIndex }) {
        const before = this.getEditableCfpBracket().find(game => game.seasonGameRow === seasonGameRow);
        if (!before) throw new Error(`SeasonGame row ${seasonGameRow} not found in the CFP bracket`);
        if (!CFP_FIRST_ROUND_BRACKET_SLOTS.includes(Number(before.bracketSlot))) {
            throw new Error("Production CFP participant editing is currently limited to the game-verified first round");
        }
        if (before.played) {
            throw new Error("Field Index will not change participants in an already completed CFP game");
        }

        const slots = this.#cfpFirstRoundSeedSlots();
        const plan = planCfpGameParticipantPermutation(slots, seasonGameRow, { homeTeamIndex, awayTeamIndex });
        const atomicPlan = this.#applyCfpFirstRoundPlan(slots, plan, {
            operation: "matchupPermutation",
            changeLogType: "cfpGameParticipants"
        });
        const after = this.getEditableCfpBracket().find(game => game.seasonGameRow === seasonGameRow);

        return {
            seasonGameRow,
            bracketSlot: before.bracketSlot,
            before: {
                homeTeamIndex: before.homeTeamIndex,
                homeTeamName: before.homeTeamName,
                awayTeamIndex: before.awayTeamIndex,
                awayTeamName: before.awayTeamName
            },
            after: {
                homeTeamIndex: after?.homeTeamIndex ?? null,
                homeTeamName: after?.homeTeamName ?? null,
                awayTeamIndex: after?.awayTeamIndex ?? null,
                awayTeamName: after?.awayTeamName ?? null
            },
            atomicPlan
        };
    }

    getCapabilities() {
        const samplePlayer = this.tables.player.records.find(record => !record.isEmpty);
        const sampleCoach = this.tables.coach.records.find(record => !record.isEmpty && record.FirstName && record.LastName);
        return {
            playerEditing: true,
            playerAttributesEditing: true,
            playerClassYearEditing: true,
            redshirtConsistencyWarnings: true,
            playerAbilitiesEditing: true,
            playerPhysicalAbilityRankEditing: true,
            playerPhysicalAbilityTierEditing: true,
            playerMentalAbilityTypeAndRankEditing: true,
            playerMentalAbilityTypeAndTierEditing: true,
            coachEditing: true,
            coachPointsEditing: true,
            coachTalentTreeEditing: true,
            coachTalentNodeStatusEditing: true,
            coachNamedTalentEditing: Boolean(this.coachTalentCatalog?.available),
            coachTalentCatalogTreeCount: this.coachTalentCatalog?.treeCount ?? 0,
            coachTalentCatalogTalentCount: this.coachTalentCatalog?.talentCount ?? 0,
            playerScalarAppearanceEditing: PLAYER_SAFE_APPEARANCE_FIELDS.every(field => !samplePlayer || Boolean(samplePlayer.getFieldByKey(field))),
            playerHeadIdEditing: true,
            playerHeadIdCatalogLoaded: Boolean(this.headCatalog.exists),
            playerHeadIdCatalogCount: this.headCatalog.size,
            playerHeadIdCatalogUsableCount: this.headCatalog.counts.usable,
            playerHeadIdPreservesGear: true,
            playerHeadIdDonorRequired: false,
            characterVisualsHeadEditing: true,
            coachScalarAppearanceEditing: COACH_APPEARANCE_FIELDS.every(field => !sampleCoach || Boolean(sampleCoach.getFieldByKey(field))),
            characterVisualsBlobEditing: false,
            equipmentEditing: false,
            depthChartEditing: true,
            depthChartReordering: true,
            teamGradesEditing: true,
            mySchoolGradesEditing: true,
            playingStyleGradesEditing: Boolean(this.tables.playerTypeGrade),
            top25Editing: true,
            cfpBracketParticipantEditing: true,
            cfpFirstRoundSeedPermutationEditing: true,
            cfpArbitraryTeamInjectionEditing: false,
            cfpCompletedGameEditing: false,
            automaticBackups: true,
            roundTripVerification: true,
            cfb27SafeWriter: true,
            productionRawFieldEditing: false,
            unsafeRawFieldEditingEnabled: this.allowUnsafeRawFields,
            stagedEditingSupportedByBackend: true
        };
    }

    async commit(options = {}) {
        const outputPath = path.resolve(options.outputPath ?? this.savePath);
        const inputPath = path.resolve(this.savePath);
        const overwriteOriginal = outputPath === inputPath;
        let backupPath = null;

        if (!overwriteOriginal && path.basename(outputPath).length > MAX_CFB27_SAVE_FILENAME_LENGTH) {
            throw new Error(
                `CFB27 save filename must be ${MAX_CFB27_SAVE_FILENAME_LENGTH} characters or fewer. `
                + `Use a shorter output name than ${path.basename(outputPath)}.`
            );
        }

        if (overwriteOriginal) {
            if (options.createBackup === false) {
                throw new Error("Overwriting the original save requires a backup");
            }
            const backupDirectory = options.backupDirectory
                ? path.resolve(options.backupDirectory)
                : path.join(path.dirname(inputPath), "FieldIndexBackups");
            fs.mkdirSync(backupDirectory, { recursive: true });
            backupPath = path.join(
                backupDirectory,
                `${path.basename(inputPath)}.field-index-backup-${timestampForFilename()}`
            );
            fs.copyFileSync(inputPath, backupPath);
        } else {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        }

        const safeWrite = writeCfb27DynastySave({
            franchise: this.franchise,
            sourcePath: inputPath,
            outputPath
        });

        let verification = null;
        if (options.verify !== false) {
            const reopened = await Franchise.create(outputPath, { schemaDirectory: this.schemaDirectory });
            verification = {
                loaded: reopened.gameType === "college" && reopened.gameYear === 27,
                gameType: reopened.gameType,
                gameYear: reopened.gameYear,
                schema: reopened.schema.meta
            };
            if (!verification.loaded) {
                throw new Error("Edited save failed round-trip validation");
            }
        }

        return {
            outputPath,
            backupPath,
            changeCount: this.changeLog.reduce((sum, entry) => sum + (entry.changes?.length ?? 1), 0),
            changeLog: copyJson(this.changeLog),
            safeWrite,
            verification
        };
    }
}

export async function openFieldIndexEditor(savePath, options = {}) {
    return FieldIndexEditor.open(savePath, options);
}

export {
    PLAYER_APPEARANCE_FIELDS,
    COACH_APPEARANCE_FIELDS,
    PLAYER_PHYSICAL_ABILITY_RANK_FIELDS,
    PLAYER_MENTAL_ABILITY_FIELDS,
    PLAYER_MENTAL_ABILITY_RANK_FIELDS,
    COACH_TALENT_TREE_NAMES,
    TEAM_GRADE_FIELDS,
    TEAM_PROGRAM_POINT_GRADE_FIELDS,
    MY_SCHOOL_GRADE_FIELDS,
    MY_SCHOOL_DISPLAY_GRADE_ALIASES,
    resolveFlatTeamGradeTarget,
    POLL_FIELDS
};
