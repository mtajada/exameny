import React, { useState, useRef, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ReadingContentZoneProps,
  RuoEOption,
  RuoEQuestion,
  isGappedTextTask,
  isMultipleMatchingTask,
} from "@/types/ruoe";
import { escapeHtml } from "@/utils/html";
import { computeEvaluationStats } from "@/utils/ruoe-stats";
import { EvaluationSummaryPills } from "@/components/ruoe/feedback/EvaluationSummaryPills";
import { SaveAndBackButton } from "@/components/ruoe/common/SaveAndBackButton";
import { normalizeReadingHeadings } from "@/utils/reading-format";

export const ReadingContentZone: React.FC<ReadingContentZoneProps> = ({
  title,
  content,
  taskType,
  isEvaluated: _isEvaluated,
  exerciseData: _exerciseData,
  userAnswers,
  evaluationResults,
  hasPendingChanges,
  isSaving,
  onSaveAndExit,
  onGapClick,
}) => {
  const [fontSize] = useState<number>(16);
  const contentRef = useRef<HTMLDivElement>(null);

  // Extract task type display name
  const getTaskTypeDisplayName = () => {
    if (_exerciseData?.taskType?.name) {
      return _exerciseData.taskType.name;
    }
    const taskNames: Record<string, string> = {
      B1_READ_MCQ_SHORT: "B1 Reading Part 1 - Notices and Messages",
      B1_READ_MULTIPLE_MATCHING: "B1 Reading Part 2 - Matching (A–H)",
      B1_READ_MCQ_LONG: "B1 Reading Part 3 - Multiple Choice",
      B1_READ_GAPPED_TEXT: "B1 Reading Part 4 - Gapped Text",
      B2_READ_MCQ: "B2 Reading Part 5 - Multiple Choice",
      B2_READ_GAPPED_TEXT: "B2 Reading Part 6 - Gapped Text",
      B2_READ_MULTIPLE_MATCHING: "B2 Reading Part 7 - Multiple Matching",
      C1_READ_MCQ: "C1 Reading Part 5 - Multiple Choice",
      C1_READ_CROSS_TEXT: "C1 Reading Part 6 - Cross-Text Multiple Matching",
      C1_READ_GAPPED_TEXT: "C1 Reading Part 7 - Gapped Text",
      C1_READ_MULTIPLE_MATCHING: "C1 Reading Part 8 - Multiple Matching",
      C2_READ_MCQ: "C2 Reading Part 5 - Multiple Choice",
      C2_READ_GAPPED_TEXT: "C2 Reading Part 6 - Gapped Text",
      C2_READ_MULTIPLE_MATCHING: "C2 Reading Part 7 - Multiple Matching",
    };
    return taskNames[taskType] || "Reading Exercise";
  };

  // (Optional) Zoom controls can hook into fontSize if needed in future iterations.

  // Build gap replacements after formatting so we can keep the base text escaped.
  const gapReplacements = useMemo(() => {
    if (!isGappedTextTask(taskType)) return null;
    const exerciseData = _exerciseData;
    if (!exerciseData) return null;

    const allOptions: RuoEOption[] = exerciseData.options || [];
    const questions: RuoEQuestion[] = exerciseData.questions || [];

    // Map letter -> first option text
    const letterToText = new Map<string, string>();
    for (const opt of allOptions) {
      const letter = (opt.option_letter || "").trim().toUpperCase();
      if (!letter) continue;
      const candidate = opt.option_text || "";
      const prev = letterToText.get(letter) || "";
      // Prefer the longest meaningful text (guards against legacy rows where option_text was only the letter)
      const isTrivial = (s: string) => !s || /^[A-Z]$/.test(s.trim());
      const better = isTrivial(prev) || candidate.length > prev.length;
      if (better) {
        letterToText.set(letter, candidate);
      }
    }

    const replacements = new Map<number, string>();
    for (const q of questions) {
      const answer = userAnswers?.[q.id];
      const qid = q.id;
      const order = q.order;
      const displayOrder = q.displayOrder;
      if (answer) {
        const txt = letterToText.get(answer.trim().toUpperCase());
        if (txt) {
          // Keep filled gaps clickable (same UX philosophy as P2)
          replacements.set(
            order,
            `<span class="gap-inserted" data-qid="${qid}" data-order="${order}" data-display-order="${displayOrder}" role="button" tabindex="0" aria-label="Gap ${displayOrder}, answered. Click to review.">${escapeHtml(txt)}</span>`,
          );
          continue;
        }
      }
      // No answer yet: render a clickable placeholder button
      // We embed data attributes so we can delegate clicks from the container
      replacements.set(
        order,
        `<button type="button" class="gap-placeholder" data-qid="${qid}" data-order="${order}" data-display-order="${displayOrder}" aria-label="Gap ${displayOrder}, not answered. Click to answer.">(${displayOrder})</button>`,
      );
    }

    return replacements;
  }, [taskType, _exerciseData, userAnswers]);

  const resolvedContent = useMemo(() => {
    if (!isMultipleMatchingTask(taskType)) {
      return content;
    }

    const hasSectionHeadings = /Section\s+[A-Z]/.test(content);
    if (hasSectionHeadings) {
      return content;
    }

    const exerciseData = _exerciseData;
    const options = exerciseData?.options ?? [];
    if (!exerciseData || options.length === 0) {
      return content;
    }

    const sectionMap = new Map<string, string>();
    for (const option of options) {
      const letter = (option.option_letter || "").trim().toUpperCase();
      if (!letter) continue;
      const candidateRaw = (option.option_text || "").trim();
      if (!candidateRaw) continue;
      const existing = sectionMap.get(letter);
      // Prefer the longest meaningful text (guards against placeholder-only values)
      if (!existing || candidateRaw.length > existing.length) {
        sectionMap.set(letter, candidateRaw);
      }
    }

    if (sectionMap.size === 0) {
      return content;
    }

    const intro = content?.trim()?.length
      ? content.trim()
      : "Read the sections (labelled with capital letters) and decide which section matches each statement.";

    const sections = Array.from(sectionMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, entry]) => `Section ${letter}\n${entry}`);

    return `${intro}\n\n${sections.join("\n\n")}`.trim();
  }, [content, taskType, _exerciseData]);

  const formattedContent = useMemo(() => {
    const normalized = normalizeReadingHeadings(resolvedContent, taskType);
    if (!gapReplacements || gapReplacements.size === 0) {
      return normalized;
    }

    return normalized.replace(/\{\{GAP_(\d+)\}\}/gi, (match, gapNumber) => {
      const replacement = gapReplacements.get(Number(gapNumber));
      return replacement ?? match;
    });
  }, [resolvedContent, taskType, gapReplacements]);

  // Instructions are rendered in the right panel (TaskInstructionsPanel)

  // Compute stats only when evaluated and props provided
  const stats =
    _isEvaluated && userAnswers && evaluationResults
      ? computeEvaluationStats(
          _exerciseData.questions,
          userAnswers,
          evaluationResults,
        )
      : null;

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="text-sm w-fit">
                {getTaskTypeDisplayName()}
              </Badge>
              {_isEvaluated && stats && (
                <EvaluationSummaryPills
                  correct={stats.correct}
                  incorrect={stats.incorrect}
                  percentage={stats.percentage}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!_isEvaluated && onSaveAndExit && (
              <SaveAndBackButton
                hasPending={Boolean(hasPendingChanges)}
                isSaving={Boolean(isSaving)}
                onFlushAndBack={onSaveAndExit}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-3 scroll-stable">
        {/* Reading content */}
        <div
          ref={contentRef}
          className="reading-content leading-6 text-gray-700"
          style={{ fontSize: `${fontSize}px` }}
          onClick={(e) => {
            // Event delegation: detect clicks on placeholders or filled gaps
            const target = e.target as HTMLElement;
            const el = target.closest("[data-qid]") as HTMLElement | null;
            if (el && onGapClick) {
              const qid = Number(el.getAttribute("data-qid"));
              if (qid) onGapClick(qid);
            }
          }}
        >
          <div
            className="prose prose-base max-w-none text-justify leading-normal reading-content-prose interactive-content-gaps"
            dangerouslySetInnerHTML={{
              __html: formattedContent,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};
