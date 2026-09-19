#!/usr/bin/env node
// Paperstrike launcher: `npx paperstrike` sets everything up and starts the app.
//
//   ~/.paperstrike/state/          your broker keys (.env) and paper account (paper.db)
//   ~/.paperstrike/app/<version>/  the installed app: Python venv, node_modules, build
//
// First run installs Python + Node dependencies and builds the web app (a few
// minutes). Later runs start in seconds. No dependencies of its own — Node
// built-ins only, so npx has nothing to download beyond this package.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));
const WIN = process.platform === "win32";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const HOME = process.env.PAPERSTRIKE_HOME || path.join(os.homedir(), ".paperstrike");
const STATE = path.join(HOME, "state");
const APP = path.join(HOME, "app", version);
const WEB_PORT = Number(opt("--port", 3000));
const API_PORT = Number(opt("--api-port", 8000));

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1), dim = c(2), green = c(32), red = c(31), yellow = c(33);
const log = (s = "") => console.log(s);
const step = (s) => log(`${green("›")} ${s}`);
const die = (s) => {
  log(`\n${red("✖")} ${s}`);
  process.exit(1);
};

if (flag("--help") || flag("-h")) {
  log(`${bold("paperstrike")} ${dim("v" + version)} — practice NSE options with real data, zero real money

  ${bold("npx paperstrike")}              install (first run) and start the app
  ${bold("npx paperstrike --no-open")}    don't open the browser
  ${bold("npx paperstrike --port 3001")}  web port (default 3000); --api-port for the data service (8000)
  ${bold("npx paperstrike --reinstall")}  rebuild the app from scratch (your keys and account are kept)

  Data lives in ${HOME}`);
  process.exit(0);
}

// ── prerequisites ──────────────────────────────────────────────────
function findPython() {
  const candidates = WIN ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  for (const [cmd, ...pre] of candidates) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print('%d.%d'%sys.version_info[:2])"], { encoding: "utf8" });
    if (r.status !== 0) continue;
    const [maj, min] = r.stdout.trim().split(".").map(Number);
    if (maj === 3 && min >= 10) return { cmd, pre, ver: `${maj}.${min}` };
  }
  return null;
}

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: opts.quiet ? "pipe" : "inherit", shell: opts.shell ?? false, ...opts });
  if (r.status !== 0) {
    if (opts.quiet) process.stdout.write((r.stdout || "") + (r.stderr || ""));
    die(`${opts.what ?? cmd} failed (exit ${r.status}).`);
  }
}

const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true))).listen(port, "127.0.0.1");
  });

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url) {
  const [cmd, argv] = WIN ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, argv, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

// ── install ────────────────────────────────────────────────────────
const venvPy = path.join(APP, "data", ".venv", WIN ? "Scripts/python.exe" : "bin/python");
const npm = WIN ? "npm.cmd" : "npm";

function install(py) {
  log(`\n${bold("Setting up Paperstrike")} ${dim("v" + version)} — first run takes a few minutes.\n`);
  rmSync(APP, { recursive: true, force: true });
  mkdirSync(APP, { recursive: true });
  const skip = new Set([".venv", "node_modules", ".next", ".env", ".env.local", "paper.db", "__pycache__", ".pytest_cache"]);
  for (const part of ["data", "web"]) {
    cpSync(path.join(PKG_DIR, part), path.join(APP, part), {
      recursive: true,
      filter: (src) => !skip.has(path.basename(src)),
    });
  }

  step(`Python ${py.ver}: creating virtual environment`);
  run(py.cmd, [...py.pre, "-m", "venv", path.join(APP, "data", ".venv")], { what: "python -m venv" });
  step("Installing data-service packages (pip)");
  run(venvPy, ["-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", "requirements.txt"], {
    cwd: path.join(APP, "data"),
    what: "pip install",
  });

  step("Installing web packages (npm)");
  run(npm, ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: path.join(APP, "web"), shell: WIN, what: "npm ci" });

  step("Building the web app");
  writeFileSync(path.join(APP, "web", ".env.local"), `NEXT_PUBLIC_DATA_URL=http://localhost:${API_PORT}\n`);
  run(npm, ["run", "build"], { cwd: path.join(APP, "web"), shell: WIN, quiet: true, what: "next build" });

  writeFileSync(path.join(APP, ".installed"), JSON.stringify({ version, apiPort: API_PORT, at: new Date().toISOString() }));
  log();
}

function installedFor() {
  try {
    return JSON.parse(readFileSync(path.join(APP, ".installed"), "utf8"));
  } catch {
    return null;
  }
}

// ── main ───────────────────────────────────────────────────────────
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) die(`Node 20 or newer is required (you have ${process.versions.node}). Get it at https://nodejs.org`);

const py = findPython();
if (!py) die("Python 3.10 or newer is required. Get it at https://www.python.org/downloads/ (tick “Add to PATH” on Windows).");

mkdirSync(STATE, { recursive: true });
const inst = installedFor();
// the data-service URL is baked into the web build, so a new --api-port means a rebuild
if (flag("--reinstall") || !inst || inst.apiPort !== API_PORT) install(py);

for (const [port, what] of [[WEB_PORT, "--port"], [API_PORT, "--api-port"]]) {
  if (!(await portFree(port))) die(`Port ${port} is already in use. Stop whatever is using it or pass ${what} <other port>.`);
}

const webUrl = `http://localhost:${WEB_PORT}`;
const children = [];
const env = {
  ...process.env,
  DATA_DIR: STATE,
  WEB_ORIGIN: `${webUrl},http://127.0.0.1:${WEB_PORT}`,
  PYTHONUNBUFFERED: "1",
};

step("Starting the data service");
children.push(
  spawn(venvPy, ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", String(API_PORT), "--log-level", "warning"], {
    cwd: path.join(APP, "data"),
    env,
    stdio: ["ignore", "inherit", "inherit"],
  })
);
step("Starting the web app");
children.push(
  spawn(npm, ["run", "start", "--", "-p", String(WEB_PORT), "-H", "127.0.0.1"], {
    cwd: path.join(APP, "web"),
    env,
    shell: WIN,
    stdio: ["ignore", "ignore", "inherit"],
  })
);

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const ch of children) {
    if (ch.exitCode !== null) continue;
    if (WIN) spawnSync("taskkill", ["/pid", String(ch.pid), "/t", "/f"], { stdio: "ignore" });
    else ch.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
for (const ch of children) ch.on("exit", (code) => !stopping && (log(red(`\nA service stopped (exit ${code}).`)), stop(1)));

const ok = (await waitFor(`http://127.0.0.1:${API_PORT}/health`, 60_000)) && (await waitFor(`http://127.0.0.1:${WEB_PORT}`, 60_000));
if (!ok) {
  log(red("Paperstrike didn't come up in time."));
  stop(1);
}

log(`
  ${bold(green("Paperstrike is running"))}  →  ${bold(webUrl)}

  ${dim("1.")} Open Settings → ${bold("Connect your broker")} (Upstox or Groww, your own keys)
  ${dim("2.")} Trade the live option chain with virtual money
  ${dim("Keys & account:")} ${STATE}
  ${yellow("Ctrl+C")} to stop
`);
if (!flag("--no-open")) openBrowser(`${webUrl}/trade`);
