#!/usr/bin/env node

import fs from "fs";
import { Project } from "ts-morph";
import { Report } from "./types";
import { loadFormatter } from "./formatters";
import { OptionTypes, parseArguments, USAGE_DOCS } from "./options";
import { crawlDirectory } from "./crawl-directory";
import { crawlFile } from "./crawl-file";
import { isChildProcess } from "./helpers";

async function run(options: OptionTypes): Promise<void> {
  if (options.command === "help") {
    console.log(USAGE_DOCS);
    process.exit(0);
  }

  const processorFn = await loadFormatter(options.formatter);

  const startTime = process.hrtime.bigint();

  const project = new Project({
    tsConfigFilePath: options.tsConfigPath,
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });

  let report: Report;
  if (options.command === "crawl") {
    report = await crawlFile(project, options);
  } else if (options.command === "main") {
    report = await crawlDirectory(project, options);
  } else {
    console.error("Unknown command");
    process.exit(1);
  }

  const reportContents = JSON.stringify(processorFn(report), null, 2);

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
