import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { QuestionStepper } from '@/components/ruoe/navigation/QuestionStepper';
import { ChatPanel } from '@/components/ruoe/chat/ChatPanel';
import {
  ClarificationRequestContext,
  PendingClarificationPrompt,
  UnifiedRightPanelProps,
  isClozeLayout,
  isUseOfEnglishKeywordTransformationTask,
} from '@/types/ruoe';
import { TaskInstructionsPanel } from '@/components/ruoe/panels/TaskInstructionsPanel';
import { AnswerInputPanel } from '@/components/ruoe/panels/AnswerInputPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, CheckCircle, HelpCircle, Home } from 'lucide-react';
import { buildClarificationPrompt } from '@/utils/ruoe-clarification-prompt';

type TabType = 'instructions' | 'chat' | 'questions';

export const UnifiedRightPanel: React.FC<UnifiedRightPanelProps> = ({
  exerciseData,
  attemptId,
  activeQuestionId,
  onGapClick,
  currentQuestionIndex = 0,
  onQuestionSelect,
  userAnswers,
  onAnswerSave,
  isEvaluated,
  evaluationResults,
  onEvaluate,
  isEvaluating,
  evaluationData
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingClarificationPrompt | null>(null);
  const [isChatBusy, setIsChatBusy] = useState<boolean>(false);
  const navigate = useNavigate();
  const taskCode = exerciseData.taskType.task_code;
  const questions = exerciseData.questions;
  const isClozeTask = isClozeLayout(taskCode) || typeof activeQuestionId === 'number';

  const currentQuestion = useMemo(() => {
    if (isClozeTask && typeof activeQuestionId === 'number') {
      return questions.find(q => q.id === activeQuestionId) ?? null;
    }
    return questions[currentQuestionIndex] ?? null;
  }, [isClozeTask, activeQuestionId, questions, currentQuestionIndex]);

  const currentQuestionId = currentQuestion?.id;
  const currentAnswer = typeof currentQuestionId === 'number' ? (userAnswers[currentQuestionId] ?? '') : '';

  const questionOptions = exerciseData.options.filter(option => option.question_id === currentQuestionId);

  // Progress and navigation calculations (shared for reading/cloze)
  const totalQuestions = questions.length;

  const answeredCount = useMemo(() => (
    questions.reduce((acc, q) => acc + (userAnswers[q.id]?.trim() ? 1 : 0), 0)
  ), [questions, userAnswers]);

  const currentIndex = useMemo(() => {
    if (!isClozeTask) return currentQuestionIndex ?? 0;
    if (typeof activeQuestionId === 'number') {
      const idx = questions.findIndex(q => q.id === activeQuestionId);
      return idx >= 0 ? idx : -1;
    }
    return -1;
  }, [isClozeTask, currentQuestionIndex, activeQuestionId, questions]);

  const firstUnansweredIndex = useMemo(() => (
    questions.findIndex(q => !(userAnswers[q.id]?.trim()))
  ), [questions, userAnswers]);

  const unansweredCount = totalQuestions - answeredCount;

  const fallbackDisplayOrder = useMemo(() => {
    if (currentIndex >= 0) return currentIndex + 1;
    return totalQuestions > 0 ? 1 : 0;
  }, [currentIndex, totalQuestions]);

  const activeDisplayOrder = currentQuestion?.displayOrder ?? fallbackDisplayOrder;

  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 ? currentIndex < totalQuestions - 1 : totalQuestions > 0;

  const goToIndex = useCallback((index: number) => {
    if (index < 0 || index >= totalQuestions) return;
    if (!isClozeTask && onQuestionSelect) {
      onQuestionSelect(index);
    }
    if (isClozeTask && onGapClick) {
      const q = questions[index];
      if (q) onGapClick(q.id);
    }
  }, [isClozeTask, onGapClick, onQuestionSelect, questions, totalQuestions]);

  const handlePrev = useCallback(() => {
    if (currentIndex === -1) return; // no-op if none selected in cloze
    if (currentIndex > 0) goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  const handleNext = useCallback(() => {
    if (isClozeTask && currentIndex === -1) {
      goToIndex(0);
      return;
    }
    if (currentIndex < totalQuestions - 1) goToIndex(currentIndex + 1);
  }, [isClozeTask, currentIndex, goToIndex, totalQuestions]);

  const reviewUnanswered = useCallback(() => {
    if (firstUnansweredIndex >= 0) {
      goToIndex(firstUnansweredIndex);
    }
  }, [firstUnansweredIndex, goToIndex]);

  const handleEvaluateClick = useCallback(() => {
    if (isEvaluating) return;
    if (unansweredCount > 0) {
      setShowConfirmDialog(true);
      return;
    }
    setShowConfirmDialog(true);
  }, [isEvaluating, unansweredCount]);

  const handleAnswerChange = async (answer: string) => {
    if (typeof currentQuestionId === 'number') {
      await onAnswerSave(currentQuestionId, answer);
    } else {
      console.error('🚨 No currentQuestionId for answer save:');
    }
  };

  const handleChatBusyChange = useCallback((busy: boolean) => {
    setIsChatBusy(busy);
  }, []);

  const handlePromptConsumed = useCallback((id: string) => {
    setPendingPrompt((current) => (current?.id === id ? null : current));
  }, []);

  const handleRequestClarification = useCallback((context: ClarificationRequestContext) => {
    if (!context) return;
    if (isChatBusy) {
      return;
    }

    const message = buildClarificationPrompt(context);
    if (!message.trim()) {
      return;
    }

    const promptId = (() => {
      const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { crypto?: Crypto }).crypto : undefined;
      if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
        return globalCrypto.randomUUID();
      }
      return `clarify-${Date.now()}`;
    })();

    setActiveTab('chat');
    setPendingPrompt({ id: promptId, message, intent: 'ruoe_clarification' });
  }, [isChatBusy]);

  // Instructions now centralized in config

  // Helper function to get Part 4 transformation data from keyword
  // Part 4 transformation template now handled inside AnswerInputPanel via getTransformationTemplate



  // Extracted: renderEvaluationFeedback and renderInstructionsTab


  const renderQuestionsTab = () => {
    return (
      <div className="h-full min-h-0 flex flex-col">
        {/* Scrollable content */}
        {/* Remove top padding so sticky header hugs the top without leaving a gap. */}
        <div className="flex-1 overflow-y-auto pl-2 pr-4 scroll-stable">
          {/* Question Navigation for Reading Layout */}
          {!isClozeTask && onQuestionSelect && (
            <div className="sticky top-0 z-10 bg-white pt-2 pb-1">
              <QuestionStepper
                questions={exerciseData.questions}
                currentQuestionIndex={currentQuestionIndex}
                answeredById={userAnswers}
                evaluationById={evaluationResults}
                isEvaluated={isEvaluated}
                onSelect={onQuestionSelect}
              />
            </div>
          )}

          {/* Current Question Display */}
          <div>
            {/* Enhanced Question Header for Use of English Part 4 */}
            {isUseOfEnglishKeywordTransformationTask(taskCode) ? (
              <div className="border-b border-gray-200 pb-4 mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Question {activeDisplayOrder}
                  </h3>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                    Part 4
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Key word transformation
                </p>
              </div>
            ) : (
              <h3 className="font-semibold text-lg mb-2 text-gray-900">
                Question {currentQuestion ? currentQuestion.displayOrder : ''}
                {currentQuestion?.question_text && !isUseOfEnglishKeywordTransformationTask(taskCode) && (
                  <span className="block text-base text-gray-800 leading-relaxed mt-1">
                    {currentQuestion.question_text}
                  </span>
                )}
              </h3>
            )}
          </div>

          {/* Answer Input + Inline Feedback */}
          <div className="space-y-4 pb-3">
            <AnswerInputPanel
              taskCode={taskCode}
              exerciseData={exerciseData}
              currentQuestion={currentQuestion}
              currentAnswer={currentAnswer}
              questionOptions={questionOptions}
              isEvaluated={isEvaluated}
              isEvaluating={isEvaluating}
              isClozeLayout={isClozeTask}
              evaluationResults={evaluationResults}
              evaluationData={evaluationData || undefined}
              onRequestClarification={handleRequestClarification}
              isChatBusy={isChatBusy}
              onAnswerChange={handleAnswerChange}
            />
          </div>
        </div>

        {/* Non-scrollable footer (no overlay) */}
        <div
          className="flex-shrink-0 bg-white border-t pt-2 pb-1"
          role="navigation"
          aria-label="Bottom question navigation"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              handlePrev();
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              handleNext();
            }
          }}
        >
          {/* Navigation bar */}
          <div className="flex items-center justify-between gap-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={handlePrev}
              disabled={!canPrev}
              aria-label="Previous question"
              title="Previous question"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>

            <div className="text-xs sm:text-sm text-gray-600 select-none">
              {currentIndex >= 0 ? (
                <>Question {activeDisplayOrder} of {totalQuestions}</>
              ) : (
                <>Select a question to begin</>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={handleNext}
              disabled={!canNext}
              aria-label="Next question"
              title="Next question"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Action: Evaluate (pre) or Back (post) */}
          <div className="pt-2">
            {!isEvaluated ? (
              <>
                {unansweredCount > 0 && answeredCount > 0 && (
                  <div className="flex items-center justify-center text-xs text-gray-600 mb-2">
                    <HelpCircle className="h-3.5 w-3.5 mr-1 text-amber-500" />
                    You still have {unansweredCount} unanswered {unansweredCount === 1 ? 'question' : 'questions'}
                  </div>
                )}
                <Button
                  onClick={handleEvaluateClick}
                  disabled={isEvaluating || answeredCount === 0}
                  className="w-full"
                  size="lg"
                  variant={unansweredCount > 0 ? 'secondary' : 'default'}
                >
                  {isEvaluating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2"></div>
                      Evaluating...
                    </>
                  ) : (
                    'Evaluate Answers'
                  )}
                </Button>
              </>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => navigate('/dashboard')}
                aria-label="Back to dashboard"
                title="Back to dashboard"
              >
                <Home className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getTabButtonClass = (tab: TabType) => {
    const baseClass = "flex items-center justify-center px-1.5 sm:px-3 md:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap tracking-tight sm:tracking-normal min-w-0";
    if (activeTab === tab) {
      // Using exact Exameny Blue from design guide: #2563EB
      return `${baseClass} bg-[#2563EB] text-white shadow-sm`;
    }
    return `${baseClass} text-[#4B5563] hover:bg-gray-100 hover:text-[#374151]`;
  };

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-2 w-full">
          <Button
            variant="ghost"
            className={getTabButtonClass('instructions')}
            onClick={() => setActiveTab('instructions')}
            title="Instructions"
            aria-label="View exercise instructions"
          >
            Instructions
          </Button>
          <Button
            variant="ghost"
            className={getTabButtonClass('chat')}
            onClick={() => setActiveTab('chat')}
            title="Chat"
            aria-label="Open chat with AI assistant"
          >
            Chat
          </Button>
          <Button
            variant="ghost"
            className={getTabButtonClass('questions')}
            onClick={() => setActiveTab('questions')}
            title="Questions"
            aria-label="View exercise questions"
          >
            Questions
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pt-0 min-h-0">
        <div className="h-full min-h-0">
          {/* Instructions Tab */}
          <div
            className={`h-full min-h-0 ${activeTab === 'instructions' ? 'block' : 'hidden'}`}
            style={{ display: activeTab === 'instructions' ? 'block' : 'none' }}
          >
            <TaskInstructionsPanel
              taskCode={taskCode}
              userAnswers={userAnswers}
              questionsLength={exerciseData.questions.length}
              isEvaluated={isEvaluated}
            />
          </div>

          {/* Chat Tab - Always rendered to prevent unmounting and state loss */}
          <div
            className={`h-full min-h-0 ${activeTab === 'chat' ? 'block' : 'hidden'}`}
            style={{ display: activeTab === 'chat' ? 'block' : 'none' }}
          >
            <ChatPanel
              exerciseData={exerciseData}
              attemptId={attemptId}
              isEvaluated={isEvaluated}
              userAnswers={userAnswers}
              currentQuestionId={currentQuestionId}
              evaluationResults={evaluationResults}
              evaluationData={evaluationData}
              pendingPrompt={pendingPrompt}
              onPromptConsumed={handlePromptConsumed}
              onChatBusyChange={handleChatBusyChange}
            />
          </div>

          {/* Questions Tab */}
          <div
            className={`h-full min-h-0 ${activeTab === 'questions' ? 'block' : 'hidden'}`}
            style={{ display: activeTab === 'questions' ? 'block' : 'none' }}
          >
            {renderQuestionsTab()}
          </div>
        </div>
        {/* Back button now appears inside the Questions sticky footer */}
      </CardContent>
    {/* Confirmation Dialog */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {unansweredCount > 0 ? (
              <HelpCircle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
            Ready to evaluate?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {unansweredCount > 0 ? (
              <>You still have {unansweredCount} unanswered {unansweredCount === 1 ? 'question' : 'questions'}. You can review them or evaluate now.</>
            ) : (
              <>You have answered all {totalQuestions} questions. Evaluate now?</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="w-full justify-center sm:!justify-center sm:!space-x-0 gap-3">
          {/* Incomplete flow: offer review first */}
          {unansweredCount > 0 ? (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowConfirmDialog(false);
                  reviewUnanswered();
                }}
              >
                Review unanswered
              </Button>
              <AlertDialogAction
                className="flex-1"
                onClick={async () => {
                  setShowConfirmDialog(false);
                  await onEvaluate();
                }}
              >
                Evaluate anyway
              </AlertDialogAction>
            </>
          ) : (
            <>
              <AlertDialogCancel className="flex-1 !mt-0 sm:!mt-0">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="flex-1"
                onClick={async () => {
                  setShowConfirmDialog(false);
                  await onEvaluate();
                }}
              >
                Evaluate
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </Card>
  );
};
