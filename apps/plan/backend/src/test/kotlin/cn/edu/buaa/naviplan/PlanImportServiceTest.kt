package cn.edu.buaa.naviplan

import cn.edu.buaa.naviplan.plan.PlanImportConnector
import cn.edu.buaa.naviplan.plan.PlanImportService
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumNode
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumSnapshot
import cn.edu.buaa.naviplan.ubaa.ByxtStudentProfile
import cn.edu.buaa.naviplan.ubaa.Grade
import cn.edu.buaa.naviplan.ubaa.GradeData
import cn.edu.buaa.naviplan.ubaa.LoginPreloadResponse
import cn.edu.buaa.naviplan.ubaa.LoginRequest
import cn.edu.buaa.naviplan.ubaa.LoginResponse
import cn.edu.buaa.naviplan.ubaa.UserData
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlanImportServiceTest {
    @Test
    fun `BYXT is called only for explicit imports and transient state is always cleared`() = runBlocking {
        val connector = CountingConnector()
        val service = PlanImportService(connector)

        assertEquals(0, connector.loginCalls, "Reading a saved Passport snapshot must not call BYXT")

        val firstPreload = service.preload("user-1")
        val first = service.run("user-1", LoginRequest("student", "secret", clientId = firstPreload.clientId))
        assertEquals(1, connector.loginCalls)
        assertEquals(1, connector.clearCalls)
        assertEquals("English", first.student.major)

        first.copy()
        assertEquals(1, connector.loginCalls, "Ordinary snapshot reads and local evaluation must not call BYXT")

        val secondPreload = service.preload("user-1")
        service.run("user-1", LoginRequest("student", "secret-2", clientId = secondPreload.clientId))
        assertEquals(2, connector.loginCalls, "A manual refresh is a second explicit BYXT import")
        assertEquals(2, connector.clearCalls)
        assertTrue(connector.lastPassword == null, "The connector must clear the credential reference after each import")
    }
}

private class CountingConnector : PlanImportConnector {
    var loginCalls = 0
    var clearCalls = 0
    var lastPassword: String? = null

    override suspend fun preload() = LoginPreloadResponse(clientId = "preload-${loginCalls + 1}")

    override suspend fun login(request: LoginRequest): LoginResponse {
        loginCalls += 1
        lastPassword = request.password
        return LoginResponse("access", "refresh", "soon", "later", UserData(request.username, "Student", "BYXT"))
    }

    override fun studentProfile() = ByxtStudentProfile(username = "student", name = "Student", grade = "2025", college = "Foreign Languages", major = "English")

    override suspend fun fetchCurriculumSnapshot() = ByxtCurriculumSnapshot(
        title = "English 2025",
        totalCredits = 150.0,
        studentGrade = "2025",
        college = "Foreign Languages",
        major = "English",
        endpointUsed = "/fake/curriculum",
        nodes = listOf(ByxtCurriculumNode(id = "required", name = "Major required", requiredCredits = 40.0)),
        courses = listOf(Grade(id = "ENG101", termCode = "2025-1", courseName = "Comprehensive English", courseCode = "ENG101", credit = 4.0, score = "90")),
    )

    override suspend fun getAllGrades(): List<GradeData> = emptyList()

    override fun clearTransientSessions() {
        clearCalls += 1
        lastPassword = null
    }
}
