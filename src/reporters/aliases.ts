import { Report } from "../types";

export default function aliases(report: Report) {
  const result: Record<string, string[]> = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = Array.from(
      new Set(
        report.usage[componentName].instances
          .map((instance) => instance.alias)
          .filter(Boolean)
      )
    ) as string[];
  });

  return result;
}
