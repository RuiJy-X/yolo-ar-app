import fs from "node:fs";
import crypto from "node:crypto";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const file = `Skysight-Setup-${pkg.version}.exe`;
const hash = crypto.createHash("sha256");
for await (const chunk of fs.createReadStream(`release/${file}`)) hash.update(chunk);
const line = `${hash.digest("hex")}  ${file}\n`;
fs.writeFileSync(`release/${file}.sha256`, line);
console.log(line);
