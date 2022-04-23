import fs from "fs";
import * as path from "path";
import { AST, parse } from "@typescript-eslint/typescript-estree";
import {
  ImportDeclaration,
  JSXAttribute,
  JSXOpeningElement,
  Literal,
} from "estree-jsx";
import { NodeLookupInfo, PossiblyResolvedComponentInstance } from "./types";
import escodegen from "escodegen";
import { walk } from "astray";
import { CommonOptionTypes } from "./options";

const PARSE_OPTIONS = { jsx: true, loc: true };

type ParsedAST = AST<typeof PARSE_OPTIONS>;

export function parseFile(filePath: string, options: CommonOptionTypes) {
  const contents = fs.readFileSync(filePath).toString();
  const ast = parse(contents, PARSE_OPTIONS);

  return analyzeAst(filePath, ast, options);
}

function analyzeAst(
  filePath: string,
  ast: ParsedAST,
  options: CommonOptionTypes
): PossiblyResolvedComponentInstance[] {
  let results: PossiblyResolvedComponentInstance[] = [];
  walk(ast, {
    // @ts-expect-error
    JSXOpeningElement(node: JSXOpeningElement) {
      const instance = analyzeComponent(
        options.tsConfigPath,
        filePath,
        ast,
        node
      );

      // Ignore built-in elements
      if (instance.builtin) return;

      results.push(instance);
    },
  });

  return results;
}

function lookupNode(
  tsConfigPath: string,
  filePath: string,
  baseNode: ParsedAST,
  name: string
): NodeLookupInfo {
  return (
    getBuiltinName(name) ??
    getImportPath(baseNode, name) ??
    getLocalPath(tsConfigPath, filePath, name) ?? {
      path: "Unknown",
      alias: undefined,
    }
  );
}

function isBuiltIn(name: string) {
  return name === name.toLowerCase() || name.startsWith("React.");
}

function getBuiltinName(name: string) {
  if (isBuiltIn(name)) {
    return { name, path: name, alias: undefined };
  }
}

function getLocalPath(tsConfigPath: string, filePath: string, name: string) {
  return {
    name,
    path: relativePath(tsConfigPath, filePath),
    alias: name,
  };
}

function getImportPath(baseNode: ParsedAST, name: string) {
  let declaration: ImportDeclaration | undefined;
  let found = false;
  let alias: string | undefined;

  // Handle components of the form Foo.Bar. We want to match against 'Foo', not
  // 'Foo.Bar' later on when we try to find the component's import
  const firstNamePart = name.split(".")[0];

  walk(baseNode, {
    ImportDeclaration: {
      enter(node) {
        if (!found) declaration = node;
      },
      exit() {
        if (!found) declaration = undefined;
      },
    },

    Identifier(node) {
      if (declaration && node.name === firstNamePart) found = true;
    },
  });

  if (declaration) {
    const specifier = declaration.specifiers.find((specifier) => {
      return specifier.local.name === firstNamePart;
    });

    if (specifier) {
      const specifierName =
        "imported" in specifier
          ? specifier.imported.name
          : specifier.local.name;

      alias = name;
      name = name
        .split(".")
        .map((namePart, i) => (i === 0 ? specifierName : namePart))
        .join(".");
    }
  }

  const importIdentifier = declaration?.source?.value?.toString();
  const isDefaultImport = Boolean(
    declaration?.specifiers?.some((specifier) => {
      return (
        specifier.type === "ImportDefaultSpecifier" &&
        specifier.local.name === firstNamePart
      );
    })
  );

  if (importIdentifier) {
    const formattedName = isDefaultImport
      ? name
          .split(".")
          .map((namePart, i) => (i === 0 ? "default" : namePart))
          .join(".")
      : name;

    return {
      name: formattedName,
      alias,
      importIdentifier,
    };
  }
}

function relativePath(tsConfigPath: string, filePath: string) {
  return path.relative(path.dirname(tsConfigPath), filePath);
}

function analyzeComponent(
  tsConfigPath: string,
  filePath: string,
  baseNode: ParsedAST,
  node: JSXOpeningElement
): PossiblyResolvedComponentInstance {
  const name = getComponentName(node);
  const importInfo = lookupNode(tsConfigPath, filePath, baseNode, name);
  const isResolved = "importPath" in importInfo;

  const instance: PossiblyResolvedComponentInstance = {
    alias: importInfo.alias,
    name: importInfo.name,
    location: {
      file: relativePath(tsConfigPath, filePath),
      start: node.loc?.start,
      end: node.loc?.end,
    },
    props: {},
    spread: false,
    hasChildren: !node.selfClosing,
    builtin: isBuiltIn(name),
    external: !isResolved,
    ...("importIdentifier" in importInfo
      ? { importIdentifier: importInfo.importIdentifier }
      : { importPath: importInfo.path }),
  };

  node.attributes.forEach((attribute) => {
    const { loc: attributeLocation } = attribute;
    if (attribute.type === "JSXAttribute") {
      instance.props[attribute.name.name.toString()] = {
        value: getPropValue(attribute),
        location: `${instance.location.file}:${attributeLocation?.start.line}:${attributeLocation?.start.column}`,
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
