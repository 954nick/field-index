// -------------------- LOCAL MAPPING PREPARATION COMPATIBILITY SERVICE --------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MappingService } from "./services/mapping_service.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mappingDirectory = path.join(projectDirectory, "assets", "mappings");
const portraitIndexPath = path.join(mappingDirectory, "player_portrait_index.json");
const headCatalogPath = path.join(mappingDirectory, "head_catalog.json");

async function prepareLocalMappings(options = {}) {
    const savePath = options.savePath ? path.resolve(options.savePath) : null;
    if (!savePath) throw new Error("prepareLocalMappings requires savePath");

    const service = new MappingService({ projectDirectory });
    const result = await service.prepareForSave(savePath, {
        portraitRoot: options.portraitRoot ?? null,
        autoDiscoverPortraits: options.autoDiscoverPortraits !== false,
        recipeRoots: options.recipeRoots ?? [],
        recipeLists: options.recipeLists ?? [],
        replace: options.replaceHeadCatalog === true,
        deepVerify: options.deepVerify === true
    });

    return {
        mappingDirectory,
        portraitIndex: result.portrait
            ? { path: result.portrait.outputPath, counts: result.portrait.index?.counts ?? result.portrait.counts ?? null }
            : service.getPortraitIndexSummary(),
        headCatalog: {
            path: result.head.catalogPath,
            counts: result.summary,
            sources: result.head.sources ?? []
        },
        autoDiscoveredPortraitRoot: result.autoDiscoveredPortraitRoot ?? null
    };
}

export {
    headCatalogPath,
    mappingDirectory,
    portraitIndexPath,
    prepareLocalMappings
};
