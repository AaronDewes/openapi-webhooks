import { createWriteStream, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import prettier from "prettier";
import execa from "execa";
import sortKeys from "sort-keys";
import equal from "deep-equal";
import _ from "lodash";
import { getCurrentVersions } from "github-enterprise-server-versions";
import mapObj from "map-obj";

import overrides from "./overrides/index.js";
import { readFile } from "node:fs/promises"

/* if (!process.env.GITHUB_ACTIONS && !process.env.ANICCA_REPOSITORY_PATH) {
  throw new Error("Please set ANICCA_REPOSITORY_PATH");
} */

run();

async function run() {
  const ghesVersions = await getCurrentVersions();
  const latestGhesVersion = ghesVersions.reverse()[0];

  const schemaFileNames = readdirSync("cache");
  const changeFileNames = readdirSync("changes");

  const changes = changeFileNames.reduce((map, file) => {
    const { route, ...change } = JSON.parse(readFileSync(`changes/${file}`).toString());
    if (!map[route]) map[route] = [];
    map[route].push(change);
    return map;
  }, {});

  for (const file of schemaFileNames) {
    const schema = JSON.parse(readFileSync(`cache/${file}`).toString());

    // apply overrides to the unaltered schemas from GitHub
    /*overrides(file, schema);

    for (const [path, methods] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const route = `${method.toUpperCase()} ${path}`;
        operation["x-octokit"] = {};

        if (!changes[route]) continue;

        operation["x-octokit"].changes = [];
        for (const change of changes[route]) {
          operation["x-octokit"].changes.push(change);
        }
      }
    }*/

    // overwrite version to "0.0.0-development", will be updated
    // right before publish via semantic-release
    schema.info.version = "0.0.0-development";
    schema.info.title = "GitHub's official Webhooks OpenAPI spec + Octokit extension";
    schema.info.description =
      "Webhooks OpenAPI specs from https://github.com/github/rest-api-description with the 'x-octokit' extension required by the Octokit SDKs";
    schema.info.contact.url = "https://github.com/octokit/openapi";

    // Isolate the webhooks schemas
    if (typeof schema.components !== "undefined" && !file.includes("deref")) {
      delete schema.components.responses;
      delete schema.components.parameters;
      delete schema.components.headers;
      delete schema.components.examples;
    }

    const tempSchema =  { ...schema };

    // Check all instances of `$ref` in the OpenAPI spec, and add them to the definitions
    const handleRefs = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj

      for (let key in obj) {
        if (key === '$ref' && typeof obj[key] === 'string') {
          const ref = obj[key].split('/').at(-1);
          tempSchema.components.schemas[ref] = schema.components.schemas[ref]
          // Call the function with the new definition to handle any of it's $refs
          handleRefs(tempSchema.components.schemas[ref])
        } else {
          obj[key] = handleRefs(obj[key])
        }
      }
      return obj
    }
    // Check all $ref properties and include them in the output
    if (typeof schema.components !== "undefined" && !file.includes("deref")) {
      handleRefs(schema.components.schemas)
    }
    writeFileSync(
      `generated/${file}`,
      prettier.format(JSON.stringify(tempSchema), { parser: "json" })
    );
    console.log(`generated/${file} written`);
  }

  // generate diff files
  /*for (const file of schemaFileNames) {
    if (!file.endsWith("deref.json")) continue;
    if (file.startsWith("api.github.com")) continue;

    const fromPath = `generated/${toFromFilename(file, latestGhesVersion)}`;
    const toPath = `generated/${file}`;
    const diffPath = `generated/${toAniccaDiffFilename(
      file,
      latestGhesVersion
    )}`;

    const cmd = `cargo run --bin cli diff ${resolve(fromPath)} ${resolve(
      toPath
    )} --format json`;

    console.log("$ %s", cmd);
    // generate diff files using `anicca`
    // cargo run --bin cli diff /Users/gregor/Projects/octokit/openapi/generated/api.github.com.deref.json /Users/gregor/Projects/octokit/openapi/generated/ghes-3.1.deref.json --format json > diff.json

    const aniccaCwd = process.env.GITHUB_ACTIONS
      ? `${process.env.GITHUB_WORKSPACE}/anicca`
      : process.env.ANICCA_REPOSITORY_PATH;

    const command = execa.command(cmd, {
      cwd: aniccaCwd,
    });
    command.stderr.pipe(process.stderr);
    command.stdout.pipe(createWriteStream(resolve(diffPath)));
    await command;

    console.log(`${diffPath} written`);

    const json = require(`../${diffPath}`);

    json.paths = {
      changed: json.paths.changed
        ? Object.fromEntries(
            Object.entries(json.paths.changed).map(
              ([path, { operations_changed }]) => {
                return [path, operations_changed];
              }
            )
          )
        : {},
      added: json.paths.added ? Object.fromEntries(json.paths.added) : {},
      removed: json.paths.removed
        ? Object.fromEntries(
            json.paths.removed.map(([path, methods]) => [
              path,
              Object.keys(methods),
            ])
          )
        : {},
    };

    const jsonWithoutNullValues = mapObj(json, removeNullValues);
    const newJson = mapObj(jsonWithoutNullValues, simplifyRemovedArrays, {
      deep: true,
    });

    if (Object.keys(newJson.paths.changed).length) {
      newJson.paths.changed = mapObj(
        newJson.paths.changed,
        removeUnchangedKeys,
        {
          deep: true,
        }
      );
    }

    const minimalJson = mapObj(newJson, removeDeepEmptyObjects, {
      deep: true,
    });

    const sortedJson = sortKeys(minimalJson, { deep: true });

    writeFileSync(
      diffPath,
      prettier.format(JSON.stringify(sortedJson), {
        parser: "json",
      })
    );

    console.log(`${diffPath} re-formatted, keys sorted, and simplified`);

    // add `"x-octokit".diff` to schemas
    addDiffExtensions(sortedJson, fromPath, toPath);
    addDiffExtensions(
      sortedJson,
      fromPath.replace(".deref", ""),
      toPath.replace(".deref", "")
    );

    // add diff files
    createDiffVersion(toPath, latestGhesVersion);
    createDiffVersion(toPath.replace(".deref", ""), latestGhesVersion);
  }*/

  /* let schemasCode = "";

  for (const name of schemaFileNames) {
    schemasCode += `["${name.replace(
      ".json",
      ""
    )}"]: require("./generated/${name}"),`;
  }

  writeFileSync(
    "index.js",
    prettier.format(
      `
      module.exports = {
        schemas: {
          ${schemasCode}
        }
      }
    `,
      {
        parser: "babel",
      }
    )
  ); */
}

