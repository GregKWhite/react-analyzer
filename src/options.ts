import commandLineArgs, { OptionDefinition } from "command-line-args";
import commandLineUsage from "command-line-usage";
import { FORMATTERS } from "./formatters";

const COMMON_OPTIONS = [
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    typeLabel: "file",
    defaultValue: "./tsconfig.json",
    description: "Path to the tsconfig.json file",
  },
  {
    name: "output",
    alias: "o",
    type: String,
    typeLabel: "file",
    description: "Path to output the results to",
  },
  {
    name: "formatter",
    alias: "f",
    type: String,
    typeLabel: "formatter",
    description: `${Object.keys(FORMATTERS).join(
      ", "
    )}, or the path to a file containing a custom formatter as the default export`,
  },
  {
    name: "match",
    alias: "m",
    type: String,
    typeLabel: "name",
    description:
      "Case insensitive string to match against component names. If the component is a default export, this will attempt to match against the file name if it is a local file, or the import path if it is an external file",
  },
] as const;

const MAIN_OPTION_DEFINITIONS = [
  {
    name: "parallel",
    alias: "p",
    type: Number,
    typeLabel: "processes",
    defaultValue: 4,
    description: "Number of processes to spawn for file parsing (default 4)",
  },
  ...COMMON_OPTIONS,
] as const;

const CRAWL_OPTION_DEFINITIONS = [
  {
    name: "entryPoint",
    alias: "e",
    type: String,
    typeLabel: "file ({bold default})",
    defaultOption: true,
    description: "Case sensitive relative path to file to start crawling from",
  },
  ...COMMON_OPTIONS,
] as const;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

type Options = (
  | typeof MAIN_OPTION_DEFINITIONS
  | typeof CRAWL_OPTION_DEFINITIONS
)[number];

// Dummy type to ensure all option definitions have a description
type _OptionCheck = Options["description"] & Options["typeLabel"];

type MainOptions = typeof MAIN_OPTION_DEFINITIONS[number];
type CrawlOptions = typeof CRAWL_OPTION_DEFINITIONS[number];
type CommonOptions = typeof COMMON_OPTIONS[number];

type ExtractType<OptionName extends Options["name"]> = ReturnType<
  Extract<Options, { name: OptionName }>["type"]
>;

type OptionType<OptionName extends Options["name"]> = Extract<
  Options,
  { name: OptionName }
> extends { defaultValue: any }
  ? ExtractType<OptionName>
  : ExtractType<OptionName> | undefined;

export type MainOptionTypes = {
  [OptionName in MainOptions["name"]]: OptionType<OptionName>;
};
export type CrawlOptionTypes = {
  [OptionName in CrawlOptions["name"]]: OptionType<OptionName>;
};
export type CommonOptionTypes = {
  [OptionName in CommonOptions["name"]]: OptionType<OptionName>;
};
export type OptionTypes = MainOptionTypes | CrawlOptionTypes;

const USAGE_DOCS = [
  {
    header: "react-analyzer",
    content:
      "{bold react-analyzer} is a tool that analyzes your React components and provides you with a report on their usage.",
  },
  {
    header: "Synopsis",
    content: [
      "$ [npx] react-analyzer [options]",
      "$ [npx] react-analyzer crawl [filePath] [options]",
    ],
  },
  {
    header: "Commands",
    content: [
      "{bold main} - Analyzes all files specified by the tsconfig.json",
      "{bold crawl} - Recursively analyzes the file specified by the entryPoint option, and any files referenced by it",
    ],
  },
  {
    header: "main options",
    optionList: MAIN_OPTION_DEFINITIONS,
  },
  {
    header: "crawl options",
    optionList: CRAWL_OPTION_DEFINITIONS,
  },
];

export function parseArguments(): OptionTypes | undefined {
  const mainConfig: OptionDefinition[] = [
    { name: "command", defaultOption: true },
    { name: "help", alias: "h", type: Boolean },
  ];

  const mainOptions = commandLineArgs(mainConfig, { stopAtFirstUnknown: true });
  const argv = mainOptions._unknown || [];

  let definitions;

  if (mainOptions.command === "help" || mainOptions.help) {
    console.log(commandLineUsage(USAGE_DOCS));
    return;
  } else if (mainOptions.command === "crawl") {
    definitions = CRAWL_OPTION_DEFINITIONS as Writeable<
      typeof CRAWL_OPTION_DEFINITIONS
    >;
  } else {
    definitions = MAIN_OPTION_DEFINITIONS as Writeable<
      typeof MAIN_OPTION_DEFINITIONS
    >;
  }

  return commandLineArgs(definitions, { argv }) as OptionTypes;
}
