import { spawn } from "node:child_process";

/** Automatic supervisors must queue before spawning on unsupported platforms.
 * Windows manual invocations use taskkill /T, which cannot guarantee cleanup of
 * descendants after their parent exits. POSIX invocations own a process group.
 */
export const gitProcessCapabilities = Object.freeze({
  treeCleanup: process.platform === "win32" ? "best-effort" : "process-group",
  automaticDeadlineEnforced: process.platform !== "win32"
} as const);

export interface GitRunOptions {
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly indexFile?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly input?: string | Uint8Array;
  /** All free-form stderr is suppressed, including any supplied private tokens. */
  readonly redact?: readonly string[];
}

export interface GitRunResult {
  readonly status: "ok" | "error" | "timeout" | "aborted" | "output-limit" | "spawn-error";
  readonly exitCode: number | null;
  /** Private protocol output. Never include this in public artifacts or diagnostics. */
  readonly stdout: string;
  /** Bounded static diagnostic; raw Git stderr may contain private filenames. */
  readonly stderr: string;
}

function diagnostic(value: string, limit: number): string {
  if (!value) return "";
  // Arbitrary Git messages can contain bare filenames or partial credentials.
  // Preserve only a finite severity label, never free-form stderr fragments.
  const severity = /^(fatal|error|warning|hint):/m.exec(value)?.[1];
  const safe = `${severity ? `${severity}: ` : ""}Git diagnostic details suppressed`;
  return safe.slice(0, limit);
}

/** argv only; ambient Git repository/index overrides are deliberately ignored. */
export async function runGit(args: readonly string[], options: GitRunOptions): Promise<GitRunResult> {
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 2000;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("Invalid Git subprocess limits");
  }
  if (options.signal?.aborted) return { status: "aborted", exitCode: null, stdout: "", stderr: "" };
  const env = { ...process.env };
  // Preserve configured policy and authentication transport settings. Only Git's
  // inherited repository-local routing must not redirect this cwd invocation.
  for (const key of ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_SHALLOW_FILE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_REPLACE_REF_BASE"]) delete env[key];
  Object.assign(env, options.env, { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_OPTIONAL_LOCKS: "0" });
  if (options.indexFile) env.GIT_INDEX_FILE = options.indexFile;

  return new Promise(resolve => {
    const child = spawn("git", [...args], { cwd: options.cwd, env, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let status: GitRunResult["status"] | undefined;
    let bytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    function killTree(): void {
      if (!child.pid) return;
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill("SIGKILL"));
      } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already reaped. */ }
      }
    }
    function stop(reason: GitRunResult["status"]): void {
      status ??= reason;
      killTree();
    }
    function collect(target: Buffer[], chunk: Buffer): void {
      const remaining = Math.max(0, maxOutputBytes - bytes);
      target.push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop("output-limit");
    }
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.stdin.on("error", () => { /* Exit status reports early stdin closure. */ });
    child.stdin.end(options.input);
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const abort = (): void => stop("aborted");
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.on("error", () => { status ??= "spawn-error"; });
    child.on("close", code => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      killTree();
      resolve({
        status: status ?? (code === 0 ? "ok" : "error"), exitCode: code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: diagnostic(status === "output-limit" ? "[output truncated]" : Buffer.concat(stderr).toString("utf8"), maxOutputBytes)
      });
    });
  });
}
