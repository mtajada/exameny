import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Lead, MutedText } from '@/components/ui/typography';
import { buildAuthFooterCopy } from '@/lib/auth/authFlags';

export type HeroHighlight = {
  icon: LucideIcon;
  text: string;
  iconClassName?: string;
};

export interface AuthHeroPanelProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  highlights?: HeroHighlight[];
  footer?: React.ReactNode;
}

const HERO_SURFACE = 'bg-blue-600 text-white';

const DEFAULT_HIGHLIGHTS: HeroHighlight[] = [];

const DEFAULT_HERO: Required<Pick<AuthHeroPanelProps, 'eyebrow' | 'title' | 'subtitle' | 'footer'>> = {
  eyebrow: 'Exameny',
  title: 'Where your personalized English journey begins.',
  subtitle:
    'AI-personalized guidance keeps your English lessons, assignments, and progress tracking aligned to the academy that invited you.',
  footer: (
    <MutedText className="text-xs text-primary-foreground/70">
      {buildAuthFooterCopy()}
    </MutedText>
  ),
};

export const AuthHeroPanel: React.FC<AuthHeroPanelProps> = ({
  eyebrow = DEFAULT_HERO.eyebrow,
  title = DEFAULT_HERO.title,
  subtitle = DEFAULT_HERO.subtitle,
  highlights = DEFAULT_HIGHLIGHTS,
  footer = DEFAULT_HERO.footer,
  className,
  ...props
}) => {
  return (
    <section
      className={cn(
        `${HERO_SURFACE} relative flex min-h-[220px] flex-col justify-between overflow-hidden px-8 py-12 sm:px-12 sm:py-16 lg:min-h-screen lg:px-20 lg:py-24`,
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-primary-foreground/70">
        <span>{eyebrow}</span>
        <span className="h-px w-12 bg-primary-foreground/40" aria-hidden="true" />
      </div>
      <div className="mt-10 space-y-4 sm:mt-12 lg:mt-16">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
        <Lead className="max-w-md text-sm text-primary-foreground/80 sm:text-base">{subtitle}</Lead>
      </div>
      {highlights.length > 0 ? (
        <div className="mt-8 space-y-4 text-sm text-primary-foreground/80">
          {highlights.map((highlight, index) => {
            const Icon = highlight.icon;
            return (
              <div key={`${highlight.text}-${index}`} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
                  <Icon className={cn('h-4 w-4 text-primary-foreground', highlight.iconClassName)} />
                </span>
                <p className="text-sm leading-relaxed">{highlight.text}</p>
              </div>
            );
          })}
        </div>
      ) : null}
      {footer ? footer : null}
    </section>
  );
};

const CONTENT_WIDTH_CLASSES: Record<'md' | 'lg' | 'xl', string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export interface AuthShellProps {
  children: React.ReactNode;
  hero?: AuthHeroPanelProps;
  className?: string;
  rightColumnClassName?: string;
  contentClassName?: string;
  contentWidth?: keyof typeof CONTENT_WIDTH_CLASSES;
}

export const AuthShell: React.FC<AuthShellProps> = ({
  children,
  hero,
  className,
  rightColumnClassName,
  contentClassName,
  contentWidth = 'md',
}) => {
  const widthClass = CONTENT_WIDTH_CLASSES[contentWidth] ?? CONTENT_WIDTH_CLASSES.md;

  return (
    <div
      className={cn(
        'grid min-h-screen grid-cols-1 overflow-hidden bg-slate-50 lg:grid-cols-2',
        className,
      )}
    >
      <AuthHeroPanel className="order-1" {...hero} />
      <section
        className={cn(
          'order-2 flex items-start justify-center bg-slate-50 px-6 py-10 sm:px-10 sm:py-14 lg:items-center lg:justify-center lg:px-12 lg:py-16',
          rightColumnClassName,
        )}
      >
        <div className={cn('w-full', widthClass, contentClassName)}>{children}</div>
      </section>
    </div>
  );
};
