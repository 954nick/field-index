// -------------------- FIELD INDEX BACKEND PUBLIC API --------------------

import { FieldIndexBackendSession } from "./session.js";
import { EditSession } from "./editing/edit_session.js";
import { AssetService } from "./services/asset_service.js";
import { MappingService } from "./services/mapping_service.js";
import { importDynasty, normalizeDynastyKey, suggestDynastyKey } from "./import_service.js";
import {
    chooseAvailableSafeOutputPath,
    generateSafeSaveFilename,
    isSafeCfb27SaveFilename
} from "./lib/save_names.js";

async function loadDynasty(savePath, options = {}) {
    return FieldIndexBackendSession.load(savePath, options);
}

async function editDynasty(savePath, options = {}) {
    return EditSession.open(savePath, options);
}

export {
    AssetService,
    MappingService,
    EditSession,
    FieldIndexBackendSession,
    chooseAvailableSafeOutputPath,
    editDynasty,
    generateSafeSaveFilename,
    importDynasty,
    isSafeCfb27SaveFilename,
    loadDynasty,
    normalizeDynastyKey,
    suggestDynastyKey
};
