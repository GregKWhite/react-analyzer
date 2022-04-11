import path from "path";
import { Project } from "ts-morph";
import { parseFile } from "./file-parser";
import { buildReport, resolveComponentInstances } from "./helpers";
import { CrawlOptionTypes } from "./options";
import { PossiblyResolvedComponentInstance, Report } from "./types";

export async function crawlFile(
  project: Project,
  { tsConfigPath, entryPoint }: CrawlOptionTypes
): Promise<Report> {
  const report = { usage: {}, imports: {} };

  const entryPointPath = path.resolve(
    path.join(path.dirname(tsConfigPath), entryPoint!)
  );

  let filesToParse = [entryPointPath];
  const parsedFiles = new Set(filesToParse);

  while (filesToParse.length > 0) {
    const instances = filesToParse.reduce((acc, filePath) => {
      if (filePath.endsWith("Unknown")) return acc;
      return acc.concat(parseFile(tsConfigPath, filePath));
    }, [] as PossiblyResolvedComponentInstance[]);

    const resolvedInstances = resolveComponentInstances(
      instances,
      tsConfigPath,
      project
    );

    buildReport(resolvedInstances, report);

    filesToParse = [];
    resolvedInstances.forEach((instance) => {
      if (instance.external) return;

      const fullPath = path.resolve(
        path.join(path.dirname(tsConfigPath), instance.importPath)
      );

      if (!parsedFiles.has(fullPath)) {
        parsedFiles.add(fullPath);
        filesToParse.push(fullPath);
      }
    });
  }

  return report;
}
