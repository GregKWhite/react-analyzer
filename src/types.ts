import { Literal, Position } from "estree-jsx";

export interface Report {
  [key: string]: {
    instances: ComponentInstance[];
  };
}

export interface ComponentInstance {
  name: string;

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
