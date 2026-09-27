/**
 * Pass-through loader. For each call, logs the color in the source it is given next to the one in the file on disk at
 * that moment, to `trace.log`. Turns `*.txt` files into a js module that exports their content.
 */

const fs = require("node:fs");
const path = require("node:path");

const color = (text) => text.match(/#[0-9a-f]{6}/)?.[0] ?? null;

module.exports = function traceLoader(source) {
	const entry = { file: path.basename(this.resourcePath), source: color(source), disk: color(fs.readFileSync(this.resourcePath, "utf8")) };
	fs.appendFileSync(path.join(__dirname, "trace.log"), `${JSON.stringify(entry)}\n`);
	return this.resourcePath.endsWith(".txt") ? `export default ${JSON.stringify(source.trim())};` : source;
};
