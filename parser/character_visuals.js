// -------------------- CFB27 CHARACTER VISUALS --------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IsonProcessor } from "madden-franchise";

const PARSER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CODEC_PATH = path.join(PARSER_DIRECTORY, "character_visuals_codec.py");
const DICTIONARY_PATH = path.join(
    PARSER_DIRECTORY,
    "node_modules",
    "madden-franchise",
    "data",
    "zstd-dicts",
    "c27",
    "dict.bin"
);
const ZERO_REFERENCE = "0".repeat(32);
const ISON = new IsonProcessor(27, "college", "CharacterVisuals");

function clone(value) {
    return structuredClone(value);
}

function pythonCandidates() {
    const configured = process.env.FIELD_INDEX_PYTHON?.trim();
    const candidates = [];
    if (configured) candidates.push({ command: configured, prefix: [] });
    candidates.push(
        { command: "py", prefix: ["-3"] },
        { command: "python", prefix: [] },
        { command: "python3", prefix: [] }
    );
    return candidates;
}

function runCodec(mode, inputBuffer) {
    if (!fs.existsSync(CODEC_PATH)) {
        throw new Error(`CharacterVisuals codec is missing: ${CODEC_PATH}`);
    }
    if (!fs.existsSync(DICTIONARY_PATH)) {
        throw new Error(`CFB27 CharacterVisuals dictionary is missing: ${DICTIONARY_PATH}`);
    }

    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-visuals-"));
    const inputPath = path.join(temporaryDirectory, "input.bin");
    const outputPath = path.join(temporaryDirectory, "output.bin");
    fs.writeFileSync(inputPath, inputBuffer);

    const failures = [];
    try {
        for (const candidate of pythonCandidates()) {
            const result = spawnSync(
                candidate.command,
                [
                    ...candidate.prefix,
                    CODEC_PATH,
                    mode,
                    inputPath,
                    DICTIONARY_PATH,
                    outputPath,
                    "--level",
                    "9"
                ],
                { encoding: "utf8", windowsHide: true }
            );

            if (!result.error && result.status === 0 && fs.existsSync(outputPath)) {
                return {
                    buffer: fs.readFileSync(outputPath),
                    detail: result.stdout.trim()
                };
            }

            failures.push(
                `${candidate.command}: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`}`
            );
        }
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    throw new Error(
        "CharacterVisuals codec failed. Install Python package `zstandard` if a system libzstd "
        + `is unavailable. Attempts: ${failures.join(" | ")}`
    );
}

async function visualContext(franchise, playerRecord) {
    const reference = playerRecord.getReferenceDataByKey("CharacterVisuals");
    if (!reference || reference.tableId === 0) {
        throw new Error(`${playerRecord.FirstName} ${playerRecord.LastName} has no CharacterVisuals reference`);
    }

    const table = franchise.getTableById(reference.tableId);
    if (!table) throw new Error(`CharacterVisuals table ${reference.tableId} was not found`);
    if (!table.recordsRead) await table.readRecords();

    const record = table.records[reference.rowNumber];
    if (!record) throw new Error(`CharacterVisuals row ${reference.rowNumber} was not found`);

    const rawField = record.getFieldByKey("RawData");
    if (!rawField?.thirdTableField) {
        throw new Error("CharacterVisuals RawData table3 field is unavailable");
    }

    return { reference, table, record, rawField };
}

function compressedFrameFromVisual(context) {
    const combined = Buffer.from(context.rawField.thirdTableField.unformattedValue);
    const compressedLength = combined.readUInt16LE(0);
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
    const frameOffset = combined.indexOf(magic);
    if (frameOffset < 0) throw new Error("CharacterVisuals zstd frame magic was not found");

    const frame = combined.subarray(frameOffset, frameOffset + compressedLength);
    if (frame.length !== compressedLength) {
        throw new Error("CharacterVisuals compressed frame is truncated");
    }
    return frame;
}

function decodeAppearance(context) {
    const frame = compressedFrameFromVisual(context);
    const decompressed = runCodec("decompress", frame);
    const json = ISON.isonVisualsToJson(decompressed.buffer);
    if (!json || typeof json !== "object") {
        throw new Error("CharacterVisuals ISON did not decode to an object");
    }
    return { json, codec: decompressed.detail, frameLength: frame.length };
}

function encodeAppearance(json) {
    const ison = ISON.jsonVisualsToIson(json);
    const compressed = runCodec("compress", ison);
    return {
        frame: compressed.buffer,
        isonLength: ison.length,
        codec: compressed.detail
    };
}

function writeCompressedFrame(context, frame) {
    if (frame.length > 0xffff) {
        throw new Error(`CharacterVisuals frame is too large: ${frame.length}`);
    }

    const size = Buffer.alloc(2);
    size.writeUInt16LE(frame.length, 0);
    const unformatted = Buffer.concat([size, frame]);
    const table3 = context.rawField.thirdTableField;
    const rootCapacity = table3.maxLength + 2;

    if (unformatted.length > rootCapacity) {
        const rootData = table3.populateOverflowRecord(unformatted);
        table3.unformattedValue = rootData;
    } else {
        table3.clearOverflowRecordIfExists();
        const padded = Buffer.alloc(rootCapacity);
        unformatted.copy(padded);
        table3.unformattedValue = padded;
        context.record.Overflow = ZERO_REFERENCE;
    }
}

function headLoadout(appearance) {
    return appearance.loadouts?.find(
        loadout => loadout?.loadoutCategory === "Head" || loadout?.loadoutType === "Head"
    ) ?? null;
}

function plusHeadElements(loadout) {
    return (loadout?.loadoutElements ?? []).filter(element => element?.slotType === "PlusHead");
}

export async function getPlayerHeadProfile(franchise, playerRecord) {
    const context = await visualContext(franchise, playerRecord);
    const decoded = decodeAppearance(context);
    const head = headLoadout(decoded.json);
    if (!head) {
        throw new Error(`${playerRecord.FirstName} ${playerRecord.LastName} has no CharacterVisuals Head loadout`);
    }

    return {
        assetName: playerRecord.PLYR_ASSETNAME,
        genericHeadAssetName: playerRecord.GenericHeadAssetName,
        portrait: playerRecord.PLYR_PORTRAIT,
        skinTone: decoded.json.skinTone,
        plusHeadElements: clone(plusHeadElements(head)),
        sourcePlayerRow: playerRecord.index ?? null,
        sourcePlayerName: `${playerRecord.FirstName} ${playerRecord.LastName}`.trim()
    };
}

export async function applyPlayerHeadProfilePreserveGear(franchise, playerRecord, profile) {
    if (!profile || typeof profile !== "object") {
        throw new Error("A valid player head profile is required");
    }

    const context = await visualContext(franchise, playerRecord);
    const decoded = decodeAppearance(context);
    const head = headLoadout(decoded.json);
    if (!head) {
        throw new Error(`${playerRecord.FirstName} ${playerRecord.LastName} has no CharacterVisuals Head loadout`);
    }

    const plusHeadBefore = plusHeadElements(head).length;
    head.loadoutElements = (head.loadoutElements ?? [])
        .filter(element => element?.slotType !== "PlusHead");

    const donorPlusHead = clone(profile.plusHeadElements ?? []);
    if (donorPlusHead.length > 0) {
        head.loadoutElements.unshift(...donorPlusHead);
    }

    decoded.json.skinTone = profile.skinTone;

    const encoded = encodeAppearance(decoded.json);
    writeCompressedFrame(context, encoded.frame);

    return {
        characterVisualsRow: context.reference.rowNumber,
        plusHeadBefore,
        plusHeadAfter: donorPlusHead.length,
        originalFrameLength: decoded.frameLength,
        newFrameLength: encoded.frame.length,
        decodeCodec: decoded.codec,
        encodeCodec: encoded.codec
    };
}
