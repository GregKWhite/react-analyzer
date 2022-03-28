import fs from "fs";
import { Report } from "./types";
import { parseFile } from "./file-parser";
import { Project } from "ts-morph";

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
