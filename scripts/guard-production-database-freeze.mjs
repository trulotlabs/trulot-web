import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_CONFIG = ".github/production-database-freeze.json";
const WORKFLOW_GUARD_COMMAND = "node scripts/guard-production-database-freeze.mjs";
const DATABASE_COMMAND_PATTERN = /\b(?:supabase\b[^\r\n]*\bdb\s+(?:push|reset)\b|supabase\b[^\r\n]*\bmigration\s+(?:repair|up)\b|psql\b|pg_restore\b|prisma\s+migrate\s+deploy\b|drizzle-kit\s+(?:migrate|push)\b|knex\s+migrate:latest\b|sequelize-cli\s+db:migrate\b)/i;
const PRODUCTION_CREDENTIAL_PATTERN = /(?:\b(?:TRULOT_)?PRODUCTION_DB_(?:URL|PASSWORD)\b|\bSUPABASE_ACCESS_TOKEN\b|secrets\.)/;
const PRODUCTION_ENVIRONMENT_PATTERN = /environment:\s*production\b/;
const DYNAMIC_ENVIRONMENT_PATTERN = /environment:\s*(?:\$\{\{|inputs\.|github\.)/;
const WORKFLOW_DISPATCH_INPUT_PATTERN = /workflow_dispatch:\s*\n\s+inputs:/;
const LOCAL_ACTION_PATTERN = /uses:\s*["']?\.\//;
const CONDITIONAL_STEP_PATTERN = /^\s*(?:-\s*)?if:/m;

export function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    config: DEFAULT_CONFIG,
    workflowRef: "",
    environment: "",
    operation: "",
    migrationDir: "",
    auditRepository: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--audit-repository") {
      options.auditRepository = true;
      continue;
    }
    const key = {
      "--root": "root",
      "--config": "config",
      "--workflow-ref": "workflowRef",
      "--environment": "environment",
      "--operation": "operation",
      "--migration-dir": "migrationDir",
    }[arg];
    if (!key) throw new Error(`Unknown freeze-guard argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    index += 1;
  }
  options.root = path.resolve(options.root);
  return options;
}

function requireStringArray(config, key) {
  assert(Array.isArray(config[key]) && config[key].length > 0, `${key} must be a non-empty array.`);
  assert(config[key].every((item) => typeof item === "string" && item.trim()), `${key} must contain non-empty strings.`);
  assert.equal(new Set(config[key]).size, config[key].length, `${key} must not contain duplicates.`);
}

export function loadAndValidateConfig(root, configPath) {
  const absolutePath = path.resolve(root, configPath);
  let raw;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
  } catch {
    throw new Error(`Freeze configuration is required and unreadable: ${configPath}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Freeze configuration is malformed JSON: ${configPath}`);
  }

  assert.equal(config.schemaVersion, 1, "Unsupported or missing freeze schemaVersion.");
  assert.equal(config.mode, "active-freeze", "Freeze mode must remain active-freeze until a reviewed unfreeze code change lands.");
  assert.equal(config.policyId, "sda-source-reconciliation-freeze", "Freeze policyId is missing or unsupported.");
  requireStringArray(config, "prohibitedMigrationVersions");
  requireStringArray(config, "prohibitedWorkflowPaths");
  requireStringArray(config, "productionEnvironments");
  requireStringArray(config, "unfreezeRequirements");
  assert.deepEqual(
    [...config.prohibitedMigrationVersions].sort(),
    ["20260713022000", "20260713025206"],
    "Both known-failing migration versions must remain prohibited.",
  );
  return config;
}

export function normalizeWorkflowPath(workflowRef) {
  const marker = "/.github/workflows/";
  const markerIndex = workflowRef.indexOf(marker);
  if (markerIndex >= 0) {
    return workflowRef.slice(markerIndex + 1).split("@")[0];
  }
  const directIndex = workflowRef.indexOf(".github/workflows/");
  if (directIndex >= 0) return workflowRef.slice(directIndex).split("@")[0];
  return workflowRef.split("@")[0];
}

export function findProhibitedMigrations(root, migrationDir, versions) {
  if (!migrationDir) return [];
  const absoluteDir = path.resolve(root, migrationDir);
  let entries;
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    throw new Error(`Proposed migration directory is required and unreadable: ${migrationDir}`);
  }
  return entries
    .filter((entry) => entry.isFile() && versions.some((version) => entry.name.includes(version)))
    .map((entry) => entry.name)
    .sort();
}

function workflowFiles(root) {
  const workflowDir = path.join(root, ".github", "workflows");
  return fs.readdirSync(workflowDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(workflowDir, entry.name));
}

export function auditRepositoryPaths(root) {
  const violations = [];
  for (const absolutePath of workflowFiles(root)) {
    const relativePath = path.relative(root, absolutePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const hasProductionEnvironment = PRODUCTION_ENVIRONMENT_PATTERN.test(source);
    const hasDynamicEnvironment = DYNAMIC_ENVIRONMENT_PATTERN.test(source);
    const credentialIndex = source.search(PRODUCTION_CREDENTIAL_PATTERN);
    const databaseCommandIndex = source.search(DATABASE_COMMAND_PATTERN);
    const isProductionConnected = hasProductionEnvironment || hasDynamicEnvironment || databaseCommandIndex >= 0 || credentialIndex >= 0;
    if (!isProductionConnected) continue;

    const guardIndex = source.indexOf(WORKFLOW_GUARD_COMMAND);
    if (guardIndex < 0) {
      violations.push(`${relativePath}: production-connected workflow does not invoke the authoritative freeze guard.`);
      continue;
    }

    const strictFreezeStub = hasProductionEnvironment || hasDynamicEnvironment || credentialIndex >= 0;
    if (strictFreezeStub) {
      const guardInvocation = source.slice(guardIndex, guardIndex + 600);
      if (!/--environment\s+production\b/.test(guardInvocation)) {
        violations.push(`${relativePath}: production freeze guard must receive the literal production environment.`);
      }
      if (!/--operation\s+(?!validation\b)[^\s\\]+/.test(guardInvocation)) {
        violations.push(`${relativePath}: production freeze guard must receive a denying production operation, not validation.`);
      }
      if (WORKFLOW_DISPATCH_INPUT_PATTERN.test(source)) {
        violations.push(`${relativePath}: production freeze stubs must not accept workflow_dispatch inputs.`);
      }
      if (LOCAL_ACTION_PATTERN.test(source)) {
        violations.push(`${relativePath}: production freeze stubs must not delegate to local composite actions.`);
      }
      if (CONDITIONAL_STEP_PATTERN.test(source)) {
        violations.push(`${relativePath}: production freeze stubs must not conditionally skip steps.`);
      }
      if (credentialIndex >= 0) {
        violations.push(`${relativePath}: production freeze stubs must remain credential-free.`);
      }
      if (databaseCommandIndex >= 0) {
        violations.push(`${relativePath}: production freeze stubs must remain database-command-free.`);
      }
    }

    for (const [label, index] of [["production credential", credentialIndex], ["database command", databaseCommandIndex]]) {
      if (index >= 0 && index < guardIndex) {
        violations.push(`${relativePath}: ${label} appears before the freeze guard.`);
      }
    }
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (DATABASE_COMMAND_PATTERN.test(String(command)) || PRODUCTION_CREDENTIAL_PATTERN.test(String(command))) {
      violations.push(`package.json script ${name}: repository script exposes a production database path.`);
    }
  }
  return violations;
}

export function evaluateFreeze(options, config) {
  if (!options.workflowRef || !options.environment || !options.operation) {
    throw new Error("workflow-ref, environment, and operation are mandatory; direct or incomplete invocation is denied.");
  }

  const workflowPath = normalizeWorkflowPath(options.workflowRef);
  if (config.prohibitedWorkflowPaths.includes(workflowPath)) {
    throw new Error(`Workflow is prohibited during the SDA recovery freeze: ${workflowPath}`);
  }

  const prohibitedMigrations = findProhibitedMigrations(
    options.root,
    options.migrationDir,
    config.prohibitedMigrationVersions,
  );
  if (prohibitedMigrations.length > 0) {
    throw new Error(`Prohibited migration present in proposed range: ${prohibitedMigrations.join(", ")}`);
  }

  if (config.productionEnvironments.includes(options.environment)) {
    throw new Error(`Production database operation is blocked while ${config.policyId} is active: ${options.operation}`);
  }

  if (options.operation !== "validation") {
    throw new Error(`Only non-production validation is allowed during the freeze; received: ${options.operation}`);
  }

  if (options.auditRepository) {
    const violations = auditRepositoryPaths(options.root);
    if (violations.length > 0) throw new Error(`Repository freeze audit failed:\n${violations.join("\n")}`);
  }

  return { workflowPath, result: "allowed-non-production-validation" };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const config = loadAndValidateConfig(options.root, options.config);
  const result = evaluateFreeze(options, config);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`PRODUCTION DATABASE FREEZE: DENIED\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
