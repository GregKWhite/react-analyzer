import fs from "fs";
import glob from "glob";
import { Report } from "./types";
import { parseFile } from "./file-parser";
import { ts, Project } from "ts-morph";

type StringOrRegexp = string | RegExp;
type Excludes = StringOrRegexp[] | ((path: string) => boolean);

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

function updateProgress(current: number, total: number) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);

  process.stdout.write(`Parsing files... ${current} of ${total}`);

  if (current === total) {
    process.stdout.write("\nGenerating report...\n");
  }
}

interface RunParams {
  tsConfigPath: string;
  output?: string;
  excludeEmpty?: boolean;
}
function run({ tsConfigPath, output, excludeEmpty }: RunParams): void {
  const startTime = process.hrtime.bigint();

  const report: Report = { usage: {}, imports: {} };

  console.log("Loading files from tsconfig...");
  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipFileDependencyResolution: true,
  });

  const sourceFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().endsWith(".tsx"));
  console.log(`Finished loading ${sourceFiles.length} files`);

  sourceFiles.forEach((sourceFile, i) => {
    updateProgress(i + 1, sourceFiles.length);
    parseFile(sourceFile, report);
  });

  if (excludeEmpty) {
    for (const key of Object.keys(report.usage)) {
      if (report.usage[key].instances.length === 0) {
        delete report.usage[key];
      }
    }
  }

  const endTime = process.hrtime.bigint();

  console.log(
    `Scanned ${sourceFiles.length} files in ${
      (endTime - startTime) / BigInt(1e9)
    } seconds`
  );

  const reportContents = JSON.stringify(report, null, 2);
  if (output) {
    fs.writeFileSync(output, reportContents);
  } else {
    console.log(reportContents);
  }
}

// run({ tsConfigPath: "./sample/tsconfig.json" });
run({
  tsConfigPath: "../discord/discord_app/tsconfig.json",
  output: "./report.json",
  excludeEmpty: true,
});
