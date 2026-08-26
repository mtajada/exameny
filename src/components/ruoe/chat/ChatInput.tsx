import React from 'react';
import { Button } from '@/components/ui/button';
import { AutoResizeTextarea } from '@/components/ui/auto-resize-textarea';
import { Send, Loader2 } from 'lucide-react';

interface ChatInputProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  onSendMessage: () => Promise<void>;
  isLoading: boolean;
  isEvaluated: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

// Placeholder text constants
const PLACEHOLDER_TEXT = {
  EVALUATED: 'Ask about the answers...',
  NOT_EVALUATED: 'Ask for help...'
} as const;

export const ChatInput: React.FC<ChatInputProps> = ({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isLoading,
  isEvaluated,
  inputRef
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage();
  };

  const placeholderText = isEvaluated ? PLACEHOLDER_TEXT.EVALUATED : PLACEHOLDER_TEXT.NOT_EVALUATED;

  return (
    <div className="px-4 pb-4 pt-1.5">
      <div className="mx-auto w-full max-w-4xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-start gap-2.5 rounded-xl border border-border/30 bg-gradient-to-r from-background/95 to-background/90 px-3.5 py-2.5 shadow-md backdrop-blur-sm transition-all duration-200 focus-within:border-primary/50 focus-within:bg-background focus-within:shadow-lg">
            <AutoResizeTextarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={placeholderText}
              disabled={isLoading}
              minRows={1}
              maxRows={8}
              className="flex-1 border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground resize-none"
              autoComplete="off"
              aria-label={`Chat input - ${placeholderText}`}
              aria-describedby="chat-input-help"
            />
            <Button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 rounded-full p-0"
              aria-label={isLoading ? "Sending message..." : "Send message"}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <div id="chat-input-help" className="sr-only">
            Press Enter to send message, Shift+Enter for new line
          </div>
        </form>
      </div>
    </div>
  );
};
