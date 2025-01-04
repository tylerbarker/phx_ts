import Bun from "bun";

// BUILD PHOENIX_TS

const phoenixTsResult = await Bun.build({
  entrypoints: ["./packages/phoenix_ts/src/index.ts"],
  outdir: "./packages/phoenix_ts/assets/js/phoenix",
  minify: true,
  target: "browser",
});

if (!phoenixTsResult.success) {
  console.error(phoenixTsResult);
  throw Error("phoenix_ts: Encountered an error during build.");
}

// BUILD PHOENIX_LIVEVIEW_TS

const liveViewTsResult = await Bun.build({
  entrypoints: ["./packages/phoenix_live_view_ts/src/index.ts"],
  outdir: "./packages/phoenix_live_view_ts/assets/js/phoenix_live_view",
  minify: true,
  target: "browser",
});

if (!liveViewTsResult.success) {
  console.error(phoenixTsResult);
  throw Error("phoenix_live_view_ts: Encountered an error during build.");
}
