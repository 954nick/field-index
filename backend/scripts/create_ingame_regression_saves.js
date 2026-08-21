// -------------------- CFB27 IN-GAME REGRESSION SAVE GENERATOR --------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDynasty } from "../backend/index.js";
import { prepareLocalBackendData } from "./prepare_local_backend_data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
    console.log(`Field Index complete in-game regression save generator

Usage:
  node scripts/create_ingame_regression_saves.js "C:\\...\\DYNASTY-SAVE"

Options:
  --output-dir <folder>      Where short DYNASTY-FI-* test saves are written
  --no-head-auto-build       Do not auto-build/merge Head ID profiles from the source save
  --skip-head-tests          Skip Head ID regression matrix
  --skip-cfp-test            Skip CFP participant-edit regression
  --only-labels <A,B,...>    Internal/test use: generate only selected save labels
  --skip-backup-test         Internal/test use: skip automated backup regression
  --backup-only              Internal/test use: run only automated backup regression
  --report-path <file>       Internal/test use: write report to a custom path
  --help                     Show this help

The source save is never overwritten. Head ID profiles are automatically captured
from the source save unless disabled. Every generated save is parser-reopened by
the production writer before it is reported as created.
`);
}

function parseArgs(argv) {
    const options = {
        source: null,
        outputDirectory: null,
        autoBuildHeads: true,
        skipHeadTests: false,
        skipCfpTest: false,
        onlyLabels: null,
        skipBackupTest: false,
        backupOnly: false,
        reportPath: null,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--output-dir") {
            const value = argv[++index];
            if (!value) throw new Error("--output-dir requires a path");
            options.outputDirectory = value;
        } else if (arg === "--no-head-auto-build") options.autoBuildHeads = false;
        else if (arg === "--skip-head-tests") options.skipHeadTests = true;
        else if (arg === "--skip-cfp-test") options.skipCfpTest = true;
        else if (arg === "--only-labels") {
            const value = argv[++index];
            if (!value) throw new Error("--only-labels requires a comma-separated list");
            options.onlyLabels = new Set(value.split(",").map(item => item.trim().toUpperCase()).filter(Boolean));
        } else if (arg === "--skip-backup-test") options.skipBackupTest = true;
        else if (arg === "--backup-only") options.backupOnly = true;
        else if (arg === "--report-path") {
            const value = argv[++index];
            if (!value) throw new Error("--report-path requires a path");
            options.reportPath = value;
        }
        else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        else if (!options.source) options.source = arg;
        else throw new Error(`Unexpected argument: ${arg}`);
    }
    return options;
}

function nextInteger(value, meta = {}, preferredStep = 1) {
    const current = Number(value ?? 0);
    const min = Number.isFinite(meta.minValue) ? Number(meta.minValue) : Number.MIN_SAFE_INTEGER;
    const max = Number.isFinite(meta.maxValue) ? Number(meta.maxValue) : Number.MAX_SAFE_INTEGER;
    if (current + preferredStep <= max) return current + preferredStep;
    if (current - preferredStep >= min) return current - preferredStep;
    return null;
}

function alternateEnum(meta, current, options = {}) {
    const blocked = new Set(options.blocked ?? []);
    return (meta?.enumValues ?? []).find(value => value !== current && !blocked.has(value)) ?? null;
}

function findPlayer(players, headType, usableKeys) {
    return players.find(player =>
        player.head?.headType === headType &&
        usableKeys.has(player.head?.canonicalKey)
    ) ?? null;
}

function findDestination(entries, headType, currentKey) {
    return entries.find(entry => entry.head_type === headType && entry.canonical_key !== currentKey) ?? null;
}

async function createSave(session, label, outputDirectory, apply) {
    const edit = await session.createEditSession();
    const changes = await apply(edit);
    const result = await edit.commit({ purpose: label, outputDirectory });
    return {
        label,
        status: "created",
        outputPath: result.outputPath,
        changes,
        verification: result.verification ?? result.writeResult?.verification ?? null,
        writer: result.writeResult ?? result
    };
}

