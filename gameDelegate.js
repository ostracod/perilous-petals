
import * as fs from "fs";
import { gameUtils } from "ostracod-multiplayer";
import { worldTilesPath, worldSize, tierAmount, grassTextureAmount, tileTypeIds, startTileChar } from "./constants.js";

const worldTilesLength = worldSize ** 2;

const foregroundTiles = Array(worldTilesLength).fill(null);
const backgroundTiles = Array(worldTilesLength).fill(null);
// This is a circular buffer.
const tileChanges = Array(1000).fill(null);
let lastTileChangeId = 0;
let lastTileChangeIndex = 0;
// Map from username to PlayerTile.
const playerTileMap = new Map();

class Pos {
    
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    copy() {
        return new Pos(this.x, this.y);
    }
    
    set(pos) {
        this.x = pos.x;
        this.y = pos.y;
    }
    
    add(pos) {
        this.x += pos.x;
        this.y += pos.y;
    }
    
    toJson() {
        return { x: this.x, y: this.y };
    }
}

const createPosFromJson = (data) => new Pos(data.x, data.y);

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // toDbJson
    
    constructor(typeId) {
        this.typeId = typeId;
    }
    
    addEvent(pos) {
        // Do nothing.
    }
    
    moveEvent(pos) {
        // Do nothing.
    }
    
    deleteEvent() {
        // Do nothing.
    }
    
    playerCanRemove() {
        return false;
    }
}

class EmptyTile extends Tile {
    
    constructor() {
        super(tileTypeIds.empty);
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
    
    toDbJson() {
        return { type: "block", tier: this.tier };
    }
}

const blockTiles = [];
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
    
    addEvent(pos) {
        super.addEvent(pos);
        this.pos = pos.copy();
    }
    
    moveEvent(pos) {
        super.moveEvent(pos);
        this.pos.set(pos);
    }
}

class PlayerTile extends EntityTile {
    
    constructor(player) {
        super(tileTypeIds.empty);
        this.player = player;
        this.pos = null;
    }
    
    addEvent(pos) {
        super.addEvent(pos);
        playerTileMap.set(this.player.username, this);
    }
    
    deleteEvent() {
        super.deleteEvent();
        playerTileMap.delete(this.player.username);
    }
    
    addToWorld() {
        const { posX, posY } = this.player.extraFields;
        const pos = new Pos(posX ?? 0, posY ?? 0);
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
        if (nextTile instanceof EmptyTile) {
            swapForegroundTiles(this.pos, nextPos);
        }
    }
    
    toDbJson() {
        return emptyTile.toDbJson();
    }
    
    toClientJson() {
        return {
            username: this.player.username,
            pos: this.pos.toJson(),
        }
    }
}

class TileChange {
    
    constructor(isForeground, pos, typeId) {
        this.isForeground = isForeground;
        this.pos = pos;
        this.typeId = typeId;
        lastTileChangeId += 1;
        this.id = lastTileChangeId;
        lastTileChangeIndex = (lastTileChangeIndex + 1) % tileChanges.length;
        tileChanges[lastTileChangeIndex] = this;
    }
    
    toJson() {
        return {
            isForeground: this.isForeground,
            pos: this.pos.toJson(),
            typeId: this.typeId,
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
        lastTile.deleteEvent();
    }
    tiles[index] = tile;
    tile.addEvent(pos);
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
        const foregroundTile = (Math.random() < 0.05) ? blockTiles[0] : emptyTile;
        const backgroundTile = (Math.random() < 0.05) ? grassTiles[0] : emptyTile;
        setTile(true, pos, foregroundTile);
        setTile(false, pos, backgroundTile);
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

const writeWorldTiles = () => {
    const data = {
        foreground: foregroundTiles.map((tile) => tile.toDbJson()),
        background: backgroundTiles.map((tile) => tile.toDbJson()),
    };
    fs.writeFileSync(worldTilesPath, JSON.stringify(data));
};

const encodeWorldTiles = () => {
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

const getTileChanges = (startChangeId) => {
    if (lastTileChangeId - startChangeId > tileChanges.length - 5) {
        return null;
    }
    const output = [];
    let index = lastTileChangeIndex;
    while (true) {
        const tileChange = tileChanges[index];
        if (tileChange === null || tileChange.id < startChangeId) {
            break;
        }
        output.push(tileChange);
        index -= 1;
        if (index < 0) {
            index = tileChanges.length - 1;
        }
    }
    output.reverse();
    return output;
};

if (fs.existsSync(worldTilesPath)) {
    readWorldTiles();
} else {
    createWorldTiles();
}

gameUtils.addCommandListener("getState", true, (command, player, outputCommands) => {
    const playerTiles = Array.from(playerTileMap.values());
    const outputCommand = {
        commandName: "setState",
        players: playerTiles.map((tile) => tile.toClientJson()),
        lastTileChangeId,
    };
    const changeId = command.lastTileChangeId;
    let changesToSend;
    if (changeId === null) {
        changesToSend = null;
    } else {
        changesToSend = getTileChanges(changeId + 1);
    }
    if (changesToSend === null) {
        outputCommand.worldTiles = encodeWorldTiles();
    } else {
        outputCommand.tileChanges = changesToSend.map((change) => change.toJson());
    }
    outputCommands.push(outputCommand);
});

gameUtils.addCommandListener("walk", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    playerTile.walk(command.offset);
});

gameUtils.addCommandListener("placeBlock", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    const pos = playerTile.pos.copy();
    const offset = createPosFromJson(command.offset);
    pos.add(offset);
    if (!posIsInWorld(pos)) {
        return;
    }
    const lastTile = getTile(true, pos);
    if (lastTile instanceof EmptyTile) {
        setTile(true, pos, blockTiles[command.tier]);
    }
});

gameUtils.addCommandListener("removeTile", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    const pos = playerTile.pos.copy();
    const offset = createPosFromJson(command.offset);
    pos.add(offset);
    if (!posIsInWorld(pos)) {
        return;
    }
    const lastTile = getTile(true, pos);
    if (lastTile.playerCanRemove()) {
        setTile(true, pos, emptyTile);
    }
});

class GameDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    playerEnterEvent(player) {
        const playerTile = new PlayerTile(player);
        playerTile.addToWorld();
    }
    
    playerLeaveEvent(player) {
        const playerTile = playerTileMap.get(player.username);
        playerTile.deleteFromWorld();
    }
    
    async persistEvent() {
        writeWorldTiles();
    }
}

export const gameDelegate = new GameDelegate();


