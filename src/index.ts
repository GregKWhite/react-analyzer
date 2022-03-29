import fs from "fs";
import { Report } from "./types";
import { parseFile } from "./file-parser";
import { Project } from "ts-morph";
import commandLineArgs from "command-line-args";

import raw from "./processors/raw";
import countComponents from "./processors/countComponents";
import countComponentsAndProps from "./processors/countComponentsAndProps";

const PROCESSORS = {
  raw: raw,
  count: countComponents,
  "count-props": countComponentsAndProps,
};

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
  processor?: string;
}
function run({ tsConfigPath, output, processor }: RunParams): void {
  let processorFn: (report: Report) => Record<string, any>;
  if (processor) {
    processorFn = PROCESSORS[processor as keyof typeof PROCESSORS];
    if (!processorFn) {
      throw new Error(
        `Unknown processor: ${processor}. Supported values are ${Object.keys(
          PROCESSORS
        ).join(", ")}`
      );
    }
  } else {
    processorFn = raw;
  }

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
    parseFile(tsConfigPath, sourceFile, report);
  });

  const endTime = process.hrtime.bigint();

  console.log(
    `Scanned ${sourceFiles.length} files in ${
      (endTime - startTime) / BigInt(1e9)
    } seconds`
  );

  const reportContents = JSON.stringify(processorFn(report), null, 2);
  if (output) {
    fs.writeFileSync(output, reportContents);
    console.log(`Saved contents to ${output}`);
  } else {
    console.log(reportContents);
  }
}

const OPTION_DEFINITIONS = [
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "./tsconfig.json",
  },
  { name: "output", alias: "o", type: String },
  { name: "processor", alias: "p", type: String },
];

run(commandLineArgs(OPTION_DEFINITIONS) as RunParams);
