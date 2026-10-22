package cn.edu.buaa.naviplan.plan

import cn.edu.buaa.naviplan.degree.DegreeProfile
import cn.edu.buaa.naviplan.degree.DegreeService
import cn.edu.buaa.naviplan.degree.RequirementGroup
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumSnapshot
import cn.edu.buaa.naviplan.ubaa.ByxtStudentProfile
import cn.edu.buaa.naviplan.ubaa.GradeData
import cn.edu.buaa.naviplan.ubaa.LoginPreloadResponse
import cn.edu.buaa.naviplan.ubaa.LoginRequest
import cn.edu.buaa.naviplan.ubaa.LoginResponse
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

interface PlanImportConnector {
    suspend fun preload(): LoginPreloadResponse
    suspend fun login(request: LoginRequest): LoginResponse
    fun studentProfile(): ByxtStudentProfile
    suspend fun fetchCurriculumSnapshot(): ByxtCurriculumSnapshot?
    suspend fun getAllGrades(): List<GradeData>
    fun clearTransientSessions()
}

class PlanImportService(private val connector: PlanImportConnector) {
    private val importMutex = Mutex()
    private val preloadOwners = ConcurrentHashMap<String, String>()

    suspend fun preload(userId: String): LoginPreloadResponse {
        val response = connector.preload()
        preloadOwners[response.clientId] = userId
        return response
    }

    suspend fun run(userId: String, request: LoginRequest): PlanSnapshot = importMutex.withLock {
        request.clientId?.let { clientId ->
            require(preloadOwners.remove(clientId) == userId) { "登录预加载已失效，请重新获取。" }
        }
        try {
            connector.login(request)
            val curriculum = connector.fetchCurriculumSnapshot()
                ?: error("未能从个人学业进度读取培养方案；原有快照未被修改。")
            val profile = connector.studentProfile()
            val degree = DegreeService()
            degree.syncCurriculumFromByxt(curriculum)
            if (curriculum.courses.isEmpty()) degree.replaceGradeData(connector.getAllGrades())
            snapshot(
                degree,
                degree.profileFromByxt(profile),
                System.currentTimeMillis(),
                 PlanSource(endpoint = curriculum.endpointUsed),
            )
        } finally {
            connector.clearTransientSessions()
        }
    }

    fun snapshot(
        degree: DegreeService,
        student: DegreeProfile,
        importedAt: Long,
        source: PlanSource,
    ): PlanSnapshot {
        val audit = degree.audit()
        val requirements = audit.plan.groups
        val courses = audit.courses
        val coursePool = degree.courses()
        return PlanSnapshot(
            student = student,
            plan = audit.plan,
            requirements = requirements,
            coursePool = coursePool,
            languageTracks = requirements.filter(::containsLanguageTrack),
            courses = courses,
            manualCorrections = degree.manualCorrections(),
            audit = audit,
            recommendations = degree.recommendations(),
            importedAt = importedAt,
            updatedAt = System.currentTimeMillis(),
            source = source,
        )
    }

    private fun containsLanguageTrack(group: RequirementGroup): Boolean =
        group.name.contains("外语") || group.name.contains("二外") || group.children.any(::containsLanguageTrack)
}
