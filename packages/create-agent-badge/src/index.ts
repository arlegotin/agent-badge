import { pathToFileURL } from "node:url";

export async function main(): Promise<string> {
  const message = "create-agent-badge is not implemented yet.";
  process.stdout.write(`${message}\n`);
  return message;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
