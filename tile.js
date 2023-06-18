
import * as fs from "fs";
import { worldTilesPath, worldSize, tierAmount, grassTextureAmount, sproutStageAmount, tileTypeIds, startTileChar, levelPointAmounts, flowerPointAmounts, sproutBuildCost, sproutRemovalPenalty, poisonFlowerPenalty, playerEmotions } from "./constants.js";
import { Pos, createPosFromJson } from "./pos.js";

const worldTilesLength = worldSize ** 2;

const foregroundTiles = Array(worldTilesLength).fill(null);
const backgroundTiles = Array(worldTilesLength).fill(null);
// This is a circular buffer.
const worldChanges = Array(1000).fill(null);
let lastWorldChangeId = 0;
let lastWorldChangeIndex = 0;
const entityTileSet = new Set();
// Map from username to PlayerTile.
export const playerTileMap = new Map();
let emptyForegroundTileCount = 0;
let grassTileCount = 0;

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // toDbJson
    
    constructor(typeId) {
        this.typeId = typeId;
    }
    
    addEvent(isForeground, pos) {
        if (isForeground && this.killsGrass() && getTile(false, pos) instanceof GrassTile) {
            setTile(false, pos, emptyTile);
        }
    }
    
    moveEvent(pos) {
        // Do nothing.
    }
    
    deleteEvent(isForeground) {
        // Do nothing.
    }
    
    playerCanWalkOn() {
        return false;
    }
    
    playerBuildEvent(playerTile) {
        // Do nothing.
    }
    
    playerCanRemove() {
        return false;
    }
    
    playerRemoveEvent(playerTile) {
        // Do nothing.
    }
    
    killsGrass() {
        return false;
    }
}

class EmptyTile extends Tile {
    
    constructor() {
        super(tileTypeIds.empty);
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        if (isForeground) {
            emptyForegroundTileCount += 1;
        }
    }
    
    deleteEvent(isForeground) {
        super.deleteEvent(isForeground);
        if (isForeground) {
            emptyForegroundTileCount -= 1;
        }
    }
    
    playerCanWalkOn() {
        return true;
    }
    
    toDbJson() {
        return null;
    }
}

const emptyTile = new EmptyTile();

class GrassTile extends Tile {
    
    constructor(texture) {
        super(tileTypeIds.grass + texture);
        this.texture = texture;
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        grassTileCount += 1;
    }
    
    deleteEvent(isForeground) {
        super.deleteEvent(isForeground);
        grassTileCount -= 1;
    }
    
    toDbJson() {
        return { type: "grass", texture: this.texture };
    }
}

const grassTiles = [];
while (grassTiles.length < grassTextureAmount) {
    const tile = new GrassTile(grassTiles.length);
    grassTiles.push(tile);
}

class BlockTile extends Tile {
    
    constructor(tier) {
        super(tileTypeIds.block + tier);
        this.tier = tier;
    }
    
    playerCanRemove() {
        return true;
    }
    
    killsGrass() {
        return true;
    }
    
    toDbJson() {
        return { type: "block", tier: this.tier };
    }
}

export const blockTiles = [];
while (blockTiles.length < tierAmount) {
    const tile = new BlockTile(blockTiles.length);
    blockTiles.push(tile);
}

// EntityTiles may only exist in foregroundTiles.
class EntityTile extends Tile {
    
    constructor(tileId) {
        super(tileId);
        this.pos = null;
    }
    
    // EntityTiles should only change their type ID with this method.
    setTypeId(typeId) {
        if (typeId !== this.typeId) {
            this.typeId = typeId;
            new TileChange(true, this.pos.copy(), this.typeId);
        }
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        this.pos = pos.copy();
        entityTileSet.add(this);
    }
    
    deleteEvent(isForeground) {
        super.deleteEvent(isForeground);
        entityTileSet.delete(this);
    }
    
    moveEvent(pos) {
        super.moveEvent(pos);
        this.pos.set(pos);
    }
    
    timerEvent() {
        // Do nothing.
    }
}

