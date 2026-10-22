import type { CourseRecordStatus, CreditAudit, StudentCourseRecord } from "./types";

export type FutureCourseItem = {
  course: StudentCourseRecord;
  requirements: string[];
  unmetRequirements: string[];
};

export type FutureRequirementGap = {
  id: string;
  name: string;
  missingCredits: number;
  missingCourseCount: number;
};

function actionableAudits(audit: CreditAudit) {
  const auditIds = new Set(audit.requirementAudits.map((item) => item.group.id));
  return audit.requirementAudits.filter((item) =>
    !(item.group.children?.length) || item.group.children.some((child) => !auditIds.has(child.id))
  );
}

function futureCourseSort(left: FutureCourseItem, right: FutureCourseItem) {
  const statusPriority: Partial<Record<CourseRecordStatus, number>> = { FAILED: 0, PLANNED: 1, CANDIDATE: 2 };
  const leftStatus = statusPriority[left.course.status] ?? 3;
  const rightStatus = statusPriority[right.course.status] ?? 3;
  if (leftStatus !== rightStatus) return leftStatus - rightStatus;
  if (left.course.offeredThisTerm !== right.course.offeredThisTerm) return left.course.offeredThisTerm ? -1 : 1;
  return left.course.courseName.localeCompare(right.course.courseName, "zh-CN");
}

export function buildFutureCourseBuckets(audit: CreditAudit, coursePool: StudentCourseRecord[]) {
  const coursesById = new Map<string, StudentCourseRecord>();
  coursePool.forEach((course) => coursesById.set(course.id, course));
  audit.courses.forEach((course) => coursesById.set(course.id, { ...coursesById.get(course.id), ...course }));

  const requirementsByCourse = new Map<string, string[]>();
  const unmetRequirementsByCourse = new Map<string, string[]>();
  const requiredByGroup = new Set<string>();
  const choiceByGroup = new Set<string>();

  actionableAudits(audit).forEach((item) => {
    const mappedCourseIds = [...new Set([...item.candidateCourseIds, ...item.matchedCourseIds])];
    mappedCourseIds.forEach((courseId) => {
      requirementsByCourse.set(courseId, [...new Set([...(requirementsByCourse.get(courseId) ?? []), item.group.name])]);
      if (!item.satisfied) {
        unmetRequirementsByCourse.set(courseId, [...new Set([...(unmetRequirementsByCourse.get(courseId) ?? []), item.group.name])]);
      }
      if (!item.satisfied && item.group.category === "REQUIRED" && item.group.ruleKind !== "CHOOSE_COURSES_FROM_POOL") requiredByGroup.add(courseId);
      if (!item.satisfied && (
        item.group.ruleKind === "CHOOSE_COURSES_FROM_POOL" ||
        item.group.category === "LIMITED_ELECTIVE" ||
        item.group.category === "MAJOR_ELECTIVE"
      )) choiceByGroup.add(courseId);
    });
  });

  type Candidate = FutureCourseItem & { required: boolean; limited: boolean };
  const candidates = new Map<string, Candidate>();

  coursesById.forEach((course) => {
    if (
      course.selectedThisTerm ||
      course.status === "COMPLETED" ||
      course.status === "EXEMPTED" ||
      course.status === "IN_PROGRESS" ||
      course.status === "IGNORED"
    ) return;
    const mappedRequirements = requirementsByCourse.get(course.id) ?? [];
    const hasUnmetRequirement = (unmetRequirementsByCourse.get(course.id) ?? []).length > 0;
    const isRequired = requiredByGroup.has(course.id) || (
      course.status === "FAILED" && mappedRequirements.length > 0 && course.courseNature?.includes("必修") === true
    );
    const isLimited = !isRequired && choiceByGroup.has(course.id);
    if (!hasUnmetRequirement && course.status !== "FAILED") return;
    if (!isRequired && !isLimited) return;

    const identity = (course.courseCode?.trim().toUpperCase() || course.id || course.courseName.trim()).toLowerCase();
    const current = candidates.get(identity);
    const requirements = [...new Set([...(current?.requirements ?? []), ...(requirementsByCourse.get(course.id) ?? [])])];
    const unmetRequirements = [...new Set([...(current?.unmetRequirements ?? []), ...(unmetRequirementsByCourse.get(course.id) ?? [])])];
    const incoming = { course, requirements, unmetRequirements, required: isRequired, limited: isLimited };
    if (!current) {
      candidates.set(identity, incoming);
      return;
    }
    const preferred = futureCourseSort(incoming, current) < 0 ? course : current.course;
    candidates.set(identity, {
      course: preferred,
      requirements,
      unmetRequirements,
      required: current.required || isRequired,
      limited: current.limited || isLimited
    });
  });

  const required: FutureCourseItem[] = [];
  const limited: FutureCourseItem[] = [];
  candidates.forEach((candidate) => {
    const item: FutureCourseItem = {
      course: candidate.course,
      requirements: candidate.requirements,
      unmetRequirements: candidate.unmetRequirements
    };
    if (candidate.required) required.push(item);
    else limited.push(item);
  });

  const gaps = actionableAudits(audit).filter((item) => !item.satisfied).map((item): FutureRequirementGap & { type: "required" | "limited" | null } => ({
    id: item.group.id,
    name: item.group.name,
    missingCredits: item.missingCredits,
    missingCourseCount: item.missingCourseCount,
    type: item.group.category === "REQUIRED" && item.group.ruleKind !== "CHOOSE_COURSES_FROM_POOL"
      ? "required"
      : item.group.ruleKind === "CHOOSE_COURSES_FROM_POOL" || item.group.category === "LIMITED_ELECTIVE" || item.group.category === "MAJOR_ELECTIVE"
        ? "limited"
        : null
  }));

  return {
    required: required.sort(futureCourseSort),
    limited: limited.sort(futureCourseSort),
    requiredGaps: gaps.filter((item) => item.type === "required").map(({ type: _type, ...item }) => item),
    limitedGaps: gaps.filter((item) => item.type === "limited").map(({ type: _type, ...item }) => item)
  };
}
