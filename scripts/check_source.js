// -------------------- FIELD INDEX SOURCE CHECK --------------------
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", "node_modules", "FieldIndexBackups"]);
const excludedPrefixes = [
    path.join(root, "assets", "awards"),
    path.join(root, "assets", "coaches"),
    path.join(root, "assets", "player_portraits"),
    path.join(root, "assets", "postseason"),
    path.join(root, "assets", "teams")
];

function walk(directory, output = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (excludedPrefixes.some(prefix => absolute === prefix || absolute.startsWith(`${prefix}${path.sep}`))) continue;
        if (entry.isDirectory()) walk(absolute, output);
        else output.push(absolute);
    }
    return output;
}

const jsFiles = walk(root).filter(file => file.endsWith(".js"));
const failures = [];
for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${path.relative(root, file)}: ${result.stderr.trim()}`);
}

const pythonFiles = walk(path.join(root, "parser")).filter(file => file.endsWith(".py"));
if (pythonFiles.length > 0) {
    const candidates = process.platform === "win32"
        ? [[process.env.FIELD_INDEX_PYTHON || "py", ["-3"]], ["python", []]]
        : [[process.env.FIELD_INDEX_PYTHON || "python3", []], ["python", []]];
    let compiled = false;
    for (const [command, prefix] of candidates) {
        const result = spawnSync(command, [...prefix, "-m", "py_compile", ...pythonFiles], { encoding: "utf8" });
        if (!result.error && result.status === 0) {
            compiled = true;
            break;
        }
    }
    if (!compiled) failures.push("Python parser helpers could not be syntax-checked");
}

if (failures.length > 0) {
    console.error("FIELD INDEX SOURCE CHECK FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`FIELD INDEX SOURCE CHECK PASSED | JavaScript=${jsFiles.length} Python=${pythonFiles.length}`);