export class PlayerTile extends EntityTile {
    
    constructor(player) {
        super(tileTypeIds.empty);
        this.player = player;
        this.flip = false;
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        playerTileMap.set(this.player.username, this);
    }
    
    deleteEvent(isForeground) {
        super.deleteEvent(isForeground);
        playerTileMap.delete(this.player.username);
    }
    
    addToWorld() {
        const { posX, posY } = this.player.extraFields;
        const pos = new Pos(posX ?? 0, posY ?? 0);
        for (let count = 0; count < 400; count++) {
            const tile = getTile(true, pos);
            if (tile instanceof EmptyTile) {
                break;
            }
            if (count > 200 && tile.playerCanRemove()) {
                break;
            }
            pos.x = Math.floor(Math.random() * worldSize);
            pos.y = Math.floor(Math.random() * worldSize);
        }
        setTile(true, pos, this);
    }
    
    deleteFromWorld() {
        setTile(true, this.pos, emptyTile);
    }
    
    walk(offset) {
        const nextPos = this.pos.copy();
        nextPos.add(offset);
        if (!posIsInWorld(nextPos)) {
            return;
        }
        const nextTile = getTile(true, nextPos);
        if (nextTile.playerCanWalkOn()) {
            if (nextTile.playerCanRemove()) {
                this.removeTile(offset);
            }
            swapForegroundTiles(this.pos, nextPos);
        }
    }
    
    emote(emotion) {
        new EmoteChange(this.player.username, emotion);
    }
    
    buildTile(offset, getBuildTile) {
        const pos = this.pos.copy();
        pos.add(offset);
        if (!posIsInWorld(pos)) {
            return;
        }
        const lastTile = getTile(true, pos);
        if (lastTile instanceof EmptyTile) {
            const tile = getBuildTile();
            setTile(true, pos, tile);
            tile.playerBuildEvent(this);
        }
    }
    
    removeTile(offset) {
        const pos = this.pos.copy();
        pos.add(offset);
        if (!posIsInWorld(pos)) {
            return;
        }
        const lastTile = getTile(true, pos);
        if (lastTile.playerCanRemove()) {
            lastTile.playerRemoveEvent(this);
            setTile(true, pos, emptyTile);
        }
    }
    
    increaseScore(amount) {
        this.player.score += amount;
        const { extraFields } = this.player;
        while (true) {
            const scoreThreshold = levelPointAmounts[extraFields.level];
            if (typeof scoreThreshold === "undefined"
                    || this.player.score < scoreThreshold) {
                break;
            }
            extraFields.level += 1;
        }
    }
    
    decreaseScore(amount) {
        const { score } = this.player;
        this.player.score = Math.max(score - amount, 0);
    }
    
    persistEvent() {
        this.player.extraFields.posX = this.pos.x;
        this.player.extraFields.posY = this.pos.y;
    }
    
    toDbJson() {
        return emptyTile.toDbJson();
    }
    
    toClientJson() {
        return {
            username: this.player.username,
            level: this.player.extraFields.level,
            pos: this.pos.toJson(),
            flip: this.flip,
        }
    }
}

class FlowerTile extends EntityTile {
    
    constructor(data) {
        super(tileTypeIds.sprout);
        this.creatorUsername = data.creatorUsername;
        this.isPoisonous = data.isPoisonous;
        this.tier = data.tier;
        this.age = data.age;
    }
    
    getStage() {
        return Math.min(Math.floor(this.age / 20), sproutStageAmount);
    }
    
    isSprout() {
        return flowerStageIsSprout(this.getStage());
    }
    
    timerEvent() {
        super.timerEvent();
        this.age += 1;
        const stage = this.getStage();
        let typeId;
        if (flowerStageIsSprout(stage)) {
            typeId = tileTypeIds.sprout + stage;
        } else {
            typeId = tileTypeIds.flower + this.tier;
        }
        this.setTypeId(typeId);
    }
    
    playerCanWalkOn() {
        return !this.isSprout();
    }
    
    playerBuildEvent(playerTile) {
        playerTile.decreaseScore(sproutBuildCost);
    }
    
