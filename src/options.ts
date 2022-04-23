import commandLineArgs, { OptionDefinition } from "command-line-args";
import commandLineUsage, { Section } from "command-line-usage";
import { FORMATTERS } from "./formatters";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

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

const HELP_OPTION_DEFINITIONS = [] as const;

const FORMAT_OPTION_DEFINITIONS = [
  {
    name: "report",
    alias: "r",
    type: String,
    defaultOption: true,
    defaultValue: "report.json",
    description: 'Path to the report file to format (default "report.json")',
    typeLabel: "file",
  },
  COMMON_OPTIONS[1],
  COMMON_OPTIONS[2],
] as const;

type Options = (
  | typeof MAIN_OPTION_DEFINITIONS
  | typeof CRAWL_OPTION_DEFINITIONS
  | typeof HELP_OPTION_DEFINITIONS
  | typeof FORMAT_OPTION_DEFINITIONS
)[number];

// Dummy type to ensure all option definitions have a description
type _OptionCheck = Options["description"] & Options["typeLabel"];

type MainOptions = typeof MAIN_OPTION_DEFINITIONS[number];
type CrawlOptions = typeof CRAWL_OPTION_DEFINITIONS[number];
type CommonOptions = typeof COMMON_OPTIONS[number];
type FormatOptions = typeof FORMAT_OPTION_DEFINITIONS[number];

type ExtractType<OptionName extends Options["name"]> = ReturnType<
  Extract<Options, { name: OptionName }>["type"]
>;

type OptionType<OptionName extends Options["name"]> = Extract<
  Options,
  { name: OptionName }
> extends { defaultValue: any }
  ? ExtractType<OptionName>
  : ExtractType<OptionName> | undefined;

type MappedOptions<O extends Options> = {
  [OptionName in O["name"]]: OptionType<OptionName>;
};

export type MainOptionTypes = MappedOptions<MainOptions>;
export type CrawlOptionTypes = MappedOptions<CrawlOptions>;
export type CommonOptionTypes = MappedOptions<CommonOptions>;
export type FormatOptionTypes = MappedOptions<FormatOptions>;

export type OptionTypes =
  | { command: "help" }
  | ({ command: "main" } & MainOptionTypes)
  | ({ command: "crawl" } & CrawlOptionTypes)
  | ({ command: "format" } & FormatOptionTypes);

export function parseArguments(): OptionTypes {
  const mainConfig: OptionDefinition[] = [
    { name: "command", defaultOption: true },
    { name: "help", alias: "h", type: Boolean },
  ];

  const mainOptions = commandLineArgs(mainConfig, { stopAtFirstUnknown: true });
  const argv = mainOptions._unknown || [];

  let definitions;
  let command: OptionTypes["command"];

  if (mainOptions.command === "help" || mainOptions.help) {
    command = "help";
    definitions = HELP_OPTION_DEFINITIONS;
  } else if (mainOptions.command === "crawl") {
    command = "crawl";
    definitions = CRAWL_OPTION_DEFINITIONS;
  } else if (mainOptions.command === "format") {
    command = "format";
    definitions = FORMAT_OPTION_DEFINITIONS;
  } else {
    command = "main";
    definitions = MAIN_OPTION_DEFINITIONS;
  }

  return {
    command,
    ...commandLineArgs(definitions as Writeable<typeof definitions>, { argv }),
  } as OptionTypes;
}

export const USAGE_DOCS = commandLineUsage([
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
      "{bold format} - Formats the raw report file specified by the report option (requires a `raw` formatted report)",
    ],
  },
  {
    header: "main command options",
    optionList: MAIN_OPTION_DEFINITIONS,
  },
  {
    header: "crawl subcommand options",
    optionList: CRAWL_OPTION_DEFINITIONS,
  },
  {
    header: "format subcommand options",
    optionList: FORMAT_OPTION_DEFINITIONS,
  },
  {
    header: "Examples",
    content: [
      {
        example: "$ react-analyzer",
        desc: "Generate a component report for files referenced in the local tsconfig",
      },
      {
        example: "$ react-analyzer -c ./some/dir/tsconfig.json",
        desc: "Generate a component report for files referenced in the local tsconfig",
      },
      {
        example: "$ react-analyzer -o output.json",
        desc: "Generate a component report for files referenced by the local tsconfig and output the results to output.json",
      },
      {
        example: "$ react-analyzer -f count",
        desc: "Count all component usages",
      },
      {
        example: "$ react-analyzer -f count-props",
        desc: "Count usages of each components' props",
      },
      {
        example: "$ react-analyzer -f prop-values",
        desc: "Show the number of times each unique prop value is used by each component",
      },
      {
        example: "$ react-analyzer -f aliases",
        desc: "Show the names used by each component",
      },
      {
        example: "$ react-analyzer -f ./path/to/formatter.js",
        desc: "Generate a report for files referenced in the local tsconfig, formatting it using the default function exported by the specified path",
      },
      {
        example: "$ react-analyzer -m Text",
        desc: "Generate a component report for components named 'Text'",
      },
      {
        example: "$ react-analyzer -o output.json -f count -m Text",
        desc: "Show the number of Text components rendered in files referenced by the local tsconfig, outputting the results to output.json",
      },

      {
        example: "$ react-analyzer crawl src/Button.tsx",
        desc: "Parse src/Button.tsx, recursively crawl rendered components, and generate a report for all components rendered in those files",
      },
      {
        example: "$ react-analyzer crawl src/Button.tsx -o output.json",
        desc: "Parse src/Button.tsx, recursively crawl rendered components, and generate a report, outputting the results to output.json",
      },
      {
        example:
          "$ react-analyzer crawl src/Button.tsx -o output.json -f count",
        desc: "Parse src/Button.tsx, recursively crawl rendered components, and count the rendered components, outputting the results to output.json",
      },
      {
        example:
          "$ react-analyzer crawl src/Button.tsx -o output.json -f count -m Text",
        desc: "Parse src/Button.tsx, recursively crawl rendered components, and count the rendered components, outputting the results to output.json",
      },

      {
        example: "$ react-analyzer format -f count",
        desc: "Run the `count` formatter on the raw report on report.json",
      },
      {
        example: "$ react-analyzer format path/to/report.json -f count",
        desc: "Run the `count` formatter on the raw report on path/to/report.json",
      },
      {
        example:
          "$ react-analyzer format path/to/report.json -f count -o counts.json",
        desc: "Run the `count` formatter on the raw report on path/to/report.json, outputting the results to counts.json",
      },
    ],
  },
] as Writeable<Section[]>);
