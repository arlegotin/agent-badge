import type { NormalizedSessionSummary } from "../providers/session-summary.js";

export type AttributionEvidenceKind =
  | "repo-root"
  | "git-remote"
  | "normalized-cwd"
  | "transcript-correlation"
  | "user-override";

export type AttributionStatus = "included" | "ambiguous" | "excluded";

export interface AttributionEvidence {
  readonly kind: AttributionEvidenceKind;
  readonly matched: boolean;
  readonly detail: string;
}

export interface AttributedSession {
  readonly session: NormalizedSessionSummary;
  readonly status: AttributionStatus;
  readonly evidence: AttributionEvidence[];
  readonly reason: string;
  readonly overrideApplied: "include" | "exclude" | null;
}

export interface AttributionCounts {
  readonly included: number;
  readonly ambiguous: number;
  readonly excluded: number;
}

export interface AttributeBackfillSessionsResult {
  readonly sessions: AttributedSession[];
  readonly counts: AttributionCounts;
}
