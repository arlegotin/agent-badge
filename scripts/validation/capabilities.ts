import { reportCapabilities } from '../../packages/core/src/providers/capability-report.js';
console.log(JSON.stringify(await reportCapabilities({ repositoryId: '12345678-1234-4234-8234-123456789abc', enrolledRoots: [], signal: AbortSignal.timeout(10000) }, { roots: { codex: [], claude: [], gemini: [], opencode: [] } }), null, 2));
