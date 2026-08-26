import React, { useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/contexts/useAuth';
import { ClipboardList, MessageCircle, UserCog } from 'lucide-react';
import { useHomeworkCount } from '@/hooks/useHomeworkCount';
import { Badge } from '@/components/ui/badge';

const Header: React.FC = () => {
  const { user, userPreferences, profile, memberships, role, logout } = useAuth();
  const navigate = useNavigate();
  const { homeworkCount } = useHomeworkCount();
  const isStudent =
    role === 'student' ||
    (!role && memberships.some((membership) => membership.role === 'student'));

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate('/auth');
  }, [logout, navigate]);

  const handleHomeworkClick = useCallback(() => {
    navigate('/dashboard?status=homework#task-filters', { state: { focus: 'homework', at: Date.now() } });
  }, [navigate]);

  const initials = useMemo(() => {
    if (userPreferences?.fullName) {
      return userPreferences.fullName
        .split(' ')
        .filter(Boolean)
        .map((name) => name[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }
    return (
      profile?.email?.substring(0, 2).toUpperCase() ||
      user?.email?.substring(0, 2).toUpperCase() ||
      'U'
    );
  }, [profile?.email, user?.email, userPreferences?.fullName]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link
          to={user ? '/dashboard' : '/'}
          className="text-lg font-semibold tracking-tight text-primary transition-colors hover:text-primary/90"
        >
          Exameny
        </Link>

        {user && (
          <nav className="flex items-center gap-1 md:gap-3" aria-label="User navigation">
            {isStudent && (
              <>
                <Button asChild variant="ghost" className="rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-primary">
                  <Link to="/speaking" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">Speaking</span>
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-primary"
                  onClick={handleHomeworkClick}
                >
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden sm:inline">Homework</span>
                  {homeworkCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-1 h-5 min-w-[1.5rem] justify-center px-1 text-[11px] font-semibold leading-tight"
                      aria-label={`${homeworkCount > 99 ? '99+' : homeworkCount} homework items`}
                    >
                      {homeworkCount > 99 ? '99+' : homeworkCount}
                    </Badge>
                  )}
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Open profile menu">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {userPreferences?.fullName || profile?.email || user?.email || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {profile?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center">
                    <UserCog className="mr-2 h-4 w-4" />
                    Profile Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-500 dark:focus:bg-red-700/20 dark:focus:text-red-400"
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        )}

        {!user && (
          <Button asChild variant="default" size="sm">
            <Link to="/auth">Sign In</Link>
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
