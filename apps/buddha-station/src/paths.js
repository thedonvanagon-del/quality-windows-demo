// Every file path an agent hands us is untrusted model output. Everything in
// this file exists to keep those paths inside the one folder they're allowed
// to touch.

import fs from "node:fs/promises";
import path from "node:path";

export const MAX_READ_BYTES = 256 * 1024;
export const MAX_WRITE_BYTES = 1024 * 1024;
export const MAX_FILES_PER_FOLDER = 500;

// Text formats only. Nothing an agent writes can be double-clicked into a
// running program.
export const ALLOWED_EXTENSIONS = new Set([
  ".md", ".txt", ".csv", ".tsv", ".json", ".html", ".xml", ".yaml", ".yml",
]);

export class PathError extends Error {}

function splitRelative(relPath) {
  if (typeof relPath !== "string" || relPath.trim() === "") {
    throw new PathError("Give a file path like notes.md or drafts/email.txt.");
  }
  if (relPath.length > 200) throw new PathError("That path is too long.");
  if (relPath.includes("\0")) throw new PathError("That path has a null byte in it.");
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath) || relPath.startsWith("~")) {
    throw new PathError("Use a path inside your folder, not a full path.");
  }
  const parts = relPath.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");
  if (parts.length === 0) throw new PathError("Give a file name.");
  if (parts.length > 5) throw new PathError("That path has too many folders in it.");
  for (const part of parts) {
    if (part === "..") throw new PathError("Paths can't step outside your folder.");
    if (part.startsWith(".")) throw new PathError("Hidden files and folders are off limits.");
    if (!/^[\w .()+@,-]{1,80}$/u.test(part)) {
      throw new PathError(`"${part}" has characters that aren't allowed in a file name.`);
    }
  }
  return parts;
}

// Resolves relPath inside root. Refuses absolute paths, "..", hidden names and
// any symlink along the way, so nothing can point back out of the folder.
export async function resolveInside(root, relPath, { mustExist = false } = {}) {
  const parts = splitRelative(relPath);
  const realRoot = await fs.realpath(root);
  let current = realRoot;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      if (mustExist) throw new PathError(`There's no file called ${relPath}.`);
      return path.join(realRoot, ...parts);
    }
    if (stat.isSymbolicLink()) throw new PathError("Links aren't allowed here.");
    if (i < parts.length - 1 && !stat.isDirectory()) {
      throw new PathError(`${parts.slice(0, i + 1).join("/")} is a file, not a folder.`);
    }
  }
  return current;
}

export function checkExtension(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new PathError(
      `Only text files can be written: ${[...ALLOWED_EXTENSIONS].join(" ")}.`,
    );
  }
}

// A flat, safe file name for the Outbox. Keeps it readable and never lets it
// carry a folder or hidden-file prefix.
export function cleanFileName(name) {
  if (typeof name !== "string") throw new PathError("Give the file a name.");
  const base = name.split(/[\\/]/).pop().replace(/[^\w .()+@,-]/gu, "-").replace(/^[.\s-]+/, "");
  const trimmed = base.slice(0, 80).trim();
  if (!trimmed) throw new PathError("Give the file a name.");
  checkExtension(trimmed);
  return trimmed;
}

export async function listFiles(root) {
  const out = [];
  async function walk(dir, rel, depth) {
    if (depth > 5 || out.length >= MAX_FILES_PER_FOLDER) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, childRel, depth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        out.push({ path: childRel, bytes: stat.size, modified: stat.mtime.toISOString() });
        if (out.length >= MAX_FILES_PER_FOLDER) return;
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

export async function readTextFile(root, relPath) {
  const full = await resolveInside(root, relPath, { mustExist: true });
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new PathError(`${relPath} is a folder, not a file.`);
  if (stat.size > MAX_READ_BYTES) {
    throw new PathError(`${relPath} is ${Math.round(stat.size / 1024)} KB. The limit is ${MAX_READ_BYTES / 1024} KB.`);
  }
  const buf = await fs.readFile(full);
  if (buf.includes(0)) throw new PathError(`${relPath} isn't a text file.`);
  return buf.toString("utf8");
}

// Writes are atomic: a crash mid-write leaves the old file, never half a file.
export async function writeTextFile(root, relPath, content) {
  checkExtension(relPath);
  if (typeof content !== "string") throw new PathError("File content must be text.");
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_WRITE_BYTES) {
    throw new PathError(`That's ${Math.round(bytes / 1024)} KB. The limit is ${MAX_WRITE_BYTES / 1024} KB.`);
  }
  const full = await resolveInside(root, relPath);
  const existing = await fs.lstat(full).catch(() => null);
  if (!existing) {
    const count = (await listFiles(root)).length;
    if (count >= MAX_FILES_PER_FOLDER) throw new PathError("This folder is full. Tidy it up first.");
  } else if (!existing.isFile()) {
    throw new PathError(`${relPath} is a folder, not a file.`);
  }
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  // Re-check after mkdir: the parent chain must still be inside root.
  const parentReal = await fs.realpath(path.dirname(full));
  const rootReal = await fs.realpath(root);
  if (parentReal !== rootReal && !parentReal.startsWith(rootReal + path.sep)) {
    throw new PathError("Paths can't step outside your folder.");
  }
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, { mode: 0o600, flag: "wx" });
  await fs.rename(tmp, full);
  return { full, bytes, replaced: Boolean(existing) };
}
