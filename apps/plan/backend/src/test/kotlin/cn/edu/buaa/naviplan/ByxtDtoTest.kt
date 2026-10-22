package cn.edu.buaa.naviplan

import cn.edu.buaa.naviplan.ubaa.WeeklyScheduleResponse
import cn.edu.buaa.naviplan.ubaa.BuaaScoreResponse
import cn.edu.buaa.naviplan.ubaa.parseBuaaScoreTermCode
import cn.edu.buaa.naviplan.ubaa.toGrade
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ByxtDtoTest {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    @Test
    fun `weekly schedule response accepts nullable BYXT wrapper fields`() {
        val payload = """
            {
              "datas": {
                "practiceList": [],
                "arrangedList": [],
                "notArrangeList": [],
                "code": null,
                "name": null
              },
              "code": "0",
              "msg": null
            }
        """.trimIndent()

        val response = json.decodeFromString<WeeklyScheduleResponse>(payload)

        assertEquals("0", response.code)
        assertNull(response.datas.code)
        assertNull(response.datas.name)
        assertEquals(0, response.datas.arrangedList.size)
    }

    @Test
    fun `score response maps BUAA score fields into grade records`() {
        val payload = """
            {
              "e": 0,
              "m": null,
              "d": {
                "1": {
                  "kcmc": "高等数学A",
                  "kch": "MATH101",
                  "xf": "5.0",
                  "kccj": 95,
                  "fslx": "正常",
                  "kclx": "必修"
                }
              }
            }
        """.trimIndent()

        val response = json.decodeFromString<BuaaScoreResponse>(payload)
        val grade = response.data.getValue("1").toGrade("2023-2024-1")

        assertEquals(0, response.code)
        assertEquals("高等数学A", grade.courseName)
        assertEquals("MATH101", grade.courseCode)
        assertEquals(5.0, grade.credit)
        assertEquals("95", grade.score)
        assertEquals("必修", grade.courseAttribute)
    }

    @Test
    fun `score term parser separates academic year and semester`() {
        val term = parseBuaaScoreTermCode("2023-2024-2")

        assertEquals("2023-2024", term.year)
        assertEquals(2, term.semester)
    }
}
