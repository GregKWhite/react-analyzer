import fs from "fs";
import glob from "glob";
import { Report } from "./types";
import { parseFile } from "./file-parser";
import { Project } from "ts-morph";

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
  process.stdout.write(`Parsing file ${current} of ${total}`);
  if (current === total) {
    process.stdout.write("\n");
  }
}

interface RunParams {
  tsConfigPath?: string;
  output?: string;
  excludeEmpty?: boolean;
}
function run({ tsConfigPath, output, excludeEmpty }: RunParams = {}): void {
  const startTime = process.hrtime.bigint();

  const report: Report = { usage: {}, imports: {} };

  const project = new Project();
  project.addSourceFilesFromTsConfig(tsConfigPath || "./tsconfig.json");
  const sourceFiles = project.getSourceFiles();
  const paths = sourceFiles.map((file) => file.getFilePath());

  sourceFiles.forEach((sourceFile, i) => {
    updateProgress(i + 1, sourceFiles.length);
    parseFile(sourceFile.getFilePath(), report);
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
    `Scanned ${paths.length} files in ${
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

run({ tsConfigPath: "./sample/tsconfig.json" });
run({
  tsConfigPath: "../discord/discord_app/tsconfig.json",
  output: "./report.json",
});
