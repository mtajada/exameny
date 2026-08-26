import React from 'react';
import type { Components } from 'react-markdown';

// Optimized chat markdown components - only essential overrides
// Extracted from ChatPanel.tsx for better performance and organization
export const chatMarkdownComponents: Components = {
  // Core text elements with improved spacing
  p: ({ node, className, ...props }) => (
    <p className={`mb-3 last:mb-0 leading-relaxed ${className ?? ''}`} {...props} />
  ),

  // Streamlined headings - removed redundant h4, h5, h6
  h1: ({ node, className, ...props }) => (
    <h1 className={`text-lg font-semibold mb-3 mt-4 first:mt-0 text-foreground ${className ?? ''}`} {...props} />
  ),
  h2: ({ node, className, ...props }) => (
    <h2 className={`text-base font-semibold mb-2 mt-3 first:mt-0 text-foreground ${className ?? ''}`} {...props} />
  ),
  h3: ({ node, className, ...props }) => (
    <h3 className={`text-sm font-semibold mb-2 mt-3 first:mt-0 text-foreground ${className ?? ''}`} {...props} />
  ),

  // Enhanced lists with better spacing (ensure className merge is safe)
  ul: ({ node, className, ...props }) => (
    <ul className={`list-disc list-outside space-y-1 mb-3 ml-4 pl-2 ${className ?? ''}`} {...props} />
  ),
  ol: ({ node, className, ...props }) => (
    <ol className={`list-decimal list-outside space-y-1 mb-3 ml-4 pl-2 ${className ?? ''}`} {...props} />
  ),
  li: ({ node, className, ...props }) => (
    <li className={`leading-relaxed pl-1 ${className ?? ''}`} {...props} />
  ),

  // Enhanced code styling
  code: ({ node, className, ...props }) => (
    <code
      className={`bg-slate-100/80 dark:bg-slate-800/80 px-2 py-1 rounded-md text-xs font-mono border border-slate-200/50 dark:border-slate-700/50 ${className ?? ''}`}
      {...props}
    />
  ),
  pre: ({ node, className, ...props }) => (
    <pre
      className={`bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-700/50 p-4 rounded-lg overflow-x-auto text-sm mb-4 backdrop-blur-sm ${className ?? ''}`}
      {...props}
    />
  ),

  // Secure links with modern styling
  a: ({ node, className, ...props }) => (
    <a
      className={`text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors break-words ${className ?? ''}`}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),

  // Enhanced blockquotes
  blockquote: ({ node, className, ...props }) => (
    <blockquote
      className={`border-l-4 border-primary/30 pl-4 py-2 my-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-r-lg italic text-muted-foreground ${className ?? ''}`}
      {...props}
    />
  ),

  // Table styling (simplified)
  table: ({ node, className, children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table className={`min-w-full text-sm border-collapse border border-border/50 rounded-lg ${className ?? ''}`} {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ node, className, ...props }) => (
    <th className={`border border-border/50 px-3 py-2 bg-muted/50 font-semibold text-left ${className ?? ''}`} {...props} />
  ),
  td: ({ node, className, ...props }) => (
    <td className={`border border-border/50 px-3 py-2 ${className ?? ''}`} {...props} />
  )
};
