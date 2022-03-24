import fs from "fs";
import { AST, parse } from "@typescript-eslint/typescript-estree";
import {
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  JSXAttribute,
  JSXOpeningElement,
  Literal,
  Node,
  Position,
} from "estree-jsx";
import { BaseNode, walk } from "estree-walker";
import { Report } from "./types";
import escodegen from "escodegen";

const PARSE_OPTIONS = { jsx: true, loc: true };

type ParsedAST = AST<typeof PARSE_OPTIONS>;

export function parseFile(filePath: string, report: Report): void {
  const contents = fs.readFileSync(filePath).toString();
  const ast = parse(contents, PARSE_OPTIONS);

  analyzeAst(filePath, ast, report);
}

function analyzeAst(filePath: string, ast: ParsedAST, report: Report): void {
  walkAst(ast, {
    ImportDeclaration(node) {
      getImportInfo(node).forEach((importInfo) => {
        if (report.imports[importInfo.importName] == null) {
          report.usage[importInfo.importName] = { instances: [] };
          report.imports[importInfo.module] = importInfo.importName;
        }
      });
    },

    JSXOpeningElement(node) {
      const componentInfo = analyzeComponent(filePath, node);

      if (report.usage[componentInfo.name] == null) {
        report.usage[componentInfo.name] = { instances: [] };
      }

      report.usage[componentInfo.name].instances.push(componentInfo);
    },
  });
}

interface Walker {
  replace: (node: Node) => void;
  remove: (node: Node) => void;
}

type ASTCallbacks = Partial<{
  [NodeType in Node["type"]]: (
    node: Extract<Node, { type: NodeType }>,
    walker: Walker
  ) => void;
}>;

function walkAst(ast: ParsedAST, callbacks: ASTCallbacks): BaseNode {
  return walk(ast, {
    enter(node) {
      if (node.type in callbacks) {
        // @ts-expect-error
        callbacks[node.type]?.(node as Node, this);
      }
    },
  });
}

interface ImportInfo {
  importName: string;
  module: string;
  isDefaultImport: boolean;
  namespacedIdentifier: string;
}
function getImportInfo(node: ImportDeclaration): ImportInfo[] {
  return node.specifiers.map((specifier) => {
    const importName = getImportNameFromSpecifier(specifier);
    const module = node.source.value;

    return {
      importName,
      module,
      isDefaultImport: specifier.type === "ImportDefaultSpecifier",
      namespacedIdentifier: `${module}/${importName}`,
    } as ImportInfo;
  });
}

function getImportNameFromSpecifier(
  specifier: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
): string {
  const importIdentifier =
    "imported" in specifier
      ? specifier.imported || specifier.local
      : specifier.local;

  return importIdentifier.name;
}

interface ComponentInstance {
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

function analyzeComponent(
  filePath: string,
  node: JSXOpeningElement
): ComponentInstance {
  const instance: ComponentInstance = {
    name: getComponentName(node),
    location: {
      file: filePath,
      start: node.loc?.start,
      end: node.loc?.end,
    },
    props: {},
    spread: false,
  };

  node.attributes.forEach((attribute) => {
    const { loc: attributeLocation } = attribute;
    if (attribute.type === "JSXAttribute") {
      instance.props[attribute.name.name.toString()] = {
        value: getPropValue(attribute),
        location: `${filePath}:${attributeLocation?.start.line}:${attributeLocation?.start.column}`,
      };
    } else {
      instance.spread = true;
    }
  });

  return instance;
}

function getComponentName(node: JSXOpeningElement): string {
  const { name: identifier } = node;
  if ("name" in identifier) {
    return identifier.name.toString();
  } else if (identifier.type === "JSXMemberExpression") {
    const identifierName =
      identifier.object.type === "JSXIdentifier"
        ? identifier.object.name
        : identifier.object.property.name;

    return [identifierName, identifier.property.name].join(".");
  } else {
    throw new Error(
      `Unknown component name type ${JSON.stringify(identifier, null, 2)}`
    );
  }
}

function getPropValue(attribute: JSXAttribute): Literal["value"] {
  const { value } = attribute;

  if (value == null) {
    return true;
  } else if (value.type === "Literal") {
    return value.value;
  } else if (value.type === "JSXExpressionContainer") {
    return escodegen.generate(value.expression) as string;
  } else {
    throw new Error(`Unknown value type "${value}"`);
  }
}
