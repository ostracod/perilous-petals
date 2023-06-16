
import * as pathUtils from "path";
import { fileURLToPath } from "url";

export const projectPath = pathUtils.dirname(fileURLToPath(import.meta.url));
export const worldTilesPath = pathUtils.join(projectPath, "worldTiles.json");

export const worldSize = 26;
export const tierAmount = 24;
export const grassTextureAmount = 3;
export const sproutStageAmount = 3;

const grassTypeId = 1;
const blockTypeId = grassTypeId + grassTextureAmount;
const sproutTypeId = blockTypeId + tierAmount;
const flowerTypeId = sproutTypeId + sproutStageAmount;
export const tileTypeIds = {
    empty: 0,
    grass: grassTypeId,
    block: blockTypeId,
    sprout: sproutTypeId,
    flower: flowerTypeId,
};
export const startTileChar = 35;

export const clientConstants = {
    worldSize,
    tierAmount,
    grassTextureAmount,
    sproutStageAmount,
    tileTypeIds,
    startTileChar,
};


