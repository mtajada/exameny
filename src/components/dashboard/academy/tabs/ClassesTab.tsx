import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { CheckedState } from '@radix-ui/react-checkbox';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { School, Plus, Users, RefreshCw, UserCheck, UserPlus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Types
interface Class {
  id: number;
  name: string;
  description: string | null;
  member_count?: number;
}

interface AcademyMember {
  id: number; // This is the academy_memberships.id
  user_id: string; // This is the profiles.id (UUID)
  email: string;
  role: 'student' | 'teacher';
  displayName: string | null;
}

// Type for data coming from Supabase query
interface SupabaseAcademyMember {
  id: number;
  user_id: string;
  email: string;
  role: string; // Supabase returns string, not union type
  profiles?: {
    email: string | null;
    user_preferences?: { full_name: string | null } | null;
  } | null;
}

// Helper function to convert Supabase data to our AcademyMember type
const convertToAcademyMember = (member: SupabaseAcademyMember): AcademyMember | null => {
  if (member.role !== 'student' && member.role !== 'teacher') {
    return null; // Skip invalid roles
  }
  return {
    id: member.id,
    user_id: member.user_id,
    email: member.email,
    role: member.role as 'student' | 'teacher',
    displayName:
      member.profiles?.user_preferences?.full_name ??
      member.email ??
      member.profiles?.email ??
      null,
  };
};

// Helper function to safely extract error message from unknown error
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
};

// Helper function to check if error has a specific code
const hasErrorCode = (error: unknown, code: string): boolean => {
  return error && typeof error === 'object' && 'code' in error && error.code === code;
};

