import { ChildProcess, fork } from "child_process";
import { Project } from "ts-morph";
import { parseFile } from "./file-parser";
import {
  buildReport,
  CHILD_PROCESS_MARKER,
  isChildProcess,
  resolveComponentInstances,
  updateProgress,
} from "./helpers";
import { CommonOptionTypes, MainOptionTypes } from "./options";
import {
  ChildProcessMessage,
  PossiblyResolvedComponentInstance,
  Report,
} from "./types";

const MAX_CHUNK_SIZE = 250;

function getChunks(filePaths: string[], workerCount: number): () => string[] {
  let currentChunk = 0;
  const chunkSize = Math.min(
    Math.ceil(filePaths.length / workerCount),
    MAX_CHUNK_SIZE
  );

  return () => {
    if (currentChunk * chunkSize >= filePaths.length) {
      return [];
    }

    const nextChunk = filePaths.slice(
      currentChunk * chunkSize,
      (currentChunk + 1) * chunkSize
    );

    currentChunk++;

    return nextChunk;
  };
}

function loadFiles(project: Project, tsConfigPath: string): string[] {
  console.log("Loading files from tsconfig...");

  project.addSourceFilesFromTsConfig(tsConfigPath);

  const sourceFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().endsWith(".tsx"))
    .map((file) => file.getFilePath().toString());

  console.log(`Loaded ${sourceFiles.length} file(s)`);

  return sourceFiles;
}

export async function crawlDirectory(
  project: Project,
  options: MainOptionTypes
): Promise<Report> {
  const { parallel, tsConfigPath } = options;

  const report: Report = { usage: {} };
  const sourceFiles = loadFiles(project, tsConfigPath);
  let totalFilesParsed = 0;

  const workers: ChildProcess[] = [];
  const workerCount = Math.max(parallel, 1);

  const next = getChunks(sourceFiles, workerCount);

  for (let i = 0; i < workerCount; i++) {
    workers.push(fork(__filename, [CHILD_PROCESS_MARKER]));
  }

  const pendingWorkers = workers.map((worker, i) => {
    return new Promise<typeof worker>((resolve) => {
      worker.send({ options, paths: next() });

      worker.on(
        "message",
        ({ instances, filesParsed }: ChildProcessMessage) => {
          if (filesParsed.length === 0) return;

          totalFilesParsed += filesParsed.length;

          const resolvedInstances = resolveComponentInstances(
            instances,
            tsConfigPath,
            project
          );

          buildReport(resolvedInstances, report);

          if (totalFilesParsed <= sourceFiles.length) {
            updateProgress(totalFilesParsed, sourceFiles.length);
          }

          worker.send({ options, paths: next() });
        }
      );

      worker.on("disconnect", () => {
        resolve(worker);
      });
    });
  });

  await Promise.all(pendingWorkers);

  return report;
}

interface Params {
  tsConfigPath: string;
  paths: string[];
  options: CommonOptionTypes;
}

if (isChildProcess()) {
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
}
