
import * as fs from "fs";
import { gameUtils } from "ostracod-multiplayer";
import { worldTilesPath, worldSize, tierAmount, grassTextureAmount, tileTypeIds, startTileChar } from "./constants.js";

const worldTilesLength = worldSize ** 2;

const foregroundTiles = Array(worldTilesLength).fill(null);
const backgroundTiles = Array(worldTilesLength).fill(null);
let lastWorldChangeId = 0;
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
    // getTypeId, toDbJson
    
    addEvent(pos) {
        // Do nothing.
    }
    
    moveEvent(pos) {
        // Do nothing.
    }
    
    deleteEvent() {
        // Do nothing.
    }
}

class EmptyTile extends Tile {
    
    getTypeId() {
        return tileTypeIds.empty;
    }
    
    toDbJson() {
        return null;
    }
}

const emptyTile = new EmptyTile();

class GrassTile extends Tile {
    
    constructor(texture) {
        super();
        this.texture = texture;
    }
    
    getTypeId() {
        return tileTypeIds.grass + this.texture;
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
        super();
        this.tier = tier;
    }
    
    getTypeId() {
        return tileTypeIds.block + this.tier;
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

class PlayerTile extends Tile {
    
    constructor(player) {
        super();
        this.player = player;
        this.pos = null;
    }
    
    addEvent(pos) {
        super.addEvent(pos);
        this.pos = pos.copy();
        playerTileMap.set(this.player.username, this);
    }
    
    moveEvent(pos) {
        super.moveEvent(pos);
        this.pos.set(pos);
    }
    
    deleteEvent() {
        super.deleteEvent();
        playerTileMap.delete(this.player.username);
    }
    
    addToWorld() {
        const { posX, posY } = this.player.extraFields;
        const pos = new Pos(posX ?? 0, posY ?? 0);
        setForegroundTile(pos, this);
    }
    
    deleteFromWorld() {
        setForegroundTile(this.pos, emptyTile);
    }
    
    walk(offset) {
        const nextPos = this.pos.copy();
        nextPos.add(offset);
        if (!posIsInWorld(nextPos)) {
            return;
        }
        const nextTile = getForegroundTile(nextPos);
        if (nextTile instanceof EmptyTile) {
            swapForegroundTiles(this.pos, nextPos);
        }
    }
    
    getTypeId() {
        return tileTypeIds.empty;
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

const getForegroundTile = (pos) => {
    const index = getTileIndex(pos);
    return foregroundTiles[index];
};

const getBackgroundTile = (pos) => {
    const index = getTileIndex(pos);
    return backgroundTiles[index];
};

const setTileHelper = (tiles, pos, tile) => {
    const index = getTileIndex(pos);
    const lastTile = tiles[index];
    if (lastTile !== null) {
        lastTile.deleteEvent();
    }
    tiles[index] = tile;
    tile.addEvent(pos);
};

const setForegroundTile = (pos, tile) => {
    setTileHelper(foregroundTiles, pos, tile);
};

const setBackgroundTile = (pos, tile) => {
    setTileHelper(backgroundTiles, pos, tile);
};

const swapForegroundTiles = (pos1, pos2) => {
    const index1 = getTileIndex(pos1);
    const index2 = getTileIndex(pos2);
    const tile1 = foregroundTiles[index1];
    const tile2 = foregroundTiles[index2];
    foregroundTiles[index1] = tile2;
    foregroundTiles[index2] = tile1;
    tile1.moveEvent(pos2);
    tile2.moveEvent(pos1);
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
        setForegroundTile(pos, foregroundTile);
        setBackgroundTile(pos, backgroundTile);
    });
};

const readWorldTiles = () => {
    const data = JSON.parse(fs.readFileSync(worldTilesPath));
    iterateWorldPos((pos, index) => {
        const foregroundTile = convertJsonToTile(data.foreground[index]);
        const backgroundTile = convertJsonToTile(data.background[index]);
        setForegroundTile(pos, foregroundTile);
        setBackgroundTile(pos, backgroundTile);
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
        const typeId = tile.getTypeId();
        chars.push(String.fromCharCode(typeId + startTileChar));
    }
    return chars.join("");
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
        lastWorldChangeId,
    };
    if (command.lastWorldChangeId === null) {
        outputCommand.worldTiles = encodeWorldTiles();
    } else {
        // TODO: Send world changes to the client.
        
    }
    outputCommands.push(outputCommand);
});

gameUtils.addCommandListener("walk", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    playerTile.walk(command.offset);
});

gameUtils.addCommandListener("placeTile", true, (command, player, outputCommands) => {
    // TODO: Verify action.
    const pos = createPosFromJson(command.pos);
    setForegroundTile(pos, blockTiles[0]);
});

gameUtils.addCommandListener("removeTile", true, (command, player, outputCommands) => {
    // TODO: Verify action.
    const pos = createPosFromJson(command.pos);
    setForegroundTile(pos, emptyTile);
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


