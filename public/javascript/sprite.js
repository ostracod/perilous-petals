
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

const backgroundColor = new Color(166, 196, 157);
const backgroundColorString = backgroundColor.toString();
const playerPalettes = [
    [new Color(0, 0, 0), new Color(255, 255, 255)],
    [new Color(0, 128, 0), new Color(255, 255, 255)],
    [new Color(128, 0, 0), new Color(255, 255, 255)],
];
const grassPalette = [new Color(136, 161, 129), null];
const seedPalette = [new Color(133, 71, 0), null];
const sproutPalette = [new Color(0, 97, 0), null];
const generatorPalette = [new Color(64, 64, 64), new Color(192, 192, 192)];
const tierPalettes = [
    [new Color(255, 0, 0), new Color(255, 192, 192)],
    [new Color(255, 128, 0), new Color(255, 224, 192)],
    [new Color(255, 255, 0), new Color(208, 208, 0)],
    [new Color(0, 255, 0), new Color(208, 255, 208)],
    [new Color(0, 255, 255), new Color(208, 255, 255)],
    [new Color(0, 0, 255), new Color(192, 192, 255)],
    [new Color(255, 0, 255), new Color(255, 192, 255)],
    [new Color(255, 255, 255), new Color(208, 208, 208)],
    
    [new Color(192, 0, 0), new Color(255, 128, 128)],
    [new Color(192, 96, 0), new Color(255, 128, 0)],
    [new Color(128, 128, 0), new Color(192, 192, 0)],
    [new Color(0, 128, 0), new Color(0, 208, 0)],
    [new Color(0, 128, 128), new Color(0, 208, 208)],
    [new Color(0, 0, 192), new Color(160, 160, 255)],
    [new Color(192, 0, 192), new Color(255, 128, 255)],
    [new Color(0, 0, 0), new Color(160, 160, 160)],
    
    [new Color(255, 0, 0), new Color(255, 255, 0)],
    [new Color(255, 128, 0), new Color(0, 255, 0)],
    [new Color(255, 255, 0), new Color(0, 192, 192)],
    [new Color(0, 255, 0), new Color(64, 64, 255)],
    [new Color(0, 255, 255), new Color(255, 0, 255)],
    [new Color(0, 0, 255), new Color(255, 0, 0)],
    [new Color(255, 0, 255), new Color(255, 192, 64)],
    [new Color(128, 128, 128), new Color(192, 192, 192)],
];

const flowerVariationAmount = 3;
const flowerColorsPerVariation = 8;

const grassSpriteSets = [];
const blockSpriteSets = [];
const sproutSpriteSets = [];
const flowerSpriteSets = [];
const playerSpriteSets = [];
const generatorSpriteSets = [];

const sproutSprites = [];
const flowerSprites = [];
const playerSprites = [];
let generatorSprites = [];

class SpriteSet {
    
    // Each color palette is a list of two colors.
    constructor(sheetIndex, palettes, canFlip) {
        this.sheetIndex = sheetIndex;
        this.palettes = palettes;
        this.canFlip = canFlip;
        this.imageMap = new Map();
        this.flippedImageMap = this.canFlip ? new Map() : null;
        this.images = [];
        this.hasBackground = false;
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
                    color = null;
                }
                index = (offsetX + offsetY * spriteSize) * 4;
                if (color === null) {
                    spriteImageDataList[index + 3] = 0;
                    this.hasBackground = true;
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
        this.hasBackground = spriteSet.hasBackground;
    }
    
    draw(context, scale, pos) {
        drawSpriteImage(context, scale, pos, this.image);
    }
}

const initializeSpriteSets = () => {
    for (let index = 0; index < playerPalettes.length; index++) {
        playerSpriteSets.push(new SpriteSet(index, [playerPalettes[index]], true));
    }
    for (let texture = 0; texture < grassTextureAmount; texture++) {
        grassSpriteSets.push(new SpriteSet(32 + texture, [grassPalette], false));
    }
    for (let stage = 0; stage < sproutStageAmount; stage += 1) {
        const palette = (stage <= 0) ? seedPalette : sproutPalette;
        sproutSpriteSets.push(new SpriteSet(8 + stage, [palette], false));
    }
    for (let variation = 0; variation < flowerVariationAmount; variation++) {
        const startIndex = variation * flowerColorsPerVariation;
        const endIndex = startIndex + flowerColorsPerVariation;
        const palettes = tierPalettes.slice(startIndex, endIndex);
        blockSpriteSets.push(new SpriteSet(24 + variation, palettes, false));
        flowerSpriteSets.push(new SpriteSet(16 + variation, palettes, false));
    }
    generatorSpriteSets.push(new SpriteSet(40, [generatorPalette], false));
    generatorSpriteSets.push(new SpriteSet(41, [generatorPalette], false));
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
    for (const spriteSet of playerSpriteSets) {
        playerSprites.push(new Sprite(spriteSet, 0, false));
        playerSprites.push(new Sprite(spriteSet, 0, true));
    }
    for (const spriteSet of sproutSpriteSets) {
        sproutSprites.push(new Sprite(spriteSet, 0));
    }
    for (let variation = 0; variation < flowerVariationAmount; variation++) {
        const flowerSpriteSet = flowerSpriteSets[variation];
        for (let paletteIndex = 0; paletteIndex < flowerColorsPerVariation; paletteIndex++) {
            flowerSprites.push(new Sprite(flowerSpriteSet, paletteIndex));
        }
    }
    generatorSprites = generatorSpriteSets.map((spriteSet) => new Sprite(spriteSet, 0));
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

const createCanvasWithSprite = (parentTag, sprite, scale, color = null) => {
    const output = document.createElement("canvas");
    const size = spriteSize * scale;
    output.width = size;
    output.height = size;
    output.style.width = size / 2;
    output.style.height = size / 2;
    parentTag.appendChild(output);
    const context = output.getContext("2d");
    if (color === null) {
        output.style.border = "3px #FFFFFF solid";
    } else {
        const colorString = color.toString();
        output.style.border = `3px ${colorString} solid`;
        context.fillStyle = colorString;
        context.fillRect(0, 0, size, size);
    }
    sprite.draw(context, scale, new Pos(0, 0));
    return output;
};


