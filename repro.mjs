/**
 * Starts `next dev` and edits `styles/index.css` (or `app/message.txt` with `--txt`) a number of times, each time to a
 * new color. After each edit, waits until `/` serves the new color (in the linked stylesheet, or in the page for
 * `--txt`), then prints the calls to `trace-loader.cjs` the edit caused: the color in the source the loader was given,
 * and whether that matched the file on disk at the time.
 *
 * Usage: node repro.mjs [--txt] [--webpack] [--iterations 5]
 */

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
	options: {
		txt: { type: "boolean", default: false },
		webpack: { type: "boolean", default: false },
		iterations: { type: "string", default: "5" },
	},
});

const origin = "http://localhost:3100";

function color(i) {
	return `#${(i * 99991 + 0x100000).toString(16).slice(-6)}`;
}

const file = args.txt ? "app/message.txt" : "styles/index.css";

function write(i) {
	writeFileSync(file, args.txt ? `${color(i)}\n` : `.probe {\n\tcolor: ${color(i)};\n}\n`);
}

async function served() {
	const html = await (await fetch(origin, { cache: "no-store" })).text();
	if (args.txt) return html;
	const hrefs = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css[^"]*)"/g)].map((match) => match[1]);
	const sheets = await Promise.all(hrefs.map(async (href) => (await fetch(origin + href, { cache: "no-store" })).text()));
	return sheets.join("\n");
}

writeFileSync("styles/index.css", `.probe {\n\tcolor: ${color(0)};\n}\n`);
writeFileSync("app/message.txt", `${color(0)}\n`);
rmSync(".next", { recursive: true, force: true });
rmSync("trace.log", { force: true });

const server = spawn("node", ["node_modules/next/dist/bin/next", "dev", "-p", "3100", ...(args.webpack ? ["--webpack"] : [])], {
	stdio: ["ignore", "pipe", "pipe"],
	env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
let log = "";
server.stdout.on("data", (chunk) => (log += chunk));
server.stderr.on("data", (chunk) => (log += chunk));
process.on("exit", () => server.kill("SIGINT"));
while (!log.includes("Ready")) await sleep(200);

if (!(await served()).includes(color(0))) throw new Error(`initial response is missing ${color(0)}:\n${log}`);

const version = JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version;
console.log(`next ${version}, ${args.webpack ? "webpack" : "turbopack"}, editing ${file}\n`);

let stale = 0;
for (let i = 1; i <= Number(args.iterations); i++) {
	appendFileSync("trace.log", `${JSON.stringify({ edit: color(i) })}\n`);
	write(i);
	for (let started = Date.now(); !(await served()).includes(color(i)); ) {
		if (Date.now() - started > 15_000) throw new Error(`never served ${color(i)}`);
		await sleep(250);
	}
	await sleep(1000);

	const calls = readFileSync("trace.log", "utf8").trim().split("\n").map((line) => JSON.parse(line));
	const since = calls.findLastIndex((call) => call.edit === color(i));
	const edit = calls
		.slice(since + 1)
		.filter((call) => file.endsWith(call.file))
		.map((call) => (call.source === call.disk ? call.source : `${call.source} (STALE, disk has ${call.disk})`));
	stale += edit.filter((call) => call.includes("STALE")).length;
	console.log(`edit ${i}: ${color(i - 1)} -> ${color(i)}, loader called with: ${edit.join(", ")}`);
}

console.log(`\n${stale} calls with stale source`);
server.kill("SIGINT");
process.exit(0);
