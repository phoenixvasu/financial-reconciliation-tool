const { execSync } = require("child_process");

execSync("cd client && npm install && npm run build", { stdio: "inherit" });
execSync("cd server && npm install", { stdio: "inherit" });
