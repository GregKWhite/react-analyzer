import raw from "./raw";
import countComponents from "./countComponents";
import countComponentsAndProps from "./countComponentsAndProps";
import path from "path";
import { Report } from "../types";

const REPORTERS = {
  raw: raw,
  count: countComponents,
  "count-props": countComponentsAndProps,
};

export async function loadReporter(processorName: string | undefined) {
  if (!processorName) {
    return raw;
  } else if (processorName in REPORTERS) {
    return REPORTERS[processorName as keyof typeof REPORTERS]!;
  } else {
    try {
      const pathName = path.join(process.cwd(), processorName);
      const processorFile = await import(pathName);
      return processorFile.default as (report: Report) => Record<string, any>;
    } catch (e) {
      throw new Error(`Could not load reporter ${processorName}`);
    }
  }
}