function expected(label, checks) {
    return { label, checks };
}

async function createBackupRegression(session, sourcePath) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-backup-regression-"));
    const workingPath = path.join(tempRoot, "DYNASTY-FIBACKUP");
    fs.copyFileSync(sourcePath, workingPath);
    try {
        const tempSession = await loadDynasty(workingPath);
        const player = (tempSession.data.players ?? []).find(item => Number.isFinite(Number(item.overallRating)));
        if (!player) return { status: "skipped", reason: "No editable player found for backup test" };
        const edit = await tempSession.createEditSession();
        const schema = edit.getPlayerEditSchema(player.playerRow);
        const after = nextInteger(player.overallRating, schema.aliases?.overallRating ?? {}, 1);
        if (after == null) return { status: "skipped", reason: "Could not select alternate overall rating" };
        await edit.editPlayer(player.playerRow, { overallRating: after });
        const result = await edit.commit({ overwriteOriginal: true, purpose: "BACKUP" });
        const backupExists = Boolean(result.backupPath && fs.existsSync(result.backupPath));
        const backupMatchesSource = backupExists && fs.readFileSync(result.backupPath).equals(fs.readFileSync(sourcePath));
        return {
            status: backupExists && backupMatchesSource ? "passed" : "failed",
            workingCopy: workingPath,
            backupPath: result.backupPath,
            backupExists,
            backupMatchesOriginalBytes: backupMatchesSource,
            verification: result.verification ?? null
        };
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

async function generateRegressionSaves(options) {
    const sourcePath = path.resolve(options.source);
    if (!fs.existsSync(sourcePath)) throw new Error(`Save not found: ${sourcePath}`);
    const outputDirectory = path.resolve(options.outputDirectory ?? path.dirname(sourcePath));
    fs.mkdirSync(outputDirectory, { recursive: true });

    const preparation = { attemptedHeadAutoBuild: false, result: null, error: null };
    const selectedLabels = options.onlyLabels;
    const headLabels = new Set(["G2U", "U2G", "G2G", "U2U", "HMULTI"]);
    const headTestsSelected = !options.backupOnly && !options.skipHeadTests && (
        !selectedLabels || [...selectedLabels].some(label => headLabels.has(label))
    );

    if (options.autoBuildHeads && headTestsSelected) {
        preparation.attemptedHeadAutoBuild = true;
        try {
            preparation.result = await prepareLocalBackendData({ save: sourcePath });
        } catch (error) {
            preparation.error = error.message;
            console.warn(`Head catalog auto-build warning: ${error.message}`);
        }
    }

    console.log("Loading dynasty through the production backend...");
    const session = await loadDynasty(sourcePath);
    const players = (session.data.players ?? []).filter(player => Number.isInteger(player.playerRow));
    const coaches = (session.data.coaches ?? []).filter(coach => Number.isInteger(coach.coachRow));
    const teams = (session.data.teams ?? []).filter(team => Number.isInteger(team.teamIndex) && team.teamIndex !== 255);
    const outputs = [];
    const skipped = [];
    const expectations = [];

    function shouldRunLabel(label) {
        if (options.backupOnly) return false;
        if (!selectedLabels) return true;
        return selectedLabels.has(String(label).toUpperCase());
    }

    async function attempt(label, checks, apply) {
        if (!shouldRunLabel(label)) return null;
        try {
            const output = await createSave(session, label, outputDirectory, apply);
            outputs.push(output);
            expectations.push(expected(label, checks));
            console.log(`CREATED ${label}: ${output.outputPath}`);
            return output;
        } catch (error) {
            skipped.push({ label, reason: error.message });
            console.warn(`SKIPPED ${label}: ${error.message}`);
            return null;
        }
    }

    // -------------------- PLAYER CORE / BATCH EDITING --------------------
    const corePlayer = players.find(player => Number.isFinite(Number(player.overallRating))) ?? null;
    if (corePlayer) {
        await attempt("PLYR", [
            "Player core scalar edit is visible and correct",
            "Unedited player identity/equipment remains unchanged",
            "Save loads and can be re-saved"
        ], async edit => {
            const schema = edit.getPlayerEditSchema(corePlayer.playerRow);
            const after = nextInteger(corePlayer.overallRating, schema.aliases?.overallRating ?? {}, 1);
            if (after == null) throw new Error("No valid alternate overall rating");
            return {
                target: corePlayer.displayName,
                playerRow: corePlayer.playerRow,
                edits: { overallRating: { before: corePlayer.overallRating, after } },
                result: await edit.editPlayer(corePlayer.playerRow, { overallRating: after })
            };
        });

        await attempt("PCLS", [
            "Class/redshirt edit matches the report",
            "Other player fields remain unchanged"
        ], async edit => {
            const schema = edit.getPlayerEditSchema(corePlayer.playerRow);
            const changes = {};
            const report = {};
            const classMeta = schema.aliases?.classYear;
            if (classMeta) {
                const next = alternateEnum(classMeta, classMeta.value) ?? nextInteger(classMeta.value, classMeta, 1);
                if (next != null) { changes.classYear = next; report.classYear = { before: classMeta.value, after: next }; }
            }
            const rsMeta = schema.aliases?.redshirtStatus;
            if (rsMeta) {
                const next = alternateEnum(rsMeta, rsMeta.value);
                if (next != null) { changes.redshirtStatus = next; report.redshirtStatus = { before: rsMeta.value, after: next }; }
            }
            if (Object.keys(changes).length === 0) throw new Error("No safe class/redshirt alternative is available");
            return { target: corePlayer.displayName, playerRow: corePlayer.playerRow, edits: report, result: await edit.editPlayer(corePlayer.playerRow, changes) };
        });
    }

    const batchPlayers = players.filter(player => Number.isFinite(Number(player.overallRating))).slice(0, 2);
    if (batchPlayers.length === 2) {
        await attempt("BATCH", [
            "Both reported player edits are present in one save",
            "No third player is unintentionally changed"
        ], async edit => {
            const edits = [];
            const report = [];
            for (const player of batchPlayers) {
                const schema = edit.getPlayerEditSchema(player.playerRow);
                const after = nextInteger(player.overallRating, schema.aliases?.overallRating ?? {}, 1);
                if (after == null) throw new Error(`No alternate OVR for ${player.displayName}`);
                edits.push({ playerRow: player.playerRow, changes: { overallRating: after } });
                report.push({ playerRow: player.playerRow, displayName: player.displayName, before: player.overallRating, after });
            }
            return { targets: report, result: await edit.editPlayers(edits) };
        });
    }

    // -------------------- PLAYER ABILITIES --------------------
    if (corePlayer) {
        await attempt("PSKILL", [
            "Player skill points/XP match the report",
            "Player ratings and equipment remain otherwise unchanged"
        ], async edit => {
            const schema = edit.getPlayerEditSchema(corePlayer.playerRow);
            const changes = {};
            const report = {};
            for (const [key, meta] of Object.entries({ skillPoints: schema.abilities?.skillPoints, experiencePoints: schema.abilities?.experiencePoints })) {
                if (!meta) continue;
                const after = nextInteger(meta.value, meta, key === "experiencePoints" ? 100 : 1);
                if (after != null) { changes[key] = after; report[key] = { before: meta.value, after }; }
            }
            if (Object.keys(changes).length === 0) throw new Error("Player has no editable skill-point/XP field");
            return { target: corePlayer.displayName, playerRow: corePlayer.playerRow, edits: report, result: await edit.stagePlayerAbilityEdit(corePlayer.playerRow, changes) };
        });

        await attempt("PABIL", [
            "Reported physical/mental ability tier change is present",
            "Unedited ability slots remain unchanged"
        ], async edit => {
            const schema = edit.getPlayerEditSchema(corePlayer.playerRow);
            const changes = {};
            const report = {};
            const physical = (schema.abilities?.physical ?? []).find(slot => alternateEnum(slot, slot.value) != null);
            if (physical) {
                const after = alternateEnum(physical, physical.value);
                changes.physical = { [physical.slot]: after };
                report.physical = { slot: physical.slot, before: physical.value, after };
            } else {
                const mental = (schema.abilities?.mental ?? []).find(slot => {
                    if (slot.ability.value !== "None") return alternateEnum(slot.rank, slot.rank.value, { blocked: ["None"] }) != null;
                    return alternateEnum(slot.ability, slot.ability.value, { blocked: ["None"] }) != null &&
                        (slot.rank.enumValues ?? []).some(value => value !== "None");
                });
                if (mental) {
                    if (mental.ability.value !== "None") {
                        const afterRank = alternateEnum(mental.rank, mental.rank.value, { blocked: ["None"] });
                        changes.mental = { [mental.slot]: { rank: afterRank } };
                        report.mental = { slot: mental.slot, ability: mental.ability.value, beforeRank: mental.rank.value, afterRank };
                    } else {
                        const ability = alternateEnum(mental.ability, mental.ability.value, { blocked: ["None"] });
                        const rank = (mental.rank.enumValues ?? []).find(value => value !== "None");
                        changes.mental = { [mental.slot]: { ability, rank } };
                        report.mental = { slot: mental.slot, beforeAbility: "None", afterAbility: ability, beforeRank: mental.rank.value, afterRank: rank };
                    }
                }
            }
            if (Object.keys(changes).length === 0) throw new Error("No alternate physical/mental ability tier available");
            return { target: corePlayer.displayName, playerRow: corePlayer.playerRow, edits: report, result: await edit.stagePlayerAbilityEdit(corePlayer.playerRow, changes) };
        });

        await attempt("PAPPR", [
            "Reported safe scalar appearance field changed",
            "Head ID, portrait, gear and tattoos are unchanged"
        ], async edit => {
            const appearance = await edit.getPlayerAppearance(corePlayer.playerRow);
            const preferred = ["PLYR_STANCE", "PLYR_HANDEDNESS", "PLYR_QBSTYLE", "PLYR_STYLE"];
            let chosen = null;
            for (const field of preferred) {
                const meta = appearance.schema?.[field];
                if (!meta) continue;
                const after = alternateEnum(meta, appearance.fields?.[field]);
                if (after != null) { chosen = { field, before: appearance.fields[field], after }; break; }
            }
            if (!chosen) throw new Error("No safe enum appearance field with an alternate value");
            return { target: corePlayer.displayName, playerRow: corePlayer.playerRow, ...chosen, result: await edit.stagePlayerAppearanceEdit(corePlayer.playerRow, { [chosen.field]: chosen.after }) };
        });
    }

    // -------------------- DEPTH CHART --------------------
    const depthCandidate = (session.data.depthCharts ?? [])
        .flatMap(chart => Object.entries(chart.positions ?? {}).map(([position, rows]) => ({ chart, position, rows })))
        .find(item => (item.rows?.length ?? 0) >= 2);
    if (depthCandidate) {
        await attempt("DEPTH", [
            "Top two players at the reported depth-chart position are swapped",
            "Other depth-chart positions remain unchanged"
        ], async edit => {
            const orderedRows = depthCandidate.rows.map(row => row.playerRow);
            [orderedRows[0], orderedRows[1]] = [orderedRows[1], orderedRows[0]];
            return {
                teamIndex: depthCandidate.chart.teamIndex,
                teamName: depthCandidate.chart.teamName,
                position: depthCandidate.position,
                before: depthCandidate.rows.slice(0, 2).map(row => ({ playerRow: row.playerRow, displayName: row.displayName })),
                afterPlayerRows: orderedRows.slice(0, 2),
                result: await edit.updateDepthChart(depthCandidate.chart.teamIndex, depthCandidate.position, orderedRows)
            };
        });
    }

    // -------------------- COACH EDITING / TALENT TREES --------------------
    const coach = coaches[0] ?? null;
    if (coach) {
        await attempt("COACH", [
            "Coach points and XP match the report",
            "Coach identity/staff assignment is unchanged"
        ], async edit => {
            const schema = edit.getCoachEditSchema(coach.coachRow);
            const points = schema.aliases?.coachPoints;
            const xp = schema.aliases?.experiencePoints;
            const changes = {};
            const report = {};
            if (points) {
                const after = nextInteger(points.value, points, 5);
                if (after != null) { changes.coachPoints = after; report.coachPoints = { before: points.value, after }; }
            }
            if (xp) {
                const after = nextInteger(xp.value, xp, 100);
                if (after != null) { changes.experiencePoints = after; report.experiencePoints = { before: xp.value, after }; }
            }
            if (Object.keys(changes).length === 0) throw new Error("Coach points/XP fields have no valid alternate value");
            return { coachRow: coach.coachRow, displayName: coach.displayName, edits: report, result: await edit.stageCoachEdit(coach.coachRow, changes) };
        });

        await attempt("CTREE", [
            "Reported coach archetype tree is unlocked",
            "Other coach trees and staff assignment remain intact"
        ], async edit => {
            const snapshot = edit.getCoachTalentTree(coach.coachRow);
            const candidate = (snapshot.trees ?? []).find(tree => tree.available && tree.state !== "Unlocked");
            if (!candidate) throw new Error("No locked/purchasable coach talent tree available for this coach");
            return {
                coachRow: coach.coachRow,
                displayName: coach.displayName,
                tree: candidate.displayName ?? candidate.treeName,
                before: candidate.state,
                after: "Unlocked",
                result: await edit.unlockCoachTalentTree(coach.coachRow, candidate.treeName)
            };
        });

        await attempt("CNODE", [
            "Reported coach talent node becomes owned",
            "Other talent nodes remain unchanged"
        ], async edit => {
            const snapshot = edit.getCoachTalentTree(coach.coachRow);
            const tree = (snapshot.trees ?? []).find(item => item.available && (item.talents ?? []).some(node => node.talentIndex > 0 && node.status !== "Owned"));
            if (!tree) throw new Error("No coach talent node candidate available");
            const node = tree.talents.find(item => item.talentIndex > 0 && item.status !== "Owned");
            return {
                coachRow: coach.coachRow,
                displayName: coach.displayName,
                tree: tree.displayName ?? tree.treeName,
                talentIndex: node.talentIndex,
                abilityName: node.definition?.name ?? null,
                before: node.status,
                after: "Owned",
                result: await edit.unlockCoachTalent(coach.coachRow, tree.internalName ?? tree.treeName, node.definition?.name ?? node.talentIndex)
            };
        });

        await attempt("CAPPR", [
            "Reported coach scalar appearance field changed",
            "Coach identity, assignment and talent tree remain intact"
        ], async edit => {
            const appearance = await edit.getCoachAppearance(coach.coachRow);
            const preferred = ["HatType", "COACH_STANCE"];
            let chosen = null;
            for (const field of preferred) {
                const meta = appearance.schema?.[field];
                if (!meta) continue;
                const after = alternateEnum(meta, appearance.fields?.[field]);
                if (after != null) { chosen = { field, before: appearance.fields[field], after }; break; }
            }
            if (!chosen) throw new Error("No coach appearance enum has an alternate value");
            return { coachRow: coach.coachRow, displayName: coach.displayName, ...chosen, result: await edit.stageCoachAppearanceEdit(coach.coachRow, { [chosen.field]: chosen.after }) };
        });
    }

    // -------------------- TEAM / RANKINGS / CFP --------------------
    const team = teams[0] ?? null;
    if (team) {
        await attempt("GRADE", [
            "Reported team/My School grade changed",
            "Other team metadata remains unchanged"
        ], async edit => {
            const grades = edit.getTeamGrades(team.teamIndex);
            for (const [key, meta] of Object.entries(grades.programPointSchema ?? {})) {
                const before = grades.programPointGrades?.[key];
                const after = alternateEnum(meta, before);
                if (after != null) {
                    return { teamIndex: team.teamIndex, teamName: team.teamName, group: "programPoints", field: key, before, after, result: await edit.stageTeamGrades(team.teamIndex, { programPoints: { [key]: after } }) };
                }
            }
            for (const [field, meta] of Object.entries(grades.mySchoolSchema ?? {})) {
                const before = grades.mySchoolGrades?.[field];
                const after = alternateEnum(meta, before);
                if (after != null) {
                    return { teamIndex: team.teamIndex, teamName: team.teamName, group: "mySchool", field, before, after, result: await edit.stageTeamGrades(team.teamIndex, { mySchool: { [field]: after } }) };
                }
            }
            throw new Error("No team grade field has an alternate enum value");
        });
    }

    await attempt("POLL", [
        "Top two teams in the CFP poll are swapped",
        "The remainder of the top 25 stays in the same relative order"
    ], async edit => {
        const current = edit.getPollRankings("cfp").filter(item => Number(item.rank) >= 1 && Number(item.rank) <= 25).slice(0, 25);
        if (current.length !== 25) throw new Error(`CFP top 25 currently has ${current.length} ranked teams`);
        const ordered = current.map(item => item.teamIndex);
        [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
        return { poll: "cfp", beforeTop2: current.slice(0, 2), afterTop2: ordered.slice(0, 2), result: await edit.stagePollTop25("cfp", ordered) };
    });

    if (!options.skipCfpTest) {
        await attempt("CFP", [
            "Only the reported unplayed CFP game's participants change",
            "Scores/stat caches for that unplayed game are reset",
            "Completed CFP games remain untouched"
        ], async edit => {
            const bracket = edit.getEditableCfpBracket();
            const game = bracket.find(item => !item.played);
            if (!game) throw new Error("No unplayed CFP game exists in this save");
            const alternatives = teams.map(item => item.teamIndex).filter(index => index !== game.homeTeamIndex && index !== game.awayTeamIndex);
            if (alternatives.length < 2) throw new Error("Not enough alternate teams for CFP test");
            return {
                seasonGameRow: game.seasonGameRow,
                bracketSlot: game.bracketSlot,
                before: { homeTeamIndex: game.homeTeamIndex, awayTeamIndex: game.awayTeamIndex },
                after: { homeTeamIndex: alternatives[0], awayTeamIndex: alternatives[1] },
                result: await edit.stageCfpGameParticipants(game.seasonGameRow, { homeTeamIndex: alternatives[0], awayTeamIndex: alternatives[1] })
            };
        });
    }

    // -------------------- HEAD ID MATRIX --------------------
    let headTargets = null;
    if (headTestsSelected) {
        const usableHeads = session.listHeadIds({ usableOnly: true });
        const usableKeys = new Set(usableHeads.map(entry => entry.canonical_key));
        const uniqueHeads = usableHeads.filter(entry => entry.head_type === "unique");
        const genericHeads = usableHeads.filter(entry => entry.head_type === "generic");
        const genericPlayer = findPlayer(players, "generic", usableKeys);
        const uniquePlayer = findPlayer(players, "unique", usableKeys);
        if (uniqueHeads.length >= 2 && genericHeads.length >= 2 && genericPlayer && uniquePlayer) {
            const g2u = findDestination(uniqueHeads, "unique", genericPlayer.head.canonicalKey);
            const u2g = findDestination(genericHeads, "generic", uniquePlayer.head.canonicalKey);
            const g2g = findDestination(genericHeads, "generic", genericPlayer.head.canonicalKey);
            const u2u = findDestination(uniqueHeads, "unique", uniquePlayer.head.canonicalKey);
            headTargets = { genericPlayer, uniquePlayer, g2u, u2g, g2g, u2u };
            const headChecks = [
                "3D head matches destination Head ID",
                "Portrait matches destination Head ID",
                "Helmet/facemask/sleeves/gloves/shoes/towel remain target player's original gear",
                "Body/build/height/weight/tattoos remain target player's original values",
                "Save loads normally and can be re-saved"
            ];
            for (const [label, target, destination] of [
                ["G2U", genericPlayer, g2u],
                ["U2G", uniquePlayer, u2g],
                ["G2G", genericPlayer, g2g],
                ["U2U", uniquePlayer, u2u]
            ]) {
                await attempt(label, headChecks, async edit => ({
                    target: target.displayName,
                    playerRow: target.playerRow,
                    from: target.head.canonicalKey,
                    to: destination.canonical_key,
                    result: await edit.setPlayerHeadId(target.playerRow, destination.canonical_key)
                }));
            }
            await attempt("HMULTI", headChecks, async edit => ({
                targets: [
                    { target: genericPlayer.displayName, playerRow: genericPlayer.playerRow, from: genericPlayer.head.canonicalKey, to: g2u.canonical_key, result: await edit.setPlayerHeadId(genericPlayer.playerRow, g2u.canonical_key) },
                    { target: uniquePlayer.displayName, playerRow: uniquePlayer.playerRow, from: uniquePlayer.head.canonicalKey, to: u2g.canonical_key, result: await edit.setPlayerHeadId(uniquePlayer.playerRow, u2g.canonical_key) }
                ]
            }));
        } else {
            skipped.push({
                label: "HEAD_MATRIX",
                reason: `Need >=2 usable unique/generic heads plus source players; unique=${uniqueHeads.length}, generic=${genericHeads.length}, genericPlayer=${Boolean(genericPlayer)}, uniquePlayer=${Boolean(uniquePlayer)}`
            });
        }
    }

    // -------------------- AUTOMATED BACKUP / ROLLBACK GATE --------------------
    let backupRegression = { status: "skipped", reason: "Backup regression not selected for this phase" };
    if (!options.skipBackupTest && (options.backupOnly || !selectedLabels)) {
        try {
            backupRegression = await createBackupRegression(session, sourcePath);
        } catch (error) {
            backupRegression = { status: "failed", reason: error.message };
        }
    }

    const report = {
        format: "field_index_ingame_regression_report",
        version: 2,
        generatedAt: new Date().toISOString(),
        sourcePath,
        sourceWasModified: false,
        outputDirectory,
        localPreparation: preparation,
        counts: {
            generatedSaves: outputs.length,
            skippedTests: skipped.length
        },
        headTargets,
        automatedBackupRegression: backupRegression,
        outputs,
        skipped,
        expectations,
        finalGlobalChecks: [
            "Every generated filename is short and begins DYNASTY-FI-",
            "Every generated save loads without hanging",
            "Every generated save can be re-saved by CFB27",
            "Only the explicitly reported edit is visible for each test",
            "Keep the untouched source save as the comparison baseline"
        ]
    };

    const reportPath = path.resolve(options.reportPath ?? path.join(root, "data", "ingame_regression_report.json"));
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`\nRegression suite ready: generated=${outputs.length} skipped=${skipped.length}`);
    console.log(`Automated backup regression: ${backupRegression.status}`);
    console.log(`Report: ${reportPath}`);
    console.log("Original source save was not overwritten.");
    return report;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help || !options.source) {
        usage();
        if (!options.help) process.exitCode = 1;
        return;
    }
    await generateRegressionSaves(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`Regression generation failed: ${error.message}`);
        process.exit(1);
    });
}

export {
    alternateEnum,
    generateRegressionSaves,
    nextInteger,
    parseArgs
};
