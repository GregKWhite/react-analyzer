import { Project, ts } from "ts-morph";
import { join, relative, dirname } from "path";
import {
  ComponentInstance,
  PossiblyResolvedComponentInstance,
  Report,
} from "./types";

export const CHILD_PROCESS_MARKER = "__CHILD_PROCESS_MARKER__";

export function isChildProcess() {
  return process.argv[2] === CHILD_PROCESS_MARKER;
}

export function buildReport(
  componentInstances: ComponentInstance[],
  report: Report
) {
  componentInstances.forEach((componentInstance) => {
    const key = `${componentInstance.importPath}/${componentInstance.name}`;

    if (!report.usage[key]) {
      report.usage[key] = { instances: [] };
    }

    report.usage[key].instances.push(componentInstance);
  });
}

export function resolveComponentInstances(
  instances: PossiblyResolvedComponentInstance[],
  tsConfigPath: string,
  project: Project
): ComponentInstance[] {
  return instances.map((instance) => {
    if ("importPath" in instance) return instance;

    let external = false;

    const result = ts.resolveModuleName(
      instance.importIdentifier,
      join(dirname(tsConfigPath), instance.location.file),
      project.getCompilerOptions(),
      project.getModuleResolutionHost()
    );

    let formattedImportPath = result.resolvedModule?.resolvedFileName;

    if (formattedImportPath?.includes("node_modules") || !formattedImportPath) {
      external = true;
      formattedImportPath = instance.importIdentifier;
    } else if (formattedImportPath) {
      formattedImportPath = relative(
        dirname(tsConfigPath),
        formattedImportPath
      );
    }

    return {
      ...instance,
      importPath: formattedImportPath,
      external,
    };
  });
}

export function updateProgress(current: number, total: number) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);

  process.stdout.write(`Parsed ${current} files...`);

  if (current === total) {
    process.stdout.write(" done\nGenerating report...\n");
  }
}
