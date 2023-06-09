
import { ostracodMultiplayer } from "ostracod-multiplayer";

import { projectPath } from "./constants.js";
import { gameDelegate } from "./gameDelegate.js";

console.log("Starting Perilous Petals server...");
const result = ostracodMultiplayer.initializeServer(projectPath, gameDelegate, []);
if (!result) {
    process.exit(1);
}


