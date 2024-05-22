import { Project, Identifier } from "ts-morph";
import path, { relative, dirname } from "path";
import {
  ComponentInstance,
  PossiblyResolvedComponentInstance,
  Report,
} from "./types";
import { Sema } from "async-sema";

const cwd = process.cwd();

export const CHILD_PROCESS_MARKER = "__CHILD_PROCESS_MARKER__";

export function isChildProcess() {
  return process.argv[2] === CHILD_PROCESS_MARKER;
}

const sema = new Sema(1);

export async function buildReport(
  componentInstances: ComponentInstance[],
  report: Report
) {
  await sema.acquire();
  try {
    componentInstances.forEach((componentInstance) => {
      const key = `${componentInstance.importPath}/${componentInstance.name}`;

      if (report.usage[key] == null) {
        report.usage[key] = { instances: [] };
      }

      report.usage[key].instances.push(componentInstance);
    });
  } finally {
    sema.release();
  }
}

export function resolveComponentInstances(
  instances: PossiblyResolvedComponentInstance[],
  tsConfigPath: string,
  project: Project
): ComponentInstance[] {
  return instances.map((instance) => {
    if ("importPath" in instance) return instance;

    let external = false;

    const sourceFile = project.getSourceFile(instance.location.absolutePath);
    const definition = (
      sourceFile?.getDescendantAtPos(instance.importPosition.index) as
        | Identifier
        | undefined
    )?.getDefinitions()[0];

    let formattedImportPath = definition?.getSourceFile()?.getFilePath() as
      | string
      | undefined;

    if (
      formattedImportPath?.includes("node_modules") ||
      !formattedImportPath ||
      !formattedImportPath.startsWith("/")
    ) {
      external = true;
      formattedImportPath = instance.importIdentifier;
    } else if (formattedImportPath) {
      formattedImportPath = relative(
        path.join(cwd, dirname(tsConfigPath)),
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
