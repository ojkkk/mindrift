const fs = require("fs");
let types = fs.readFileSync("D:/new idea/mindrift/shared/types.ts", "utf-8");

// Add source to SessionInfo
types = types.replace(
  "export interface SessionInfo {\n  id: string;\n  name: string;\n  filePath: string;\n  startedAt: string;",
  "export interface SessionInfo {\n  id: string;\n  name: string;\n  filePath: string;\n  source: string;\n  startedAt: string;"
);

fs.writeFileSync("D:/new idea/mindrift/shared/types.ts", types, "utf-8");
console.log("Types updated");
