import { Report } from "../types";
import { sortEntries } from "./helpers";

export default function propCombinations(report: Report) {
  const result: Record<
    string,
    {
      count: number;
      combinationCount: number;
      propCombinations: Record<string, number>;
    }
  > = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = {
      count: report.usage[componentName].instances.length,
      combinationCount: 0,
      propCombinations: {},
    };

    report.usage[componentName].instances.forEach((instance) => {
      const props = new Set(Object.keys(instance.props));
      if (instance.spread) props.add("...");
      if (instance.hasChildren) props.add("children");

      const key = Array.from(props).sort().join(", ");
      if (!result[componentName].propCombinations[key]) {
        result[componentName].propCombinations[key] = 0;
        result[componentName].combinationCount += 1;
      }

      result[componentName].propCombinations[key] += 1;
    });

    result[componentName].propCombinations = sortEntries(
      result[componentName].propCombinations,
      (a, b) => b[1] - a[1]
    );
  });

  return sortEntries(result, (a, b) => b[1].count - a[1].count);
}
