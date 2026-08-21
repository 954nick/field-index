// -------------------- LOCAL ASSET / MAPPING BUILD SERVICE --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeadCatalog } from "../../parser/build_head_catalog.js";
import { writePortraitIndex } from "../../parser/build_portrait_index.js";
import { DEFAULT_HEAD_CATALOG_PATH, HeadCatalog } from "../../parser/head_catalog.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..", "..");
const defaultPortraitIndex = path.join(projectDirectory, "assets", "mappings", "player_portrait_index.json");
const defaultPortraitRoot = path.join(projectDirectory, "assets", "player_portraits");

export class MappingService {
    constructor(options = {}) {
        this.projectDirectory = path.resolve(options.projectDirectory ?? projectDirectory);
        this.headCatalogPath = path.resolve(options.headCatalogPath ?? DEFAULT_HEAD_CATALOG_PATH);
        this.portraitIndexPath = path.resolve(options.portraitIndexPath ?? defaultPortraitIndex);
        this.defaultPortraitRoot = path.resolve(options.defaultPortraitRoot ?? defaultPortraitRoot);
    }

    buildPortraitIndex(portraitRoot, options = {}) {
        return writePortraitIndex(portraitRoot, options.output ?? this.portraitIndexPath);
    }

    async buildHeadCatalog(options = {}) {
        const portraitIndex = options.portraitIndex ?? (
            fs.existsSync(this.portraitIndexPath) ? this.portraitIndexPath : null
        );
        return buildHeadCatalog({
            saves: options.saves ?? (options.save ? [options.save] : []),
            recipeRoots: options.recipeRoots ?? [],
            recipeLists: options.recipeLists ?? [],
            portraitIndex,
            output: options.output ?? this.headCatalogPath,
            replace: options.replace === true,
            deepVerify: options.deepVerify === true
        });
    }

    findDefaultPortraitRoot() {
        return fs.existsSync(this.defaultPortraitRoot) ? this.defaultPortraitRoot : null;
    }

    async prepareForSave(savePath, options = {}) {
        let portrait = null;
        const explicitPortraitRoot = options.portraitRoot ? path.resolve(options.portraitRoot) : null;
        const autoPortraitRoot = !explicitPortraitRoot
            && options.autoDiscoverPortraits !== false
            && !fs.existsSync(this.portraitIndexPath)
            ? this.findDefaultPortraitRoot()
            : null;
        const portraitRoot = explicitPortraitRoot ?? autoPortraitRoot;

        if (portraitRoot) {
            portrait = this.buildPortraitIndex(portraitRoot, options.portraitOptions ?? {});
        }
        const head = await this.buildHeadCatalog({
            save: savePath,
            recipeRoots: options.recipeRoots ?? [],
            recipeLists: options.recipeLists ?? [],
            portraitIndex: portrait?.outputPath ?? options.portraitIndex,
            replace: options.replace === true,
            deepVerify: options.deepVerify === true
        });
        return {
            portrait,
            head,
            autoDiscoveredPortraitRoot: autoPortraitRoot,
            summary: HeadCatalog.load(head.catalogPath, { allowMissing: false }).counts
        };
    }

    getHeadCatalogSummary() {
        const catalog = HeadCatalog.load(this.headCatalogPath, { allowMissing: true });
        return {
            path: this.headCatalogPath,
            exists: catalog.exists,
            total: catalog.size,
            ...catalog.counts
        };
    }

    getPortraitIndexSummary() {
        if (!fs.existsSync(this.portraitIndexPath)) {
            return { path: this.portraitIndexPath, exists: false, counts: null };
        }
        const parsed = JSON.parse(fs.readFileSync(this.portraitIndexPath, "utf8"));
        return { path: this.portraitIndexPath, exists: true, counts: parsed.counts ?? null };
    }
}
