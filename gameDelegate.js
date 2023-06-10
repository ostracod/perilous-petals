
import * as fs from "fs";
import { gameUtils } from "ostracod-multiplayer";
import { worldTilesPath, worldSize, tierAmount, grassTextureAmount } from "./constants.js";

let foregroundTiles;
let backgroundTiles;
// Map from username to PlayerTile.
const playerTileMap = new Map();

class Pos {
    
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    add(pos) {
        this.x += pos.x;
        this.y += pos.y;
    }
    
    toJson() {
        return { x: this.x, y: this.y };
    }
}

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // toDbJson
}

class EmptyTile extends Tile {
    
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
        const { posX, posY } = this.player.extraFields;
        this.pos = new Pos(posX ?? 0, posY ?? 0);
        playerTileMap.set(this.player.username, this);
    }
    
    remove() {
        playerTileMap.delete(this.player.username);
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

const createWorldTiles = () => {
    foregroundTiles = [];
    backgroundTiles = [];
    const tileAmount = worldSize ** 2;
    for (let index = 0; index < tileAmount; index++) {
        foregroundTiles.push((Math.random() < 0.05) ? grassTiles[0] : emptyTile);
        backgroundTiles.push((Math.random() < 0.05) ? blockTiles[0] : emptyTile);
    }
};

const readWorldTiles = () => {
    const data = JSON.parse(fs.readFileSync(worldTilesPath));
    foregroundTiles = data.foreground.map(convertJsonToTile);
    backgroundTiles = data.background.map(convertJsonToTile);
};

const writeWorldTiles = () => {
    const data = {
        foreground: foregroundTiles.map((tile) => tile.toDbJson()),
        background: backgroundTiles.map((tile) => tile.toDbJson()),
    };
    fs.writeFileSync(worldTilesPath, JSON.stringify(data));
};

if (fs.existsSync(worldTilesPath)) {
    readWorldTiles();
} else {
    createWorldTiles();
}

gameUtils.addCommandListener("getState", true, (command, player, outputCommands) => {
    const playerTiles = Array.from(playerTileMap.values());
    outputCommands.push({
        commandName: "setState",
        players: playerTiles.map((tile) => tile.toClientJson()),
    });
});

gameUtils.addCommandListener("walk", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    playerTile.pos.add(command.offset);
});

class GameDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    playerEnterEvent(player) {
        new PlayerTile(player);
    }
    
    playerLeaveEvent(player) {
        const playerTile = playerTileMap.get(player.username);
        playerTile.remove();
    }
    
    async persistEvent() {
        writeWorldTiles();
    }
}

export const gameDelegate = new GameDelegate();


