import commandLineArgs, { OptionDefinition } from "command-line-args";

const COMMON_OPTIONS = [
  { name: "output", alias: "o", type: String },
  { name: "formatter", alias: "f", type: String },
] as const;

const MAIN_OPTION_DEFINITIONS = [
  ...COMMON_OPTIONS,
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "./tsconfig.json",
  },
  { name: "parallel", alias: "p", type: Number, defaultValue: 4 },
  { name: "entryPoint", alias: "e", type: String },
] as const;

const CRAWL_OPTION_DEFINITIONS = [
  ...COMMON_OPTIONS,
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultValue: "./tsconfig.json",
  },
  { name: "entryPoint", alias: "e", type: String, defaultOption: true },
] as const;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

type Options = (
  | typeof MAIN_OPTION_DEFINITIONS
  | typeof CRAWL_OPTION_DEFINITIONS
)[number];

type MainOptions = typeof MAIN_OPTION_DEFINITIONS[number];
type CrawlOptions = typeof MAIN_OPTION_DEFINITIONS[number];

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
export type OptionTypes = MainOptionTypes | CrawlOptionTypes;

export function parseArguments(): OptionTypes {
  const mainConfig: OptionDefinition[] = [
    { name: "command", defaultOption: true },
  ];

  const mainOptions = commandLineArgs(mainConfig, { stopAtFirstUnknown: true });
  const argv = mainOptions._unknown || [];

  let definitions;
  if (mainOptions.command === "crawl") {
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
