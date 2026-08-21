// -------------------- CFB27 SAFE DYNASTY WRITER --------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FBCHUNKS_MAGIC = Buffer.from("FBCHUNKS", "ascii");
const COMPRESSED_DATA_OFFSET = 0x52;
const COMPRESSED_SIZE_OFFSET = 0x4a;
const EA_ZLIB_LEVEL = 6;
const HELPER_PATH = fileURLToPath(new URL("./classic_zlib_compress.py", import.meta.url));

function assertCfb27DynastyContainer(original) {
    if (original.length < COMPRESSED_DATA_OFFSET) {
        throw new Error("CFB27 save is too small to contain an FBCHUNKS header");
    }
    if (!original.subarray(0, FBCHUNKS_MAGIC.length).equals(FBCHUNKS_MAGIC)) {
        throw new Error("CFB27 safe writer requires an FBCHUNKS Dynasty save");
    }

    const compressedSize = original.readUInt32LE(COMPRESSED_SIZE_OFFSET);
    const streamEnd = COMPRESSED_DATA_OFFSET + compressedSize;
    if (compressedSize <= 0 || streamEnd > original.length) {
        throw new Error("CFB27 save reports an invalid chunk-1 compressed size");
    }
    return { compressedSize, streamEnd };
}

function findChunkOneSlotEnd(original, streamEnd) {
    let slotEnd = streamEnd;
    while (slotEnd < original.length && original[slotEnd] === 0) {
        slotEnd += 1;
    }
    if (slotEnd >= original.length) {
        throw new Error("Could not locate the preserved CFB27 tail after chunk 1");
    }
    return slotEnd;
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

function compressWithClassicZlib(unpackedContents) {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-classic-zlib-"));
    const inputPath = path.join(temporaryDirectory, "chunk1-unpacked.bin");
    const outputPath = path.join(temporaryDirectory, "chunk1.zlib");
    fs.writeFileSync(inputPath, unpackedContents);

    const failures = [];
    try {
        for (const candidate of pythonCandidates()) {
            const result = spawnSync(
                candidate.command,
                [...candidate.prefix, HELPER_PATH, inputPath, outputPath, "--level", String(EA_ZLIB_LEVEL)],
                { encoding: "utf8", windowsHide: true }
            );

            if (!result.error && result.status === 0 && fs.existsSync(outputPath)) {
                return {
                    compressed: fs.readFileSync(outputPath),
                    detail: result.stdout.trim()
                };
            }

            const detail = result.error?.message
                ?? result.stderr?.trim()
                ?? `exit code ${result.status}`;
            failures.push(`${candidate.command}: ${detail}`);
        }
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    throw new Error(
        "CFB27 safe writer could not run the classic-zlib helper. "
        + `Attempts: ${failures.join(" | ")}`
    );
}

function verifySourceCompressionProfile(original, originalCompressedSize) {
    const originalStream = original.subarray(
        COMPRESSED_DATA_OFFSET,
        COMPRESSED_DATA_OFFSET + originalCompressedSize
    );
    const originalUnpacked = zlib.inflateSync(originalStream);
    const result = compressWithClassicZlib(originalUnpacked);

    if (!result.compressed.equals(originalStream)) {
        throw new Error(
            "CFB27 safe writer refused to write because the available classic zlib "
            + "does not reproduce this EA-authored save byte-for-byte. "
            + `EA=${originalStream.length} bytes, compressor=${result.compressed.length} bytes.`
        );
    }

    return {
        sourceUnpackedSize: originalUnpacked.length,
        compressorDetail: result.detail
    };
}

function buildUpdatedUnpackedContents(franchise) {
    if (!franchise?.strategy?.file?.generateUnpackedContents) {
        throw new Error("madden-franchise does not expose generateUnpackedContents for this save");
    }

    const saveOnChangeEnabled = franchise.settings.saveOnChange;
    franchise.settings.saveOnChange = false;
    try {
        const generated = franchise.strategy.file.generateUnpackedContents(
            franchise.tables,
            franchise.unpackedFileContents
        );
        franchise.unpackedFileContents = generated;
        return generated;
    } finally {
        franchise.settings.saveOnChange = saveOnChangeEnabled;
    }
}

function writeBufferSafely(outputPath, data) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.field-index-writing-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporaryPath, data);
    try {
        fs.renameSync(temporaryPath, outputPath);
    } catch {
        fs.copyFileSync(temporaryPath, outputPath);
        fs.rmSync(temporaryPath, { force: true });
    }
}

