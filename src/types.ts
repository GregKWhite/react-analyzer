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
  importedFrom: string;
  hasChildren: boolean;

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
