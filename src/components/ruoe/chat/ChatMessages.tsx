import React from 'react';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/types/ruoe';
import { chatMarkdownComponents } from './MarkdownComponents';

interface ChatMessagesProps {
  messages: readonly ChatMessage[];
  isLoading: boolean;
  isEvaluated: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

// Placeholder text constants
const PLACEHOLDER_TEXT = {
  EVALUATED: 'Ask about the answers...',
  NOT_EVALUATED: 'Ask for help...'
} as const;

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  isLoading,
  isEvaluated,
  containerRef
}) => {
  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2">
      <div className="space-y-4 max-w-4xl mx-auto">
        {messages.length === 0 && !isLoading ? (
          <div
            className="text-center text-muted-foreground text-sm py-8"
            role="status"
            aria-label="Chat empty state"
          >
            {isEvaluated ? PLACEHOLDER_TEXT.EVALUATED : PLACEHOLDER_TEXT.NOT_EVALUATED}
          </div>
        ) : (
          <>
            <div role="log" aria-live="polite" aria-label="Chat messages">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`${
                      message.role === 'user'
                        ? 'max-w-[80%] px-4 py-3 rounded-2xl bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20 backdrop-blur-sm transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5'
                        : 'max-w-[85%] px-4 py-3 rounded-2xl bg-gradient-to-br from-slate-50/80 to-slate-100/60 border border-slate-200/30 text-foreground shadow-md backdrop-blur-sm transition-all duration-200 hover:shadow-lg hover:bg-gradient-to-br hover:from-slate-50 hover:to-slate-100/80 hover:-translate-y-0.5'
                    }`}
                    role={message.role === 'assistant' ? 'article' : undefined}
                    aria-label={message.role === 'user' ? 'Your message' : 'Assistant response'}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </p>
                    ) : (
                      <div className="prose prose-sm max-w-none text-sm leading-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>h1]:text-lg [&>h1]:font-semibold [&>h2]:text-base [&>h2]:font-semibold [&>h3]:text-sm [&>h3]:font-semibold [&>p]:mb-2 [&>ul]:space-y-1 [&>ol]:space-y-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={chatMarkdownComponents}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] px-4 py-3 rounded-2xl bg-gradient-to-br from-slate-50/80 to-slate-100/60 border border-slate-200/30 shadow-md backdrop-blur-sm animate-pulse"
                  role="status"
                  aria-label="AI is thinking"
                >
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground animate-pulse">Thinking...</span>
                    <div className="flex gap-1 ml-2" aria-hidden="true">
                      <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
