
class ClientDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    initialize(done) {
        done();
    }
    
    setLocalPlayerInfo(command) {
        
    }
    
    addCommandsBeforeUpdateRequest() {
        
    }
    
    timerEvent() {
        
    }
    
    keyDownEvent(keyCode) {
        return true;
    }
    
    keyUpEvent(keyCode) {
        return true;
    }
}

clientDelegate = new ClientDelegate();


