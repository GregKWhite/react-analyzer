import { Report } from "../types";
import { sortEntries } from "./helpers";

export default function countPropValues(report: Report) {
  const result: Record<
    string,
    { count: number; props: Record<string, Record<string, number>> }
  > = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = {
      count: report.usage[componentName].instances.length,
      props: {},
    };

    report.usage[componentName].instances.forEach((instance) => {
      Object.keys(instance.props).forEach((prop) => {
        const propValue = String(instance.props[prop].value);

        if (!result[componentName].props[prop]) {
          result[componentName].props[prop] = {};
        }

        if (!result[componentName].props[prop][propValue]) {
          result[componentName].props[prop][propValue] = 0;
        }

        result[componentName].props[prop][propValue] += 1;
      });

      if (instance.spread) {
        if (!result[componentName].props["..."]) {
          result[componentName].props["..."] = { "...": 0 };
        }

        result[componentName].props["..."]["..."] += 1;
      }

      if (instance.hasChildren) {
        if (!result[componentName].props.children) {
          result[componentName].props.children = { children: 0 };
        }

        result[componentName].props.children.children += 1;
      }
    });
  });

  Object.keys(result).forEach((componentName) => {
    Object.keys(result[componentName].props).forEach((prop) => {
      result[componentName].props[prop] = sortEntries(
        result[componentName].props[prop],
        (a, b) => b[1] - a[1]
      );
    });

    result[componentName].props = sortEntries(
      result[componentName].props,
      (a, b) =>
        Object.values(b[1]).reduce((sum, value) => sum + value, 0) -
        Object.values(a[1]).reduce((sum, value) => sum + value, 0)
    );
  });

  return sortEntries(result, (a, b) => b[1].count - a[1].count);
}
