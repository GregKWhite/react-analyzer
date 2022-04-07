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
  { name: "entryPoint", alias: "e", type: String },
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
  entryPoint,
}: OptionTypes): Promise<void> {
  const processorFn = await loadFormatter(formatter);

  const startTime = process.hrtime.bigint();

  console.log("Loading files from tsconfig...", path.resolve(tsConfigPath));
  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipFileDependencyResolution: true,
  });

  let sourceFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().endsWith(".tsx"));

  if (entryPoint) {
    sourceFiles = sourceFiles.filter((file) =>
      file.getFilePath().includes(entryPoint)
    );
  }

  console.log(`Finished loading ${sourceFiles.length} file(s)`);

  const workers: ChildProcess[] = [];
  workerCount = entryPoint ? 1 : Math.max(workerCount, 1);
  for (let i = 0; i < workerCount; i++) {
    workers.push(fork("./dist/worker"));
  }

  const fileStatuses = new Map(
    sourceFiles.map((file) => [file.getFilePath().toString(), false])
  );

  const chunkSize = Math.min(Math.ceil(sourceFiles.length / workerCount), 250);
  let currentChunk = 0;

  const next = () => {
    const paths = Array.from(fileStatuses.keys());

    if (entryPoint) {
      return paths.filter((path) => fileStatuses.get(path) == false);
    } else {
      if (currentChunk * chunkSize >= paths.length) {
        return [];
      }

      const nextChunk = paths.slice(
        currentChunk * chunkSize,
        (currentChunk + 1) * chunkSize
      );

      currentChunk++;

      return nextChunk;
    }
  };

  const report: Report = { usage: {}, imports: {} };
  let totalFilesParsed = 0;
  const pendingWorkers = workers.map((worker, i) => {
    return new Promise<typeof worker>((resolve) => {
      worker.send({ tsConfigPath, paths: next() });

      worker.on(
        "message",
        ({ instances, filesParsed }: ChildProcessMessage) => {
          if (filesParsed.length === 0) return;

          totalFilesParsed += filesParsed.length;

          const resolvedInstances = instances.map((instance) => {
            return "importPath" in instance
              ? instance
              : resolveComponentInstance(instance, tsConfigPath, project);
          });

          buildReport(resolvedInstances, report);
          filesParsed.forEach((file) => fileStatuses.set(file, true));

          if (entryPoint) {
            resolvedInstances.forEach((instance) => {
              if (instance.external) return;

              const fullPath = path.resolve(
                path.join(path.dirname(tsConfigPath), instance.importPath)
              );

              if (!fileStatuses.has(fullPath)) {
                fileStatuses.set(fullPath, false);
              }
            });
          }

          updateProgress(
            totalFilesParsed,
            Array.from(fileStatuses.keys()).length
          );

          worker.send({ tsConfigPath, paths: next() });
        }
      );

      worker.on("disconnect", () => {
        resolve(worker);
      });
    });
  });

  await Promise.all(pendingWorkers);
  const endTime = process.hrtime.bigint();

  console.log(
    `Scanned ${Array.from(fileStatuses.keys()).length} file(s) in ${
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

function buildReport(componentInstances: ComponentInstance[], report: Report) {
  componentInstances.forEach((componentInstance) => {
    const key = `${componentInstance.importPath}/${componentInstance.name}`;

    if (!report.usage[key]) {
      report.usage[key] = { instances: [] };
    }

    report.usage[key].instances.push(componentInstance);
  });
}

function resolveComponentInstance(
  instance: UnresolvedComponentInstance,
  tsConfigPath: string,
  project: Project
): ComponentInstance {
  let external = false;

  const result = ts.resolveModuleName(
    instance.importIdentifier,
    path.join(path.dirname(tsConfigPath), instance.location.file),
    project.getCompilerOptions(),
    project.getModuleResolutionHost()
  );

  let formattedImportPath = result.resolvedModule?.resolvedFileName;

  if (formattedImportPath?.includes("node_modules")) {
    external = true;
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
    importPath: formattedImportPath,
    external,
  };
}

const args = commandLineArgs(
  OPTION_DEFINITIONS as Writeable<typeof OPTION_DEFINITIONS>
);

run(args as OptionTypes);
