package cn.edu.buaa.naviplan

import cn.edu.buaa.naviplan.degree.CourseRecordStatus
import cn.edu.buaa.naviplan.degree.CourseOverrideRequest
import cn.edu.buaa.naviplan.degree.CurriculumPlan
import cn.edu.buaa.naviplan.degree.DegreeService
import cn.edu.buaa.naviplan.degree.RequirementCategory
import cn.edu.buaa.naviplan.degree.RequirementGroup
import cn.edu.buaa.naviplan.degree.RequirementRuleKind
import cn.edu.buaa.naviplan.degree.RequirementRule
import cn.edu.buaa.naviplan.degree.StudentCourseRecord
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumNode
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumSnapshot
import cn.edu.buaa.naviplan.ubaa.Grade
import cn.edu.buaa.naviplan.ubaa.GradeData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DegreeServiceTest {
    @Test
    fun `manual corrections apply to courses that only exist in the curriculum pool`() {
        val service = DegreeService()
        val course = StudentCourseRecord(
            id = "plan-ENG101",
            courseCode = "ENG101",
            courseName = "综合英语",
            credits = 4.0,
            termCode = "2026-2027-1",
            termName = "未来学期",
            category = RequirementCategory.REQUIRED,
            source = "BUAA/培养方案课程池",
            status = CourseRecordStatus.CANDIDATE,
            courseNature = "必修",
        )
        val plan = CurriculumPlan(
            id = "plan",
            version = "test",
            studentGrade = "2024",
            college = "外国语学院",
            major = "英语",
            source = "test",
            groups = listOf(
                RequirementGroup(
                    id = "required",
                    name = "专业必修",
                    category = RequirementCategory.REQUIRED,
                    requiredCredits = 4.0,
                    rules = listOf(RequirementRule("required-courses", "课程清单", courseCodes = listOf("ENG101"))),
                ),
            ),
            updatedAt = 0,
        )

        service.restore(
            plan,
            mergeSnapshotCourses(listOf(course), emptyList()),
            mapOf(course.id to CourseOverrideRequest(status = CourseRecordStatus.PLANNED, manualNote = "下学期修读")),
        )

        val updated = service.courses().single()
        assertEquals(CourseRecordStatus.PLANNED, updated.status)
        assertEquals("下学期修读", updated.manualNote)
        assertEquals(4.0, service.audit().totalPlannedCredits)
    }

    @Test
    fun `large research pool is audited as a choice pool and failed fixed course is recommended first`() {
        val service = DegreeService()
        service.syncCurriculumFromByxt(
            ByxtCurriculumSnapshot(
                title = "英语主修培养方案",
                nodes = listOf(
                    ByxtCurriculumNode(
                        id = "core",
                        name = "核心专业类",
                        requiredCredits = 59.0,
                        children = listOf(
                            ByxtCurriculumNode(
                                id = "research",
                                parentId = "core",
                                name = "科研课堂",
                                requiredCredits = 2.0,
                                courseCodes = listOf("R1", "R2", "R3"),
                                courseNameKeywords = listOf("科研一", "科研二", "科研三"),
                                candidateCourseCount = 3,
                                candidateCredits = 6.0,
                            ),
                            ByxtCurriculumNode(
                                id = "fixed",
                                parentId = "core",
                                name = "核心专业类",
                                requiredCredits = 57.0,
                                courseCodes = listOf("ENG201"),
                                courseNameKeywords = listOf("中级英语（2）"),
                                candidateCourseCount = 1,
                                candidateCredits = 4.0,
                            ),
                            ByxtCurriculumNode(
                                id = "micro",
                                parentId = "core",
                                name = "国家安全模块",
                                requiredCredits = 0.3,
                                courseCodes = listOf("SAFE006"),
                                courseNameKeywords = listOf("国家安全（6）"),
                                candidateCourseCount = 1,
                                candidateCredits = 0.3,
                            ),
                        ),
                    ),
                ),
                courses = listOf(
                    Grade(termCode = "2026-2027-1", courseName = "科研一", courseCode = "R1", credit = 2.0, statusCode = "04", requirementGroupId = "research", courseGroup = "科研课堂", courseNature = "必修"),
                    Grade(termCode = "2026-2027-1", courseName = "科研二", courseCode = "R2", credit = 2.0, statusCode = "04", requirementGroupId = "research", courseGroup = "科研课堂", courseNature = "必修"),
                    Grade(termCode = "2026-2027-1", courseName = "科研三", courseCode = "R3", credit = 2.0, statusCode = "04", requirementGroupId = "research", courseGroup = "科研课堂", courseNature = "必修"),
                    Grade(termCode = "2025-2026-2", courseName = "中级英语（2）", courseCode = "ENG201", credit = 4.0, statusCode = "02", requirementGroupId = "fixed", courseGroup = "核心专业类", courseNature = "必修"),
                    Grade(termCode = "2026-2027-1", courseName = "国家安全（6）", courseCode = "SAFE006", credit = 0.3, statusCode = "04", requirementGroupId = "micro", courseGroup = "国家安全模块", courseNature = "必修"),
                ),
            ),
        )

        val audit = service.audit()
        val research = audit.requirementAudits.single { it.group.id == "research" }
        val core = audit.requirementAudits.single { it.group.id == "core" }
        val recommendations = service.recommendations()

        assertEquals(RequirementCategory.REQUIRED, core.group.category)
        assertEquals(RequirementRuleKind.CHOOSE_COURSES_FROM_POOL, research.group.ruleKind)
        assertTrue(research.group.ruleHint.orEmpty().contains("3 门候选课"))
        assertEquals("中级英语（2）", recommendations.first().courseName)
        assertTrue(recommendations.first().reason.contains("未通过"))
        assertTrue(recommendations.any { it.groupId == "research" && it.reason.contains("至少还需选择 1 门") })
        assertTrue(recommendations.indexOfFirst { it.groupId == "research" } < recommendations.indexOfFirst { it.groupId == "micro" })
    }

    @Test
    fun `real grade data is used for credit audit and failed grades do not earn credits`() {
        val service = DegreeService()

        val result = service.replaceGradeData(
            listOf(
                GradeData(
                    termCode = "2023-2024-1",
                    grades = listOf(
                        Grade(
                            termCode = "2023-2024-1",
                            courseName = "高等数学A",
                            courseCode = "MATH101",
                            credit = 5.0,
                            score = "59",
                            courseAttribute = "必修",
                            passed = "否",
                        ),
                    ),
                ),
            ),
        )
        val audit = service.audit()
        val course = audit.courses.single { it.courseCode == "MATH101" }

        assertEquals(1, result.importedTerms)
        assertEquals(1, result.importedCourses)
        assertEquals(CourseRecordStatus.FAILED, course.status)
        assertEquals(RequirementCategory.REQUIRED, course.category)
        assertEquals(0.0, audit.totalEarnedCredits)
        assertTrue(audit.risks.any { it.courseId == course.id })
    }

    @Test
    fun `unread BYXT alternatives are candidates and do not count as planned credits`() {
        val service = DegreeService()

        service.syncCurriculumFromByxt(
            ByxtCurriculumSnapshot(
                title = "2024级英语主修培养方案",
                nodes = listOf(
                    ByxtCurriculumNode(
                        id = "four-history",
                        name = "四史限修",
                        requiredCredits = 1.0,
                        requiredCourses = 1,
                        courseCodes = listOf("B280021015", "B280021016", "B280021017", "B280021018"),
                    ),
                ),
                courses = listOf(
                    Grade(termCode = "2024-2025-1", courseName = "中国共产党历史", courseCode = "B280021015", credit = 1.0, statusCode = "01"),
                    Grade(termCode = "2024-2025-1", courseName = "新中国史", courseCode = "B280021016", credit = 1.0, statusCode = "04"),
                    Grade(termCode = "2024-2025-1", courseName = "改革开放史", courseCode = "B280021017", credit = 1.0, statusCode = "04"),
                    Grade(termCode = "2024-2025-1", courseName = "社会主义发展史", courseCode = "B280021018", credit = 1.0, statusCode = "04"),
                ),
            ),
        )

        val audit = service.audit()
        val fourHistory = audit.requirementAudits.single { it.group.name == "四史限修" }

        assertEquals(1.0, fourHistory.earnedCredits)
        assertEquals(0.0, fourHistory.plannedCredits)
        assertEquals(0.0, fourHistory.missingCredits)
        assertEquals(3, fourHistory.candidateCourseIds.size)
        assertTrue(fourHistory.satisfied)
        assertEquals(CourseRecordStatus.CANDIDATE, audit.courses.single { it.courseName == "新中国史" }.status)
    }

    @Test
    fun `second foreign language follows the started language track`() {
        val service = DegreeService()

        service.syncCurriculumFromByxt(
            ByxtCurriculumSnapshot(
                title = "2024级英语主修培养方案",
                nodes = listOf(
                    ByxtCurriculumNode(
                        id = "foreign-language",
                        name = "外语类课",
                        requiredCredits = 8.0,
                        requiredCourses = 4,
                        courseCodes = listOf(
                            "B120013228", "B120013229", "B120013230",
                            "B120013231", "B120013232", "B120013233",
                            "B120013234", "B120013235", "B120013236",
                            "B120013237", "B120013238", "B120013239",
                        ),
                        courseNameKeywords = listOf(
                            "二外德语（1）", "二外法语（1）", "二外日语（1）",
                            "二外德语（2）", "二外法语（2）", "二外日语（2）",
                            "二外德语（3）", "二外法语（3）", "二外日语（3）",
                            "二外德语（4）", "二外法语（4）", "二外日语（4）",
                        ),
                    ),
                ),
                courses = listOf(
                    Grade(termCode = "2024-2025-1", courseName = "二外法语（1）", courseCode = "B120013229", credit = 2.0, statusCode = "01"),
                    Grade(termCode = "2024-2025-2", courseName = "二外法语（2）", courseCode = "B120013232", credit = 2.0, statusCode = "01"),
                    Grade(termCode = "2025-2026-1", courseName = "二外法语（3）", courseCode = "B120013235", credit = 2.0, statusCode = "03"),
                    Grade(termCode = "2026-2027-1", courseName = "二外法语（4）", courseCode = "B120013238", credit = 2.0, statusCode = "04"),
                    Grade(termCode = "2024-2025-1", courseName = "二外德语（1）", courseCode = "B120013228", credit = 2.0, statusCode = "04"),
                    Grade(termCode = "2024-2025-1", courseName = "二外日语（1）", courseCode = "B120013230", credit = 2.0, statusCode = "04"),
                    Grade(termCode = "2024-2025-1", courseName = "二外法语（1）", courseCode = "B120013229", credit = 2.0, statusCode = "04"),
                ),
            ),
        )

        val audit = service.audit()
        val foreignLanguage = audit.requirementAudits.single { it.group.name == "外语类课" }
        val recommendations = service.recommendations()

        assertEquals(6.0, foreignLanguage.earnedCredits + foreignLanguage.inProgressCredits)
        assertEquals(0.0, foreignLanguage.plannedCredits)
        assertEquals(2.0, foreignLanguage.missingCredits)
        assertEquals(CourseRecordStatus.COMPLETED, audit.courses.single { it.courseCode == "B120013229" }.status)
        assertTrue(recommendations.any { it.courseName == "二外法语（4）" })
        assertFalse(recommendations.any { it.courseName.contains("二外德语") || it.courseName.contains("二外日语") })
    }
}