    playerCanRemove() {
        return true;
    }
    
    playerRemoveEvent(playerTile) {
        super.playerRemoveEvent(playerTile);
        if (this.isSprout()) {
            playerTile.decreaseScore(sproutRemovalPenalty);
        } else if (this.isPoisonous) {
            playerTile.decreaseScore(poisonFlowerPenalty);
            playerTile.emote(playerEmotions.sad);
            if (playerTile.player.username !== this.creatorUsername) {
                const creatorTile = playerTileMap.get(this.creatorUsername);
                if (typeof creatorTile !== "undefined") {
                    creatorTile.increaseScore(poisonFlowerPenalty);
                }
            }
        } else {
            const pointAmount = flowerPointAmounts[this.tier];
            playerTile.increaseScore(pointAmount);
            playerTile.emote(playerEmotions.happy);
        }
    }
    
    killsGrass() {
        return true;
    }
    
    toDbJson() {
        return {
            type: "flower",
            creatorUsername: this.creatorUsername,
            isPoisonous: this.isPoisonous,
            tier: this.tier,
            age: this.age,
        };
    }
}

class WorldChange {
    // Concrete subclasses of WorldChange must implement these methods:
    // getTypeName, getJsonFields
    
    constructor() {
        lastWorldChangeId += 1;
        this.id = lastWorldChangeId;
        lastWorldChangeIndex = (lastWorldChangeIndex + 1) % worldChanges.length;
        worldChanges[lastWorldChangeIndex] = this;
    }
    
    toJson() {
        return {
            type: this.getTypeName(),
            ...this.getJsonFields(),
        };
    }
}

class TileChange extends WorldChange {
    
    constructor(isForeground, pos, tileTypeId) {
        super();
        this.isForeground = isForeground;
        this.pos = pos;
        this.tileTypeId = tileTypeId;
    }
    
    getTypeName() {
        return "tile";
    }
    
    getJsonFields() {
        return {
            isForeground: this.isForeground,
            pos: this.pos.toJson(),
            tileTypeId: this.tileTypeId,
        };
    }
}

class EmoteChange extends WorldChange {
    
    constructor(username, emotion) {
        super();
        this.username = username;
        this.emotion = emotion;
    }
    
    getTypeName() {
        return "emote";
    }
    
    getJsonFields() {
        return {
            username: this.username,
            emotion: this.emotion,
        };
    }
}

const convertJsonToTile = (data) => {
    if (data === null) {
        return emptyTile;
    }
    const { type } = data;
    if (type === "block") {
        return blockTiles[data.tier];
    } else if (type === "grass") {
        return grassTiles[data.texture];
    } else if (type === "flower") {
        return new FlowerTile(data);
    }
    throw new Error(`Unrecognized tile type "${type}".`);
};

const posIsInWorld = (pos) => (
    pos.x >= 0 && pos.x < worldSize && pos.y >= 0 && pos.y < worldSize
);

const getTileIndex = (pos) => pos.x + pos.y * worldSize;

const getTiles = (isForeground) => isForeground ? foregroundTiles : backgroundTiles;

const getTile = (isForeground, pos) => {
    const index = getTileIndex(pos);
    return getTiles(isForeground)[index];
};

const setTile = (isForeground, pos, tile) => {
    const tiles = getTiles(isForeground);
    const index = getTileIndex(pos);
    const lastTile = tiles[index];
    let lastTypeId;
    if (lastTile === null) {
        lastTypeId = null;
    } else {
        lastTypeId = lastTile.typeId;
        lastTile.deleteEvent(isForeground);
    }
    tiles[index] = tile;
    tile.addEvent(isForeground, pos);
    const typeId = tile.typeId;
    if (lastTypeId !== typeId) {
        new TileChange(isForeground, pos.copy(), typeId);
    }
};

