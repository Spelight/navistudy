package cn.edu.buaa.naviplan.degree

import kotlinx.serialization.Serializable

@Serializable
enum class CourseRecordStatus { PLANNED, IN_PROGRESS, COMPLETED, FAILED, EXEMPTED, IGNORED, CANDIDATE }

@Serializable
enum class RequirementCategory {
    REQUIRED,
    MAJOR_ELECTIVE,
    LIMITED_ELECTIVE,
    GENERAL,
    AESTHETIC,
    LABOR,
    PRACTICE,
    FREE_ELECTIVE,
}

@Serializable
enum class RequirementRuleKind {
    CREDIT_TOTAL,
    CHOOSE_COURSES_FROM_POOL,
    LANGUAGE_TRACK,
    ADDITIONAL_INDICATOR,
}

@Serializable
data class AcademicTerm(
    val code: String,
    val name: String,
    val startDate: String? = null,
    val endDate: String? = null,
)

@Serializable
data class StudentCourseRecord(
    val id: String,
    val courseCode: String?,
    val courseName: String,
    val credits: Double,
    val termCode: String,
    val termName: String,
    val category: RequirementCategory,
    val source: String,
    val status: CourseRecordStatus,
    val manualCategory: RequirementCategory? = null,
    val manualNote: String? = null,
    val requirementGroupId: String? = null,
    val requirementGroupName: String? = null,
    val courseNature: String? = null,
    val plannedTermCode: String? = null,
    val plannedTermName: String? = null,
    val offeredTermCode: String? = null,
    val offeredTermName: String? = null,
    val offeringClassCount: Int? = null,
    val offeredThisTerm: Boolean? = null,
    val selectedThisTerm: Boolean? = null,
)

@Serializable
data class RequirementRule(
    val id: String,
    val label: String,
    val courseCodes: List<String> = emptyList(),
    val courseNameKeywords: List<String> = emptyList(),
)

@Serializable
data class RequirementGroup(
    val id: String,
    val name: String,
    val category: RequirementCategory,
    val requiredCredits: Double,
    val requiredCourses: Int = 0,
    val ruleKind: RequirementRuleKind = RequirementRuleKind.CREDIT_TOTAL,
    val ruleHint: String? = null,
    val rules: List<RequirementRule> = emptyList(),
    val children: List<RequirementGroup> = emptyList(),
    val sourceEarnedCredits: Double? = null,
    val sourceInProgressCredits: Double? = null,
    val sourcePlannedCredits: Double? = null,
    val sourceSatisfied: Boolean? = null,
)

@Serializable
data class CurriculumPlan(
    val id: String,
    val version: String,
    val studentGrade: String,
    val college: String,
    val major: String,
    val source: String,
    val groups: List<RequirementGroup>,
    val updatedAt: Long,
    val sourceRequiredCredits: Double? = null,
    val sourceEarnedCredits: Double? = null,
    val sourceInProgressCredits: Double? = null,
    val sourceOutOfProgramCredits: Double? = null,
)

@Serializable
data class RequirementAudit(
    val group: RequirementGroup,
    val earnedCredits: Double,
    val inProgressCredits: Double,
    val plannedCredits: Double,
    val missingCredits: Double,
    val earnedCourseCount: Int = 0,
    val inProgressCourseCount: Int = 0,
    val plannedCourseCount: Int = 0,
    val candidateCourseIds: List<String> = emptyList(),
    val missingCourseCount: Int = 0,
    val satisfied: Boolean = missingCredits <= 0.0 && missingCourseCount <= 0,
    val matchedCourseIds: List<String>,
)

@Serializable
data class PlanningRisk(
    val id: String,
    val severity: String,
    val title: String,
    val message: String,
    val courseId: String? = null,
    val groupId: String? = null,
)

@Serializable
data class CourseRecommendation(
    val id: String,
    val groupId: String,
    val category: RequirementCategory,
    val courseCode: String?,
    val courseName: String,
    val credits: Double,
    val usuallyOfferedTerms: List<String>,
    val suggestedTerm: String,
    val reason: String,
)

@Serializable
data class CreditAudit(
    val plan: CurriculumPlan,
    val courses: List<StudentCourseRecord>,
    val totalEarnedCredits: Double,
    val totalInProgressCredits: Double,
    val totalPlannedCredits: Double,
    val totalRequiredCredits: Double,
    val requirementAudits: List<RequirementAudit>,
    val risks: List<PlanningRisk>,
    val generatedAt: Long,
)

@Serializable
data class DegreeProfile(
    val username: String? = null,
    val grade: String,
    val college: String,
    val major: String,
    val portal: String,
    val autoDetected: Boolean,
    val message: String,
)

@Serializable
data class CurriculumSyncResult(
    val plan: CurriculumPlan,
    val autoFetched: Boolean,
    val message: String,
)

@Serializable
data class GradeSyncAllResult(
    val importedTerms: Int,
    val importedCourses: Int,
    val message: String,
)

@Serializable
data class CourseOverrideRequest(
    val status: CourseRecordStatus? = null,
    val manualCategory: RequirementCategory? = null,
    val credits: Double? = null,
    val manualNote: String? = null,
)