export function inspectCfb27WriteSlot(savePath) {
    const original = fs.readFileSync(savePath);
    const { compressedSize, streamEnd } = assertCfb27DynastyContainer(original);
    const slotEnd = findChunkOneSlotEnd(original, streamEnd);
    return {
        fileSize: original.length,
        compressedDataOffset: COMPRESSED_DATA_OFFSET,
        originalCompressedSize: compressedSize,
        originalStreamEnd: streamEnd,
        slotEnd,
        slotCapacity: slotEnd - COMPRESSED_DATA_OFFSET,
        originalSlack: slotEnd - streamEnd,
        tailSize: original.length - slotEnd
    };
}

export function writeCfb27DynastySave({ franchise, sourcePath, outputPath }) {
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedOutputPath = path.resolve(outputPath ?? sourcePath);
    const original = fs.readFileSync(resolvedSourcePath);

    const { compressedSize: originalCompressedSize, streamEnd } =
        assertCfb27DynastyContainer(original);
    const slotEnd = findChunkOneSlotEnd(original, streamEnd);
    const slotCapacity = slotEnd - COMPRESSED_DATA_OFFSET;

    // Critical CFB27 build-833 gate:
    // prove this machine can recreate the exact EA-authored source stream BEFORE
    // generating or writing a mutated save.
    const sourceProfile = verifySourceCompressionProfile(original, originalCompressedSize);

    const updatedUnpackedContents = buildUpdatedUnpackedContents(franchise);
    const compression = compressWithClassicZlib(updatedUnpackedContents);
    const compressed = compression.compressed;

    const reinflated = zlib.inflateSync(compressed);
    if (!reinflated.equals(updatedUnpackedContents)) {
        throw new Error("CFB27 safe writer compression verification failed");
    }

    if (compressed.length > slotCapacity) {
        throw new Error(
            `CFB27 safe writer refused to write: compressed chunk 1 is ${compressed.length} bytes, `
            + `but the original slot can hold only ${slotCapacity} bytes. The preserved tail was not touched.`
        );
    }

    const output = Buffer.from(original);
    compressed.copy(output, COMPRESSED_DATA_OFFSET);
    output.fill(0, COMPRESSED_DATA_OFFSET + compressed.length, slotEnd);
    output.writeUInt32LE(compressed.length, COMPRESSED_SIZE_OFFSET);

    if (output.length !== original.length) {
        throw new Error("CFB27 safe writer changed the save file length");
    }
    if (!output.subarray(slotEnd).equals(original.subarray(slotEnd))) {
        throw new Error("CFB27 safe writer detected a change in the preserved save tail");
    }

    writeBufferSafely(resolvedOutputPath, output);

    return {
        outputPath: resolvedOutputPath,
        fileSize: output.length,
        originalCompressedSize,
        compressedSize: compressed.length,
        slotCapacity,
        originalSlack: slotEnd - streamEnd,
        remainingHeadroom: slotCapacity - compressed.length,
        preservedTailOffset: slotEnd,
        preservedTailBytes: original.length - slotEnd,
        compression: "classic-zlib",
        zlibLevel: EA_ZLIB_LEVEL,
        sourceProfileVerified: true,
        sourceUnpackedSize: sourceProfile.sourceUnpackedSize,
        compressorDetail: compression.detail
    };
}
