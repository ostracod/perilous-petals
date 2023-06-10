
class ClientDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    initialize(done) {
        initializeSpriteSheet(done);
    }
    
    setLocalPlayerInfo(command) {
        
    }
    
    addCommandsBeforeUpdateRequest() {
        
    }
    
    timerEvent() {
        clearCanvas();
        const size = 26;
        for (let posY = 0; posY < size; posY += 1) {
            for (let posX = 0; posX < size; posX += 1) {
                if (Math.random() < 0.3) {
                    testSprite.draw(
                        context, 6,
                        new Pos(posX, posY),
                        Math.floor(Math.random() * 2),
                        Math.random() > 0.5,
                    );
                }
            }
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


