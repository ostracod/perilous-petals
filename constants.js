
import * as pathUtils from "path";
import { fileURLToPath } from "url";

export const projectPath = pathUtils.dirname(fileURLToPath(import.meta.url));
export const worldTilesPath = pathUtils.join(projectPath, "worldTiles.json");

export const worldSize = 26;
export const tierAmount = 24;
export const grassTextureAmount = 3;

const grassTypeId = 1;
const blockTypeId = grassTypeId + grassTextureAmount;
export const tileTypeIds = {
    empty: 0,
    grass: grassTypeId,
    block: blockTypeId,
};
export const startTileChar = 35;


