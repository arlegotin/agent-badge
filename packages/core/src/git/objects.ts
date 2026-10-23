import { createHash } from "node:crypto";
import {
  ProtocolError,
  PUBLIC_OBJECT_MAX_BYTES,
} from "../domain/capabilities.js";
import { runGit, GitStreamError } from "./process.js";
/** Inspect only the bounded objects about to be read. Whole-tree size discovery
 * opens every historical blob even when most inventory is already verified. */
export async function readGitBlobSizes(
  cwd: string,
  oids: readonly string[],
  options: { signal: AbortSignal; deadline: number }
): Promise<number[]> {
  if (
    !oids.length ||
    oids.length > 4096 ||
    oids.some((oid) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
  )
    throw new ProtocolError("invalid-record");
  options.signal.throwIfAborted();
  if (options.deadline <= Date.now()) throw new GitStreamError("timeout");
  const result = await runGit(
    [
      "--no-replace-objects",
      "-c",
      "core.hooksPath=/dev/null",
      "cat-file",
      "--batch-check",
    ],
    {
      cwd,
      signal: options.signal,
      timeoutMs: options.deadline - Date.now(),
      maxOutputBytes: oids.length * 128,
      input: oids.map((oid) => oid + "\n").join(""),
      env: { GIT_NO_REPLACE_OBJECTS: "1" },
    }
  );
  if (result.status !== "ok") throw new GitStreamError(result.status);
  const lines = result.stdout.split("\n");
  if (lines.pop() !== "" || lines.length !== oids.length)
    throw new ProtocolError("invalid-record");
  return lines.map((line, i) => {
    const match = /^([a-f0-9]+) blob (0|[1-9][0-9]*)$/.exec(line);
    if (!match || match[1] !== oids[i])
      throw new ProtocolError("invalid-record");
    const size = Number(match[2]);
    if (!Number.isSafeInteger(size) || size > PUBLIC_OBJECT_MAX_BYTES)
      throw new ProtocolError("object-too-large");
    return size;
  });
}
/** Shared bounded blob transfer. Git OID, type and exact framing are checked for
 * every object before provider-independent public validators consume its bytes. */
export async function readVerifiedGitBlobs(
  cwd: string,
  blobs: readonly { oid: string; size: number }[],
  options: { signal: AbortSignal; deadline: number }
): Promise<Buffer[]> {
  const limit = blobs.reduce((sum, blob) => sum + blob.size + 128, 0);
  if (
    !blobs.length ||
    blobs.length > 4096 ||
    limit > 16 * 1024 * 1024 ||
    blobs.some(
      (blob) =>
        !Number.isSafeInteger(blob.size) ||
        blob.size < 0 ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(blob.oid)
    )
  )
    throw new ProtocolError("invalid-record");
  options.signal.throwIfAborted();
  if (options.deadline <= Date.now()) throw new GitStreamError("timeout");
  const result = await runGit(
    [
      "--no-replace-objects",
      "-c",
      "core.hooksPath=/dev/null",
      "cat-file",
      "--batch",
    ],
    {
      cwd,
      signal: options.signal,
      timeoutMs: options.deadline - Date.now(),
      maxOutputBytes: limit,
      input: blobs.map((blob) => blob.oid + "\n").join(""),
      env: { GIT_NO_REPLACE_OBJECTS: "1" },
    }
  );
  if (result.status !== "ok") throw new GitStreamError(result.status);
  const bytes = Buffer.from(result.stdout, "utf8"),
    bodies: Buffer[] = [];
  let cursor = 0;
  for (const blob of blobs) {
    options.signal.throwIfAborted();
    const end = bytes.indexOf(10, cursor);
    if (
      end < cursor ||
      bytes.subarray(cursor, end).toString("ascii") !==
        `${blob.oid} blob ${blob.size}`
    )
      throw new ProtocolError("invalid-record");
    cursor = end + 1;
    const body = bytes.subarray(cursor, cursor + blob.size);
    cursor += blob.size;
    if (
      body.length !== blob.size ||
      bytes[cursor++] !== 10 ||
      createHash(blob.oid.length === 40 ? "sha1" : "sha256")
        .update(`blob ${blob.size}\0`)
        .update(body)
        .digest("hex") !== blob.oid
    )
      throw new ProtocolError("invalid-record");
    bodies.push(body);
  }
  if (cursor !== bytes.length) throw new ProtocolError("invalid-record");
  return bodies;
}
