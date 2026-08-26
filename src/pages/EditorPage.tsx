import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth.ts';
import { Button } from '@/components/ui/button.tsx';
import { useToast } from '@/components/ui/use-toast.ts';
import { Loader2 } from 'lucide-react';
import { useSubmissionTimer } from '@/hooks/useSubmissionTimer.ts';
import FixedViewportPage from '@/components/layout/FixedViewportPage.tsx';
import { ExamTwoPaneFrame } from '@/components/ruoe/layouts/ExamTwoPaneFrame.tsx';
import { WritingEditorPanel, WritingRightPanel } from '@/components/writing/index.ts';

// Types (Already in English, well-defined)
type Submission = {
  id: string;
  submission_text: string | null;
  word_count: number | null;
  task_type_id: number | null;
  time_spent_seconds?: number | null;
  last_timer_synced_at?: string | null;
  ai_generated_prompt_text?: string | null;
  assigned_prompt?: {
    prompt_text: string | null;
    taskType?: {
      default_time_minutes: number | null;
      exam_id: number;
      level_id: number;
    };
  } | null;
};

type AIPromptDetails = {
  promptText: string;
  suggestedTimeMinutes: number;
  taskTypeId: number;
  examId: number;
  levelId: number;
};

// Small helper to normalize unknown errors to a readable message
function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try { return JSON.stringify(e); } catch { return 'Unknown error'; }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function EditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, activeMembershipId, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();

  const state = location.state as {
    submissionId?: string;
    assignedPromptId?: string;
    aiGeneratedPromptText?: string;
    suggestedTimeMinutes?: number;
    taskTypeId?: number;
    examId?: number;
    levelId?: number;
  } | null;

  const submissionIdFromState = state?.submissionId;
  const assignedPromptIdFromState = state?.assignedPromptId;
  const aiPromptDetailsFromState: AIPromptDetails | undefined = useMemo(() => {
    if (
      state?.aiGeneratedPromptText &&
      state?.suggestedTimeMinutes != null &&
      state?.taskTypeId != null
    ) {
      return {
        promptText: state.aiGeneratedPromptText,
        suggestedTimeMinutes: state.suggestedTimeMinutes,
        taskTypeId: state.taskTypeId,
        examId: state.examId!,
        levelId: state.levelId!,
      };
    }
    return undefined;
  }, [state]);

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [currentDraftText, setCurrentDraftText] = useState<string>('');
  const [wordCount, setWordCount] = useState<number>(0);
  const [promptText, setPromptText] = useState<string>('');
  const [suggestedTimeMinutes, setSuggestedTimeMinutes] = useState<number>(0);
  const [taskTypeId, setTaskTypeId] = useState<number | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [levelId, setLevelId] = useState<number | null>(null);
  const [timeSpentSeconds, setTimeSpentSeconds] = useState<number>(0);
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>>([]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const initialFetchDone = useRef(false);

  const {
    formatted: formattedTimerValue,
    isSyncing: isTimerSyncing,
    syncWithServer: syncSubmissionTime,
    getTotalSeconds: getSubmissionTotalSeconds,
    markSynced: markSubmissionTimeSynced,
    pause: pauseSubmissionTimer,
    resume: resumeSubmissionTimer,
  } = useSubmissionTimer({ submissionId, initialSeconds: timeSpentSeconds });

  useEffect(() => {
    if (!user) {
      setError("User not authenticated.");
      setIsLoadingPage(false);
      initialFetchDone.current = true;
      return;
    }

    if (isAuthLoading) {
      setIsLoadingPage(true);
      return;
    }

    const membershipRequiredForEditor = Boolean(assignedPromptIdFromState || aiPromptDetailsFromState);
    if (membershipRequiredForEditor && activeMembershipId == null) {
      setError("Could not determine your academy membership. Please try again.");
      setIsLoadingPage(false);
      return;
    }

    const initializeEditor = async () => {
      if (!submissionIdFromState && !assignedPromptIdFromState && !aiPromptDetailsFromState) {
        setError("Could not determine which task to load. Please try again.");
        setIsLoadingPage(false);
        initialFetchDone.current = true;
        return;
      }

      setIsLoadingPage(true);
      setError(null);

      try {
        let fetchedPromptText: string = '';
        let fetchedTaskTypeId: number | null = null;
        let fetchedTime: number = 0;
        // No need for existingSubmissionId, existingSubmissionText, existingWordCount here as they are set directly

        if (submissionIdFromState) {
          const draftAccessFilter =
            activeMembershipId == null
              ? `and(student_membership_id.is.null,student_id.eq.${user.id})`
              : `student_membership_id.eq.${activeMembershipId},and(student_membership_id.is.null,student_id.eq.${user.id})`;
          const { data: draftById, error: draftByIdError } = await supabase
            .from('submissions')
            .select(`
                    id, submission_text, word_count, time_spent_seconds, last_timer_synced_at, task_type_id, ai_generated_prompt_text,
                    assigned_prompt: assigned_prompts ( prompt_text, taskType: exam_task_types(default_time_minutes, exam_id: exam_type_id, level_id) )
                `)
            .eq('id', submissionIdFromState)
            .or(draftAccessFilter)
            .single();

          if (draftByIdError) throw draftByIdError;
          if (!draftById) throw new Error(`Draft with ID ${submissionIdFromState} not found.`);

          const typedDraftById = draftById as Submission;
          setSubmissionId(typedDraftById.id);
          setCurrentDraftText(typedDraftById.submission_text || '');
          setWordCount(typedDraftById.word_count || 0);
          setTimeSpentSeconds(typedDraftById.time_spent_seconds || 0);
          setTaskTypeId(typedDraftById.task_type_id);

          let finalPromptText = 'Error: Prompt not retrieved.';
          let finalTime = 0;

          if (typedDraftById.ai_generated_prompt_text) {
            finalPromptText = typedDraftById.ai_generated_prompt_text;
            if (typedDraftById.task_type_id) {
              const { data: taskTypeData, error: taskTypeError } = await supabase
                .from('exam_task_types')
                .select('default_time_minutes, exam_id: exam_type_id, level_id')
                .eq('id', typedDraftById.task_type_id)
                .single();
              if (taskTypeError && import.meta.env.DEV) {
                console.error("[EditorPage] Failed to fetch AI task timing.");
              }
              finalTime = taskTypeData?.default_time_minutes || 0;
              setExamId(taskTypeData?.exam_id || null);
              setLevelId(taskTypeData?.level_id || null);
            }
          } else if (typedDraftById.assigned_prompt) {
            finalPromptText = typedDraftById.assigned_prompt.prompt_text || '';
            if (typedDraftById.assigned_prompt.taskType &&
              typeof typedDraftById.assigned_prompt.taskType.exam_id === 'number' &&
              typeof typedDraftById.assigned_prompt.taskType.level_id === 'number') {
              finalTime = typedDraftById.assigned_prompt.taskType.default_time_minutes || 0;
              setExamId(typedDraftById.assigned_prompt.taskType.exam_id);
              setLevelId(typedDraftById.assigned_prompt.taskType.level_id);
            } else {
              finalTime = 0; setExamId(null); setLevelId(null);
            }
          } else { // Fallback if no AI prompt and no assigned prompt on the loaded submission
            if (typedDraftById.task_type_id) {
              type FallbackTaskTypeInfo = { default_time_minutes: number | null; exam_id: number; level_id: number; name: string | null; };
              const { data: taskTypeData, error: taskTypeError } = await supabase
                .from('exam_task_types')
                .select('default_time_minutes, exam_id: exam_type_id, level_id, name')
                .eq('id', typedDraftById.task_type_id)
                .single();
              if (taskTypeError || !taskTypeData) {
                finalTime = 0; setExamId(null); setLevelId(null);
                if (!finalPromptText || finalPromptText === 'Error: Prompt not retrieved.') finalPromptText = 'Continue task: Untitled Task';
              } else {
                const typedTaskTypeData = taskTypeData as FallbackTaskTypeInfo;
                if (typeof typedTaskTypeData.exam_id !== 'number' || typeof typedTaskTypeData.level_id !== 'number' || typedTaskTypeData.name === undefined) {
                  finalTime = typedTaskTypeData.default_time_minutes || 0; setExamId(null); setLevelId(null);
                  if (!finalPromptText || finalPromptText === 'Error: Prompt not retrieved.') finalPromptText = `Continue task: ${typedTaskTypeData.name || 'Untitled Task'}`;
                } else {
                  finalTime = typedTaskTypeData.default_time_minutes || 0;
                  setExamId(typedTaskTypeData.exam_id); setLevelId(typedTaskTypeData.level_id);
                  if (!finalPromptText || finalPromptText === 'Error: Prompt not retrieved.') finalPromptText = `Continue task: ${typedTaskTypeData.name || 'Untitled Task'}`;
                }
              }
            }
          }
          setPromptText(finalPromptText);
          setSuggestedTimeMinutes(finalTime);

        } else if (assignedPromptIdFromState) {
          // Check if a draft already exists for this assigned_prompt_id
          const { data: existingDraft, error: existingDraftError } = await supabase
            .from('submissions')
            .select('id, submission_text, word_count, time_spent_seconds, task_type_id')
            .eq('assigned_prompt_id', assignedPromptIdFromState)
            .eq('student_id', user.id)
            .eq('student_membership_id', activeMembershipId)
            .eq('status', 'draft' as const)
            .maybeSingle(); // Use maybeSingle as there might be no draft

          if (existingDraftError) {
            throw existingDraftError;
          }

          if (existingDraft) {
            // Load existing draft for assigned task
            const { data: promptDetails, error: promptFetchError } = await supabase
              .from('assigned_prompts')
              .select(`prompt_text, task_type_id, taskType: exam_task_types!inner (default_time_minutes, exam_id: exam_type_id, level_id)`)
              .eq('id', assignedPromptIdFromState)
              .single(); // No student_id check here as we already established ownership via existingDraft

            if (promptFetchError || !promptDetails) {
              throw new Error("Assigned task details not found for existing draft.");
            }

            const typedPromptDetails = promptDetails as { prompt_text: string; task_type_id: number; taskType: { default_time_minutes: number; exam_id: number; level_id: number; } };

            setSubmissionId(existingDraft.id);
            setCurrentDraftText(existingDraft.submission_text || '');
            setWordCount(existingDraft.word_count || 0);
            setTimeSpentSeconds(existingDraft.time_spent_seconds || 0);
            fetchedPromptText = typedPromptDetails.prompt_text;
            fetchedTaskTypeId = typedPromptDetails.task_type_id;
            fetchedTime = typedPromptDetails.taskType.default_time_minutes;
            setExamId(typedPromptDetails.taskType.exam_id);
            setLevelId(typedPromptDetails.taskType.level_id);

          } else {
            // Create new submission for assigned task
            const { data: promptDetails, error: promptFetchError } = await supabase
              .from('assigned_prompts')
              .select(`prompt_text, task_type_id, taskType: exam_task_types!inner (default_time_minutes, exam_id: exam_type_id, level_id)`)
              .eq('id', assignedPromptIdFromState)
              .eq('student_id', user.id)
              .eq('student_membership_id', activeMembershipId)
              .single();

            if (promptFetchError || !promptDetails) {
              throw new Error("Assigned task not found or permission denied for new submission.");
            }

            const typedPromptDetails = promptDetails as { prompt_text: string; task_type_id: number; taskType: { default_time_minutes: number; exam_id: number; level_id: number; } };

            fetchedPromptText = typedPromptDetails.prompt_text;
            fetchedTaskTypeId = typedPromptDetails.task_type_id;
            fetchedTime = typedPromptDetails.taskType.default_time_minutes;
            setExamId(typedPromptDetails.taskType.exam_id);
            setLevelId(typedPromptDetails.taskType.level_id);

            const { data: newSubmission, error: insertError } = await supabase
              .from('submissions')
              .insert({ student_id: user.id, student_membership_id: activeMembershipId, task_type_id: fetchedTaskTypeId, assigned_prompt_id: assignedPromptIdFromState, status: 'draft' as const, submission_text: '', word_count: 0 })
              .select('id').single();

            if (insertError || !newSubmission) {
              throw insertError || new Error("Failed to create new submission for assigned task.");
            }
            setSubmissionId(newSubmission.id);
            setCurrentDraftText('');
            setWordCount(0);
            setTimeSpentSeconds(0);
          }
          setPromptText(fetchedPromptText);
          setTaskTypeId(fetchedTaskTypeId);
          setSuggestedTimeMinutes(fetchedTime);

        } else if (aiPromptDetailsFromState) {
          fetchedPromptText = aiPromptDetailsFromState.promptText;
          fetchedTaskTypeId = aiPromptDetailsFromState.taskTypeId;
          fetchedTime = aiPromptDetailsFromState.suggestedTimeMinutes;
          setExamId(aiPromptDetailsFromState.examId);
          setLevelId(aiPromptDetailsFromState.levelId);

          const { data: newSubmission, error: insertError } = await supabase
            .from('submissions')
            .insert({ student_id: user.id, student_membership_id: activeMembershipId, task_type_id: fetchedTaskTypeId, ai_generated_prompt_text: fetchedPromptText, status: 'draft' as const, submission_text: '', word_count: 0 })
            .select('id').single();

          if (insertError || !newSubmission) {
            throw insertError || new Error("Failed to create new submission for AI task.");
          }
          setSubmissionId(newSubmission.id);
          setCurrentDraftText('');
          setWordCount(0);
          setTimeSpentSeconds(0);
          setPromptText(fetchedPromptText);
          setTaskTypeId(fetchedTaskTypeId);
          setSuggestedTimeMinutes(fetchedTime);

        } else {
          // This case should ideally not be reached if the initial check is robust
          throw new Error("No valid task context found after initial checks.");
        }
      } catch (err) {
        const msg = getErrorMessage(err) || "An unexpected error occurred while loading the editor.";
        setError(msg);

        if (activeMembershipId == null && submissionIdFromState) {
          initialFetchDone.current = false;
        }
      } finally {
        setIsLoadingPage(false);
      }
    };

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      setIsLoadingPage(true);
      setError(null);
      initializeEditor();
    } else {
      setIsLoadingPage(false);
    }

  }, [user, activeMembershipId, isAuthLoading, submissionIdFromState, assignedPromptIdFromState, aiPromptDetailsFromState, navigate, toast]);


  useEffect(() => {
    if (!submissionId) return;

    const handleBeforeUnload = () => {
      // use keepalive transport to prevent browsers from aborting the final sync during unload
      void syncSubmissionTime({ force: true, reason: 'beforeunload', transport: 'keepalive' });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void syncSubmissionTime({ force: true, reason: 'visibility-hidden', transport: 'keepalive' });
      }
    };

    addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void syncSubmissionTime({ force: true, reason: 'unmount', transport: 'keepalive' });
    };
  }, [submissionId, syncSubmissionTime]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setCurrentDraftText(newText);
    const words = newText.trim().split(/\s+/).filter(Boolean);
    setWordCount(words.length === 1 && words[0] === '' ? 0 : words.length);
  }, []);

  const handleSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!submissionId || !user) {
      toast({ title: "Error", description: "Could not identify the draft to save.", variant: "destructive" });
      return false;
    }
    setIsSavingDraft(true);
    try {
      const syncResult = await syncSubmissionTime({ reason: 'manual-save' });
      if (syncResult.error) {
        if (import.meta.env.DEV) {
          console.warn('[EditorPage] Time sync failed before saving draft.');
        }
      }

      const totalSeconds = getSubmissionTotalSeconds();
      const payload: {
        submission_text: string;
        word_count: number;
        time_spent_seconds?: number;
      } = {
        submission_text: currentDraftText,
        word_count: wordCount,
      };

      if (!syncResult.error) {
        payload.time_spent_seconds = totalSeconds;
      }

      let updateQuery = supabase
        .from('submissions')
        .update(payload)
        .eq('id', submissionId)
        .eq('student_id', user.id); // Security check from original

      if (activeMembershipId == null) {
        updateQuery = updateQuery.is('student_membership_id', null);
      } else {
        updateQuery = updateQuery.or(`student_membership_id.eq.${activeMembershipId},student_membership_id.is.null`);
      }

      const { error: updateError } = await updateQuery;
      if (updateError) throw updateError;

      if (!syncResult.error) {
        markSubmissionTimeSynced(totalSeconds);
        setTimeSpentSeconds(totalSeconds);
      }

      toast({ title: "Draft Saved", description: "Your progress has been saved." });
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[EditorPage] Draft save failed.");
      }
      const msg = getErrorMessage(err) || "Could not save the draft.";
      toast({ title: "Error Saving", description: msg, variant: "destructive" });
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  }, [submissionId, user, activeMembershipId, currentDraftText, wordCount, toast, syncSubmissionTime, getSubmissionTotalSeconds, markSubmissionTimeSynced]);

  // New: Save and return to dashboard in one action
  const handleSaveAndBack = useCallback(async () => {
    const ok = await handleSaveDraft();
    if (ok) {
      navigate('/dashboard');
    }
  }, [handleSaveDraft, navigate]);

  const handleEvaluate = async () => {
    if (!submissionId) {
      toast({ title: "Error", description: "Cannot evaluate, submission ID is missing.", variant: "destructive" });
      return;
    }
    toast({ title: "Saving draft...", description: "Ensuring the latest version is evaluated." });
    pauseSubmissionTimer();
    const saveResult = await handleSaveDraft();
    if (!saveResult) {
      resumeSubmissionTimer();
      return;
    }

    setIsEvaluating(true);
    setError(null);
    toast({
      title: "Evaluation in Progress...",
      description: "The AI is reviewing your text. This may take a moment.",
    });

    try {
      const { data, error: funcError } = await supabase.functions.invoke('evaluate-submission', {
        body: { submissionId },
      });

      if (funcError) {
        if (import.meta.env.DEV) {
          console.error("[EditorPage] Evaluation request failed.");
        }
        let detailedError = funcError.message;
        if (funcError.context && typeof funcError.context === 'object') {
          detailedError = funcError.context.message || funcError.context.error_description || JSON.stringify(funcError.context);
        }
        throw new Error(`Error in Supabase function: ${detailedError}`);
      }

      if (data?.evaluation) {
        // Success toast removed: navigation to results provides clear feedback
        navigate(`/evaluation/${submissionId}`, { replace: true });
      } else {
        if (import.meta.env.DEV) {
          console.error("[EditorPage] Evaluation response was incomplete.");
        }
        throw new Error("Error during evaluation: Unexpected server response.");
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[EditorPage] Evaluation could not be completed.");
      }
      let errorMessage = "Error during evaluation.";
      const msg = getErrorMessage(err);
      if (msg) { errorMessage = msg; }
      // ... (error message extraction logic from original)
      setError(errorMessage);
      resumeSubmissionTimer();
      toast({ title: "Evaluation Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isAiLoading || !user) return;

    const userQuery = chatInput.trim();
    const currentConversationHistory = [...chatHistory];

    setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userQuery }] }]);
    setChatInput('');
    setIsAiLoading(true);
    setError(null); // Clear previous chat errors

    try {
      const { data, error: funcError } = await supabase.functions.invoke('get-chat-assistance', {
        body: {
          userQuery,
          currentDraftText,
          originalPromptText: promptText,
          taskTypeId,
          examId,
          levelId,
          conversationHistory: currentConversationHistory
        }
      });

      if (funcError) {
        if (import.meta.env.DEV) {
          console.error("[EditorPage] AI assistance request failed.");
        }
        let detailedError = funcError.message;

        if (isPlainRecord(funcError.context)) {
          const context = funcError.context;
          const contextMessage = typeof context.message === 'string' ? context.message : null;
          const contextBody = typeof context.body === 'string' ? context.body : null;

          if (contextBody) {
            try {
              const parsedBody = JSON.parse(contextBody);
              if (isPlainRecord(parsedBody)) {
                const bodyError = typeof parsedBody.error === 'string' ? parsedBody.error : null;
                const bodyMessage = typeof parsedBody.message === 'string' ? parsedBody.message : null;
                detailedError = bodyError || bodyMessage || contextMessage || detailedError;
              } else {
                detailedError = contextMessage || detailedError;
              }
            } catch {
              detailedError = contextMessage || detailedError;
            }
          } else {
            detailedError = contextMessage || detailedError;
          }
        }

        throw new Error(`Error in Supabase function: ${detailedError}`);
      }

      if (data && data.responseText) {
        setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: data.responseText }] }]);
      } else {
        // Handle case from original: no responseText but also no funcError
        if (import.meta.env.DEV) {
          console.warn("[EditorPage] AI assistance response was incomplete.");
        }
        setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "The assistant didn't provide a response this time. Try rephrasing or asking again." }] }]);
      }

    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[EditorPage] AI assistance could not be completed.");
      }
      // Error display logic from previous refactor (more user-friendly)
      let displayError = "Sorry, I couldn't get a response. Please try again.";
      const msg = getErrorMessage(err);
      if (msg) {
        if (msg.includes("FunctionFetchError") || msg.includes("RelayError")) {
          displayError = "There was a problem connecting to the assistant. Please check your connection and try again.";
        } else {
          displayError = `Error: ${msg}`; // Avoid showing raw error object stringification
        }
      }
      setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: displayError }] }]);
    } finally {
      setIsAiLoading(false);
    }
  }, [chatInput, isAiLoading, user, chatHistory, currentDraftText, promptText, taskTypeId, examId, levelId]);


  const handleClearChat = () => {
    setChatHistory([]);
    toast({ title: "Chat Cleared", description: "The conversation history has been removed." });
  };

  if (isLoadingPage) {
    return (
      <FixedViewportPage className="bg-background text-foreground">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-lg">Loading Editor...</p>
        </div>
      </FixedViewportPage>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-8 text-center bg-background text-foreground">
        <h2 className="text-xl font-semibold text-destructive mb-4">Error Loading Editor</h2>
        <p className="text-destructive-foreground mb-6">{error}</p> {/* text-destructive-foreground for better contrast on destructive bg */}
        <Button onClick={() => navigate(-1)} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  if (!submissionId) {
    return (
      <div className="container mx-auto p-8 text-center bg-background text-foreground">
        <p className="text-lg text-amber-600 dark:text-amber-500">The draft could not be initialized yet.</p>
        <Button onClick={() => navigate(-1)} className="mt-6" variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <FixedViewportPage paddingYClass="py-1.5">
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <ExamTwoPaneFrame
          left={
            <WritingEditorPanel
              value={currentDraftText}
              onChange={handleTextChange}
              wordCount={wordCount}
              suggestedTimeMinutes={suggestedTimeMinutes}
              formattedTime={formattedTimerValue}
              isTimerSyncing={isTimerSyncing}
              onSaveAndExit={handleSaveAndBack}
              isSaving={isSavingDraft}
              onEvaluate={handleEvaluate}
              isEvaluating={isEvaluating}
            />
          }
          right={
            <WritingRightPanel
              promptText={promptText}
              chatHistory={chatHistory}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSendMessage={handleSendMessage}
              onClearChat={handleClearChat}
              isAiLoading={isAiLoading}
            />
          }
        />
      </div>
    </FixedViewportPage>
  );
}

export default EditorPage;
