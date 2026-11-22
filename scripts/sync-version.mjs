#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const versionFile = path.join(root, "VERSION");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
const changelogPath = path.join(root, "CHANGELOG.md");

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readCargoPackageVersion(tomlText) {
  const m = tomlText.match(/(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m);
  return m ? m[2] : null;
}

function updateCargoPackageVersion(tomlText, nextVersion) {
  const re = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
  if (!re.test(tomlText)) {
    throw new Error("Could not find [package] version in src-tauri/Cargo.toml");
  }
  return tomlText.replace(re, `$1${nextVersion}$3`);
}

function readCargoLockVersion(lockText) {
  const m = lockText.match(/(\[\[package\]\]\s*\nname = "yarda"\s*\nversion = ")([^"]+)(")/m);
  return m ? m[2] : null;
}

function updateCargoLockVersion(lockText, nextVersion) {
  const re = /(\[\[package\]\]\s*\nname = "yarda"\s*\nversion = ")([^"]+)(")/m;
  if (!re.test(lockText)) {
    throw new Error('Could not find [[package]] name = "yarda" in src-tauri/Cargo.lock');
  }
  return lockText.replace(re, `$1${nextVersion}$3`);
}

function getAllVersions() {
  const versionTxt = fs.readFileSync(versionFile, "utf8").trim();
  const pkg = readJson(packageJsonPath);
  const pkgLock = readJson(packageLockPath);
  const tauriConf = readJson(tauriConfPath);
  const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
  const cargoLock = fs.readFileSync(cargoLockPath, "utf8");

  return [
    ["VERSION", versionTxt],
    ["package.json", pkg.version],
    ["package-lock.json (root)", pkgLock.version],
    ['package-lock.json (packages[""])', pkgLock.packages?.[""]?.version],
    ["src-tauri/tauri.conf.json", tauriConf.version],
    ["src-tauri/Cargo.toml", readCargoPackageVersion(cargoToml)],
    ["src-tauri/Cargo.lock", readCargoLockVersion(cargoLock)],
  ];
}

function syncAll(targetVersion) {
  if (!SEMVER_RE.test(targetVersion)) {
    throw new Error(`Invalid semver version: "${targetVersion}"`);
  }

  fs.writeFileSync(versionFile, `${targetVersion}\n`, "utf8");

  const pkg = readJson(packageJsonPath);
  if (pkg.version !== targetVersion) {
    pkg.version = targetVersion;
    writeJson(packageJsonPath, pkg);
  }

  const pkgLock = readJson(packageLockPath);
  let lockChanged = false;
  if (pkgLock.version !== targetVersion) {
    pkgLock.version = targetVersion;
    lockChanged = true;
  }
  if (pkgLock.packages?.[""] && pkgLock.packages[""].version !== targetVersion) {
    pkgLock.packages[""].version = targetVersion;
    lockChanged = true;
  }
  if (lockChanged) {
    writeJson(packageLockPath, pkgLock);
  }

  const tauriConf = readJson(tauriConfPath);
  if (tauriConf.version !== targetVersion) {
    tauriConf.version = targetVersion;
    writeJson(tauriConfPath, tauriConf);
  }

  const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
  const nextCargoToml = updateCargoPackageVersion(cargoToml, targetVersion);
  if (nextCargoToml !== cargoToml) {
    fs.writeFileSync(cargoTomlPath, nextCargoToml, "utf8");
  }

  const cargoLock = fs.readFileSync(cargoLockPath, "utf8");
  const nextCargoLock = updateCargoLockVersion(cargoLock, targetVersion);
  if (nextCargoLock !== cargoLock) {
    fs.writeFileSync(cargoLockPath, nextCargoLock, "utf8");
  }
}

function stampChangelog(targetVersion, dateStr) {
  const changelog = fs.readFileSync(changelogPath, "utf8");
  if (changelog.includes(`## [${targetVersion}]`)) {
    return false;
  }
  if (!changelog.includes("## [Unreleased]")) {
    throw new Error("Could not find '## [Unreleased]' in CHANGELOG.md");
  }
  const updated = changelog.replace(
    "## [Unreleased]",
    `## [Unreleased]\n\n## [${targetVersion}] - ${dateStr}`,
  );
  fs.writeFileSync(changelogPath, updated, "utf8");
  return true;
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const releaseIdx = args.indexOf("--release");
const stampRelease = releaseIdx !== -1;
const explicitDate = stampRelease && args[releaseIdx + 1] && !args[releaseIdx + 1].startsWith("-")
  ? args[releaseIdx + 1]
  : new Date().toISOString().slice(0, 10);

const positional = args.filter((arg, i) => !arg.startsWith("-") && i !== releaseIdx + 1);

if (checkOnly) {
  const expected = fs.readFileSync(versionFile, "utf8").trim();
  if (!SEMVER_RE.test(expected)) {
    console.error(`Invalid VERSION file value: "${expected}"`);
    process.exit(1);
  }
  const entries = getAllVersions();
  const mismatched = entries.filter(([, value]) => value !== expected);
  if (mismatched.length > 0) {
    console.error(`Version drift detected (expected ${expected} from VERSION):`);
    for (const [label, value] of entries) {
      console.error(`  - ${label}: ${value}`);
    }
    process.exit(1);
  }
  console.log(`All app version files match ${expected}.`);
  process.exit(0);
}

const nextVersion = positional[0] || fs.readFileSync(versionFile, "utf8").trim();
syncAll(nextVersion);

let changelogMsg = "";
if (stampRelease) {
  const changed = stampChangelog(nextVersion, explicitDate);
  changelogMsg = changed
    ? ` and stamped CHANGELOG.md [${nextVersion}] - ${explicitDate}`
    : ` (CHANGELOG.md already has [${nextVersion}])`;
}

console.log(`Synced version ${nextVersion} across VERSION, package.json, package-lock.json, tauri.conf.json, Cargo.toml, and Cargo.lock${changelogMsg}.`);
