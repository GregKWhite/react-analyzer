import fs from "fs";
import path from "path";
import { fork, ChildProcess } from "child_process";
import { ts, Project } from "ts-morph";
import commandLineArgs from "command-line-args";

import {
  ComponentInstance,
  PossiblyResolvedComponentInstance,
  Report,
  UnresolvedComponentInstance,
} from "./types";
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

  process.stdout.write(`Parsing files... ${current} of ${total}`);

  if (current === total) {
    process.stdout.write("\nGenerating report...\n");
  }
}

async function run({
  tsConfigPath,
  output,
  reporter,
  parallel: workerCount,
}: OptionTypes): Promise<void> {
  const processorFn = await loadReporter(reporter);

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

  const chunkSize = Math.min(Math.ceil(sourceFiles.length / workerCount), 100);
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

      worker.on("message", (data: PossiblyResolvedComponentInstance[]) => {
        results = results.concat(data);
        worker.send({ tsConfigPath, paths: next() });
      });

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
      "importPath" in componentInstance
        ? resolveComponentInstance(componentInstance, tsConfigPath, project)
        : componentInstance;

    if (!report.usage[resolvedComponentInstance.importedFrom]) {
      report.usage[resolvedComponentInstance.importedFrom] = { instances: [] };
    }

    report.usage[resolvedComponentInstance.importedFrom].instances.push(
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
    instance.importPath,
    path.join(path.dirname(tsConfigPath), instance.location.file),
    project.getCompilerOptions(),
    project.getModuleResolutionHost()
  );

  let formattedImportPath = result.resolvedModule?.resolvedFileName;

  if (formattedImportPath?.includes("node_modules")) {
    formattedImportPath = instance.importPath;
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
    importedFrom: `${formattedImportPath}/${instance.name}`,
  };
}

const args = commandLineArgs(
  OPTION_DEFINITIONS as Writeable<typeof OPTION_DEFINITIONS>
);

run(args as OptionTypes);
