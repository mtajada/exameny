import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardTab from '@/components/dashboard/academy/tabs/DashboardTab';
import MembersTab from '@/components/dashboard/academy/tabs/MembersTab';
import ClassesTab from '@/components/dashboard/academy/tabs/ClassesTab';

export default function AcademyDashboardPage() {
  const location = useLocation();
  const hash = location.hash.replace('#', '');

  const renderContent = () => {
    switch (hash) {
      case 'members':
        return <MembersTab />;
      case 'classes':
        return <ClassesTab />;
      case 'overview':
      case '':
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="space-y-6">
      {renderContent()}
    </div>
  );
}
