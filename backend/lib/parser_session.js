// -------------------- PARSER SESSION LOADER --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..", "..");
const parserEntryPath = path.join(projectDirectory, "parser", "index.js");

let parserLoadQueue = Promise.resolve();

function withParserLoadLock(callback) {
    const pending = parserLoadQueue.then(callback, callback);
    parserLoadQueue = pending.catch(() => undefined);
    return pending;
}

async function loadParsedDynasty(savePath) {
    const absoluteSavePath = path.resolve(savePath);
    if (!fs.existsSync(absoluteSavePath)) {
        throw new Error(`Dynasty save does not exist: ${absoluteSavePath}`);
    }

    return withParserLoadLock(async () => {
        const previousSaveArgument = process.argv[2];
        process.argv[2] = absoluteSavePath;

        try {
            const url = pathToFileURL(parserEntryPath);
            url.searchParams.set("fieldIndexSession", `${Date.now()}-${Math.random()}`);
            const parserModule = await import(url.href);
            return {
                savePath: absoluteSavePath,
                data: parserModule.fieldIndexData,
                accessors: {
                    cleanPlayers: parserModule.cleanPlayers,
                    getGameBoxScoreData: parserModule.getGameBoxScoreData,
                    getGameContext: parserModule.getGameContext,
                    getGameScoringSummary: parserModule.getGameScoringSummary,
                    getTeamBoxScoreStats: parserModule.getTeamBoxScoreStats,
                    getGameLineScore: parserModule.getGameLineScore
                }
            };
        } finally {
            if (previousSaveArgument === undefined) delete process.argv[2];
            else process.argv[2] = previousSaveArgument;
        }
    });
}

export {
    loadParsedDynasty,
    projectDirectory
};
