#!/usr/bin/env node

import fs from "fs";
import { Project } from "ts-morph";
import { Report } from "./types";
import { loadFormatter } from "./formatters";
import { MainOptionTypes, OptionTypes, parseArguments } from "./options";
import { crawlDirectory } from "./crawl-directory";
import { crawlFile } from "./crawl-file";
import { isChildProcess } from "./helpers";

async function run(options: OptionTypes): Promise<void> {
  const processorFn = await loadFormatter(options.formatter);

  const startTime = process.hrtime.bigint();

  const project = new Project({
    tsConfigFilePath: options.tsConfigPath,
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });

  let report: Report;
  if ("entryPoint" in options) {
    report = await crawlFile(project, options);
  } else {
    report = await crawlDirectory(project, options);
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
  const options = parseArguments();

  if (options) {
    run(options);
  } else {
    // This happens if the user runs the help command.
    process.exit(0);
  }
}
