import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { passportLoginUrl } from "./api";
import { buildFutureCourseBuckets } from "./futureCourses";
import type { CreditAudit, StudentCourseRecord } from "./types";

describe("App", () => {
  it("renders the degree planning shell", async () => {
    render(<App />);
    expect(await screen.findByText("NaviPlan")).toBeInTheDocument();
    expect(await screen.findByText(/学业规划与毕业学分检查/)).toBeInTheDocument();
    expect(await screen.findByText("导入你的个人学业进度")).toBeInTheDocument();
    expect(screen.queryByText(/计算机类|程序设计基础|高等数学 A/)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/培养方案/)).length).toBeGreaterThan(0);
  });

  it("starts a plan-web PKCE authorization instead of returning directly from Study login", async () => {
    const url = new URL(await passportLoginUrl());
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("plan-web");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("redirect_uri")).toContain("/navistudy-callback.html");
    expect(sessionStorage.getItem("navi_plan_pkce_verifier")).toBeTruthy();
  });

  it("separates future unselected required and limited courses", () => {
    const course = (id: string, nature: string, status: StudentCourseRecord["status"] = "CANDIDATE"): StudentCourseRecord => ({
      id,
      courseCode: id,
      courseName: id,
      credits: 2,
      termCode: "",
      termName: "未来学期",
      category: nature === "必修" ? "REQUIRED" : "LIMITED_ELECTIVE",
      source: "test",
      status,
      courseNature: nature,
      selectedThisTerm: false
    });
    const required = course("required", "必修");
    const limited = course("limited", "限修");
    const failed = course("failed", "必修", "FAILED");
    const completed = course("completed", "必修", "COMPLETED");
    const audit = {
      plan: {
        id: "plan",
        version: "test",
        studentGrade: "2024",
        college: "test",
        major: "test",
        source: "test",
        groups: [],
        updatedAt: 0
      },
      courses: [required, limited, failed, completed],
      totalEarnedCredits: 0,
      totalInProgressCredits: 0,
      totalPlannedCredits: 0,
      totalRequiredCredits: 4,
      requirementAudits: [
        {
          group: { id: "required-group", name: "核心必修", category: "REQUIRED", requiredCredits: 2, requiredCourses: 1, ruleKind: "CREDIT_TOTAL", rules: [] },
          earnedCredits: 0,
          inProgressCredits: 0,
          plannedCredits: 0,
          missingCredits: 2,
          earnedCourseCount: 0,
          inProgressCourseCount: 0,
          plannedCourseCount: 0,
          candidateCourseIds: [required.id],
          missingCourseCount: 1,
          satisfied: false,
          matchedCourseIds: [failed.id]
        },
        {
          group: { id: "limited-group", name: "专业限修", category: "LIMITED_ELECTIVE", requiredCredits: 2, requiredCourses: 1, ruleKind: "CHOOSE_COURSES_FROM_POOL", rules: [] },
          earnedCredits: 0,
          inProgressCredits: 0,
          plannedCredits: 0,
          missingCredits: 2,
          earnedCourseCount: 0,
          inProgressCourseCount: 0,
          plannedCourseCount: 0,
          candidateCourseIds: [limited.id],
          missingCourseCount: 1,
          satisfied: false,
          matchedCourseIds: []
        }
      ],
      risks: [],
      generatedAt: 0
    } satisfies CreditAudit;

    const buckets = buildFutureCourseBuckets(audit, audit.courses);
    expect(buckets.required.map((item) => item.course.id)).toEqual(["failed", "required"]);
    expect(buckets.limited.map((item) => item.course.id)).toEqual(["limited"]);
    expect(buckets.limited[0].requirements).toEqual(["专业限修"]);
    expect(buckets.requiredGaps).toEqual([{ id: "required-group", name: "核心必修", missingCredits: 2, missingCourseCount: 1 }]);
    expect(buckets.limitedGaps).toEqual([{ id: "limited-group", name: "专业限修", missingCredits: 2, missingCourseCount: 1 }]);
  });

  it("deduplicates curriculum rows by course code and gives required courses priority", () => {
    const required: StudentCourseRecord = {
      id: "plan-required",
      courseCode: "ENG101",
      courseName: "综合英语",
      credits: 4,
      termCode: "2026-1",
      termName: "未来学期",
      category: "REQUIRED",
      source: "plan",
      status: "CANDIDATE",
      courseNature: "必修"
    };
    const duplicateLimited = { ...required, id: "plan-limited", category: "LIMITED_ELECTIVE", courseNature: "限修" } satisfies StudentCourseRecord;
    const audit = {
      plan: { id: "plan", version: "test", studentGrade: "2024", college: "test", major: "test", source: "test", groups: [], updatedAt: 0 },
      courses: [],
      totalEarnedCredits: 0,
      totalInProgressCredits: 0,
      totalPlannedCredits: 0,
      totalRequiredCredits: 4,
      requirementAudits: [{
        group: { id: "required-group", name: "核心必修", category: "REQUIRED", requiredCredits: 4, requiredCourses: 1, ruleKind: "CREDIT_TOTAL", rules: [] },
        earnedCredits: 0,
        inProgressCredits: 0,
        plannedCredits: 0,
        missingCredits: 4,
        earnedCourseCount: 0,
        inProgressCourseCount: 0,
        plannedCourseCount: 0,
        candidateCourseIds: [required.id, duplicateLimited.id],
        missingCourseCount: 1,
        satisfied: false,
        matchedCourseIds: []
      }],
      risks: [],
      generatedAt: 0
    } satisfies CreditAudit;

    const buckets = buildFutureCourseBuckets(audit, [duplicateLimited, required]);
    expect(buckets.required).toHaveLength(1);
    expect(buckets.required[0].course.courseCode).toBe("ENG101");
    expect(buckets.limited).toHaveLength(0);
  });

  it("treats required-nature courses in a choice pool as selectable candidates", () => {
    const researchCourse: StudentCourseRecord = {
      id: "research-course",
      courseCode: "RES101",
      courseName: "科研课堂候选课",
      credits: 2,
      termCode: "",
      termName: "未来学期",
      category: "REQUIRED",
      source: "plan",
      status: "CANDIDATE",
      courseNature: "必修",
      requirementGroupName: "科研课堂"
    };
    const audit = {
      plan: { id: "plan", version: "test", studentGrade: "2024", college: "test", major: "test", source: "test", groups: [], updatedAt: 0 },
      courses: [],
      totalEarnedCredits: 0,
      totalInProgressCredits: 0,
      totalPlannedCredits: 0,
      totalRequiredCredits: 2,
      requirementAudits: [{
        group: { id: "research", name: "科研课堂", category: "REQUIRED", requiredCredits: 2, requiredCourses: 1, ruleKind: "CHOOSE_COURSES_FROM_POOL", rules: [] },
        earnedCredits: 0,
        inProgressCredits: 0,
        plannedCredits: 0,
        missingCredits: 2,
        earnedCourseCount: 0,
        inProgressCourseCount: 0,
        plannedCourseCount: 0,
        candidateCourseIds: [researchCourse.id],
        missingCourseCount: 1,
        satisfied: false,
        matchedCourseIds: []
      }],
      risks: [],
      generatedAt: 0
    } satisfies CreditAudit;

    const buckets = buildFutureCourseBuckets(audit, [researchCourse]);
    expect(buckets.required).toHaveLength(0);
    expect(buckets.limited.map((item) => item.course.id)).toEqual([researchCourse.id]);
    expect(buckets.limitedGaps).toEqual([{ id: "research", name: "科研课堂", missingCredits: 2, missingCourseCount: 1 }]);
  });
});
