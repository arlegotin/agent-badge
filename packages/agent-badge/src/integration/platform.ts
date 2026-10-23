/** Native Windows cannot satisfy the repository storage durability contract. */
export const UNSUPPORTED_PLATFORM_MESSAGE = 'agent-badge: Native Windows is unsupported. Run Agent Badge and the coding agent in Linux/WSL2, or use macOS.';
export class UnsupportedPlatformError extends Error {
  constructor(readonly command?: string) { super(UNSUPPORTED_PLATFORM_MESSAGE); this.name = 'UnsupportedPlatformError'; }
}
export function assertSupportedPlatform(command?: string): void {
  if (process.platform === 'win32') throw new UnsupportedPlatformError(command);
}
