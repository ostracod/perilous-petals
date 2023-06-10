
const pixelScale = 6;

let localPlayerUsername;
let playerTiles = [];
let localPlayerTile = null;

class Tile {
    
}

class PlayerTile {
    
    constructor(username, pos) {
        this.username = username;
        this.pos = pos;
        playerTiles.push(this);
        if (this.username === localPlayerUsername) {
            localPlayerTile = this;
        }
    }
    
    draw() {
        playerSprite.draw(context, pixelScale, this.pos);
    }
}

addCommandListener("setState", (command) => {
    playerTiles = [];
    localPlayerTile = null;
    for (const playerData of command.players) {
        const pos = createPosFromJson(playerData.pos);
        new PlayerTile(playerData.username, pos);
    }
});

class ClientDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    initialize(done) {
        initializeSpriteSheet(done);
    }
    
    setLocalPlayerInfo(command) {
        localPlayerUsername = command.username;
    }
    
    addCommandsBeforeUpdateRequest() {
        gameUpdateCommandList.push({
            commandName: "getState",
        });
    }
    
    timerEvent() {
        clearCanvas();
        for (const playerTile of playerTiles) {
            playerTile.draw();
        }
    }
    
    keyDownEvent(keyCode) {
        return true;
    }
    
    keyUpEvent(keyCode) {
        return true;
    }
}

clientDelegate = new ClientDelegate();


