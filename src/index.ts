import fs from "fs";
import glob from "glob";
import { Report } from "./types";
import { parseFile } from "./file-parser";

type StringOrRegexp = string | RegExp;
type Excludes = StringOrRegexp[] | ((path: string) => boolean);

interface findFilesProps {
  /** The directory to search within */
  startDir?: string;

  /**
   * Either an array of strings/regexes, or a function that will
   * determine which paths to exclude from the result set.
   *
   * If an array is passed, it will check each path for a regex match, or to to
   * see if the path starts with the given string. If the path is matched,
   * it will not be searched. Note: all paths are relative to the current path.
   *
   * If a function is passed, it will be given the path to the path, and
   * should return `true` if the path should be included.
   */
  exclude?: Excludes;
}
function findFiles({ startDir, exclude }: findFilesProps): string[] {
  startDir = startDir || ".";
  if (!startDir.endsWith("/")) {
    startDir = `${startDir}/`;
  }

  let files = glob.sync(`${startDir}**/*.{ts,tsx,js,jsx}`, {});
  files = filterFiles(files, exclude || ["./node_modules"]);

  return files;
}

/**
 * Takes in an array of file paths, and returns an array of file paths that are
 * filtered based on the given `exclude` paths.
 *
 * @param files - an array of file paths
 * @param exclude - an array of strings or regular expressions to be tested,
 * or a function that should return `true` when the path should be excluded.
 * @returns the filtered list of file paths
 */
function filterFiles(files: string[], exclude: Excludes): string[] {
  let excludeFn: (path: string) => boolean;

  if (typeof exclude === "function") {
    excludeFn = exclude;
  } else {
    excludeFn = (path: string) => {
      return exclude.some((stringOrRegexp) => {
        if (typeof stringOrRegexp === "string") {
          return path.startsWith(stringOrRegexp);
        } else {
          return stringOrRegexp.test(path);
        }
      });
    };
  }

  return files.filter((path) => !excludeFn(path));
}

interface RunParams {
  startDir?: string;
  outputDir?: string;
}
function run({ startDir, outputDir }: RunParams = {}): void {
  const startTime = process.hrtime.bigint();

  const report: Report = {};
  const paths = findFiles({ startDir: startDir || "./src" });

  paths.forEach((path) => {
    parseFile(path, report);
  });

  const endTime = process.hrtime.bigint();

  console.log(
    `Scanned ${paths.length} files in ${
      (endTime - startTime) / BigInt(1e9)
    } seconds`
  );

  const reportContents = JSON.stringify(report, null, 2);
  if (outputDir) {
    fs.writeFileSync(outputDir, reportContents);
  } else {
    console.log(reportContents);
  }
}

run({ startDir: "./sample" });
// run({ startDir: "../discord/discord_app/modules/", outputDir: "results.json" });
