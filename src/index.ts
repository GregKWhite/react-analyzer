import fs from "fs";
import { Report } from "./types";
import { parseFile } from "./file-parser";
import { Project } from "ts-morph";
import commandLineArgs, { OptionDefinition } from "command-line-args";
import { loadReporter } from "./reporters";

const OPTION_DEFINITIONS = [
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "./tsconfig.json",
  },
  { name: "output", alias: "o", type: String },
  { name: "reporter", alias: "r", type: String },
] as const;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
type Options = typeof OPTION_DEFINITIONS[number];
type ExtractType<OptionName extends Options["name"]> = ReturnType<
  Extract<Options, { name: OptionName }>["type"]
>;
type OptionType<OptionName extends Options["name"]> = Extract<
  Options,
  { name: OptionName }
> extends { defaultValue: any }
  ? ExtractType<OptionName>
  : ExtractType<OptionName> | undefined;

type OptionTypes = {
  [OptionName in Options["name"]]: OptionType<OptionName>;
};

function updateProgress(current: number, total: number) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);

  process.stdout.write(`Parsing files... ${current} of ${total}`);

  if (current === total) {
    process.stdout.write("\nGenerating report...\n");
  }
}

async function run({
  tsConfigPath,
  output,
  reporter,
}: OptionTypes): Promise<void> {
  const processorFn = await loadReporter(reporter);

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

const args = commandLineArgs(
  OPTION_DEFINITIONS as Writeable<typeof OPTION_DEFINITIONS>
);

run(args as OptionTypes);
