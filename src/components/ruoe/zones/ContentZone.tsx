import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// Tooltips now handled inside renderer components
import { Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { SaveAndBackButton } from '@/components/ruoe/common/SaveAndBackButton';
import { computeEvaluationStats } from '@/utils/ruoe-stats';
import { EvaluationSummaryPills } from '@/components/ruoe/feedback/EvaluationSummaryPills';
import { ContentZoneProps, isTransformationLayout, isWordFormationLayout } from '@/types/ruoe';
import { buildTransformationContext } from '@/utils/ruoe-transformation';
import { GapRenderer } from '@/components/ruoe/renderers/GapRenderer';
import { TransformationRenderer } from '@/components/ruoe/renderers/TransformationRenderer';
import { WordFormationRenderer } from '@/components/ruoe/renderers/WordFormationRenderer';
import { getTaskInstructions } from '@/config/ruoe-task-instructions';

export const ContentZone: React.FC<ContentZoneProps> = ({
  title,
  content,
  questions,
  userAnswers,
  onGapClick,
  activeQuestionId,
  isEvaluated,
  taskType,
  isEvaluating = false,
  evaluationResults = {},
  hasPendingChanges: hasPendingChangesProp,
  isSaving: isSavingProp,
  onSaveAndExit
}) => {
  // Use prop-driven pending/saving status supplied by parent hook
  const gapRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  // Focus management for active question
  useEffect(() => {
    if (activeQuestionId && gapRefs.current[activeQuestionId]) {
      gapRefs.current[activeQuestionId]?.focus();
    }
  }, [activeQuestionId]);

  // Check task types using generic functions
  const isTransformation = isTransformationLayout(taskType);
  const isWordFormation = isWordFormationLayout(taskType);

  // Build a natural badge text: "B2 Use of English Part X - <instruction title>"
  const getPartBadgeText = () => {
    const basePart = (() => {
      const taskNames: { [key: string]: string } = {
        'B2_LANG_MC_CLOZE': 'B2 Use of English Part 1',
        'B2_LANG_OPEN_CLOZE': 'B2 Use of English Part 2',
        'B2_LANG_WORD_FORMATION': 'B2 Use of English Part 3',
        'B2_LANG_TRANSFORMATION': 'B2 Use of English Part 4',
        'C1_LANG_MC_CLOZE': 'C1 Use of English Part 1',
        'C1_LANG_OPEN_CLOZE': 'C1 Use of English Part 2',
        'C1_LANG_WORD_FORMATION': 'C1 Use of English Part 3',
        'C1_LANG_TRANSFORMATION': 'C1 Use of English Part 4',
      };
      return taskNames[taskType] || 'Use of English';
    })();

    const inst = getTaskInstructions(taskType);
    const instTitle = inst?.title ? ` - ${inst.title}` : '';
    return `${basePart}${instTitle}`;
  };

  // Detect titles that look like codes (fallback to part badge in that case)
  const looksLikeCodeTitle = (t: string | undefined) => {
    if (!t) return true;
    const trimmed = t.trim();
    // Similar heuristic as backend validation for reading
    const codeish = /^(B2|C1)_[A-Z_]+$/.test(trimmed) || /^[A-Z_]{6,}$/.test(trimmed);
    return codeish || trimmed.length < 8 || !/\s/.test(trimmed);
  };

  // Parse content and render with interactive gaps
  const renderContentWithGaps = () => {
    // For Part 3, use special word formation layout
    if (isWordFormation) {
      return renderWordFormationPairs();
    }

    // For Part 4, use special transformation layout
    if (isTransformation) {
      return renderTransformationPairs();
    }

    // For Parts 1-2, use the existing cloze layout
    const parts = [];
    let currentIndex = 0;

    // Sort questions by order to ensure correct placement
    const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

    sortedQuestions.forEach((question, index) => {
      const placeholder = `{{GAP_${question.order}}}`;
      const placeholderIndex = content.indexOf(placeholder, currentIndex);

      if (placeholderIndex !== -1) {
        // Add text before the gap
        if (placeholderIndex > currentIndex) {
          parts.push(
            <span key={`text-${index}`}>
              {content.substring(currentIndex, placeholderIndex)}
            </span>
          );
        }

        // Add the interactive gap
        parts.push(
          <GapRenderer
            key={question.id}
            question={question}
            questionIndex={index}
            userAnswer={userAnswers[question.id]}
            isActive={activeQuestionId === question.id}
            isEvaluated={isEvaluated}
            isEvaluating={isEvaluating}
            evaluationResults={evaluationResults}
            onGapClick={onGapClick}
            questions={sortedQuestions}
            gapRefs={gapRefs}
          />
        );

        // Update current index
        currentIndex = placeholderIndex + placeholder.length;
      }
    });

    // Add remaining text after last gap
    if (currentIndex < content.length) {
      parts.push(
        <span key="text-end">
          {content.substring(currentIndex)}
        </span>
      );
    }

    return parts;
  };

  // Render Part 4 transformation pairs
  const renderTransformationPairs = () => {
    const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

    return sortedQuestions.map((question) => {
      const transformationData = buildTransformationContext(question);

      return (
        <div key={question.id} className="mb-8 p-6 bg-white rounded-lg border border-gray-200">
          {/* Question Number */}
          <div className="text-lg font-semibold text-gray-900 mb-4">
            {question.displayOrder}.
          </div>

          {/* Original Sentence */}
          <div className="text-base text-gray-900 mb-3 leading-relaxed">
            {transformationData.originalSentence}
          </div>

          {/* Key Word - Centered and highlighted */}
          <div className="text-center py-2 mb-3">
            <span className="px-4 py-2 bg-blue-50 text-blue-900 font-medium rounded-md border border-blue-200">
              {transformationData.keyWord}
            </span>
          </div>

          {/* Transformation with Clickable Gap */}
          <div className="text-base text-gray-900 interactive-content-gaps">
            {renderTransformationWithGap(question, transformationData)}
          </div>
        </div>
      );
    });
  };

  // Render Part 3 word formation exercises
  const renderWordFormationPairs = () => {
    // For Part 3, we need to show the original content with gaps and root words
    const parts = [];
    let currentIndex = 0;

    // Sort questions by order to ensure correct placement
    const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

    sortedQuestions.forEach((question, index) => {
      const placeholder = `{{GAP_${question.order}}}`;
      const placeholderIndex = content.indexOf(placeholder, currentIndex);

      if (placeholderIndex !== -1) {
        // Add text before the gap
        if (placeholderIndex > currentIndex) {
          parts.push(
            <span key={`text-${index}`}>
              {content.substring(currentIndex, placeholderIndex)}
            </span>
          );
        }

        // Add the word formation gap with root word
        parts.push(
          <WordFormationRenderer
            key={question.id}
            question={question}
            questionIndex={index}
            userAnswer={userAnswers[question.id]}
            isActive={activeQuestionId === question.id}
            isEvaluated={isEvaluated}
            isEvaluating={isEvaluating}
            evaluationResults={evaluationResults}
            onGapClick={onGapClick}
            questions={sortedQuestions}
            gapRefs={gapRefs}
          />
        );

        // Update current index
        currentIndex = placeholderIndex + placeholder.length;
      }
    });

    // Add remaining text after last gap
    if (currentIndex < content.length) {
      parts.push(
        <span key="text-end">
          {content.substring(currentIndex)}
        </span>
      );
    }

    return parts;
  };


  // Render transformation sentence with interactive gap
  const renderTransformationWithGap = (
    question: ContentZoneProps['questions'][0],
    transformationData: ReturnType<typeof buildTransformationContext>
  ) => {
    const transformationSentence = transformationData.transformationSentence || 'Transformation with _______ gap.';
    const gapPattern = /_{2,}/; // Match multiple underscores (UI convention)

    if (!gapPattern.test(transformationSentence)) {
      // If no gap pattern found, just render the sentence with the gap button at the end
      return (
        <span>
          {transformationSentence}{' '}
          <TransformationRenderer
            question={question}
            questionIndex={questions.findIndex(q => q.id === question.id)}
            userAnswer={userAnswers[question.id]}
            isActive={activeQuestionId === question.id}
            isEvaluated={isEvaluated}
            isEvaluating={isEvaluating}
            evaluationResults={evaluationResults}
            onGapClick={onGapClick}
            questions={[...questions].sort((a, b) => a.order - b.order)}
            gapRefs={gapRefs}
          />
        </span>
      );
    }

    // Split by the gap pattern and insert the interactive gap
    const parts = transformationSentence.split(gapPattern);
    const result: React.ReactNode[] = [];

    parts.forEach((part, index) => {
      result.push(
        <span key={`part-${index}`}>{part}</span>
      );

      // Add gap after each part except the last
      if (index < parts.length - 1) {
        result.push(
          <TransformationRenderer
            key={`trans-gap-${question.id}-${index}`}
            question={question}
            questionIndex={questions.findIndex(q => q.id === question.id)}
            userAnswer={userAnswers[question.id]}
            isActive={activeQuestionId === question.id}
            isEvaluated={isEvaluated}
            isEvaluating={isEvaluating}
            evaluationResults={evaluationResults}
            onGapClick={onGapClick}
            questions={[...questions].sort((a, b) => a.order - b.order)}
            gapRefs={gapRefs}
          />
        );
      }
    });

    return result;
  };

  const getTaskTypeDisplayName = () => {
    const taskNames: { [key: string]: string } = {
      'B2_LANG_MC_CLOZE': 'B2 Use of English Part 1',
      'B2_LANG_OPEN_CLOZE': 'B2 Use of English Part 2',
      'B2_LANG_WORD_FORMATION': 'B2 Use of English Part 3',
      'B2_LANG_TRANSFORMATION': 'B2 Use of English Part 4',
      'C1_LANG_MC_CLOZE': 'C1 Use of English Part 1',
      'C1_LANG_OPEN_CLOZE': 'C1 Use of English Part 2',
      'C1_LANG_WORD_FORMATION': 'C1 Use of English Part 3',
      'C1_LANG_TRANSFORMATION': 'C1 Use of English Part 4',
    };
    return taskNames[taskType] || taskType;
  };

  const getAnsweredQuestions = () => {
    return questions.filter(q => userAnswers[q.id]).length;
  };

  const getTotalQuestions = () => {
    return questions.length;
  };

  // Get evaluation statistics (post-evaluation) using shared util
  const getEvaluationStats = () => {
    if (!isEvaluated) return null;
    return computeEvaluationStats(questions, userAnswers, evaluationResults);
  };

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            {/* Header strategy:
                - For P1–P3: show the exercise title if it looks natural; fallback to part label.
                - For P4 (transformations): keep legacy header (part label only) to avoid changing that UX now. */}
            {isTransformation ? (
              <CardTitle className="text-xl font-semibold mb-2">
                {getTaskTypeDisplayName()}
              </CardTitle>
            ) : (
              <>
                <CardTitle className="text-lg font-semibold mb-1">
                  {looksLikeCodeTitle(title) ? getTaskTypeDisplayName() : title}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className="text-sm w-fit">
                    {getPartBadgeText()}
                  </Badge>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 mt-1">
              {isEvaluated ? (
                (() => {
                  const stats = getEvaluationStats();
                  return (
                    <EvaluationSummaryPills
                      correct={stats?.correct || 0}
                      incorrect={stats?.incorrect || 0}
                      percentage={stats?.percentage || 0}
                    />
                  );
                })()
              ) : (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {getAnsweredQuestions()}/{getTotalQuestions()} answered
                  </Badge>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span>30 min</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEvaluated && onSaveAndExit && (
              <SaveAndBackButton
                hasPending={Boolean(hasPendingChangesProp)}
                isSaving={Boolean(isSavingProp)}
                onFlushAndBack={onSaveAndExit}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-3 scroll-stable">
        {isTransformation ? (
          // Part 4 uses its own card layout, no prose styling needed
          <div className="space-y-6">
            {renderContentWithGaps()}
          </div>
        ) : isWordFormation ? (
          // Part 3 uses prose styling but with special word formation gaps
          <div className="prose prose-base max-w-none text-justify interactive-content-gaps">
            {renderContentWithGaps()}
          </div>
        ) : (
          // Parts 1-2 use standard prose styling for reading text
          <div className="prose prose-base max-w-none text-justify interactive-content-gaps">
            {renderContentWithGaps()}
          </div>
        )}

        {/* Instructions for gap interaction */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {isEvaluated ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-blue-600" />
            )}
            <span className="font-medium text-blue-800">
              {isEvaluated ? 'Review Mode:' : 'How to use:'}
            </span>
          </div>
          {isEvaluated ? (
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <span className="inline-flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" /> Green</span> gaps show correct answers</li>
              <li>• <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3 text-red-600" /> Red</span> gaps show incorrect answers</li>
              <li>• <span className="inline-flex items-center gap-1"><AlertCircle className="h-3 w-3 text-gray-500" /> Gray</span> gaps were not answered</li>
              <li>• Hover over any gap to see detailed feedback and explanations</li>
              <li>• Click on gaps to view comprehensive feedback in the answer panel</li>
            </ul>
          ) : isWordFormation ? (
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Use the root word shown below each gap to complete the sentence</li>
              <li>• Transform the root word by adding prefixes, suffixes, or changing its form</li>
              <li>• Write only ONE word in each gap</li>
              <li>• Click on any gap to enter your transformation</li>
              <li>• Your answers are saved automatically as you type</li>
            </ul>
          ) : isTransformation ? (
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Read each original sentence and the given key word</li>
              <li>• Complete the second sentence using the key word unchanged</li>
              <li>• Use 2-5 words including the key word in your answer</li>
              <li>• Click on any gap to enter your transformation</li>
              <li>• Your answers are saved automatically as you type</li>
            </ul>
          ) : (
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Click on any numbered gap to select it</li>
              <li>• Use arrow keys to navigate between gaps</li>
              <li>• The selected gap will be highlighted and appear in the answer panel</li>
              <li>• Your answers are saved automatically as you type</li>
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
