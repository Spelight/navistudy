package cn.edu.buaa.naviplan.ubaa

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Serializable
data class LoginPreloadResponse(
    val clientId: String,
    val captcha: CaptchaInfo? = null,
    val execution: String? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val captchaRequired: Boolean = false,
)

@Serializable
data class CaptchaInfo(val captchaId: String, val imageUrl: String)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val captcha: String? = null,
    val execution: String? = null,
    val clientId: String? = null,
)

@Serializable
data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresAt: String,
    val refreshTokenExpiresAt: String,
    val user: UserData,
)

@Serializable
data class TokenRefreshRequest(val refreshToken: String)

@Serializable
data class SessionStatusResponse(val user: UserData, val lastActivity: String, val authenticatedAt: String)

@Serializable
data class UserData(val username: String, val name: String, val portal: String)

@Serializable
data class ByxtStudentProfile(
    val username: String? = null,
    val name: String? = null,
    val grade: String? = null,
    val college: String? = null,
    val major: String? = null,
    val rawSource: String = "BYXT currentUser.do",
)

@Serializable
data class ByxtCurriculumEndpointResult(
    val endpoint: String,
    val status: Int,
    val contentType: String? = null,
    val matched: Boolean,
    val snippet: String,
)

@Serializable
data class ByxtCurriculumRawResponse(
    val discoveredEndpoints: List<String>,
    val results: List<ByxtCurriculumEndpointResult>,
)

@Serializable
data class ByxtCurriculumNode(
    val id: String? = null,
    val parentId: String? = null,
    val name: String,
    val requiredCredits: Double? = null,
    val earnedCredits: Double? = null,
    val inProgressCredits: Double? = null,
    val plannedCredits: Double? = null,
    val passed: Boolean? = null,
    val requiredCourses: Int? = null,
    val courseCodes: List<String> = emptyList(),
    val courseNameKeywords: List<String> = emptyList(),
    val candidateCourseCount: Int = 0,
    val candidateCredits: Double = 0.0,
    val children: List<ByxtCurriculumNode> = emptyList(),
)

@Serializable
data class ByxtCurriculumSnapshot(
    val title: String? = null,
    val totalCredits: Double? = null,
    val earnedCredits: Double? = null,
    val inProgressCredits: Double? = null,
    val outOfProgramCredits: Double? = null,
    val studentGrade: String? = null,
    val college: String? = null,
    val major: String? = null,
    val endpointUsed: String? = null,
    val nodes: List<ByxtCurriculumNode> = emptyList(),
    val courses: List<Grade> = emptyList(),
    val termCredits: List<ByxtTermCredit> = emptyList(),
    val rawSnippet: String? = null,
)

@Serializable
data class ByxtTermCredit(
    val termCode: String,
    val termName: String? = null,
    val earnedCredits: Double = 0.0,
    val inProgressCredits: Double = 0.0,
    val plannedCredits: Double = 0.0,
    val failedCredits: Double = 0.0,
)

@Serializable
data class Term(val itemCode: String, val itemName: String, val selected: Boolean, val itemIndex: Int)

@Serializable
data class Week(
    val startDate: String,
    val endDate: String,
    val term: String,
    val curWeek: Boolean,
    val serialNumber: Int,
    val name: String,
)

@Serializable
data class CourseClass(
    val courseCode: String,
    val courseName: String,
    val courseSerialNo: String?,
    val credit: String?,
    val beginTime: String?,
    val endTime: String?,
    val beginSection: Int?,
    val endSection: Int?,
    val placeName: String?,
    val weeksAndTeachers: String?,
    val teachingTarget: String?,
    val color: String?,
    val dayOfWeek: Int?,
)

@Serializable
data class WeeklySchedule(
    val arrangedList: List<CourseClass> = emptyList(),
    val practiceList: List<CourseClass> = emptyList(),
    val notArrangeList: List<CourseClass> = emptyList(),
    val code: String? = null,
    val name: String? = null,
)

@Serializable
data class TodayClass(val bizName: String, val place: String?, val time: String?, val shortName: String?)

@Serializable data class TermResponse(val datas: List<Term> = emptyList(), val code: String? = null, val msg: String? = null)

