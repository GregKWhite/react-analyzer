import { parseFile } from "./file-parser";
import {
  ChildProcessMessage,
  PossiblyResolvedComponentInstance,
} from "./types";

interface Params {
  tsConfigPath: string;
  paths: string[];
}

process.on("message", ({ tsConfigPath, paths }: Params) => {
  if (paths.length === 0) {
    process.disconnect();
    return;
  }

  const message: ChildProcessMessage = {
    filesParsed: paths,
    instances: paths.reduce((acc, path) => {
      return acc.concat(parseFile(tsConfigPath, path));
    }, [] as PossiblyResolvedComponentInstance[]),
  };

  process.send?.(message);
});
