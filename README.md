# Turbopack: after a file changes, loaders are first run with the file's previous content

In `next dev` with Turbopack, editing a file that goes through a webpack loader (configured in `turbopack.rules`) runs
the loader chain **twice**. The first call gets the file's **previous** content, although the file on disk already has
the new content. The second call gets the current content. `next dev --webpack` runs the loader once, with the current
content.

The final output is correct as long as the loader only looks at the `source` it's given. Loaders that also read the
file system see a disk state that doesn't match their input. A loader that caches by the file's mtime (as
`@tailwindcss/turbopack` does) rebuilds its cache from the stale content in the first call, sees an unchanged mtime in
the second call, and reuses the stale result. The served output then always lags one edit behind.

This looks like the same underlying problem as #93052, which describes it for the built-in PostCSS transform and only
when a PostCSS plugin reports a dependency. This repro shows it's broader:

- it happens for any loader in `turbopack.rules`, not just PostCSS;
- the loader here reports no dependencies;
- it's not CSS-specific: a `*.txt` file loaded `as: "*.js"` behaves the same.

## Link to the code that reproduces this issue

https://github.com/stefanprobst/next-turbopack-loader-stale-source-repro

## To Reproduce

```sh
pnpm install
node repro.mjs          # edit styles/index.css, turbopack
node repro.mjs --txt    # edit app/message.txt, turbopack
node repro.mjs --webpack
node repro.mjs --webpack --txt
```

`trace-loader.cjs` is a pass-through loader for `*.css` and `*.txt` (see `next.config.mjs`). For each call, it logs the
color in the source it's given next to the color in the file on disk at that moment. `repro.mjs` starts `next dev`
and edits the file five times, each time to a new color. After each edit it waits until `/` serves the new color, then
prints the loader calls that edit caused.

## Current vs. Expected behavior

**Expected:** one loader call per edit, with the current content (as with `--webpack`):

```
next 16.3.6, webpack, editing styles/index.css

edit 1: #100000 -> #118697, loader called with: #118697
edit 2: #118697 -> #130d2e, loader called with: #130d2e
edit 3: #130d2e -> #1493c5, loader called with: #1493c5
edit 4: #1493c5 -> #161a5c, loader called with: #161a5c
edit 5: #161a5c -> #17a0f3, loader called with: #17a0f3

0 calls with stale source
```

**Current:** with Turbopack, most edits first call the loader with the previous content:

```
next 16.3.6, turbopack, editing styles/index.css

edit 1: #100000 -> #118697, loader called with: #100000 (STALE, disk has #118697), #118697
edit 2: #118697 -> #130d2e, loader called with: #118697 (STALE, disk has #130d2e), #130d2e
edit 3: #130d2e -> #1493c5, loader called with: #130d2e (STALE, disk has #1493c5), #1493c5
edit 4: #1493c5 -> #161a5c, loader called with: #1493c5 (STALE, disk has #161a5c), #161a5c
edit 5: #161a5c -> #17a0f3, loader called with: #17a0f3

4 calls with stale source
```

```
next 16.3.6, turbopack, editing app/message.txt

edit 1: #100000 -> #118697, loader called with: #100000 (STALE, disk has #118697), #118697
edit 2: #118697 -> #130d2e, loader called with: #118697 (STALE, disk has #130d2e), #130d2e
edit 3: #130d2e -> #1493c5, loader called with: #130d2e (STALE, disk has #1493c5), #1493c5
edit 4: #1493c5 -> #161a5c, loader called with: #1493c5 (STALE, disk has #161a5c), #161a5c
edit 5: #161a5c -> #17a0f3, loader called with: #161a5c (STALE, disk has #17a0f3), #17a0f3

5 calls with stale source
```

Also observed:

- Both calls run in the same loader worker process.
- It also happens with `experimental.turbopackFileSystemCacheForDev: false`.
- It happens with `next@16.4.0-canary.50` too.

## Provide environment information

```
Operating System:
  Platform: linux
  Arch: x64
  Version: #34~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC Fri Sep  4 15:38:29 UTC 2
  Available memory (MB): 32035
  Available CPU cores: 4
Binaries:
  Node: 24.21.0
  npm: N/A
  Yarn: N/A
  pnpm: 12.6.0
Relevant Packages:
  next: 16.3.6 // Latest available version is detected (16.3.6).
  eslint-config-next: N/A
  react: 19.3.0
  react-dom: 19.3.0
  typescript: N/A
Next.js Config:
  output: N/A
```

Also reproduces with `next@16.4.0-canary.50`.

## Which area(s) are affected?

Turbopack

## Which stage(s) are affected?

`next dev` (local)