const swapForegroundTiles = (pos1, pos2) => {
    const index1 = getTileIndex(pos1);
    const index2 = getTileIndex(pos2);
    const tile1 = foregroundTiles[index1];
    const tile2 = foregroundTiles[index2];
    const lastTypeId1 = tile1.typeId;
    const lastTypeId2 = tile2.typeId;
    foregroundTiles[index1] = tile2;
    foregroundTiles[index2] = tile1;
    tile1.moveEvent(pos2);
    tile2.moveEvent(pos1);
    const typeId1 = tile1.typeId;
    const typeId2 = tile1.typeId;
    if (lastTypeId1 !== typeId2) {
        new TileChange(isForeground, pos1.copy(), typeId2);
    }
    if (lastTypeId2 !== typeId1) {
        new TileChange(isForeground, pos2.copy(), typeId1);
    }
};

const iterateWorldPos = (handle) => {
    const pos = new Pos(0, 0);
    for (let index = 0; index < worldTilesLength; index++) {
        handle(pos, index);
        pos.x += 1;
        if (pos.x >= worldSize) {
            pos.x = 0;
            pos.y += 1;
        }
    }
};

const createWorldTiles = () => {
    iterateWorldPos((pos) => {
        setTile(true, pos, emptyTile);
        setTile(false, pos, emptyTile);
    });
};

const readWorldTiles = () => {
    const data = JSON.parse(fs.readFileSync(worldTilesPath));
    iterateWorldPos((pos, index) => {
        const foregroundTile = convertJsonToTile(data.foreground[index]);
        const backgroundTile = convertJsonToTile(data.background[index]);
        setTile(true, pos, foregroundTile);
        setTile(false, pos, backgroundTile);
    });
};

export const initWorldTiles = () => {
    if (fs.existsSync(worldTilesPath)) {
        readWorldTiles();
    } else {
        createWorldTiles();
    }
};

export const writeWorldTiles = () => {
    const data = {
        foreground: foregroundTiles.map((tile) => tile.toDbJson()),
        background: backgroundTiles.map((tile) => tile.toDbJson()),
    };
    fs.writeFileSync(worldTilesPath, JSON.stringify(data));
};

export const encodeWorldTiles = () => {
    const chars = [];
    for (let index = 0; index < worldTilesLength; index++) {
        let tile = foregroundTiles[index];
        if (tile instanceof EmptyTile) {
            tile = backgroundTiles[index];
        }
        const typeId = tile.typeId;
        chars.push(String.fromCharCode(typeId + startTileChar));
    }
    return chars.join("");
};

export const getWorldChanges = (startChangeId) => {
    if (lastWorldChangeId - startChangeId > worldChanges.length - 5) {
        return null;
    }
    const output = [];
    let index = lastWorldChangeIndex;
    while (true) {
        const worldChange = worldChanges[index];
        if (worldChange === null || worldChange.id < startChangeId) {
            break;
        }
        output.push(worldChange);
        index -= 1;
        if (index < 0) {
            index = worldChanges.length - 1;
        }
    }
    output.reverse();
    return output;
};

export const getLastWorldChangeId = () => lastWorldChangeId;

export const createSproutTile = (creatorUsername, isPoisonous, tier) => new FlowerTile({
    creatorUsername, isPoisonous, tier, age: 0,
});

const flowerStageIsSprout = (stage) => (stage < sproutStageAmount);

const growGrass = () => {
    if (Math.random() > 0.02) {
        return;
    }
    const grassRatio = grassTileCount / emptyForegroundTileCount;
    if (grassRatio >= 30 / 676) {
        return;
    }
    const pos = new Pos(
        Math.floor(Math.random() * worldSize),
        Math.floor(Math.random() * worldSize),
    );
    if (getTile(true, pos) instanceof EmptyTile
            && getTile(false, pos) instanceof EmptyTile) {
        const texture = Math.floor(Math.random() * grassTiles.length);
        const grassTile = grassTiles[texture];
        setTile(false, pos, grassTile);
    }
};

export const tilesTimerEvent = () => {
    const entityTiles = Array.from(entityTileSet);
    for (const entityTile of entityTiles) {
        entityTile.timerEvent();
    }
    growGrass();
};


