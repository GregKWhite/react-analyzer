import fs from "fs";
import * as path from "path";
import { AST, parse } from "@typescript-eslint/typescript-estree";
import {
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  JSXAttribute,
  JSXOpeningElement,
  Literal,
} from "estree-jsx";
import { ComponentInstance, Report } from "./types";
import escodegen from "escodegen";
import { ts, SourceFile } from "ts-morph";
import astray from "astray";

const PARSE_OPTIONS = { jsx: true, loc: true };

type ParsedAST = AST<typeof PARSE_OPTIONS>;

export function parseFile(
  tsConfigPath: string,
  sourceFile: SourceFile,
  report: Report
): void {
  const filePath = sourceFile.getFilePath();
  const contents = fs.readFileSync(filePath).toString();
  const ast = parse(contents, PARSE_OPTIONS);

  analyzeAst(tsConfigPath, sourceFile, ast, report);
}

function analyzeAst(
  tsConfigPath: string,
  sourceFile: SourceFile,
  ast: ParsedAST,
  report: Report
): void {
  astray.walk(ast, {
    // @ts-expect-error
    JSXOpeningElement(node: JSXOpeningElement) {
      const componentInfo = analyzeComponent(
        tsConfigPath,
        sourceFile,
        ast,
        node
      );

      // Ignore built-in elements
      if (componentInfo.builtin) return;

      if (report.usage[componentInfo.importedFrom] == null) {
        report.usage[componentInfo.importedFrom] = { instances: [] };
      }

      report.usage[componentInfo.importedFrom].instances.push(componentInfo);
    },
  });
}

function lookupNode(
  tsConfigPath: string,
  sourceFile: SourceFile,
  baseNode: ParsedAST,
  name: string
): { name: string; path: string; alias: string | undefined } {
  return (
    getBuiltinName(name) ??
    getImportPath(tsConfigPath, sourceFile, baseNode, name) ??
    getLocalPath(sourceFile, name) ?? { path: "Unknown", alias: undefined }
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

function getLocalPath(sourceFile: SourceFile, name: string) {
  return {
    name,
    path: `${sourceFile.getFilePath()}/${name}`,
    alias: undefined,
  };
}

function getImportPath(
  tsConfigPath: string,
  sourceFile: SourceFile,
  baseNode: ParsedAST,
  name: string
) {
  let declaration: ImportDeclaration | undefined;
  let found = false;
  let alias: string | undefined;

  astray.walk(baseNode, {
    ImportDeclaration: {
      enter(node) {
        if (!found) declaration = node;
      },
      exit() {
        if (!found) declaration = undefined;
      },
    },

    Identifier(node) {
      if (declaration && node.name === name.split(".")[0]) found = true;
    },
  });

  if (declaration) {
    const specifier = declaration.specifiers.find((specifier) => {
      return specifier.local.name === name;
    });

    if (specifier) {
      const specifierName =
        "imported" in specifier
          ? specifier.imported.name
          : specifier.local.name;

      alias = name === specifierName ? undefined : name;
      name = specifierName;
    }
  }

  const importPath = declaration?.source?.value?.toString();
  const isDefaultImport = Boolean(
    declaration?.specifiers?.some((specifier) => {
      return (
        specifier.type === "ImportDefaultSpecifier" &&
        specifier.local.name === name
      );
    })
  );

  if (importPath) {
    const result = ts.resolveModuleName(
      importPath,
      sourceFile.getFilePath(),
      sourceFile.getProject().getCompilerOptions(),
      sourceFile.getProject().getModuleResolutionHost()
    );

    const formattedName = isDefaultImport
      ? name
          .split(".")
          .map((namePart, i) => (i === 0 ? "default" : namePart))
          .join(".")
      : name;

    let formattedImportPath = result.resolvedModule?.resolvedFileName;
    if (formattedImportPath?.includes("node_modules")) {
      formattedImportPath = importPath;
    } else if (formattedImportPath) {
      formattedImportPath = relativePath(tsConfigPath, formattedImportPath);
    } else {
      formattedImportPath = "Unknown";
    }

    return {
      name: formattedName,
      path: `${formattedImportPath}/${formattedName}`,
      alias,
    };
  }
}

function relativePath(tsConfigPath: string, filePath: string) {
  return path.relative(path.dirname(tsConfigPath), filePath);
}

function analyzeComponent(
  tsConfigPath: string,
  sourceFile: SourceFile,
  baseNode: ParsedAST,
  node: JSXOpeningElement
): ComponentInstance {
  const filePath = sourceFile.getFilePath();
  const name = getComponentName(node);
  const importInfo = lookupNode(tsConfigPath, sourceFile, baseNode, name);

  const instance: ComponentInstance = {
    alias: importInfo.alias,
    importedFrom: importInfo.path,
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
