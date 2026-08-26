import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';

const DashboardPage: React.FC = () => {
  const { user, profile, role, memberships, isPlatformAdmin, isLoading } = useAuth();

  const resolvedRole =
    role ??
    (memberships.length === 1 ? memberships[0].role : null) ??
    null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!profile && !resolvedRole && !isPlatformAdmin) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center py-12">
          <p className="text-gray-600">Unable to determine your academy role. Please try again.</p>
        </div>
      </div>
    );
  }

  if (isPlatformAdmin) {
    return <Navigate to="/platform" replace />;
  }

  if (resolvedRole === 'student') {
    return <StudentDashboard />;
  }

  if (resolvedRole === 'teacher') {
    return <TeacherDashboard />;
  }

  if (resolvedRole === 'academy_admin') {
    return <Navigate to="/academy/dashboard" replace />;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="text-center py-12">
        <p className="text-red-600">User role not recognized or invalid.</p>
      </div>
    </div>
  );
};

export default DashboardPage;
