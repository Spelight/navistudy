package cn.edu.buaa.naviplan

import cn.edu.buaa.naviplan.degree.DegreeService
import cn.edu.buaa.naviplan.ubaa.ByxkCourseOffering
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumParser
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ByxtCurriculumParserTest {
    @Test
    fun `personal progress owns identity and requirements while plan API supplies all 328 courses`() {
        val courses = (1..328).map { index ->
            val nature = when {
                index <= 286 -> "必修"
                index <= 322 -> "限修"
                else -> "任修"
            }
            val group = when (nature) {
                "必修" -> "required"
                "限修" -> "limited"
                else -> "free"
            }
            obj(
                "KZH" to group,
                "KZM" to nature,
                "KCH" to "COURSE-${index.toString().padStart(3, '0')}",
                "KCM" to "课程 $index",
                "XF" to 2.0,
                "KCXZDM_DISPLAY" to nature,
                "KCLBDM_DISPLAY" to "测试课组",
                "JHXNDM" to "2026",
                "JHXQDM" to "1",
            )
        }
        val auditChildren = listOf(
            auditNode("required", "核心专业类", 120.0, 70.0, 20.0, "COURSE-001", "01"),
            auditNode("limited", "限修课程", 30.0, 15.0, 4.0, "COURSE-287", "03"),
            auditNode("free", "任修课程", 17.0, 8.8, 1.2, "COURSE-323", "04"),
        )
        val snapshot = ByxtCurriculumParser.parse(
            studentPayload = envelope("queryXsjbxx", obj(
                "jbxx" to obj("XZNJ_DISPLAY" to "2024级", "YXDM_DISPLAY" to "外国语学院", "ZYDM_DISPLAY" to "英语"),
                "faArr" to JsonArray(listOf(obj("PYFADM" to "english-2024", "PYFAMC" to "2024级英语主修培养方案", "XDLXDM" to "01"))),
            )),
            personalPlanPayload = rowsEnvelope("grpyfacx", listOf(obj("PYFADM" to "english-2024", "PYFAMC" to "2024级英语主修培养方案"))),
            groupPayload = rowsEnvelope("kzcx", listOf(
                obj("KZH" to "required", "FKZH" to "-1", "KZM" to "核心专业类"),
                obj("KZH" to "limited", "FKZH" to "-1", "KZM" to "限修课程"),
                obj("KZH" to "free", "FKZH" to "-1", "KZM" to "任修课程"),
            )),
            coursePayload = rowsEnvelope("kzkccx", courses),
            auditPayload = envelope("queryXyzhbx", obj(
                "fanbx" to obj(
                    "id" to "root",
                    "name" to "2024级英语主修培养方案",
                    "creditsRequired" to 167.0,
                    "creditsTaken" to 93.8,
                    "creditsSelection" to 25.2,
                    "creditsOutOfProgram" to 4.0,
                    "children" to JsonArray(auditChildren),
                )
            )),
            termCreditsPayload = rowsEnvelope("cxxsxqxf", emptyList()),
            offerings = listOf(
                ByxkCourseOffering("COURSE-287", "2026-2027-1", "2026秋季", "class-1"),
                ByxkCourseOffering("COURSE-287", "2026-2027-1", "2026秋季", "class-2"),
                ByxkCourseOffering("COURSE-323", "2026-2027-1", "2026秋季", "class-3", selected = true),
            ),
        ) ?: error("snapshot should parse")

        assertEquals("2024级", snapshot.studentGrade)
        assertEquals("外国语学院", snapshot.college)
        assertEquals("英语", snapshot.major)
        assertEquals("2024级英语主修培养方案", snapshot.title)
        assertEquals(167.0, snapshot.totalCredits)
        assertEquals(93.8, snapshot.earnedCredits)
        assertEquals(25.2, snapshot.inProgressCredits)
        assertEquals(328, snapshot.courses.size)
        assertEquals(286, snapshot.courses.count { it.courseNature == "必修" })
        assertEquals(36, snapshot.courses.count { it.courseNature == "限修" })
        assertEquals(6, snapshot.courses.count { it.courseNature == "任修" })
        assertEquals("01", snapshot.courses.single { it.courseCode == "COURSE-001" }.statusCode)
        assertEquals("03", snapshot.courses.single { it.courseCode == "COURSE-287" }.statusCode)
        assertEquals(2, snapshot.courses.single { it.courseCode == "COURSE-287" }.offeringClassCount)
        assertTrue(snapshot.courses.single { it.courseCode == "COURSE-323" }.selectedThisTerm == true)
        assertFalse(snapshot.nodes.first().name.contains("计算机"))

        val degree = DegreeService()
        degree.syncCurriculumFromByxt(snapshot)
        val audit = degree.audit()
        assertEquals("2024级英语主修培养方案", audit.plan.version)
        assertEquals(167.0, audit.totalRequiredCredits)
        assertEquals(93.8, audit.totalEarnedCredits)
        assertEquals(25.2, audit.totalInProgressCredits)
        assertEquals(4.0, audit.plan.sourceOutOfProgramCredits)
    }

    @Test
    fun `course groups missing from the progress tree are retained with their complete course pool`() {
        val snapshot = ByxtCurriculumParser.parse(
            studentPayload = envelope("queryXsjbxx", obj(
                "jbxx" to obj("ZYDM_DISPLAY" to "英语"),
                "faArr" to JsonArray(listOf(obj("PYFADM" to "english-2024"))),
            )),
            personalPlanPayload = rowsEnvelope("grpyfacx", emptyList()),
            groupPayload = rowsEnvelope("kzcx", listOf(
                obj("KZH" to "known", "FKZH" to "-1", "KZM" to "核心专业类"),
                obj("KZH" to "arts", "FKZH" to "-1", "KZM" to "美育课程池", "ZSXDXF" to 2.0),
            )),
            coursePayload = rowsEnvelope("kzkccx", listOf(
                obj("KZH" to "known", "KZM" to "核心专业类", "KCH" to "ENG101", "KCM" to "综合英语", "XF" to 4.0, "KCXZDM_DISPLAY" to "必修"),
                obj("KZH" to "arts", "KCH" to "ART101", "KCM" to "西方音乐赏析", "XF" to 2.0, "KCXZDM_DISPLAY" to "限修"),
            )),
            auditPayload = envelope("queryXyzhbx", obj(
                "fanbx" to obj(
                    "name" to "英语主修培养方案",
                    "children" to JsonArray(listOf(auditNode("known", "核心专业类", 4.0, 0.0, 0.0, "ENG101", "04"))),
                )
            )),
            termCreditsPayload = rowsEnvelope("cxxsxqxf", emptyList()),
        ) ?: error("snapshot should parse")

        assertEquals(2, snapshot.courses.size)
        val arts = snapshot.nodes.single { it.id == "arts" }
        assertEquals(listOf("ART101"), arts.courseCodes)
        assertEquals(1, arts.candidateCourseCount)
        assertEquals(2.0, arts.candidateCredits)
        assertEquals("美育课程池", snapshot.courses.single { it.courseCode == "ART101" }.courseGroup)
    }

    private fun auditNode(groupId: String, name: String, required: Double, earned: Double, selected: Double, courseCode: String, status: String) = obj(
        "id" to "node-$groupId",
        "courseGroupId" to groupId,
        "name" to name,
        "creditsRequired" to required,
        "creditsTaken" to earned,
        "creditsSelection" to selected,
        "passed" to false,
        "checkCourseVOS" to JsonArray(listOf(obj(
            "courseId" to courseCode,
            "courseName" to "审计 $courseCode",
            "credit" to 2.0,
            "status" to status,
            "schoolYearTerms" to "2026-2027-1",
            "courseNature" to when (groupId) { "required" -> "01"; "limited" -> "05"; else -> "06" },
        ))),
        "children" to JsonArray(emptyList()),
    )

    private fun envelope(name: String, value: JsonObject) = obj("datas" to obj(name to value), "code" to "0")

    private fun rowsEnvelope(name: String, rows: List<JsonObject>) = envelope(name, obj("rows" to JsonArray(rows), "totalSize" to rows.size))

    private fun obj(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject(pairs.associate { (key, value) ->
        key to when (value) {
            null -> kotlinx.serialization.json.JsonNull
            is JsonObject -> value
            is JsonArray -> value
            is String -> JsonPrimitive(value)
            is Number -> JsonPrimitive(value)
            is Boolean -> JsonPrimitive(value)
            else -> error("Unsupported test value: $value")
        }
    })
}
