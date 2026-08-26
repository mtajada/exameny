// src/pages/ProfilePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle, User, ArrowLeft, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { saveUserPreferences } from '@/lib/auth/saveUserPreferences';

function isViteFlagEnabled(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

const INCLUDE_E2E_EXAMS = import.meta.env.DEV && isViteFlagEnabled(import.meta.env.VITE_INCLUDE_E2E_EXAMS);

type ExamType = {
  id: number;
  name: string;
};

type LevelType = {
  id: number;
  name: string;
  code: string;
};

const ProfilePage: React.FC = () => {
  const {
    user,
    role: userRole,
    profile: authProfile,
    userPreferences,
    refreshUserProfile,
  } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Inputs
  const [fullNameInput, setFullNameInput] = useState<string>('');
  const [selectedExamIdInput, setSelectedExamIdInput] = useState<string>('');
  const [selectedLevelIdInput, setSelectedLevelIdInput] = useState<string>('');

  // Initial values to detect changes
  const [initialFullName, setInitialFullName] = useState<string>('');
  const [initialExamId, setInitialExamId] = useState<string>('');
  const [initialLevelId, setInitialLevelId] = useState<string>('');

  // Lists for dropdowns
  const [allExams, setAllExams] = useState<Array<ExamType>>([]);
  const [availableLevels, setAvailableLevels] = useState<Array<LevelType>>([]);

  // Loading and UI states
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(true);
  const [isLoadingExams, setIsLoadingExams] = useState<boolean>(false);
  const [isLoadingLevels, setIsLoadingLevels] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState<boolean>(false);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const potentialMessage = (error as { message?: unknown }).message;
      if (typeof potentialMessage === 'string' && potentialMessage.trim().length > 0) {
        return potentialMessage;
      }
    }
    return 'Unexpected error';
  };

  // useEffect to load initial data
  useEffect(() => {
    if (!user || !authProfile) {
      setIsLoadingPage(false);
      if (!user) {
        setError("User not authenticated.");
      } else {
        setError("Could not load profile information from context.");
      }
      return;
    }

    setIsLoadingPage(true);
    setFullNameInput(userPreferences?.fullName || '');
    setInitialFullName(userPreferences?.fullName || '');
    setError(null);

    if (userRole === 'student') {
      const resolvedExamId = userPreferences?.targetExamId != null ? String(userPreferences.targetExamId) : '';
      const resolvedLevelId = userPreferences?.targetLevelId != null ? String(userPreferences.targetLevelId) : '';

      setSelectedExamIdInput(resolvedExamId);
      setInitialExamId(resolvedExamId);
      setSelectedLevelIdInput(resolvedLevelId);
      setInitialLevelId(resolvedLevelId);

      setIsLoadingExams(true);
      const fetchStudentData = async () => {
        try {
          let query = supabase.from('exam_types').select('id, name');
          if (!INCLUDE_E2E_EXAMS) {
            query = query.not('code', 'ilike', 'E2E_EXAM_%');
          }

          const { data: exams, error: examsError } = await query.order('name');

          if (examsError) {
            throw new Error(`Exam types: ${examsError.message}`);
          }

          setAllExams(exams || []);
        } catch (error: unknown) {
          const message = getErrorMessage(error);
          console.error("Error fetching student data:");
          setError(message);
          toast({
            title: "Error Loading Data",
            description: message,
            variant: "destructive",
          });
        } finally {
          setIsLoadingExams(false);
          setIsLoadingPage(false);
        }
      };
      fetchStudentData();
    } else {
      setIsLoadingPage(false);
    }
  }, [user, userRole, authProfile, userPreferences, toast]);

  // useEffect to load filtered levels for students
  useEffect(() => {
    if (userRole === 'student' && selectedExamIdInput) {
      setIsLoadingLevels(true);
      setError(null);
      const fetchLevelsForExam = async () => {
        try {
          const { data: levelsData, error: levelsError } = await supabase
            .from('exam_task_types')
            .select('level_id, levels (id, name, code)')
            .eq('exam_type_id', parseInt(selectedExamIdInput))
            .order('levels(id)');

          if (levelsError) {
            throw new Error(`Levels: ${levelsError.message}`);
          }

          const uniqueLevels = levelsData
            ?.map(item => item.levels)
            .filter(level => level !== null) as LevelType[];

          const distinctLevels = Array.from(new Map(uniqueLevels.map(level => [level.id, level])).values());

          setAvailableLevels(distinctLevels || []);
          if (initialExamId !== selectedExamIdInput) {
            if (!distinctLevels.find(l => String(l.id) === selectedLevelIdInput)) {
              setSelectedLevelIdInput('');
            }
          }

        } catch (error: unknown) {
          const message = getErrorMessage(error);
          console.error("Error fetching levels:");
          setError(message);
          toast({
            title: "Error Loading Levels",
            description: message,
            variant: "destructive",
          });
          setAvailableLevels([]);
        } finally {
          setIsLoadingLevels(false);
        }
      };
      fetchLevelsForExam();
    } else if (userRole === 'student') {
      setAvailableLevels([]);
    }
  }, [userRole, selectedExamIdInput, selectedLevelIdInput, initialExamId, toast]);

  const hasChanges = useCallback(() => {
    if (fullNameInput !== initialFullName) return true;
    if (userRole === 'student') {
      if (selectedExamIdInput !== initialExamId) return true;
      if (selectedLevelIdInput !== initialLevelId) return true;
    }
    return false;
  }, [fullNameInput, initialFullName, userRole, selectedExamIdInput, initialExamId, selectedLevelIdInput, initialLevelId]);

  const finishStudentSaveAttempt = useCallback(() => {
    setIsSaving(false);
    setShowConfirmationModal(false);
  }, []);

  const notifyStudentRecoverableError = useCallback(
    (title: string, description: string) => {
      toast({ title, description, variant: "destructive" });
      finishStudentSaveAttempt();
    },
    [toast, finishStudentSaveAttempt],
  );

  const saveStudentProfile = async () => {
    setIsSaving(true);
    setError(null);

    if (!user) {
      notifyStudentRecoverableError("Error", "User not identified.");
      return;
    }

    if (!selectedExamIdInput || !selectedLevelIdInput) {
      notifyStudentRecoverableError("Error", "Missing data to save student profile.");
      return;
    }

    const sanitizedFullName = fullNameInput.trim();
    const initialFullNameTrimmed = initialFullName.trim();
    const fullNameChanged = sanitizedFullName !== initialFullNameTrimmed;

    if (fullNameChanged && sanitizedFullName.length === 0) {
      const message = "Full name cannot be empty.";
      notifyStudentRecoverableError("Validation Error", message);
      return;
    }

    const parsedExamId = Number.parseInt(selectedExamIdInput, 10);
    const parsedLevelId = Number.parseInt(selectedLevelIdInput, 10);

    if (Number.isNaN(parsedExamId) || Number.isNaN(parsedLevelId)) {
      const message = "Invalid exam or level selected.";
      notifyStudentRecoverableError("Error", message);
      return;
    }

    try {
      await saveUserPreferences({
        targetExamId: parsedExamId,
        targetLevelId: parsedLevelId,
        ...(fullNameChanged
          ? { fullName: sanitizedFullName, fullNameProvided: true }
          : {}),
      });

      toast({ title: "Profile Updated", description: "Your student profile has been updated." });
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
      setInitialFullName(sanitizedFullName);
      setFullNameInput(sanitizedFullName);
      setInitialExamId(String(parsedExamId));
      setSelectedExamIdInput(String(parsedExamId));
      setInitialLevelId(String(parsedLevelId));
      setSelectedLevelIdInput(String(parsedLevelId));
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error("Error saving student profile:");
      setError(`Error saving student profile: ${message}`);
      toast({ title: "Save Error", description: message, variant: "destructive" });
    } finally {
      finishStudentSaveAttempt();
    }
  };

  const saveTeacherProfile = async () => {
    setIsSaving(true);
    setError(null);

    if (!user) {
      toast({ title: "Error", description: "User not identified.", variant: "destructive" });
      setIsSaving(false);
      return;
    }
    try {
      const sanitizedFullName = fullNameInput.trim();
      await saveUserPreferences({
        fullName: sanitizedFullName,
        fullNameProvided: true,
      });

      toast({ title: "Profile Updated", description: "Your name has been updated." });
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
      setInitialFullName(sanitizedFullName);
      setFullNameInput(sanitizedFullName);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error("Error saving teacher profile:");
      setError(`Error saving profile: ${message}`);
      toast({ title: "Save Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    if (!hasChanges()) {
      toast({ title: "No Changes", description: "You haven't made any changes to your profile.", variant: "default" });
      return;
    }

    setError(null);

    const examOrLevelChanged = userRole === 'student' &&
      (initialExamId !== selectedExamIdInput || initialLevelId !== selectedLevelIdInput) &&
      (initialExamId !== '' && initialLevelId !== '');

    if (userRole === 'student') {
      if (examOrLevelChanged) {
        setIsSaving(false);
        setShowConfirmationModal(true);
        return;
      } else {
        await saveStudentProfile();
      }
    } else if (userRole === 'teacher' || userRole === 'academy_admin') {
      await saveTeacherProfile();
    }
  };


  if (isLoadingPage && !error) {
    return (
      <div className="min-h-screen bg-muted/20 py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-6">
              <Skeleton className="h-8 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-10 w-full" />
              </div>
              {userRole === 'student' && (
                <>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </>
              )}
              <Skeleton className="h-10 w-1/3 mt-4" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/20 py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4">
          <Alert variant="destructive">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="font-semibold">Error</AlertTitle>
            <AlertDescription className="text-foreground">{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4">
        {/* Page Header */}
        <header className="space-y-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
          <h1 className="text-3xl font-semibold text-foreground">Profile Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account preferences and exam targets.
          </p>
        </header>

        {/* Profile Card */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">Personal Information</CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  {userRole === 'student'
                    ? 'Update your name and exam preferences.'
                    : 'Update your display name.'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium text-foreground">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  placeholder="Your full name"
                  disabled={isSaving}
                  className="h-10"
                />
              </div>

              {userRole === 'student' && (
                <>
                  {/* Exam Preferences Section */}
                  <div className="pt-4 border-t border-border/60">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 rounded-full bg-teal-100">
                        <Target className="h-4 w-4 text-teal-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Exam Preferences</span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="examType" className="text-sm font-medium text-foreground">Target Exam</Label>
                        <Select
                          value={selectedExamIdInput}
                          onValueChange={(value) => {
                            setSelectedExamIdInput(value);
                          }}
                          disabled={isSaving || isLoadingExams || isLoadingLevels}
                        >
                          <SelectTrigger
                            id="examType"
                            disabled={isLoadingExams || isSaving}
                            className="h-10"
                          >
                            <SelectValue placeholder={isLoadingExams ? "Loading exams..." : "Select an exam"} />
                          </SelectTrigger>
                          <SelectContent>
                            {isLoadingExams ? (
                              <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : allExams.length > 0 ? (
                              allExams.map(exam => (
                                <SelectItem key={exam.id} value={String(exam.id)}>
                                  {exam.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="no-exams" disabled>No exams available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="level" className="text-sm font-medium text-foreground">Target Level</Label>
                        <Select
                          value={selectedLevelIdInput}
                          onValueChange={setSelectedLevelIdInput}
                          disabled={isSaving || isLoadingLevels || !selectedExamIdInput || availableLevels.length === 0}
                        >
                          <SelectTrigger
                            id="level"
                            disabled={isLoadingLevels || !selectedExamIdInput || availableLevels.length === 0 || isSaving}
                            className="h-10"
                          >
                            <SelectValue placeholder={isLoadingLevels ? "Loading levels..." : (!selectedExamIdInput ? "Select an exam first" : (availableLevels.length === 0 && !isLoadingLevels ? "No levels for this exam" : "Select a level"))} />
                          </SelectTrigger>
                          <SelectContent>
                            {isLoadingLevels ? (
                              <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : availableLevels.length > 0 ? (
                              availableLevels.map(level => (
                                <SelectItem key={level.id} value={String(level.id)}>
                                  {level.name} ({level.code})
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="no-levels" disabled>
                                {!selectedExamIdInput ? "Select an exam" : "No levels available"}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {(() => {
                const examChanged = userRole === 'student' && initialExamId !== selectedExamIdInput && initialExamId !== '';
                const levelChanged = userRole === 'student' && initialLevelId !== selectedLevelIdInput && initialLevelId !== '';
                const examOrLevelChanged = examChanged || levelChanged;

                if (userRole === 'student' && examOrLevelChanged) {
                  return (
                    <Alert variant="default" className="mt-4 bg-accent/50 border-accent">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <AlertTitle className="text-sm font-semibold text-foreground">Notice</AlertTitle>
                      <AlertDescription className="text-sm text-muted-foreground">
                        Changing your target exam or level will affect AI suggestions and your progress view. Your past results will not be modified.
                      </AlertDescription>
                    </Alert>
                  );
                }
                return null;
              })()}

              <div className="pt-6 mt-2 border-t border-border/60">
                <Button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={isSaving || !hasChanges() || isLoadingPage}
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>

              {userRole === 'student' && (
                <AlertDialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
                  <AlertDialogContent className="border-border shadow-lg">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-xl font-semibold text-foreground">Confirm Changes?</AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground mt-2">
                        You are about to change your target exam or level. This will affect AI suggestions and your progress view. Your past results will not be modified.
                        Are you sure you want to continue?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6">
                      <AlertDialogCancel
                        onClick={() => setIsSaving(false)}
                        disabled={isSaving}
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={saveStudentProfile}
                        disabled={isSaving}
                      >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm and Save
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
