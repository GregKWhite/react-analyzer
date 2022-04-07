import commandLineArgs from "command-line-args";

const OPTION_DEFINITIONS = [
  {
    name: "tsConfigPath",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "./tsconfig.json",
  },
  { name: "output", alias: "o", type: String },
  { name: "formatter", alias: "f", type: String },
  { name: "parallel", alias: "p", type: Number, defaultValue: 4 },
  { name: "entryPoint", alias: "e", type: String },
] as const;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
type Options = typeof OPTION_DEFINITIONS[number];
type ExtractType<OptionName extends Options["name"]> = ReturnType<
  Extract<Options, { name: OptionName }>["type"]
>;

type OptionType<OptionName extends Options["name"]> = Extract<
  Options,
  { name: OptionName }
> extends { defaultValue: any }
  ? ExtractType<OptionName>
  : ExtractType<OptionName> | undefined;

export type OptionTypes = {
  [OptionName in Options["name"]]: OptionType<OptionName>;
};

export function parseArguments(): OptionTypes {
  return commandLineArgs(
    OPTION_DEFINITIONS as Writeable<typeof OPTION_DEFINITIONS>
  ) as OptionTypes;
}
