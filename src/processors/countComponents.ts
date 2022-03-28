import { Report } from "../types";

export default function countComponents(report: Report) {
  const result: Record<string, number> = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = report.usage[componentName].instances.length;
  });

  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1]));
}
