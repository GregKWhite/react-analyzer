import { Report } from "../types";
import { sortEntries } from "./helpers";

export default function countComponents(report: Report) {
  const result: Record<string, number> = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = report.usage[componentName].instances.length;
  });

  return sortEntries(result, (a, b) => b[1] - a[1]);
}
