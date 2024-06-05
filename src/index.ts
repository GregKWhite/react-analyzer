#!/usr/bin/env node

import fs from "fs";
import { Project } from "ts-morph";
import { Report } from "./types";
import { loadFormatter, isCustomFormatter } from "./formatters";
import { OptionTypes, parseArguments, USAGE_DOCS } from "./options";
import { crawlDirectory } from "./crawl-directory";
import { crawlFile } from "./crawl-file";
import { isChildProcess } from "./helpers";

function getProject(tsConfigPath: string) {
  return new Project({
    tsConfigFilePath: tsConfigPath,
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });
}

function filterMatches(report: Report, match: string) {
  const filteredReport: Report = { usage: {} };

  const regex = RegExp(match, "i");

  const keys = Object.keys(report.usage).filter((componentKey) => {
    return regex.test(componentKey);
  });

  keys.forEach((key) => {
    filteredReport.usage[key] = report.usage[key];
  });

  return filteredReport;
}

async function run(options: OptionTypes): Promise<void> {
  if (options.command === "help") {
    console.log(USAGE_DOCS);
    process.exit(0);
  }

  const processorFn = await loadFormatter(options.formatter);

  const startTime = process.hrtime.bigint();

  let report: Report;
  if (options.command === "crawl") {
    report = await crawlFile(getProject(options.tsConfigPath), options);
  } else if (options.command === "main") {
    report = await crawlDirectory(getProject(options.tsConfigPath), options);
  } else if (options.command === "format") {
    report = JSON.parse(fs.readFileSync(options.report).toString());
  } else {
    console.error("Unknown command");
    process.exit(1);
  }

  if (options.match) {
    report = filterMatches(report, options.match);
  }

  // If the user provided their own formatter, respect the output - otherwise,
  // format it as JSON.
  let unformattedReport = processorFn(report);
  let reportContents: any = unformattedReport;
  if (!isCustomFormatter(options.formatter)) {
    reportContents = JSON.stringify(unformattedReport, null, 2);
  }

  const elapsedTime =
    Number(((process.hrtime.bigint() - startTime) * 10n) / BigInt(1e9)) / 10;
  console.log(`Finished in ${elapsedTime} seconds`);

  if (options.output) {
    fs.writeFileSync(options.output, reportContents);
    console.log(`Saved contents to ${options.output}`);
  } else {
    console.log(reportContents);
  }
}

if (!isChildProcess()) {
  run(parseArguments());
}
