import Bun from "bun";

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
