import { Report } from "../types";
import { sortEntries } from "./helpers";

export default function raw(report: Report) {
  return sortEntries(report);
}
