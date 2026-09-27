import { resolve } from "node:path";

/**
 * Runs `trace-loader.cjs` on `*.css` and `*.txt`. With webpack (`--webpack`), as the first loader of next's own css
 * rules, and as the only loader for `*.txt`.
 *
 * @type {import("next").NextConfig}
 */
export default {
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["./trace-loader.cjs"],
				as: "*.css",
			},
			"*.txt": {
				loaders: ["./trace-loader.cjs"],
				as: "*.js",
			},
		},
	},
	webpack(config) {
		const visit = (rules) => {
			for (const rule of rules ?? []) {
				if (!rule || typeof rule !== "object") continue;
				visit(rule.oneOf);
				if (Array.isArray(rule.use) && rule.use.some((use) => String(use?.loader ?? use).includes("css-loader"))) {
					rule.use.push(resolve("trace-loader.cjs"));
				}
			}
		};
		visit(config.module.rules);
		config.module.rules.push({ test: /\.txt$/, use: [resolve("trace-loader.cjs")] });
		return config;
	},
};
