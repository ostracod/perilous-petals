
import { gameUtils } from "ostracod-multiplayer";

// Map from username to PlayerTile.
const playerTileMap = new Map();

class Pos {
    
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    toJson() {
        return { x: this.x, y: this.y };
    }
}

class Tile {
    
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
    
    toClientJson() {
        return {
            username: this.player.username,
            pos: this.pos.toJson(),
        }
    }
}

gameUtils.addCommandListener("getState", true, (command, player, outputCommands) => {
    const playerTiles = Array.from(playerTileMap.values());
    outputCommands.push({
        commandName: "setState",
        players: playerTiles.map((tile) => tile.toClientJson()),
    });
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
        
    }
}

export const gameDelegate = new GameDelegate();


