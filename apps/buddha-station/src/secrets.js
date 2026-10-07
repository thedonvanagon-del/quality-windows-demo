// API keys and tokens. On a Mac they go in the Keychain, the same locked
// vault Safari uses for your passwords. They never reach the browser page,
// the logs, or the station's JSON files.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SERVICE = "buddha-station";
const NAME_RE = /^[a-z0-9-]{1,40}$/;
// Printable ASCII with no quotes, backslashes or spaces. Every real key and
// token fits, and it means a value can never break out of a Keychain command.
const VALUE_RE = /^[\x21\x23-\x26\x28-\x5b\x5d-\x7e]{8,512}$/;

export class SecretError extends Error {}

function checkName(name) {
  if (!NAME_RE.test(name)) throw new SecretError("bad secret name");
}

export function checkValue(value) {
  if (typeof value !== "string" || !VALUE_RE.test(value.trim())) {
    throw new SecretError("That doesn't look like a valid key. Paste it again with no spaces.");
  }
  return value.trim();
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new SecretError(err.trim() || `exit ${code}`))));
    child.stdin.end(input ?? "");
  });
}

class KeychainSecrets {
  async get(name) {
    checkName(name);
    return new Promise((resolve) => {
      execFile("security", ["find-generic-password", "-a", name, "-s", SERVICE, "-w"], (err, stdout) => {
        resolve(err ? null : stdout.trim() || null);
      });
    });
  }

  async set(name, value) {
    checkName(name);
    const clean = checkValue(value);
    // Sent over stdin to `security -i`, so the key never shows up in the
    // process list where other programs could read it.
    await run("security", ["-i"], `add-generic-password -U -a ${name} -s ${SERVICE} -w "${clean}"\n`);
  }

  async remove(name) {
    checkName(name);
    await run("security", ["delete-generic-password", "-a", name, "-s", SERVICE]).catch(() => {});
  }
}

// For non-Mac machines (and tests): one file per secret, readable only by you.
class FileSecrets {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  async get(name) {
    checkName(name);
    try {
      return fs.readFileSync(path.join(this.dir, name), "utf8").trim() || null;
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  async set(name, value) {
    checkName(name);
    fs.writeFileSync(path.join(this.dir, name), checkValue(value), { mode: 0o600 });
  }

  async remove(name) {
    checkName(name);
    fs.rmSync(path.join(this.dir, name), { force: true });
  }
}

export function makeSecrets(home, { platform = process.platform } = {}) {
  const backend = platform === "darwin" && !process.env.BUDDHA_STATION_FILE_SECRETS
    ? new KeychainSecrets()
    : new FileSecrets(path.join(home, "secrets"));
  const cache = new Map();
  return {
    kind: backend instanceof KeychainSecrets ? "Mac Keychain" : "private file",
    async get(name) {
      if (!cache.has(name)) cache.set(name, await backend.get(name));
      return cache.get(name);
    },
    async set(name, value) {
      await backend.set(name, value);
      cache.set(name, checkValue(value));
    },
    async remove(name) {
      await backend.remove(name);
      cache.set(name, null);
    },
  };
}

// Shows the last four characters so you can tell keys apart. Never more.
export function hint(value) {
  return value ? `…${value.slice(-4)}` : null;
}