function toFromFilename(path, latestGhesVersion) {
  const filename = basename(path);
  if (filename.startsWith("ghec")) {
    return "api.github.com.deref.json";
  }

  if (filename.startsWith("github.ae")) {
    return "api.github.com.deref.json";
  }

  if (filename.startsWith(`ghes-${latestGhesVersion}`)) {
    return "api.github.com.deref.json";
  }

  if (filename.startsWith("ghes-3.")) {
    const v3Version = parseInt(filename.substring("ghes-3.".length));
    return `ghes-3.${v3Version + 1}.deref.json`;
  }

  throw new Error(`Cannot calculate base version for ${filename}`);
}

function toAniccaDiffFilename(path, latestGhesVersion) {
  const filename = basename(path);
  const fromFilename = toFromFilename(filename, latestGhesVersion);
  return filename.replace(".deref.json", `-anicca-diff-to-${fromFilename}`);
}

function toDiffFilename(path, latestGhesVersion) {
  const filename = basename(path);
  const fromFilename = toFromFilename(filename, latestGhesVersion);

  if (filename.includes(".deref")) {
    return filename.replace(/\.deref\.json/, `-diff-to-${fromFilename}`);
  }

  return filename.replace(
    /\.json/,
    `-diff-to-${fromFilename.replace(".deref", "")}`
  );
}

