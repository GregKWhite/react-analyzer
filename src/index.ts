import fs from "fs";
import path from "path";
import { fork, ChildProcess } from "child_process";
import { ts, Project } from "ts-morph";
import commandLineArgs from "command-line-args";

import {
  ChildProcessMessage,
  ComponentInstance,
  PossiblyResolvedComponentInstance,
  Report,
  UnresolvedComponentInstance,
} from "./types";
import { loadFormatter } from "./formatters";

const OPTION_DEFINITIONS = [
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "./tsconfig.json",
  },
  { name: "output", alias: "o", type: String },
  { name: "formatter", alias: "f", type: String },
  { name: "parallel", alias: "p", type: Number, defaultValue: 4 },
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

  process.stdout.write(`Parsed ${current} files...`);

  if (current === total) {
    process.stdout.write("\nGenerating report...\n");
  }
}

async function run({
  tsConfigPath,
  output,
  formatter,
  parallel: workerCount,
}: OptionTypes): Promise<void> {
  const processorFn = await loadFormatter(formatter);

  const startTime = process.hrtime.bigint();

  console.log("Loading files from tsconfig...", path.resolve(tsConfigPath));
  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipFileDependencyResolution: true,
  });

  const sourceFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().endsWith(".tsx"));
  console.log(`Finished loading ${sourceFiles.length} files`);

  const workers: ChildProcess[] = [];
  for (let i = 0; i < Math.max(workerCount, 1); i++) {
    workers.push(fork("./dist/worker"));
  }

  const fileStatuses = Object.fromEntries(
    sourceFiles.map((file) => [file, false])
  );

  const chunkSize = Math.min(Math.ceil(sourceFiles.length / workerCount), 250);
  const chunkCount = Math.ceil(sourceFiles.length / chunkSize);
  let currentChunk = 0;

  const next = () => {
    if (currentChunk >= chunkCount) {
      return [];
    }

    const nextChunk = sourceFiles
      .slice(currentChunk * chunkSize, (currentChunk + 1) * chunkSize)
      .map((sourceFile) => sourceFile.getFilePath().toString());

    currentChunk++;

    return nextChunk;
  };

  let results: PossiblyResolvedComponentInstance[] = [];
  const pendingWorkers = workers.map((worker, i) => {
    return new Promise<typeof worker>((resolve) => {
      worker.send({ tsConfigPath, paths: next() });

      worker.on(
        "message",
        ({ instances, filesParsed }: ChildProcessMessage) => {
          results = results.concat(instances);
          filesParsed.forEach((file) => (fileStatuses[file] = true));

          if (filesParsed.length > 0) {
            updateProgress(
              Object.values(fileStatuses).filter((status) => status).length,
              sourceFiles.length
            );
          }

          worker.send({ tsConfigPath, paths: next() });
        }
      );

      worker.on("disconnect", () => {
        resolve(worker);
      });
    });
  });

  await Promise.all(pendingWorkers);
  const report = createReport(results, tsConfigPath, project);

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

function createReport(
  componentInstances: PossiblyResolvedComponentInstance[],
  tsConfigPath: string,
  project: Project
): Report {
  const report: Report = { usage: {}, imports: {} };

  componentInstances.forEach((componentInstance) => {
    const resolvedComponentInstance: ComponentInstance =
      "importIdentifier" in componentInstance
        ? resolveComponentInstance(componentInstance, tsConfigPath, project)
        : componentInstance;

    if (!report.usage[resolvedComponentInstance.importPath]) {
      report.usage[resolvedComponentInstance.importPath] = { instances: [] };
    }

    report.usage[resolvedComponentInstance.importPath].instances.push(
      resolvedComponentInstance
    );
  });

  return report;
}

function resolveComponentInstance(
  instance: UnresolvedComponentInstance,
  tsConfigPath: string,
  project: Project
): ComponentInstance {
  const result = ts.resolveModuleName(
    instance.importIdentifier,
    path.join(path.dirname(tsConfigPath), instance.location.file),
    project.getCompilerOptions(),
    project.getModuleResolutionHost()
  );

  let formattedImportPath = result.resolvedModule?.resolvedFileName;

  if (formattedImportPath?.includes("node_modules")) {
    formattedImportPath = instance.importIdentifier;
  } else if (formattedImportPath) {
    formattedImportPath = path.relative(
      path.dirname(tsConfigPath),
      formattedImportPath
    );
  } else {
    formattedImportPath = "Unknown";
  }

  return {
    ...instance,
    importPath: `${formattedImportPath}/${instance.name}`,
  };
}

const args = commandLineArgs(
  OPTION_DEFINITIONS as Writeable<typeof OPTION_DEFINITIONS>
);

run(args as OptionTypes);
