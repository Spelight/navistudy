export type PassportAccount = { id?: string | number; username: string; status?: string };
export type PassportSession = { account: PassportAccount | null; csrfToken?: string };

export type CourseRecordStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "EXEMPTED" | "IGNORED" | "CANDIDATE";
export type RequirementCategory = "REQUIRED" | "MAJOR_ELECTIVE" | "LIMITED_ELECTIVE" | "GENERAL" | "AESTHETIC" | "LABOR" | "PRACTICE" | "FREE_ELECTIVE";
export type RequirementRuleKind = "CREDIT_TOTAL" | "CHOOSE_COURSES_FROM_POOL" | "LANGUAGE_TRACK" | "ADDITIONAL_INDICATOR";

export type StudentCourseRecord = {
  id: string;
  courseCode: string | null;
  courseName: string;
  credits: number;
  termCode: string;
  termName: string;
  category: RequirementCategory;
  source: string;
  status: CourseRecordStatus;
  manualCategory?: RequirementCategory | null;
  manualNote?: string | null;
  requirementGroupId?: string | null;
  requirementGroupName?: string | null;
  courseNature?: string | null;
  plannedTermCode?: string | null;
  plannedTermName?: string | null;
  offeredTermCode?: string | null;
  offeredTermName?: string | null;
  offeringClassCount?: number | null;
  offeredThisTerm?: boolean | null;
  selectedThisTerm?: boolean | null;
};

export type CourseOverride = {
  status?: CourseRecordStatus;
  manualCategory?: RequirementCategory;
  credits?: number;
  manualNote?: string | null;
};

export type RequirementRule = { id: string; label: string; courseCodes: string[]; courseNameKeywords: string[] };
export type RequirementGroup = {
  id: string;
  name: string;
  category: RequirementCategory;
  requiredCredits: number;
  requiredCourses: number;
  ruleKind: RequirementRuleKind;
  ruleHint?: string | null;
  rules: RequirementRule[];
  children?: RequirementGroup[];
  sourceEarnedCredits?: number | null;
  sourceInProgressCredits?: number | null;
  sourcePlannedCredits?: number | null;
  sourceSatisfied?: boolean | null;
};

export type CurriculumPlan = {
  id: string;
  version: string;
  studentGrade: string;
  college: string;
  major: string;
  source: string;
  groups: RequirementGroup[];
  updatedAt: number;
  sourceRequiredCredits?: number | null;
  sourceEarnedCredits?: number | null;
  sourceInProgressCredits?: number | null;
  sourceOutOfProgramCredits?: number | null;
};

export type RequirementAudit = {
  group: RequirementGroup;
  earnedCredits: number;
  inProgressCredits: number;
  plannedCredits: number;
  missingCredits: number;
  earnedCourseCount: number;
  inProgressCourseCount: number;
  plannedCourseCount: number;
  candidateCourseIds: string[];
  missingCourseCount: number;
  satisfied: boolean;
  matchedCourseIds: string[];
};

export type PlanningRisk = { id: string; severity: string; title: string; message: string; courseId?: string | null; groupId?: string | null };
export type CourseRecommendation = {
  id: string;
  groupId: string;
  category: RequirementCategory;
  courseCode: string | null;
  courseName: string;
  credits: number;
  usuallyOfferedTerms: string[];
  suggestedTerm: string;
  reason: string;
};

export type CreditAudit = {
  plan: CurriculumPlan;
  courses: StudentCourseRecord[];
  totalEarnedCredits: number;
  totalInProgressCredits: number;
  totalPlannedCredits: number;
  totalRequiredCredits: number;
  requirementAudits: RequirementAudit[];
  risks: PlanningRisk[];
  generatedAt: number;
};

export type DegreeProfile = {
  username: string | null;
  grade: string;
  college: string;
  major: string;
  portal: string;
  autoDetected: boolean;
  message: string;
};

export type PlanSource = { kind: string; endpoint?: string | null; note: string };
export type PlanSnapshot = {
  schemaVersion: 1;
  student: DegreeProfile;
  plan: CurriculumPlan;
  requirements: RequirementGroup[];
  coursePool: StudentCourseRecord[];
  languageTracks: RequirementGroup[];
  courses: StudentCourseRecord[];
  manualCorrections: Record<string, CourseOverride>;
  audit: CreditAudit;
  recommendations: CourseRecommendation[];
  importedAt: number;
  updatedAt: number;
  source: PlanSource;
};

export type PlanPassportSyncResponse = {
  product: "plan";
  revision: number;
  schemaVersion: 1;
  document: Partial<PlanSnapshot>;
  updatedAt: number | null;
};

export type Term = { itemCode: string; itemName: string; selected: boolean; itemIndex: number };
