import { Literal, Position } from "estree-jsx";

export interface Report {
  usage: {
    [key: string]: {
      instances: ComponentInstance[];
    };
  };

  imports: Record<string, string>;
}

export interface ComponentInstance {
  name: string;
  alias: string | undefined;
  importPath: string;
  hasChildren: boolean;
  builtin: boolean;
  external: boolean;

  location: {
    file: string;
    start?: Position;
    end?: Position;
  };

  props: {
    [key: string]: {
      value: Literal["value"];
      location: string;
    };
  };

  spread: boolean;
}

export type UnresolvedComponentInstance = Omit<
  ComponentInstance,
  "importPath"
> & { importIdentifier: string };

export type PossiblyResolvedComponentInstance =
  | ComponentInstance
  | UnresolvedComponentInstance;

export type NodeLookupInfo =
  | { name: string; path: string; alias: string | undefined }
  | {
      name: string;
      alias: string | undefined;
      importIdentifier: string;
    };

export type ChildProcessMessage = {
  instances: PossiblyResolvedComponentInstance[];
  filesParsed: string[];
};
