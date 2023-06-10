
const pixelScale = 6;
const worldSize = 26;

let localPlayerUsername;
let playerTiles = [];
let localPlayerTile = null;
const walkOffset = new Pos(0, 0);
let walkDelay = 0;
let firstStepDelay = 0;
let standDelay = 0;

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

const tryWalk = () => {
    if ((walkOffset.x === 0 && walkOffset.y === 0)
            || localPlayerTile === null || walkDelay > 0) {
        return;
    }
    const nextPos = localPlayerTile.pos.copy();
    nextPos.add(walkOffset);
    if (nextPos.x < 0 || nextPos.y < 0 || nextPos.x >= worldSize || nextPos.y >= worldSize) {
        return;
    }
    localPlayerTile.pos.set(nextPos);
    gameUpdateCommandList.push({
        commandName: "walk",
        offset: walkOffset.copy().toJson(),
    });
    walkDelay = 3;
};

const actInDirection = (offset) => {
    if (standDelay > 4) {
        firstStepDelay = 9;
    }
    walkOffset.set(offset);
    tryWalk();
};

const stopWalk = (offset) => {
    if (walkOffset.equals(offset)) {
        walkOffset.x = 0;
        walkOffset.y = 0;
    }
};

addCommandListener("setState", (command) => {
    playerTiles = [];
    localPlayerTile = null;
    for (const playerData of command.players) {
        const pos = createPosFromJson(playerData.pos);
        new PlayerTile(playerData.username, pos);
    }
});

addCommandRepeater("walk", (command) => {
    localPlayerTile.pos.add(command.offset);
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
        walkDelay -= 1;
        firstStepDelay -= 1;
        if (walkOffset.x === 0 && walkOffset.y === 0) {
            standDelay += 1;
        } else {
            standDelay = 0;
        }
        if (firstStepDelay <= 0) {
            tryWalk();
        }
        clearCanvas();
        for (const playerTile of playerTiles) {
            playerTile.draw();
        }
    }
    
    keyDownEvent(keyCode) {
        if (focusedTextInput !== null) {
            return true;
        }
        if (keyCode === 65 || keyCode === 37) {
            actInDirection(new Pos(-1, 0));
        }
        if (keyCode === 68 || keyCode === 39) {
            actInDirection(new Pos(1, 0));
        }
        if (keyCode === 87 || keyCode === 38) {
            actInDirection(new Pos(0, -1));
        }
        if (keyCode === 83 || keyCode === 40) {
            actInDirection(new Pos(0, 1));
        }
        return (keyCode !== 38 && keyCode !== 40);
    }
    
    keyUpEvent(keyCode) {
        if (keyCode === 65 || keyCode === 37) {
            stopWalk(new Pos(-1, 0));
        }
        if (keyCode === 68 || keyCode === 39) {
            stopWalk(new Pos(1, 0));
        }
        if (keyCode === 87 || keyCode === 38) {
            stopWalk(new Pos(0, -1));
        }
        if (keyCode === 83 || keyCode === 40) {
            stopWalk(new Pos(0, 1));
        }
        return true;
    }
}

clientDelegate = new ClientDelegate();


