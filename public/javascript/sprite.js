
const spriteSize = 8;
const spriteSheetTileSize = 8;
const spriteSheetSize = spriteSize * spriteSheetTileSize;
const sprites = [];
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

class Sprite {
    
    // Each color palette is a list of two colors.
    constructor(sheetIndex, palettes, canFlip) {
        this.sheetIndex = sheetIndex;
        this.palettes = palettes;
        this.canFlip = canFlip;
        this.imageMap = new Map();
        this.flippedImageMap = this.canFlip ? new Map() : null;
        this.images = [];
        sprites.push(this);
    }
    
    getImageMap(flip) {
        return flip ? this.flippedImageMap : this.imageMap;
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
        const image = this.getImageMap(flip).get(paletteIndex);
        const scaledSize = spriteSize * scale;
        context.imageSmoothingEnabled = false;
        context.drawImage(
            image,
            pos.x * scaledSize, pos.y * scaledSize,
            scaledSize, scaledSize,
        );
    }
}

const dummyPalette = [new Color(0, 0, 0), new Color(255, 255, 255)];
const grassSprite = new Sprite(32, [dummyPalette], false);
const blockSprite = new Sprite(24, [dummyPalette], false);
const playerSprite = new Sprite(0, [dummyPalette], true);

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
        
        for (const sprite of sprites) {
            sprite.initialize();
        }
        
        const loadWaitInterval = setInterval(() => {
            if (sprites.every((sprite) => sprite.hasFinishedLoading())) {
                clearInterval(loadWaitInterval);
                done();
            }
        }, 100);
    };
    spriteSheetImage.src = "/images/sprites.png";
};


