import { Report } from "../types";

export default function countComponentsAndProps(report: Report) {
  const result: Record<
    string,
    { count: number; props: Record<string, number> }
  > = {};

  Object.keys(report.usage).forEach((componentName) => {
    result[componentName] = {
      count: report.usage[componentName].instances.length,
      props: {},
    };

    report.usage[componentName].instances.forEach((instance) => {
      Object.keys(instance.props).forEach((prop) => {
        if (!result[componentName].props[prop]) {
          result[componentName].props[prop] = 0;
        }

        result[componentName].props[prop] += 1;
      });

      if (instance.spread) {
        if (!result[componentName].props["..."]) {
          result[componentName].props["..."] = 0;
        }

        result[componentName].props["..."] += 1;
      }

      if (instance.hasChildren) {
        if (!result[componentName].props.children) {
          result[componentName].props.children = 0;
        }

        result[componentName].props.children += 1;
      }
    });
  });

  return Object.fromEntries(
    Object.entries(result).sort((a, b) => b[1].count - a[1].count)
  );
}
