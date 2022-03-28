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
    });
  });

  return Object.fromEntries(
    Object.entries(result).sort((a, b) => b[1].count - a[1].count)
  );
}
