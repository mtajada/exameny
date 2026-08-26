import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { EnhancedChatPanelProps } from '@/types/ruoe';
import { useChatIntegration } from '@/components/ruoe/hooks/useChatIntegration';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { loadDraftFromStorage, saveDraftToStorage, clearDraftFromStorage } from './chatStorage';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ChatError } from './ChatError';


export const ChatPanel: React.FC<EnhancedChatPanelProps> = ({
  exerciseData,
  attemptId,
  isEvaluated,
  userAnswers,
  currentQuestionId,
  evaluationResults,
  evaluationData,
  pendingPrompt,
  onPromptConsumed,
  onChatBusyChange,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // StrictMode protection - prevent double execution in development
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentAttemptIdRef = useRef<number | null>(null);
  const processedPromptIdsRef = useRef<Set<string>>(new Set());
  const inFlightPromptIdRef = useRef<string | null>(null);

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    cancelRequest
  } = useChatIntegration({
    exerciseData,
    attemptId,
    isEvaluated,
    userAnswers,
    currentQuestionId,
    evaluationResults,
    evaluationData
  });

  useEffect(() => {
    onChatBusyChange?.(isLoading);
  }, [isLoading, onChatBusyChange]);

  useEffect(() => {
    processedPromptIdsRef.current.clear();
    inFlightPromptIdRef.current = null;
  }, [attemptId]);

  useEffect(() => {
    if (!pendingPrompt) {
      return;
    }

    const { id, message, intent } = pendingPrompt;
    if (!message?.trim()) {
      onPromptConsumed?.(id);
      return;
    }

    if (processedPromptIdsRef.current.has(id) || inFlightPromptIdRef.current === id) {
      onPromptConsumed?.(id);
      return;
    }

    if (isLoading) {
      return;
    }

    const sendAutomatedMessage = async () => {
      processedPromptIdsRef.current.add(id);
      inFlightPromptIdRef.current = id;
      try {
        setInputMessage('');
        if (attemptId) {
          await clearDraftFromStorage(attemptId);
        }
        await sendMessage(message, intent);
      } finally {
        inFlightPromptIdRef.current = null;
        onPromptConsumed?.(id);
      }
    };

    void sendAutomatedMessage();
  }, [pendingPrompt, isLoading, onPromptConsumed, sendMessage, attemptId]);

  // Debounced save function
  const debouncedSave = useCallback(
    (attemptId: number | null, message: string) => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for debounced save
      saveTimeoutRef.current = setTimeout(() => {
        saveDraftToStorage(attemptId, message);
      }, 300); // 300ms debounce
    },
    []
  );

  // Load draft message when attemptId changes (with StrictMode protection)
  useEffect(() => {
    const loadDraft = async () => {
      if (attemptId && attemptId !== currentAttemptIdRef.current) {
        currentAttemptIdRef.current = attemptId;

        // Prevent double loading in StrictMode
        if (isInitialized.current && attemptId === currentAttemptIdRef.current) {
          return;
        }

        const draft = await loadDraftFromStorage(attemptId);
        if (draft && attemptId === currentAttemptIdRef.current) {
          setInputMessage(draft);
        }

        isInitialized.current = true;
      } else if (!attemptId) {
        // Clear input when no attempt ID
        setInputMessage('');
        currentAttemptIdRef.current = null;
        isInitialized.current = false;
      }
    };

    loadDraft();

    // Cleanup function to prevent race conditions
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [attemptId]);

  // Auto-save draft message when it changes (debounced)
  useEffect(() => {
    // Only save if we have a valid attemptId and the component is initialized
    if (attemptId && isInitialized.current && attemptId === currentAttemptIdRef.current) {
      debouncedSave(attemptId, inputMessage);
    }

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [attemptId, inputMessage, debouncedSave]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const bottom = container.scrollHeight - container.clientHeight;

    // If container doesn't overflow, keep scroll position at top without forcing layout scroll.
    if (bottom <= 0) {
      container.scrollTop = 0;
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    const behavior: ScrollBehavior = isNearBottom ? 'smooth' : 'auto';

    container.scrollTo({ top: bottom, behavior });
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const messageToSend = inputMessage.trim();

    // Clear any pending save operations
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Clear input and draft immediately for better UX
    setInputMessage('');

    // Clear draft when message is sent
    if (attemptId) {
      await clearDraftFromStorage(attemptId);
    }

    await sendMessage(messageToSend, 'general');
  };


  const handleConfirmClear = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      cancelRequest();
      clearMessages();
      processedPromptIdsRef.current.clear();
      inFlightPromptIdRef.current = null;
      setInputMessage('');
      if (attemptId) {
        await clearDraftFromStorage(attemptId);
      }
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setIsClearDialogOpen(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [attemptId, cancelRequest, clearMessages]);

  const hasMessages = messages.length > 0;



  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-4 pt-1 pb-2">
        <TooltipProvider delayDuration={150}>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Exam Coach AI
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"
                    role="status"
                    aria-label="Context-aware support active"
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">Context-aware support</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              {isLoading && (
                <span className="flex items-center text-primary" role="status" aria-live="polite">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Assistant replying</span>
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full border border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary"
                    onClick={() => setIsClearDialogOpen(true)}
                    disabled={!hasMessages || isLoading}
                    aria-label="Clear conversation"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Clear chat history
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>

      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        isEvaluated={isEvaluated}
        containerRef={messagesContainerRef}
      />

      <ChatError error={error} />

      <ChatInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        isEvaluated={isEvaluated}
        inputRef={inputRef}
      />

      <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all previous questions and answers for this exercise. You can keep asking new
              questions afterwards, but the assistant will not remember the cleared context.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmClear()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
