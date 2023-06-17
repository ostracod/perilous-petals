
const spriteSize = 8;
const spriteSheetTileSize = 8;
const spriteSheetSize = spriteSize * spriteSheetTileSize;
const pixelScale = 6;
const scaledSpriteSize = spriteSize * pixelScale;
const spriteSets = [];

// Contains all sprites without color.
let spriteSheetImage;
let spriteSheetCanvas;
let spriteSheetContext;
let spriteSheetImageData;
let spriteSheetImageDataList;

// Contains a single sprite with color.
let spriteCanvas;
let spriteContext;
let spriteImageData;
let spriteImageDataList;

// Stores an image of tiles in the world.
let bufferCanvas;
let bufferContext;
let bufferCanvasHasChanged = false;

const backgroundColor = new Color(255, 255, 255);
const backgroundColorString = backgroundColor.toString();
const dummyPalette1 = [new Color(0, 0, 0), new Color(255, 255, 255)];
const dummyPalette2 = [new Color(0, 0, 255), new Color(255, 255, 255)];

const grassSpriteSets = [];
let blockSpriteSet;
const sproutSpriteSets = [];
let flowerSpriteSets;
let playerSpriteSet;

const sproutSprites = [];
const flowerSprites = [];
let playerSprite;

class SpriteSet {
    
    // Each color palette is a list of two colors.
    constructor(sheetIndex, palettes, canFlip) {
        this.sheetIndex = sheetIndex;
        this.palettes = palettes;
        this.canFlip = canFlip;
        this.imageMap = new Map();
        this.flippedImageMap = this.canFlip ? new Map() : null;
        this.images = [];
        spriteSets.push(this);
    }
    
    getImageMap(flip) {
        return flip ? this.flippedImageMap : this.imageMap;
    }
    
    getImage(paletteIndex, flip) {
        return this.getImageMap(flip).get(paletteIndex);
    }
    
    initializeImage(paletteIndex, flip) {
        const palette = this.palettes[paletteIndex];
        const posX = (this.sheetIndex % spriteSheetTileSize) * spriteSize;
        const posY = Math.floor(this.sheetIndex / spriteSheetTileSize) * spriteSize;
        for (let offsetY = 0; offsetY < spriteSize; offsetY++) {
            for (let offsetX = 0; offsetX < spriteSize; offsetX++) {
                const tempOffsetX = flip ? (spriteSize - offsetX - 1) : offsetX;
                let index = ((posX + tempOffsetX) + (posY + offsetY) * spriteSheetSize) * 4;
                const colorR = spriteSheetImageDataList[index];
                let color;
                if (colorR < 128) {
                    color = palette[0];
                } else if (colorR < 224) {
                    color = palette[1];
                } else {
                    color = backgroundColor;
                }
                index = (offsetX + offsetY * spriteSize) * 4;
                if (color === null) {
                    spriteImageDataList[index + 3] = 0;
                } else {
                    spriteImageDataList[index] = color.r;
                    spriteImageDataList[index + 1] = color.g;
                    spriteImageDataList[index + 2] = color.b;
                    spriteImageDataList[index + 3] = 255;
                }
            }
        }
        spriteContext.putImageData(spriteImageData, 0, 0);
        const image = new Image();
        image.src = spriteCanvas.toDataURL();
        this.getImageMap(flip).set(paletteIndex, image);
        this.images.push(image);
    }
    
    initialize() {
        for (let index = 0; index < this.palettes.length; index++) {
            this.initializeImage(index, false);
            if (this.canFlip) {
                this.initializeImage(index, true);
            }
        }
    }
    
    hasFinishedLoading() {
        for (const image of this.images) {
            if (!image.complete) {
                return false;
            }
        }
        return true;
    }
    
    draw(context, scale, pos, paletteIndex = 0, flip = false) {
        const image = this.getImage(paletteIndex, flip);
        drawSpriteImage(context, scale, pos, image);
    }
}

class Sprite {
    
    constructor(spriteSet, paletteIndex = 0, flip = false) {
        this.image = spriteSet.getImage(paletteIndex, flip);
    }
    
    draw(context, scale, pos) {
        drawSpriteImage(context, scale, pos, this.image);
    }
}

const initializeSpriteSets = () => {
    for (let texture = 0; texture < grassTextureAmount; texture++) {
        grassSpriteSets.push(new SpriteSet(32 + texture, [dummyPalette1], false));
    }
    blockSpriteSet = new SpriteSet(24, [dummyPalette1, dummyPalette2], false);
    for (let stage = 0; stage < sproutStageAmount; stage += 1) {
        sproutSpriteSets.push(new SpriteSet(8 + stage, [dummyPalette1], false));
    }
    flowerSpriteSets = [new SpriteSet(16, [dummyPalette1, dummyPalette2], false)];
    playerSpriteSet = new SpriteSet(0, [dummyPalette1], true);
};

const initializeSpriteSheet = (done) => {
    
    spriteSheetCanvas = document.createElement("canvas");
    spriteSheetCanvas.width = spriteSheetSize;
    spriteSheetCanvas.height = spriteSheetSize;
    spriteSheetContext = spriteSheetCanvas.getContext("2d");
    
    spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteSize;
    spriteCanvas.height = spriteSize;
    spriteContext = spriteCanvas.getContext("2d");
    
    spriteSheetImage = new Image();
    spriteSheetImage.onload = () => {
        
        spriteSheetContext.drawImage(spriteSheetImage, 0, 0);
        spriteSheetImageData = spriteSheetContext.getImageData(
            0, 0,
            spriteSheetSize,
            spriteSheetSize,
        );
        spriteSheetImageDataList = spriteSheetImageData.data;
        
        spriteImageData = spriteContext.createImageData(spriteSize, spriteSize);
        spriteImageDataList = spriteImageData.data;
        
        for (const spriteSet of spriteSets) {
            spriteSet.initialize();
        }
        
        const loadWaitInterval = setInterval(() => {
            if (spriteSets.every((spriteSet) => spriteSet.hasFinishedLoading())) {
                clearInterval(loadWaitInterval);
                done();
            }
        }, 100);
    };
    spriteSheetImage.src = "/images/sprites.png";
};

const initializeSprites = () => {
    playerSprite = new Sprite(playerSpriteSet, 0, false);
    for (const spriteSet of sproutSpriteSets) {
        sproutSprites.push(new Sprite(spriteSet, 0));
    }
    const flowerSpriteSet = flowerSpriteSets[0];
    flowerSprites.push(new Sprite(flowerSpriteSet, 0));
    flowerSprites.push(new Sprite(flowerSpriteSet, 1));
};

const initializeBufferCanvas = () => {
    bufferCanvas = document.createElement("canvas");
    bufferCanvas.width = worldPixelSize;
    bufferCanvas.height = worldPixelSize;
    bufferContext = bufferCanvas.getContext("2d");
};

const drawSpriteImage = (context, scale, pos, image) => {
    const scaledSize = spriteSize * scale;
    context.imageSmoothingEnabled = false;
    context.drawImage(
        image,
        pos.x * scaledSize, pos.y * scaledSize,
        scaledSize, scaledSize,
    );
};

const createCanvasWithSprite = (parentTag, sprite, scale) => {
    const output = document.createElement("canvas");
    const size = spriteSize * scale;
    output.width = size;
    output.height = size;
    output.style.width = size / 2;
    output.style.height = size / 2;
    parentTag.appendChild(output);
    const context = output.getContext("2d");
    sprite.draw(context, scale, new Pos(0, 0));
    return output;
};


