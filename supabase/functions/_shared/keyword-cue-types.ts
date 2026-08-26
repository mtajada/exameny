export type KeywordCueLevel = "B2" | "C1" | "C2";

export interface KeywordCue {
  readonly id: string;
  readonly keyword: string;
  readonly operator: string;
  readonly frames: readonly string[];
  readonly variants: readonly string[];
  readonly notes?: string;
  readonly level: KeywordCueLevel;
}

export interface KeywordCuePlanEntry {
  readonly cueId: string;
  readonly keyword: string;
  readonly operator: string;
  readonly frame: string;
  readonly variants: readonly string[];
  readonly notes?: string;
  readonly skillFocusTag?: string;
  readonly level: KeywordCueLevel;
}

export interface KeywordCuePlanResult {
  readonly entries: readonly KeywordCuePlanEntry[];
  readonly sourceCues: readonly KeywordCue[];
  readonly metadata: {
    readonly appliedSkillFocusTag?: string;
    readonly fallbackToFullBank: boolean;
    readonly filteredCount: number;
    readonly totalAvailable: number;
  };
}
