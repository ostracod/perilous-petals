
import * as commonUtils from "./commonUtils.js";

export class Pos {
    
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    copy() {
        return new Pos(this.x, this.y);
    }
    
    equals(pos) {
        return (this.x === pos.x && this.y === pos.y);
    }
    
    set(pos) {
        this.x = pos.x;
        this.y = pos.y;
    }
    
    add(pos) {
        this.x += pos.x;
        this.y += pos.y;
    }
    
    subtract(pos) {
        this.x -= pos.x;
        this.y -= pos.y;
    }
    
    toJson() {
        return { x: this.x, y: this.y };
    }
}

const readClientPos = (data) => {
    const { x, y } = data;
    if (!commonUtils.isValidInt(x) || !commonUtils.isValidInt(y)) {
        return null;
    }
    return new Pos(x, y);
};

export const readClientOffset = (data) => {
    const offset = readClientPos(data);
    if (offset === null || Math.abs(offset.x) + Math.abs(offset.y) !== 1) {
        return null;
    }
    return offset;
};