@Serializable data class WeekResponse(val datas: List<Week> = emptyList(), val code: String? = null, val msg: String? = null)

@Serializable data class WeeklyScheduleResponse(val datas: WeeklySchedule = WeeklySchedule(), val code: String? = null, val msg: String? = null)

@Serializable data class TodayScheduleResponse(val datas: List<TodayClass> = emptyList(), val code: String? = null, val msg: String? = null)

@Serializable
data class GradeData(
    val termCode: String,
    val grades: List<Grade> = emptyList(),
)

@Serializable
data class Grade(
    @SerialName("WID") val id: String? = null,
    @SerialName("XNXQDM") val termCode: String? = null,
    @SerialName("XNXQDM_DISPLAY") val termName: String? = null,
    @SerialName("KCM") val courseName: String? = null,
    @SerialName("KCH") val courseCode: String? = null,
    @SerialName("TDKCM") val replacementCourseName: String? = null,
    @SerialName("TDKCH") val replacementCourseCode: String? = null,
    @SerialName("XF") val credit: Double? = null,
    @SerialName("XSZCJ") val score: String? = null,
    @SerialName("JD") val gradePoint: String? = null,
    @SerialName("KCLBDM_DISPLAY") val courseCategory: String? = null,
    @SerialName("XGXKLBDM_DISPLAY") val courseGroup: String? = null,
    @SerialName("KCXZDM_DISPLAY") val courseAttribute: String? = null,
    @SerialName("KSLXDM_DISPLAY") val examType: String? = null,
    @SerialName("CXCKDM_DISPLAY") val examAttempt: String? = null,
    @SerialName("SFJG_DISPLAY") val passed: String? = null,
    @SerialName("SFYX_DISPLAY") val effective: String? = null,
    @SerialName("CJRDFSDM_DISPLAY") val recognitionType: String? = null,
    val statusCode: String? = null,
    val statusName: String? = null,
    val tag: String? = null,
    val teachingLanguage: String? = null,
    val requirementGroupId: String? = null,
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
data class ByxkCourseOffering(
    val courseCode: String,
    val termCode: String? = null,
    val termName: String? = null,
    val teachingClassId: String? = null,
    val selected: Boolean = false,
)

@Serializable
data class BuaaScoreResponse(
    @SerialName("e") val code: Int = 0,
    @SerialName("m") val message: String? = null,
    @SerialName("d") val data: Map<String, BuaaScoreCourse> = emptyMap(),
)

@Serializable
data class BuaaScoreCourse(
    @SerialName("kcmc") val courseName: String? = null,
    @SerialName("kch") val courseCode: String? = null,
    @SerialName("xf") val credit: JsonElement? = null,
    @SerialName("kccj") val score: JsonElement? = null,
    @SerialName("fslx") val scoreType: String? = null,
    @SerialName("kclx") val courseType: String? = null,
)

data class BuaaScoreTerm(val year: String, val semester: Int)

fun parseBuaaScoreTermCode(termCode: String): BuaaScoreTerm {
    val match = Regex("""^(\d{4}-\d{4})-(\d+)$""").matchEntire(termCode.trim())
        ?: throw IllegalArgumentException("Unsupported term code: $termCode")
    val semester = match.groupValues[2].toIntOrNull()
        ?: throw IllegalArgumentException("Unsupported term code: $termCode")
    return BuaaScoreTerm(year = match.groupValues[1], semester = semester)
}

fun BuaaScoreCourse.toGrade(termCode: String): Grade =
    Grade(
        termCode = termCode,
        termName = termCode,
        courseName = courseName.cleanText(),
        courseCode = courseCode.cleanText(),
        credit = credit.asText()?.toDoubleOrNull(),
        score = score.asText(),
        courseAttribute = courseType.cleanText(),
        recognitionType = scoreType.cleanText(),
    )

private fun JsonElement?.asText(): String? = (this as? JsonPrimitive)?.contentOrNull.cleanText()

private fun String?.cleanText(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

object UbaaAttribution {
    const val source = "https://github.com/BUAASubnet/UBAA/"
    const val commit = "0b57e8c18eb0210b6da504b7e25d1401104edf4a"
    const val license = "MIT"
}
