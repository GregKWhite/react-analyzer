import fs from "fs";
import glob from "glob";
import { AST, parse } from "@typescript-eslint/typescript-estree";
import {
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Literal,
  Position,
} from "estree";
import { JSXAttribute, JSXOpeningElement } from "estree-jsx";
import escodegen from "escodegen";
import { BaseNode, walk } from "estree-walker";

type StringOrRegexp = string | RegExp;
type Excludes = StringOrRegexp[] | ((path: string) => boolean);

interface findFilesProps {
  /** The directory to search within */
  startDir?: string;

  /**
   * Either an array of strings/regexes, or a function that will
   * determine which paths to exclude from the result set.
   *
   * If an array is passed, it will check each path for a regex match, or to to
   * see if the path starts with the given string. If the path is matched,
   * it will not be searched. Note: all paths are relative to the current path.
   *
   * If a function is passed, it will be given the path to the path, and
   * should return `true` if the path should be included.
   */
  exclude?: Excludes;
}
function findFiles({ startDir, exclude }: findFilesProps): string[] {
  startDir = startDir || ".";
  if (!startDir.endsWith("/")) {
    startDir = `${startDir}/`;
  }

  let files = glob.sync(`${startDir}**/*.{ts,tsx,js,jsx}`, {});
  files = filterFiles(files, exclude || ["./node_modules"]);

  return files;
}

/**
 * Takes in an array of file paths, and returns an array of file paths that are
 * filtered based on the given `exclude` paths.
 *
 * @param files - an array of file paths
 * @param exclude - an array of strings or regular expressions to be tested,
 * or a function that should return `true` when the path should be excluded.
 * @returns the filtered list of file paths
 */
function filterFiles(files: string[], exclude: Excludes): string[] {
  let excludeFn: (path: string) => boolean;

  if (typeof exclude === "function") {
    excludeFn = exclude;
  } else {
    excludeFn = (path: string) => {
      return exclude.some((stringOrRegexp) => {
        if (typeof stringOrRegexp === "string") {
          return path.startsWith(stringOrRegexp);
        } else {
          return stringOrRegexp.test(path);
        }
      });
    };
  }

  return files.filter((path) => !excludeFn(path));
}

const PARSE_OPTIONS = { jsx: true, loc: true };
function parseFile(path: string): AST<typeof PARSE_OPTIONS> {
  const contents = fs.readFileSync(path).toString();

  return parse(contents, PARSE_OPTIONS);
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

interface Report {
  [key: string]: {
    instances: ComponentInstance[];
  };
}

function walkAst(ast: AST<typeof PARSE_OPTIONS> | BaseNode, callbacks: any) {
  return walk(ast, {
    enter(node) {
      callbacks[node.type]?.(node, this);
    },
  });
}

interface Walker {
  replace: (node: BaseNode) => void;
  remove: (node: BaseNode) => void;
}

function walkTree(
  report: Report,
  filePath: string,
  ast: AST<typeof PARSE_OPTIONS>
): void {
  walkAst(ast, {
    ImportDeclaration(node: ImportDeclaration) {
      getImportInfo(node).forEach((importInfo) => {
        if (report[importInfo.importName] == null) {
          report[importInfo.importName] = { instances: [] };
        }
      });
    },

    JSXOpeningElement(node: JSXOpeningElement) {
      const componentInfo = analyzeComponent(filePath, node);

      if (report[componentInfo.name] == null) {
        report[componentInfo.name] = { instances: [] };
      }

      report[componentInfo.name].instances.push(componentInfo);
    },
  });
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

type PropValue = Literal["value"];
function getPropValue(attribute: JSXAttribute): PropValue {
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

interface RunParams {
  startDir?: string;
  outputDir?: string;
}
function run({ startDir, outputDir }: RunParams = {}): void {
  const startTime = process.hrtime.bigint();

  const report: Report = {};
  const paths = findFiles({ startDir: startDir || "./src" });

  paths.forEach((path) => {
    const ast = parseFile(path);

    walkTree(report, path, ast);
  });

  const endTime = process.hrtime.bigint();

  console.log(
    `Scanned ${paths.length} files in ${
      (endTime - startTime) / BigInt(1e9)
    } seconds`
  );

  const reportContents = JSON.stringify(report, null, 2);
  if (outputDir) {
    fs.writeFileSync(outputDir, reportContents);
  } else {
    console.log(reportContents);
  }
}

run({ startDir: "./sample" });
// run({ startDir: "../discord/discord_app/modules/", outputDir: "results.json" });
