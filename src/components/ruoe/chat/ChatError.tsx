import React from 'react';

interface ChatErrorProps {
  error: string | null;
}

export const ChatError: React.FC<ChatErrorProps> = ({ error }) => {
  if (!error) return null;

  return (
    <div className="px-6 py-3">
      <div className="max-w-4xl mx-auto">
        <div
          className="bg-gradient-to-r from-destructive/10 to-destructive/5 text-destructive text-sm px-4 py-3 rounded-xl border border-destructive/20 shadow-sm backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
          aria-label="Chat error message"
        >
          {error}
        </div>
      </div>
    </div>
  );
};