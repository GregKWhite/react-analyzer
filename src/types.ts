export interface Report {
  usage: {
    [key: string]: {
      instances: ComponentInstance[];
    };
  };
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
    absolutePath: string;
    start?: {
      line: number;
      column: number;
    };
    end?: {
      line: number;
      column: number;
    };
  };

  props: {
    [key: string]: {
      value: string | number | bigint | boolean | RegExp | null | undefined;
      location: string;
    };
  };

  spread: boolean;
}

export type UnresolvedComponentInstance = Omit<
  ComponentInstance,
  "importPath"
> & {
  importIdentifier: string;
  importPosition: ImportPosition;
};

export type PossiblyResolvedComponentInstance =
  | ComponentInstance
  | UnresolvedComponentInstance;

interface ImportPosition {
  line: number;
  column: number;
  index: number;
}

export type NodeLookupInfo =
  | { name: string; path: string; alias: string | undefined }
  | {
      name: string;
      alias: string | undefined;
      importIdentifier: string;
      position: ImportPosition;
    };

export type ChildProcessMessage = {
  instances: PossiblyResolvedComponentInstance[];
  filesParsed: string[];
};
