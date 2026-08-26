
import React from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import Header from './Header';

interface AppLayoutProps {
  className?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ className }) => {
  return (
    <div className="app-shell">
      <Header />
      <main
        className={cn('app-shell__main', className)}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
