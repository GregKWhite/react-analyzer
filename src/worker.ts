import { parseFile } from "./file-parser";
import { PossiblyResolvedComponentInstance } from "./types";

interface Params {
  tsConfigPath: string;
  paths: string[];
}

process.on("message", ({ tsConfigPath, paths }: Params) => {
  if (paths.length === 0) {
    process.disconnect();
    return;
  }

  process.send?.(
    paths.reduce((acc, path) => {
      return acc.concat(parseFile(tsConfigPath, path));
    }, [] as PossiblyResolvedComponentInstance[])
  );
});
