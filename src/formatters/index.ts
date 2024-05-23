import raw from "./raw";
import countComponents from "./count";
import countComponentsAndProps from "./count-props";
import aliases from "./aliases";
import propValues from "./prop-values";
import path from "path";
import { Report } from "../types";
import propCombinations from "./prop-combinations";
import { propValueCombinations } from "./prop-value-combinations";

export const FORMATTERS = {
  raw: raw,
  count: countComponents,
  "count-props": countComponentsAndProps,
  aliases: aliases,
  "prop-values": propValues,
  "prop-combinations": propCombinations,
  "prop-value-combinations": propValueCombinations,
};

export async function loadFormatter(formatterName: string | undefined) {
  if (!formatterName) {
    return raw;
  } else if (formatterName in FORMATTERS) {
    return FORMATTERS[formatterName as keyof typeof FORMATTERS]!;
  } else {
    try {
      const pathName = path.join(process.cwd(), formatterName);
      const processorFile = await import(pathName);
      return processorFile.default as (report: Report) => Record<string, any>;
    } catch (e) {
      console.error(`Could not load reporter ${formatterName}`);
      throw e;
    }
  }
}
