import React from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { useActiveAcademy } from '@/contexts/useActiveAcademy';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard,
  Users,
  School,
  Home,
  LogOut,
} from 'lucide-react';

export function AcademyLayout() {
  const {
    logout,
    user,
    userPreferences,
    role,
    isPlatformAdmin,
  } = useAuth();
  const location = useLocation();
  const { activeMembership } = useActiveAcademy();

  if (!activeMembership) {
    if (isPlatformAdmin) {
      return <Navigate to="/platform" replace state={{ from: location }} />;
    }

    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  const academyName =
    activeMembership?.academyName ?? 'Academy Management';

  const roleLabel = (() => {
    const membershipRole = activeMembership?.role ?? role;
    switch (membershipRole) {
      case 'academy_admin':
        return 'Academy Admin';
      case 'teacher':
        return 'Teacher';
      case 'student':
        return 'Student';
      default:
        return 'Member';
    }
  })();

  const displayName =
    userPreferences?.fullName ??
    user?.email ??
    'User';

  const isActive = (path: string, hash?: string) => {
    if (hash) {
      return location.pathname === path && location.hash === hash;
    }
    // For overview, active if it's /academy/dashboard with no hash or #overview
    return location.pathname === path && (location.hash === '' || location.hash === '#overview');
  };

  const navigationItems = [
    {
      href: '/academy/dashboard#overview',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: isActive('/academy/dashboard', '#overview') || isActive('/academy/dashboard')
    },
    {
      href: '/academy/dashboard#members',
      label: 'Members',
      icon: Users,
      active: isActive('/academy/dashboard', '#members')
    },

    {
      href: '/academy/dashboard#classes',
      label: 'Classes',
      icon: School,
      active: isActive('/academy/dashboard', '#classes')
    }
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard" className="flex items-center space-x-2 text-gray-600 hover:text-primary">
                <Home className="h-5 w-5" />
                <span className="text-sm font-medium">Back to Main</span>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <h1 className="text-xl font-semibold text-gray-900">{academyName}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{displayName}</span>
                <span className="text-gray-400 ml-2">{roleLabel}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-gray-600 hover:text-red-600"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-64 flex-shrink-0">
            <Card>
              <CardContent className="p-4">
                <nav className="space-y-2">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          item.active
                            ? 'bg-primary text-white'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
