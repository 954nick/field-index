// -------------------- CFB27 SAFE SAVE NAMES --------------------

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_CFB27_SAVE_FILENAME_LENGTH = 31;
const SAFE_PREFIX = "DYNASTY-FI";

function sanitizePurpose(value) {
    const text = String(value ?? "EDIT")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
    return text || "EDIT";
}

function shortToken(seed = "") {
    return crypto
        .createHash("sha256")
        .update(`${seed}|${Date.now()}|${process.pid}|${Math.random()}`)
        .digest("hex")
        .slice(0, 6)
        .toUpperCase();
}

function isSafeCfb27SaveFilename(fileName) {
    const base = path.basename(String(fileName ?? ""));
    return (
        base.length > 0 &&
        base.length <= MAX_CFB27_SAVE_FILENAME_LENGTH &&
        /^DYNASTY-[A-Z0-9_-]+$/i.test(base)
    );
}

function generateSafeSaveFilename(options = {}) {
    const purpose = sanitizePurpose(options.purpose);
    const token = String(options.token ?? shortToken(options.seed ?? ""))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) || shortToken();

    let candidate = `${SAFE_PREFIX}-${purpose}-${token}`;
    if (candidate.length > MAX_CFB27_SAVE_FILENAME_LENGTH) {
        candidate = `${SAFE_PREFIX}-${token}`;
    }

    if (!isSafeCfb27SaveFilename(candidate)) {
        throw new Error(`Generated unsafe CFB27 save filename: ${candidate}`);
    }
    return candidate;
}

function chooseAvailableSafeOutputPath(sourcePath, options = {}) {
    const directory = path.resolve(options.directory ?? path.dirname(sourcePath));
    fs.mkdirSync(directory, { recursive: true });

    for (let attempt = 0; attempt < 100; attempt++) {
        const fileName = generateSafeSaveFilename({
            purpose: options.purpose,
            seed: `${sourcePath}|${attempt}`
        });
        const candidate = path.join(directory, fileName);
        if (!fs.existsSync(candidate)) return candidate;
    }

    throw new Error("Could not allocate a unique short CFB27 save filename");
}

export {
    MAX_CFB27_SAVE_FILENAME_LENGTH,
    chooseAvailableSafeOutputPath,
    generateSafeSaveFilename,
    isSafeCfb27SaveFilename
};
