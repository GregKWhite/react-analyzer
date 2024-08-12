import { SgNode, tsx } from "@ast-grep/napi";
import fs from "fs";
import * as path from "path";
import { NodeLookupInfo, PossiblyResolvedComponentInstance } from "./types";
import { CommonOptionTypes } from "./options";

const cwd = process.cwd();

export function parseFile(filePath: string, options: CommonOptionTypes) {
  const contents = fs.readFileSync(filePath).toString();
  const ast = tsx.parse(contents);

  return analyzeAst(filePath, ast.root(), options);
}

function analyzeAst(
  filePath: string,
  ast: SgNode,
  options: CommonOptionTypes
): PossiblyResolvedComponentInstance[] {
  let results: PossiblyResolvedComponentInstance[] = [];

  const jsxElements = ast.findAll({
    rule: {
      pattern: "$IDENTIFIER",
      any: [{ kind: "identifier" }, { kind: "member_expression" }],
      inside: {
        pattern: "$ELEMENT",
        any: [
          { kind: "jsx_opening_element" },
          { kind: "jsx_self_closing_element" },
        ],
      },
    },
  });

  jsxElements.forEach((element) => {
    const instance = analyzeComponent(
      options.tsConfigPath,
      filePath,
      ast,
      element
    );

    results.push(instance);
  });

  return results;
}

function lookupNode(
  tsConfigPath: string,
  filePath: string,
  ast: SgNode,
  name: string
): NodeLookupInfo {
  return (
    getBuiltinName(name) ??
    getImportPath(ast, name) ??
    getLocalPath(tsConfigPath, filePath, name) ?? {
      path: "Unknown",
      alias: undefined,
    }
  );
}

function isBuiltIn(name: string) {
  return name[0].toLowerCase() === name[0] || name.startsWith("React.");
}

function getBuiltinName(name: string) {
  if (isBuiltIn(name)) {
    return { name, path: "react", alias: undefined };
  }
}

function getLocalPath(tsConfigPath: string, filePath: string, name: string) {
  return {
    name,
    path: relativePath(tsConfigPath, filePath),
    alias: name,
  };
}

function getImportPath(ast: SgNode, name: string) {
  // Handle components of the form Foo.Bar. We want to match against 'Foo', not
  // 'Foo.Bar' later on when we try to find the component's import
  const [firstNamePart, ...restName] = name.split(".");
  const matchingRegex = `^${firstNamePart}$`;
  const imports = ast.findAll({
    rule: {
      pattern: "$IMPORT",
      kind: "import_statement",
      has: {
        stopBy: "end",
        any: [
          {
            kind: "identifier",
            pattern: "$IDENTIFIER",
            inside: {
              has: {
                kind: "identifier",
                pattern: "$ALIAS",
                field: "alias",
                regex: matchingRegex,
              },
            },
          },
          { kind: "identifier", pattern: "$IDENTIFIER", regex: matchingRegex },
        ],
      },
    },
  });

  const importInfo = imports.find((importNode) => {
    const identifier = (importNode.getMatch("ALIAS") ??
      importNode.getMatch("IDENTIFIER"))!.text();
    return identifier === firstNamePart;
  });

  if (importInfo == null) return;

  const isDefaultImport = Boolean(
    importInfo.find({
      rule: {
        kind: "import_clause",
        has: {
          kind: "identifier",
          pattern: name,
        },
      },
    })
  );

  let formattedName;
  if (isDefaultImport) {
    formattedName = ["default", ...restName].join(".");
  } else {
    formattedName = [
      importInfo.getMatch("IDENTIFIER")!.text(),
      ...restName,
    ].join(".");
  }

  return {
    name: formattedName,
    alias: importInfo.getMatch("ALIAS")?.text(),
    importIdentifier: importInfo
      .find({
        rule: { has: { stopBy: "end", kind: "string_fragment" } },
      })!
      .text(),
    position: importInfo.getMatch("IDENTIFIER")!.range().start,
  };
}

function relativePath(tsConfigPath: string, filePath: string) {
  return path.relative(path.join(cwd, path.dirname(tsConfigPath)), filePath);
}

function analyzeComponent(
  tsConfigPath: string,
  filePath: string,
  baseNode: SgNode,
  node: SgNode
): PossiblyResolvedComponentInstance {
  const name = node.getMatch("IDENTIFIER")!.text();
  const importInfo = lookupNode(tsConfigPath, filePath, baseNode, name);
  const isResolved = "importPath" in importInfo;

  const element = node.getMatch("ELEMENT")!;
  const elementRange = element.range();
  const children = element.children();

  const instance: PossiblyResolvedComponentInstance = {
    alias: importInfo.alias,
    name: importInfo.name,
    location: {
      file: relativePath(tsConfigPath, filePath),
      absolutePath: filePath,
      start: {
        line: elementRange.start.line + 1,
        column: elementRange.start.column,
      },
      end: {
        line: elementRange.end.line + 1,
        column: elementRange.end.column,
      },
    },
    props: {},
    spread: children.some((c) => c.kind() === "jsx_expression"),
    hasChildren:
      element.kind() === "jsx_opening_element" &&
      element.next()?.kind() === "jsx_element",
    builtin: isBuiltIn(name),
    external: !isResolved,
    ...("importIdentifier" in importInfo
      ? {
          importIdentifier: importInfo.importIdentifier,
          importPosition: importInfo.position,
        }
      : { importPath: importInfo.path }),
  };

  const attributes = children.filter((c) => c.kind() === "jsx_attribute");
  attributes.forEach((attr) => {
    const identifier = attr.find({
      rule: { kind: "property_identifier" },
    });
    const value = attr.find({
      rule: { any: [{ kind: "string_fragment" }, { kind: "jsx_expression" }] },
    });

    if (identifier && value) {
      const range = attr.range();
      let formattedValue = value.text();

      if (value.kind() === "jsx_expression") {
        formattedValue = formattedValue.slice(1, -1);
      }

      // Ensure string values are wrapped in qzuotes
      if (value.kind() === "string_fragment") {
        formattedValue = `'${formattedValue}'`;
      }

      instance.props[identifier.text()] = {
        value: formattedValue,
        location: `${relativePath(tsConfigPath, filePath)}:${
          range.start.line + 1
        }:${range.start.column}`,
      };
    }
  });

  return instance;
}
