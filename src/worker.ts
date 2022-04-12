import { parseFile } from "./file-parser";
import { CommonOptionTypes } from "./options";
import {
  ChildProcessMessage,
  PossiblyResolvedComponentInstance,
} from "./types";

interface Params {
  tsConfigPath: string;
  paths: string[];
  options: CommonOptionTypes;
}

process.on("message", ({ paths, options }: Params) => {
  if (paths.length === 0) {
    process.disconnect();
    return;
  }

  const message: ChildProcessMessage = {
    filesParsed: paths,
    instances: paths.reduce((acc, path) => {
      return acc.concat(parseFile(path, options));
    }, [] as PossiblyResolvedComponentInstance[]),
  };

  process.send?.(message);
});