function filenameToVersion(filename) {
  return filename.replace(/^generated\//, "").replace(/\.deref\.json$/, "");
}

function removeUnchangedKeys(key, value) {
  if (value === null) {
    return mapObj.mapObjectSkip;
  }

  // we don't care about description changes
  if (
    (key === "description" || key === "description_changed") &&
    typeof value === "object" &&
    equal(Object.keys(value).sort(), ["from", "to"])
  ) {
    return mapObj.mapObjectSkip;
  }

  // we also don't care about operation summary changes
  if (
    key === "summary" &&
    typeof value === "object" &&
    equal(Object.keys(value).sort(), ["from", "to"])
  ) {
    return mapObj.mapObjectSkip;
  }

  if (equal(Object.keys(value).sort(), ["added", "changed", "removed"])) {
    value.changed = mapObj(value.changed, removeEmptyObjects);
  }

  if (equal(value, { added: [], changed: {}, removed: [] })) {
    return mapObj.mapObjectSkip;
  }

  if (equal(value, { added: [], removed: [] })) {
    return mapObj.mapObjectSkip;
  }

  if (
    equal(Object.keys(value).sort(), [
      "operations_added",
      "operations_changed",
      "operations_removed",
    ])
  ) {
    value.operations_changed = mapObj(
      value.operations_changed,
      removeEmptyObjects
    );

    if (
      equal(value, {
        operations_added: [],
        operations_changed: {},
        operations_removed: [],
      })
    ) {
      return mapObj.mapObjectSkip;
    }
  }

  return [key, value];
}

function removeNullValues(key, value) {
  if (value === null) {
    return mapObj.mapObjectSkip;
  }

  return [key, value];
}

function simplifyRemovedArrays(key, value) {
  if (key !== "removed") return [key, value];

  if (!Array.isArray(value) || !Array.isArray(value[0])) return [key, value];

  return [key, value.map(([removedKey]) => removedKey)];
}

function removeEmptyObjects(key, value) {
  if (equal(value, {})) {
    return mapObj.mapObjectSkip;
  }

  return [key, value];
}

function removeDeepEmptyObjects(key, value) {
  if (isEmptyDeep(value)) {
    return mapObj.mapObjectSkip;
  }

  return [key, value];
}

function isEmptyDeep(obj) {
  if (_.isObject(obj)) {
    if (Object.keys(obj).length === 0) return true;
    return _.every(_.map(obj, (v) => isEmptyDeep(v)));
  } else if (_.isString(obj)) {
    return !obj.length;
  }
  return false;
}

function addDiffToOperations(version, schema, diff = {}, type) {
  for (const [path, methods] of Object.entries(diff)) {
    for (const method of Object.keys(methods)) {
      const operation = schema.paths[path][method];

      operation["x-octokit"] = {
        ...operation["x-octokit"],
        diff: {
          [version]: { type },
        },
      };
    }
  }
}

function addRemovedOperations(
  fromVersion,
  toVersion,
  schema,
  diffSchema,
  diff = {}
) {
  for (const [path, methods] of Object.entries(diff)) {
    for (const method of methods) {
      if (!schema.paths[path]) {
        schema.paths[path] = {};
      }

      // leave out some properties
      const {
        requestBody,
        parameters,
        responses,
        "x-github": _ignore,
        ...diffOperation
      } = diffSchema.paths[path][method];

      schema.paths[path][method] = {
        ...diffOperation,
        responses: {
          501: {
            description: "Not Implemented",
          },
        },
        description: `This endpoint does not exist ${toVersion}. It was added in ${fromVersion}`,
        "x-octokit": {
          [fromVersion]: "removed",
        },
      };
    }
  }
}

function addDiffExtensions(diffJson, fromPath, toPath) {
  const fromJson = require(`../${fromPath}`);
  const toJson = require(`../${toPath}`);

  const { added, removed, changed } = diffJson.paths;
  const from = filenameToVersion(fromPath);
  const to = filenameToVersion(toPath);

  addDiffToOperations(from, toJson, added, "added");
  addDiffToOperations(from, toJson, changed, "changed");
  addRemovedOperations(from, to, toJson, fromJson, removed);

  writeFileSync(
    toPath,
    prettier.format(JSON.stringify(toJson), {
      parser: "json",
    })
  );

  console.log(`"x-octokit".diff extension added to ${toPath}`);
}

function createDiffVersion(path, latestGhesVersion) {
  const schema = require(`../${path}`);
  const newPaths = {};
  let refs = new Set();

  // remove all paths that didn't change and keep track of refs
  for (const [path, methods] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation["x-octokit"]?.diff) continue;

      _.set(newPaths, `${path}.${method}`, operation);
      refs = new Set([...refs, ...findRefs(operation, refs)]);
    }
  }
  schema.paths = newPaths;

  // go through all refs recursively
  refs.forEach((ref) => {
    const component = _.get(schema, ref);
    findAllRefs(schema, component, refs);
  });

  // remove all components that didn't change
  const newComponents = {};
  refs.forEach((ref) => {
    _.set(newComponents, ref, _.get(schema, ref));
  });
  schema.components = newComponents.components;

  console.log("%d components left over", refs.size);

  const newPath = "generated/" + toDiffFilename(path, latestGhesVersion);

  writeFileSync(
    newPath,
    prettier.format(JSON.stringify(schema), { parser: "json" })
  );

  console.log("%s updated", newPath);
}

function findRefs(obj) {
  const newRefs = new Set();
  mapObj(
    obj,
    (key, value) => {
      if (key === "$ref") {
        // value is e.g. "#/components/parameters/per-page"
        newRefs.add(value.substr(2).replace(/\//g, "."));
      }

      return [key, value];
    },
    { deep: true }
  );

  return newRefs;
}

function findAllRefs(schema, component, refs) {
  const newRefs = findRefs(component);

  newRefs.forEach((ref) => {
    if (refs.has(ref)) return;
    refs.add(ref);

    findAllRefs(schema, _.get(schema, ref), refs);
  });
}