// Main Component
export default function ClassesTab() {
  const { activeAcademyId } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const academyIdRef = useRef<number | null>(activeAcademyId);

  // State for dialogs
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // State for creating a class
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [availableTeachers, setAvailableTeachers] = useState<AcademyMember[]>([]);
  const [availableStudents, setAvailableStudents] = useState<AcademyMember[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [isLoadingCreateMembers, setIsLoadingCreateMembers] = useState(false);

  // State for managing members
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [classMembers, setClassMembers] = useState<AcademyMember[]>([]);
  const [availableMembers, setAvailableMembers] = useState<AcademyMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    academyIdRef.current = activeAcademyId;
    if (!activeAcademyId) {
      setClasses([]);
      setIsLoading(false);
      setError('Select an academy to view classes.');
    }
  }, [activeAcademyId]);

  const fetchClasses = useCallback(async () => {
    const requestedAcademyId = activeAcademyId;

    if (!requestedAcademyId) {
      setClasses([]);
      setError('Select an academy to view classes.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          description,
          created_at,
          class_members!inner(count)
        `)
        .eq('academy_id', requestedAcademyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedClasses = data?.map(cls => ({
        ...cls,
        member_count: Array.isArray(cls.class_members) ? cls.class_members[0]?.count || 0 : 0
      })) || [];
      if (academyIdRef.current !== requestedAcademyId) return;
      setClasses(processedClasses);
      setError(null);
    } catch (err) {
      if (academyIdRef.current !== requestedAcademyId) return;
      setError('Could not load the class list. Please check your connection and try refreshing the page.');
      setClasses([]);
      console.error('Failed to load classes:');
    } finally {
      if (academyIdRef.current === requestedAcademyId) {
        setIsLoading(false);
      }
    }
  }, [activeAcademyId]);

  useEffect(() => {
    fetchClasses();
  }, [activeAcademyId, fetchClasses]);

  const openCreateClassDialog = async () => {
    const requestedAcademyId = academyIdRef.current;
    if (!requestedAcademyId) {
      setError('Select an academy to manage classes.');
      return;
    }

    // Reset all create dialog state
    setNewClassName('');
    setNewClassDescription('');
    setSelectedTeacher(null);
    setSelectedStudents(new Set());
    setAvailableTeachers([]);
    setAvailableStudents([]);

    setIsLoadingCreateMembers(true);
    setIsCreateModalOpen(true);

    try {
      const { data, error } = await supabase
        .from('academy_memberships')
        .select('id, user_id, email, role, profiles:profiles(user_preferences(full_name), email)')
        .eq('academy_id', requestedAcademyId)
        .eq('status', 'active') as { data: SupabaseAcademyMember[] | null; error: Error | null };

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      const convertedMembers = data.map(convertToAcademyMember).filter(Boolean) as AcademyMember[];
      if (academyIdRef.current !== requestedAcademyId) {
        return;
      }
      setAvailableTeachers(convertedMembers.filter(m => m.role === 'teacher'));
      setAvailableStudents(convertedMembers.filter(m => m.role === 'student'));

    } catch (err) {
      toast({ title: "Error Loading Members", description: "Could not load the list of teachers and students. Please close this window and try again.", variant: "destructive" });
      setIsLoadingCreateMembers(false);
      setIsCreateModalOpen(false); // Close dialog on error
    } finally {
      if (academyIdRef.current === requestedAcademyId) {
        setIsLoadingCreateMembers(false);
      }
    }
  };

  const handleCreateClass = async () => {
    const requestedAcademyId = academyIdRef.current;
    if (!requestedAcademyId || !newClassName.trim()) {
      setError('Select an academy to manage classes.');
      return;
    }

    if (!selectedTeacher) {
      toast({ title: "Validation Error", description: "You must select a teacher for the class.", variant: "destructive" });
      return;
    }

    setIsCreating(true);

    // === PRE-FLIGHT CHECKS (Phase 2 of Plan) ===
    const studentMembershipIds = Array.from(selectedStudents);
    if (studentMembershipIds.length > 0) {
      const { data: existingMembers, error: existingMembersError } = await supabase
        .from('class_members')
        .select('membership_id, classes(name)')
        .in('membership_id', studentMembershipIds);

      if (existingMembersError) {
        toast({ title: "Validation Error", description: `Could not verify student status: ${existingMembersError.message}`, variant: "destructive" });
        setIsCreating(false);
        return;
      }

      if (existingMembers && existingMembers.length > 0) {
        const studentIdToClassMap = new Map<number, string>();
        existingMembers.forEach(em => {
          if (em.classes) { // Type guard for non-null class
            studentIdToClassMap.set(em.membership_id, em.classes.name);
          }
        });

        const conflictingStudents = availableStudents
          .filter(s => studentIdToClassMap.has(s.id))
          .map(s => {
            const studentName = s.displayName || s.email;
            const className = studentIdToClassMap.get(s.id);
            return `${studentName} (in class '${className}')`;
          });

        if (conflictingStudents.length > 0) {
          toast({
            title: "Student Already in a Class",
            description: `The following students are already enrolled: ${conflictingStudents.join(', ')}. Please remove them from their current class first.`,
            variant: "destructive",
            duration: 10000,
          });
          setIsCreating(false);
          return;
        }
      }
    }
    // === END PRE-FLIGHT CHECKS ===

    let newClassId: number | null = null;
    try {
      // Step 1: Create the class
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .insert({
          academy_id: requestedAcademyId,
          name: newClassName.trim(),
          description: newClassDescription.trim() || null
        })
        .select('id')
        .single();

      if (classError) throw classError;
      if (!classData) throw new Error("Failed to get new class ID.");
      newClassId = classData.id;

      // Step 2: Add all members to the class
      const allSelectedMemberIds: number[] = [selectedTeacher, ...studentMembershipIds];
      const membersToInsert = allSelectedMemberIds.map(memberId => ({
        class_id: newClassId,
        membership_id: memberId
      }));

      const { error: membersError } = await supabase
        .from('class_members')
        .insert(membersToInsert);

      if (membersError) {
        throw new Error(`Failed to add members to class: ${membersError.message}`);
      }

      // Step 3: Update student_profiles with assigned_teacher_id
      const teacherProfile = availableTeachers.find(t => t.id === selectedTeacher);
      if (!teacherProfile) throw new Error("Could not find the selected teacher's profile data.");
      const teacherUserId = teacherProfile.user_id;

      const selectedStudentRecords = availableStudents.filter(s => selectedStudents.has(s.id));
      const studentMembershipIdsForProfiles = selectedStudentRecords.map(s => s.id);
      if (studentMembershipIdsForProfiles.length > 0) {
        // Check which students already have student_profiles to preserve their data
        const { data: existingProfiles, error: checkError } = await supabase
          .from('student_profiles')
          .select('membership_id')
          .in('membership_id', studentMembershipIdsForProfiles);

        if (checkError) {
          throw new Error(`Failed to check existing student profiles: ${checkError.message}`);
        }

        const existingMembershipIds = new Set(existingProfiles?.map(p => p.membership_id) || []);

        // Update existing profiles (preserve their target_exam_id and target_level_id)
        if (existingMembershipIds.size > 0) {
          const { error: updateError } = await supabase
            .from('student_profiles')
            .update({ assigned_teacher_id: teacherUserId })
            .in('membership_id', Array.from(existingMembershipIds));

          if (updateError) {
            throw new Error(`Failed to update existing student profiles: ${updateError.message}`);
          }
        }

        // Insert new profiles for students who don't have one yet
        const studentsMissingProfiles = selectedStudentRecords.filter(student => !existingMembershipIds.has(student.id));
        if (studentsMissingProfiles.length > 0) {
          const nullTargetExamId: number | null = null;
          const nullTargetLevelId: number | null = null;
          const newProfiles: TablesInsert<'student_profiles'>[] = studentsMissingProfiles.map(student => ({
            membership_id: student.id,
            user_id: student.user_id,
            assigned_teacher_id: teacherUserId,
            target_exam_id: nullTargetExamId,
            target_level_id: nullTargetLevelId
          }));

          const { error: insertError } = await supabase
            .from('student_profiles')
            .insert(newProfiles);

          if (insertError) {
            throw new Error(`Failed to create new student profiles: ${insertError.message}`);
          }
        }

      }

      toast({ title: "Class Created Successfully", description: `"${newClassName}" has been created and teacher assigned.` });
      setIsCreateModalOpen(false);
      fetchClasses();

    } catch (err: unknown) {
      console.error('Error creating class:');

      // FULL ROLLBACK: If any step failed after the class was created, delete the class.
      // The 'class_members' are deleted via CASCADE constraint.
      if (newClassId) {
        await supabase.from('classes').delete().eq('id', newClassId);
        toast({
          title: "Error & Rollback",
          description: `A critical error occurred. The class was not created. Details: ${getErrorMessage(err)}`,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        // Handle errors that happened before the class was created (e.g., unique name constraint)
        if (hasErrorCode(err, '23505')) {
          toast({
            title: "Class Name Exists",
            description: `A class named "${newClassName.trim()}" already exists. Please choose a different name.`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Creation Failed",
            description: `An unexpected error occurred: ${getErrorMessage(err)}`,
            variant: "destructive"
          });
        }
      }
    } finally {
      setIsCreating(false);
    }
  };

  const memberLookup = useMemo(() => {
    const map = new Map<number, AcademyMember>();
    for (const member of availableMembers) {
      map.set(member.id, member);
    }
    for (const member of classMembers) {
      if (!map.has(member.id)) {
        map.set(member.id, member);
      }
    }
    return map;
  }, [availableMembers, classMembers]);

  const enforceTeacherSelection = () => {
    toast({
      title: "Teacher required",
      description: "Select another teacher before removing the current one.",
      variant: "destructive",
    });
  };

  const handleMemberToggle = (member: AcademyMember, checked: CheckedState) => {
    const isChecked = checked === true;
    let blocked = false;
    setSelectedMemberIds(prev => {
      if (isChecked) {
        const next = new Set(prev);
        if (member.role === 'teacher') {
          memberLookup.forEach(candidate => {
            if (candidate.role === 'teacher') {
              next.delete(candidate.id);
            }
          });
        }
        next.add(member.id);
        return next;
      }

      if (member.role === 'teacher') {
        const otherTeacherSelected = Array.from(prev).some(id => {
          if (id === member.id) return false;
          return memberLookup.get(id)?.role === 'teacher';
        });
        if (!otherTeacherSelected) {
          blocked = true;
          return prev;
        }
      }

      const next = new Set(prev);
      next.delete(member.id);
      return next;
    });

    if (blocked) {
      enforceTeacherSelection();
    }
  };

  const openManageMembers = async (classItem: Class) => {
    const requestedAcademyId = academyIdRef.current;
    if (!requestedAcademyId) {
      toast({ title: "Select an academy", description: "Choose an academy before managing class members.", variant: "destructive" });
      return;
    }
    setSelectedClass(classItem);
    setIsMembersModalOpen(true);
    setIsLoadingMembers(true);
    try {
      // Fetch current members of the class
      const { data: membersData, error: membersError } = await supabase
        .from('class_members')
        .select(`
          membership_id,
          academy_memberships!inner(
            id,
            user_id,
            email,
            role,
            status,
            academy_id,
            profiles:profiles(user_preferences(full_name), email)
          )
        `)
        .eq('class_id', classItem.id)
        .eq('academy_memberships.academy_id', requestedAcademyId)
        .eq('academy_memberships.status', 'active');

      if (membersError) throw membersError;

      const currentMembersRaw = membersData?.map(cm => cm.academy_memberships).filter(Boolean) || [];
      const currentMembers = currentMembersRaw.map(convertToAcademyMember).filter(Boolean) as AcademyMember[];
      if (academyIdRef.current !== requestedAcademyId) return;
      setClassMembers(currentMembers);
      setSelectedMemberIds(new Set(currentMembers.map(m => m.id)));

      // Fetch all available members in the academy
      const { data: allMembersData, error: allMembersError } = await supabase
        .from('academy_memberships')
        .select('id, user_id, email, role, profiles:profiles(user_preferences(full_name), email)')
        .eq('academy_id', requestedAcademyId)
        .eq('status', 'active') as { data: SupabaseAcademyMember[] | null; error: Error | null };
      if (allMembersError) throw allMembersError;
      const convertedAllMembers = (allMembersData || []).map(convertToAcademyMember).filter(Boolean) as AcademyMember[];
      if (academyIdRef.current !== requestedAcademyId) return;
      setAvailableMembers(convertedAllMembers);
    } catch (err) {
      toast({ title: "Error Loading Members", description: "Could not load the member list for this class. Please close this window and try again.", variant: "destructive" });
      console.error('Failed to load members for class:');
    } finally {
      if (academyIdRef.current === requestedAcademyId) {
        setIsLoadingMembers(false);
      }
    }
  };

  const handleUpdateClassMembers = async () => {
    if (!selectedClass) return;
    setIsUpdatingMembers(true);
    try {
      const currentMemberIds = new Set(classMembers.map(m => m.id));
      const newMemberIds = selectedMemberIds;

      const selectedTeacher = Array.from(selectedMemberIds)
        .map(id => memberLookup.get(id))
        .find(member => member?.role === 'teacher');

      if (!selectedTeacher) {
        throw new Error('Select a teacher before saving changes.');
      }

      if (!selectedTeacher.user_id) {
        throw new Error('The selected teacher does not have a linked user.');
      }

      const teacherUserId = selectedTeacher.user_id;
      const finalStudentIds = Array.from(selectedMemberIds).filter(id => memberLookup.get(id)?.role === 'student');

      const toAddIds = Array.from(newMemberIds).filter(id => !currentMemberIds.has(id));
      const toRemoveIds = Array.from(currentMemberIds).filter(id => !newMemberIds.has(id));

      // --- Handle Removals ---
      if (toRemoveIds.length > 0) {
        const studentsToRemove = classMembers.filter(m => m.role === 'student' && toRemoveIds.includes(m.id));
        const studentMembershipIdsToRemove = studentsToRemove.map(s => s.id);

        if (studentMembershipIdsToRemove.length > 0) {
          const { error: updateError } = await supabase
            .from('student_profiles')
            .update({ assigned_teacher_id: null })
            .in('membership_id', studentMembershipIdsToRemove);
          if (updateError) throw new Error(`Failed to unassign teacher: ${updateError.message}`);
        }

        const { error: deleteError } = await supabase.from('class_members').delete().eq('class_id', selectedClass.id).in('membership_id', toRemoveIds);
        if (deleteError) throw new Error(`Failed to remove members: ${deleteError.message}`);
      }

      // --- Handle Additions ---
      if (toAddIds.length > 0) {
        const { error: insertError } = await supabase
          .from('class_members')
          .insert(toAddIds.map(id => ({ class_id: selectedClass.id, membership_id: id })));
        if (insertError) throw new Error(`Failed to add new members: ${insertError.message}`);
      }

      if (finalStudentIds.length > 0) {
        const { data: existingProfiles, error: checkError } = await supabase
          .from('student_profiles')
          .select('membership_id, user_id')
          .in('membership_id', finalStudentIds);

        if (checkError) {
          throw new Error(`Failed to check existing student profiles: ${checkError.message}`);
        }

        const existingMembershipIds = new Set(existingProfiles?.map(p => p.membership_id) || []);

        if (existingMembershipIds.size > 0) {
          const { error: updateError } = await supabase
            .from('student_profiles')
            .update({ assigned_teacher_id: teacherUserId })
            .in('membership_id', Array.from(existingMembershipIds));

          if (updateError) {
            throw new Error(`Failed to update existing student profiles: ${updateError.message}`);
          }
        }

        const missingProfileMembers = finalStudentIds.filter(id => !existingMembershipIds.has(id));
        if (missingProfileMembers.length > 0) {
          const nullTargetExamId: number | null = null;
          const nullTargetLevelId: number | null = null;
          const newProfiles = missingProfileMembers.map(id => {
            const member = memberLookup.get(id);
            if (!member?.user_id) {
              throw new Error('Could not determine the student user for profile creation.');
            }
            return {
              membership_id: id,
              user_id: member.user_id,
              assigned_teacher_id: teacherUserId,
              target_exam_id: nullTargetExamId,
              target_level_id: nullTargetLevelId,
            };
          });

          const { error: insertError } = await supabase.from('student_profiles').insert(newProfiles);
          if (insertError) {
            throw new Error(`Failed to create new student profiles: ${insertError.message}`);
          }
        }
      }

      toast({ title: "Class Updated", description: "Member list has been updated successfully." });
      setIsMembersModalOpen(false);
      fetchClasses();
    } catch (err: unknown) {
      toast({ title: "Update Failed", description: getErrorMessage(err), variant: "destructive", duration: 8000 });
      console.error('Failed to update class members:');
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleDeleteClass = async (classToDelete: Class) => {
    setIsDeleting(true);
    try {
      // Step 1: Get all student membership IDs from the class
      const { data: members, error: membersError } = await supabase
        .from('class_members')
        .select('membership_id, academy_memberships(user_id, role)')
        .eq('class_id', classToDelete.id);

      if (membersError) throw new Error(`Failed to fetch class members: ${membersError.message}`);

      const studentMembershipIds = members
        .filter(m => m.academy_memberships?.role === 'student')
        .map(m => m.membership_id);

      // Step 2: Unassign teacher from students
      if (studentMembershipIds.length > 0) {
        const { error: updateError } = await supabase
          .from('student_profiles')
          .update({ assigned_teacher_id: null })
          .in('membership_id', studentMembershipIds);
        if (updateError) throw new Error(`Failed to unassign teacher: ${updateError.message}`);
      }

      // Step 3: Delete the class (class_members will be deleted by cascade)
      const { error: deleteError } = await supabase.from('classes').delete().eq('id', classToDelete.id);
      if (deleteError) throw new Error(`Failed to delete class: ${deleteError.message}`);

      toast({ title: "Class Deleted", description: `The class "${classToDelete.name}" has been successfully deleted.` });
      fetchClasses(); // Refresh the list

    } catch (err: unknown) {
      toast({ title: "Deletion Failed", description: getErrorMessage(err), variant: "destructive", duration: 8000 });
      console.error('Failed to delete class:');
    } finally {
      setIsDeleting(false);
    }
  };

  const MemberSelectionList = ({
    title,
    members,
    selectedIds,
    onSelectionChange,
    icon: Icon
  }: {
    title: string;
    members: AcademyMember[];
    selectedIds: Set<number>;
    onSelectionChange: (newSet: Set<number>) => void;
    icon: React.ComponentType<{ className?: string }>;
  }) => (
    <div className="space-y-2">
      <h4 className="font-semibold flex items-center"><Icon className="h-5 w-5 mr-2" />{title}</h4>
      <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
        {members.length === 0 && <p className="text-sm text-gray-500 p-2">No available {title.toLowerCase()}.</p>}
        {members.map((member: AcademyMember) => (
          <div key={member.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
            <Checkbox
              id={`create-${title.toLowerCase()}-${member.id}`}
              checked={selectedIds.has(member.id)}
              onCheckedChange={checked => {
                const newSet = new Set(selectedIds);
                if (checked) newSet.add(member.id); else newSet.delete(member.id);
                onSelectionChange(newSet);
              }}
            />
            <Label htmlFor={`create-${title.toLowerCase()}-${member.id}`} className="flex-1 cursor-pointer">
              <div>{member.displayName || member.email}</div>
              <div className="text-xs text-gray-500">{member.email}</div>
            </Label>
          </div>
        ))}
      </div>
    </div>
  );


  if (isLoading) return <div className="p-4"><Skeleton className="h-10 w-1/3 mb-4" /><Skeleton className="h-40 w-full" /></div>;
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Class Management</h2>
          <p className="text-gray-600 dark:text-gray-400">Create and manage classes for your academy.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchClasses} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild><Button onClick={openCreateClassDialog}><Plus className="h-4 w-4 mr-2" />Create Class</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Create New Class</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="className">Class Name</Label>
                  <Input id="className" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="e.g., C1 Mornings" />
                </div>
                <div>
                  <Label htmlFor="classDesc">Description (Optional)</Label>
                  <Textarea id="classDesc" value={newClassDescription} onChange={e => setNewClassDescription(e.target.value)} placeholder="A brief description of the class" />
                </div>
                {isLoadingCreateMembers ? <Skeleton className="h-48 w-full" /> : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center"><UserCheck className="h-5 w-5 mr-2" />Teacher</h4>
                      <RadioGroup
                        value={selectedTeacher ? String(selectedTeacher) : ""}
                        onValueChange={(value) => setSelectedTeacher(Number(value))}
                        className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1"
                      >
                        {availableTeachers.length === 0 && <p className="text-sm text-gray-500 p-2">No available teachers.</p>}
                        {availableTeachers.map((teacher) => (
                          <div key={teacher.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                            <RadioGroupItem value={String(teacher.id)} id={`teacher-${teacher.id}`} />
                            <Label htmlFor={`teacher-${teacher.id}`} className="flex-1 cursor-pointer">
                              <div>{teacher.displayName || teacher.email}</div>
                              <div className="text-xs text-gray-500">{teacher.email}</div>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                    <MemberSelectionList
                      title="Students"
                      members={availableStudents}
                      selectedIds={selectedStudents}
                      onSelectionChange={setSelectedStudents}
                      icon={UserPlus}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleCreateClass} disabled={isCreating || isLoadingCreateMembers || !newClassName.trim()}>{isCreating ? 'Creating...' : 'Create Class'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.map((classItem) => (
          <Card key={classItem.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span>{classItem.name}</span>
                <Badge variant="secondary">{classItem.member_count} Members</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="text-sm text-gray-500 min-h-[40px]">{classItem.description || 'No description.'}</p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 p-6">
              <Button onClick={() => openManageMembers(classItem)} variant="outline" size="sm" className="w-full"><Users className="h-4 w-4 mr-2" />Manage Members</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting} className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the class "{classItem.name}" and remove all associated students. Their teacher assignments will be cleared.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteClass(classItem)} disabled={isDeleting}>
                      {isDeleting ? 'Deleting...' : 'Continue'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isMembersModalOpen} onOpenChange={setIsMembersModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Manage Members for {selectedClass?.name}</DialogTitle></DialogHeader>
          {isLoadingMembers ? <Skeleton className="h-40 w-full" /> : (
            <div className="py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                {availableMembers.map(member => (
                  <div key={member.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Checkbox
                      id={`manage-member-${member.id}`}
                      checked={selectedMemberIds.has(member.id)}
                      onCheckedChange={checked => handleMemberToggle(member, checked)}
                    />
                    <Label htmlFor={`manage-member-${member.id}`} className="flex-1 cursor-pointer">
                      <div>{member.displayName || member.email}</div>
                      <div className="text-xs text-gray-500">{member.email} - {member.role}</div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleUpdateClassMembers} disabled={isUpdatingMembers}>{isUpdatingMembers ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
