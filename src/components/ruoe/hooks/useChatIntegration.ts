import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ChatMessage,
  ExerciseData,
  UseChatIntegrationProps,
  ChatIntegrationReturn,
  ChatAssistancePayload,
  CompleteRuoEContext,
  CompleteQuestionContext,
  CompleteOptionContext,
  CurrentQuestionContext,
  ChatLoadingState,
  ChatError,
  ConversationHistoryEntry,
  type AssistanceIntent
} from '@/types/ruoe';
import { useAuth } from '@/contexts/useAuth';

// Helper function to create chat errors following best practices
const createChatError = (message: string, cause?: unknown): ChatError => ({
  name: 'ChatError',
  message,
  cause: cause instanceof Error ? cause : new Error(String(cause)),
  timestamp: new Date()
});

const MAX_HISTORY_MESSAGES = 12;

export const useChatIntegration = (
  props: UseChatIntegrationProps
): ChatIntegrationReturn => {
  // Use discriminated unions for loading state (TypeScript best practice)
  const [loadingState, setLoadingState] = useState<ChatLoadingState>({ status: 'idle' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  // SessionStorage helpers for chat persistence
  const getStorageKey = useCallback(() => {
    return props.attemptId ? `ruoe_chat_messages_${props.attemptId}` : null;
  }, [props.attemptId]);

  const loadMessagesFromStorage = useCallback(() => {
    const storageKey = getStorageKey();
    if (!storageKey) return [];

    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate that it's an array of valid ChatMessage objects
        if (Array.isArray(parsed) &&
            parsed.every(msg =>
              msg &&
              typeof msg === 'object' &&
              ['user', 'assistant'].includes(msg.role) &&
              typeof msg.content === 'string' &&
              msg.timestamp
            )) {
          // Convert timestamp strings back to Date objects
          return parsed.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }
      }
    } catch (error) {
      console.warn('Failed to load chat messages from storage:');
    }
    return [];
  }, [getStorageKey]);

  const saveMessagesToStorage = useCallback((messagesToSave: ChatMessage[]) => {
    const storageKey = getStorageKey();
    if (!storageKey) return;

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messagesToSave));
    } catch (error) {
      console.warn('Failed to save chat messages to storage:');
    }
  }, [getStorageKey]);

  const clearMessagesFromStorage = useCallback(() => {
    const storageKey = getStorageKey();
    if (!storageKey) return;

    try {
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Failed to clear chat messages from storage:');
    }
  }, [getStorageKey]);

  // Load messages from sessionStorage on mount or when attemptId changes
  useEffect(() => {
    const storedMessages = loadMessagesFromStorage();
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    }
  }, [props.attemptId, loadMessagesFromStorage]);

  // Save messages to sessionStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages, saveMessagesToStorage]);

  // Build complete R&UoE context following TypeScript best practices
  const buildCompleteRuoEContext = useCallback((
    userQuery: string,
    conversationHistory: ConversationHistoryEntry[],
    intent: AssistanceIntent
  ): ChatAssistancePayload => {
    // Validate props before proceeding (defensive programming)
    if (!props.exerciseData?.exercise?.id) {
      throw createChatError('Invalid exercise data provided');
    }

    // Get current question context if available (using optional chaining)
    const currentQuestion = props.currentQuestionId
      ? props.exerciseData.questions.find(q => q.id === props.currentQuestionId)
      : null;

    // Build all questions with complete context (ALWAYS sent for better guidance)
    const allQuestions: CompleteQuestionContext[] = props.exerciseData.questions.map(q => ({
      id: q.id,
      order: q.order,
      displayOrder: q.displayOrder,
      questionText: q.question_text,
      correctAnswers: q.correct_answers, // ✅ Always included for intelligent guidance
      explanation: q.explanation
    }));

    // Build all options with complete context (ALWAYS sent for better guidance)
    const allOptions: CompleteOptionContext[] = props.exerciseData.options.map(opt => ({
      id: opt.id,
      questionId: opt.question_id,
      letter: opt.option_letter,
      text: opt.option_text,
      isCorrect: opt.is_correct, // ✅ Always included for intelligent guidance
      feedback: opt.feedback
    }));

    // Build current question context
    const currentQuestionContext: CurrentQuestionContext | null = currentQuestion ? {
      id: currentQuestion.id,
      order: currentQuestion.order,
      displayOrder: currentQuestion.displayOrder,
      questionText: currentQuestion.question_text,
      userAnswer: props.userAnswers?.[currentQuestion.id] ?? null
    } : null;

    // Build complete context with all information
    const completeContext: CompleteRuoEContext = {
      // Exercise basic information
      exerciseId: props.exerciseData.exercise.id,
      exerciseTitle: props.exerciseData.exercise.title,
      exerciseContent: props.exerciseData.exercise.content_text,
      taskType: props.exerciseData.taskType.task_code,
      taskTypeName: props.exerciseData.taskType.name,
      examType: props.exerciseData.taskType.exam_type_id,
      levelId: props.exerciseData.taskType.level_id,

      // Complete questions and options (sent in both pre/post evaluation)
      allQuestions,
      allOptions,

      // User's current state
      isEvaluated: props.isEvaluated,
      attemptId: props.attemptId,
      totalQuestions: props.exerciseData.questions.length,
      answeredQuestions: Object.keys(props.userAnswers ?? {}).length,
      userAnswers: props.userAnswers ?? {},
      displayOrderByQuestionId: props.exerciseData.displayOrderByQuestionId,

      // Current question context
      currentQuestion: currentQuestionContext,

      // Evaluation results (when available)
      ...(props.evaluationData && {
        evaluationResults: props.evaluationResults ?? {},
        correctAnswersData: props.evaluationData.correctAnswersData ?? {},
        explanations: props.evaluationData.explanations ?? {},
        score: props.evaluationData.score,
        maxScore: props.evaluationData.maxScore
      })
    };

    // Return complete payload for chat assistance
    return {
      userQuery,
      currentDraftText: JSON.stringify(props.userAnswers ?? {}),
      originalPromptText: `${props.exerciseData.exercise.title}\n\n${props.exerciseData.exercise.content_text}`,
      taskTypeId: props.exerciseData.taskType.id,
      examId: props.exerciseData.taskType.exam_type_id,
      levelId: props.exerciseData.taskType.level_id,
      ruoeContext: completeContext, // ✅ Complete context always sent
      conversationHistory,
      assistanceIntent: intent
    };
  }, [props]);

  const buildConversationHistoryPayload = useCallback((history: ChatMessage[]): ConversationHistoryEntry[] => {
    if (!history.length) return [];
    return history
      .slice(-MAX_HISTORY_MESSAGES)
      .map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));
  }, []);

  // Enhanced sendMessage with better error handling and TypeScript best practices
  const sendMessage = useCallback(async (userQuery: string, intent: AssistanceIntent = 'general'): Promise<void> => {
    if (!userQuery.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: userQuery,
      timestamp: new Date()
    } as const; // const assertion for immutability

    const historyPayload = buildConversationHistoryPayload(messages);

    setMessages(prev => [...prev, userMessage]);
    setLoadingState({ status: 'loading' });

    try {
      // Cancel any existing request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const contextData = buildCompleteRuoEContext(userQuery, historyPayload, intent);

      const { data, error: apiError } = await supabase.functions.invoke(
        'get-chat-assistance',
        {
          body: contextData
        }
      );

      if (apiError) {
        throw createChatError('AI service error', apiError);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data?.responseText ?? 'No response received from AI service',
        timestamp: new Date()
      } as const;

      setMessages(prev => [...prev, assistantMessage]);
      setLoadingState({ status: 'success' });

    } catch (error) {
      // Handle AbortError gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const chatError = error instanceof Error && error.name === 'ChatError'
        ? error as ChatError
        : createChatError('Unknown error occurred', error);

      setLoadingState({ status: 'error', error: chatError });

      // Add error message to chat for user feedback
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${chatError.message}. Please try again.`,
        timestamp: new Date()
      } as const;

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      abortControllerRef.current = null;
    }
  }, [buildCompleteRuoEContext, buildConversationHistoryPayload, messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLoadingState({ status: 'idle' });
    clearMessagesFromStorage();
  }, [clearMessagesFromStorage]);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Return with proper TypeScript typing using const assertion
  return {
    messages,
    isLoading: loadingState.status === 'loading',
    error: loadingState.status === 'error' ? loadingState.error.message : null,
    sendMessage,
    clearMessages,
    cancelRequest
  } as const;
};
