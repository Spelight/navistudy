package cn.edu.buaa.naviplan.plan

import cn.edu.buaa.naviplan.degree.CourseOverrideRequest
import cn.edu.buaa.naviplan.degree.CourseRecommendation
import cn.edu.buaa.naviplan.degree.CreditAudit
import cn.edu.buaa.naviplan.degree.CurriculumPlan
import cn.edu.buaa.naviplan.degree.DegreeProfile
import cn.edu.buaa.naviplan.degree.RequirementGroup
import cn.edu.buaa.naviplan.degree.StudentCourseRecord
import kotlinx.serialization.Serializable

@Serializable
data class PassportIdentity(val id: String, val username: String)

@Serializable
data class PlanSource(
    val kind: String = "BYXT",
    val endpoint: String? = null,
    val note: String = "仅保存培养方案与课程的精简结果，不保存教务原始响应或登录会话。",
)

@Serializable
data class PlanSnapshot(
    val schemaVersion: Int = 1,
    val student: DegreeProfile,
    val plan: CurriculumPlan,
    val requirements: List<RequirementGroup>,
    val coursePool: List<StudentCourseRecord>,
    val languageTracks: List<RequirementGroup>,
    val courses: List<StudentCourseRecord>,
    val manualCorrections: Map<String, CourseOverrideRequest>,
    val audit: CreditAudit,
    val recommendations: List<CourseRecommendation>,
    val importedAt: Long,
    val updatedAt: Long,
    val source: PlanSource,
)

@Serializable
data class EvaluateRequest(
    val snapshot: PlanSnapshot,
    val manualCorrections: Map<String, CourseOverrideRequest> = emptyMap(),
)
