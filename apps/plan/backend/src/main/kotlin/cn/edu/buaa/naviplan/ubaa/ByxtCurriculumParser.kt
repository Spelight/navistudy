package cn.edu.buaa.naviplan.ubaa

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

object ByxtCurriculumParser {
    fun parse(
        studentPayload: JsonObject,
        personalPlanPayload: JsonObject,
        groupPayload: JsonObject,
        coursePayload: JsonObject,
        auditPayload: JsonObject,
        termCreditsPayload: JsonObject,
        offerings: List<ByxkCourseOffering>? = null,
    ): ByxtCurriculumSnapshot? {
        val student = studentPayload.objectAt("datas", "queryXsjbxx")
        val profile = student?.objectAt("jbxx")
        val planFromProgress = student?.arrayAt("faArr")?.objects()?.firstOrNull()
        val personalPlan = personalPlanPayload.arrayAt("datas", "grpyfacx", "rows")?.objects()?.firstOrNull()
        if (sequenceOf(planFromProgress?.text("PYFADM"), personalPlan?.text("PYFADM"))
                .filterNotNull()
                .none { it.isNotBlank() }
        ) return null

        val groupRows = groupPayload.arrayAt("datas", "kzcx", "rows").objects()
        val courseRows = coursePayload.arrayAt("datas", "kzkccx", "rows").objects()
        val auditRoot = auditPayload.objectAt("datas", "queryXyzhbx", "fanbx") ?: return null
        val groupsById = groupRows.mapNotNull { row -> row.text("KZH")?.let { it to row } }.toMap()
        val planCoursesByGroup = courseRows.groupBy { it.text("KZH").orEmpty() }

        val auditCourses = mutableListOf<Grade>()
        fun buildAuditNode(node: JsonObject, parentId: String?): ByxtCurriculumNode {
            val id = node.text("courseGroupId") ?: node.text("KZH") ?: node.text("id")
            val metadata = id?.let(groupsById::get)
            val groupName = node.text("name")
                ?: node.text("courseCategoryName")
                ?: metadata?.text("KZM")
                ?: "未命名课组"
            val auditRows = node.arrayAt("checkCourseVOS").objects().ifEmpty { node.arrayAt("data").objects() }
            val nodeCourses = auditRows.mapNotNull { it.toAuditGrade(id, groupName) }
            auditCourses += nodeCourses
            val planRows = planCoursesByGroup[id].orEmpty()
            val requiredCourses = node.number("courseCountRequired")?.toInt()?.takeIf { it > 0 }
                ?: node.number("groupCountRequired")?.toInt()?.takeIf { it > 0 }
                ?: metadata?.number("ZSWCKZS")?.toInt()?.takeIf { it > 0 }
            return ByxtCurriculumNode(
                id = id,
                parentId = parentId,
                name = groupName,
                requiredCredits = node.number("creditsRequired")
                    ?: metadata?.number("ZSXDXF")
                    ?: metadata?.number("ZDXDXF"),
                earnedCredits = node.number("creditsTaken"),
                inProgressCredits = node.number("creditsSelection"),
                plannedCredits = 0.0,
                passed = node.bool("passed"),
                requiredCourses = requiredCourses,
                courseCodes = (planRows.mapNotNull { it.text("KCH") } + nodeCourses.mapNotNull { it.courseCode }).distinct(),
                courseNameKeywords = (planRows.mapNotNull { it.text("KCM") } + nodeCourses.mapNotNull { it.courseName }).distinct(),
                candidateCourseCount = planRows.distinctBy { it.text("KCH") ?: it.text("KCM") }.size,
                candidateCredits = planRows.sumOf { it.number("XF") ?: 0.0 },
                children = node.arrayAt("children").objects().map { child -> buildAuditNode(child, id) },
            )
        }

        val auditNodes = auditRoot.arrayAt("children").objects().map { buildAuditNode(it, null) }
        val existingIds = buildSet {
            fun collect(items: List<ByxtCurriculumNode>) {
                items.forEach { node ->
                    node.id?.let(::add)
                    collect(node.children)
                }
            }
            collect(auditNodes)
        }
        val rowsById = groupRows.mapNotNull { row -> row.groupId()?.let { it to row } }.toMap()
        val rowsByParent = groupRows.groupBy { it.parentGroupId() }

        fun supplementalNode(row: JsonObject, parentId: String?): ByxtCurriculumNode {
            val id = row.groupId()
            val planRows = planCoursesByGroup[id].orEmpty()
            return ByxtCurriculumNode(
                id = id,
                parentId = parentId,
                name = row.text("KZM") ?: "未命名课组",
                requiredCredits = row.number("ZSXDXF") ?: row.number("ZDXDXF"),
                requiredCourses = row.number("ZSWCKZS")?.toInt()?.takeIf { it > 0 },
                courseCodes = planRows.mapNotNull { it.text("KCH") }.distinct(),
                courseNameKeywords = planRows.mapNotNull { it.text("KCM") }.distinct(),
                candidateCourseCount = planRows.distinctBy { it.text("KCH") ?: it.text("KCM") }.size,
                candidateCredits = planRows.sumOf { it.number("XF") ?: 0.0 },
                children = rowsByParent[id].orEmpty()
                    .filter { it.groupId() !in existingIds }
                    .distinctBy { it.groupId() }
                    .map { supplementalNode(it, id) },
            )
        }

        fun enrichAuditNode(node: ByxtCurriculumNode): ByxtCurriculumNode {
            val supplementalChildren = rowsByParent[node.id].orEmpty()
                .filter { it.groupId() !in existingIds }
                .distinctBy { it.groupId() }
                .map { supplementalNode(it, node.id) }
            return node.copy(
                children = node.children.map(::enrichAuditNode) + supplementalChildren,
            )
        }

        val supplementalRoots = rowsById.values
            .filter { row ->
                val id = row.groupId()
                val parent = row.parentGroupId()
                id !in existingIds && (parent == null || parent !in rowsById && parent !in existingIds)
            }
            .distinctBy { it.groupId() }
            .map { supplementalNode(it, null) }
        val nodes = auditNodes.map(::enrichAuditNode) + supplementalRoots
        val candidates = courseRows.mapNotNull { row ->
            row.toPlanCandidate(row.text("KZH")?.let(groupsById::get)?.text("KZM"))
        }
            .distinctBy { "${it.requirementGroupId}|${it.courseCode}|${it.courseName}" }
        val auditByGroupAndCode = auditCourses
            .filter { !it.requirementGroupId.isNullOrBlank() && !it.courseCode.isNullOrBlank() }
            .associateBy { "${it.requirementGroupId}|${it.courseCode}" }
        val auditByCode = auditCourses.filter { !it.courseCode.isNullOrBlank() }.groupBy { it.courseCode!! }
        val mergedKeys = mutableSetOf<String>()

        val merged = candidates.map { candidate ->
            val groupKey = "${candidate.requirementGroupId}|${candidate.courseCode}"
            val progress = auditByGroupAndCode[groupKey] ?: candidate.courseCode?.let { auditByCode[it]?.firstOrNull() }
            if (progress == null) {
                candidate
            } else {
                mergedKeys += progress.auditIdentity()
                candidate.copy(
                    termCode = progress.termCode,
                    termName = progress.termName,
                    replacementCourseName = progress.replacementCourseName,
                    replacementCourseCode = progress.replacementCourseCode,
                    score = progress.score,
                    gradePoint = progress.gradePoint,
                    examType = progress.examType,
                    examAttempt = progress.examAttempt,
                    passed = progress.passed,
                    effective = progress.effective,
                    recognitionType = progress.recognitionType,
                    statusCode = progress.statusCode,
                    statusName = progress.statusName,
                    tag = progress.tag,
                    teachingLanguage = progress.teachingLanguage,
                )
            }
        }.toMutableList()

        auditCourses
            .distinctBy { it.auditIdentity() }
            .filterNot { it.auditIdentity() in mergedKeys }
            .forEach(merged::add)

        val offeringSummary = offerings?.groupBy { it.courseCode }?.mapValues { (_, rows) ->
            val first = rows.first()
            CourseOfferingSummary(
                termCode = first.termCode,
                termName = first.termName,
                classCount = rows.mapNotNull { it.teachingClassId }.distinct().size.takeIf { it > 0 } ?: rows.size,
                selected = rows.any { it.selected },
            )
        }
        val courses = merged.map { grade ->
            if (offeringSummary == null) return@map grade
            val offered = grade.courseCode?.let(offeringSummary::get)
            grade.copy(
                offeredTermCode = offered?.termCode,
                offeredTermName = offered?.termName,
                offeringClassCount = offered?.classCount,
                offeredThisTerm = offered != null,
                selectedThisTerm = offered?.selected ?: false,
            )
        }

        val termCredits = termCreditsPayload.arrayAt("datas", "cxxsxqxf", "rows").objects().map {
            ByxtTermCredit(
                termCode = it.text("XNXQDM") ?: it.text("JHXNXQDM") ?: "unknown",
                termName = it.text("XNXQDM_DISPLAY") ?: it.text("JHXNXQDM_DISPLAY"),
                earnedCredits = it.number("YHXF") ?: 0.0,
                inProgressCredits = it.number("YXXF") ?: 0.0,
                plannedCredits = it.number("WLCJXF") ?: 0.0,
                failedCredits = it.number("BJGXF") ?: 0.0,
            )
        }

        return ByxtCurriculumSnapshot(
            title = auditRoot.text("name") ?: planFromProgress?.text("PYFAMC") ?: personalPlan?.text("PYFAMC"),
            totalCredits = auditRoot.number("creditsRequired")
                ?: planFromProgress?.number("ZSYQXF")
                ?: personalPlan?.number("ZSYQXF"),
            earnedCredits = auditRoot.number("creditsTaken"),
            inProgressCredits = auditRoot.number("creditsSelection"),
            outOfProgramCredits = auditRoot.number("creditsOutOfProgram"),
            studentGrade = profile?.text("XZNJ_DISPLAY") ?: personalPlan?.text("XZNJ_DISPLAY"),
            college = profile?.text("YXDM_DISPLAY") ?: personalPlan?.text("YXDM_DISPLAY"),
            major = profile?.text("ZYDM_DISPLAY") ?: personalPlan?.text("ZYDM_DISPLAY"),
            endpointUsed = "byshapp/queryXyzhbx + jwpubapp/pyfa/kzcx+kzkccx" + if (offerings != null) " + byxk/clazz/list" else "",
            nodes = nodes,
            courses = courses,
            termCredits = termCredits,
        )
    }

    private data class CourseOfferingSummary(
        val termCode: String?,
        val termName: String?,
        val classCount: Int,
        val selected: Boolean,
    )

    private fun JsonObject.toPlanCandidate(fallbackGroupName: String?): Grade? {
        val courseCode = text("KCH") ?: return null
        val courseName = text("KCM") ?: return null
        val groupId = text("KZH")
        val plannedCode = text("XNXQ") ?: text("JHXNXQDM")
        val plannedName = text("XNXQ_DISPLAY")
            ?: listOfNotNull(text("JHXNDM"), text("JHXQDM")).takeIf { it.isNotEmpty() }?.joinToString("-")
        return Grade(
            id = "plan-${groupId.orEmpty()}-$courseCode",
            termCode = plannedCode ?: "curriculum",
            termName = plannedName ?: "培养方案课程池",
            courseName = courseName,
            courseCode = courseCode,
            credit = number("XF"),
            courseCategory = text("KCLBDM_DISPLAY"),
            courseGroup = text("KZM") ?: fallbackGroupName,
            courseAttribute = text("KCXZDM_DISPLAY"),
            statusCode = "04",
            statusName = "未修读",
            requirementGroupId = groupId,
            courseNature = text("KCXZDM_DISPLAY"),
            plannedTermCode = plannedCode,
            plannedTermName = plannedName,
        )
    }

    private fun JsonObject.toAuditGrade(groupId: String?, groupName: String): Grade? {
        val courseName = text("courseName") ?: text("KCM") ?: text("replacedCourseName") ?: text("TDKCM") ?: return null
        val courseCode = text("courseId") ?: text("KCH") ?: text("replacedCourseId") ?: text("TDKCH")
        val plannedTerm = text("schoolYearTerms") ?: text("JHXNXQDM")
        val actualTerm = text("courseSelectionSchoolYearTermCode")
            ?: text("pointSchoolYearTermCode")
            ?: text("XKXNXQDM")
            ?: text("CJXNXQDM")
            ?: plannedTerm
            ?: "unknown"
        val statusCode = text("status") ?: text("ZT")
        return Grade(
            id = text("WID") ?: listOfNotNull(groupId, courseCode, courseName, actualTerm).joinToString("-"),
            termCode = actualTerm,
            termName = text("XKXNXQDM_DISPLAY") ?: text("CJXNXQDM_DISPLAY") ?: text("JHXNXQDM_DISPLAY") ?: actualTerm,
            courseName = courseName,
            courseCode = courseCode,
            replacementCourseName = text("replacedCourseName") ?: text("TDKCM"),
            replacementCourseCode = text("replacedCourseId") ?: text("TDKCH"),
            credit = number("credit") ?: number("XF"),
            score = text("scoreView") ?: text("XSZCJ") ?: text("CJ") ?: text("DJCJ_DISPLAY"),
            gradePoint = text("gradePoint") ?: text("JD"),
            courseCategory = text("courseCategoryName") ?: text("KCLBDM_DISPLAY") ?: groupName,
            courseGroup = groupName,
            courseAttribute = text("KCXZDM_DISPLAY") ?: text("courseNature"),
            examType = text("KSLXDM_DISPLAY") ?: text("examType"),
            examAttempt = text("CXCKDM_DISPLAY") ?: text("retakeType"),
            passed = text("SFJG_DISPLAY") ?: bool("passed")?.let { if (it) "是" else "否" },
            effective = text("SFYX_DISPLAY"),
            recognitionType = text("HQFS_DISPLAY") ?: text("obtainType"),
            statusCode = statusCode,
            statusName = text("ZT_DISPLAY") ?: statusCode.statusName(),
            tag = text("BQMC") ?: text("bqmc"),
            teachingLanguage = text("SKYZMC_DISPLAY") ?: text("skyzmc"),
            requirementGroupId = groupId,
            courseNature = text("KCXZDM_DISPLAY") ?: text("courseNature").natureName(),
            plannedTermCode = plannedTerm,
            plannedTermName = text("JHXNXQDM_DISPLAY") ?: plannedTerm,
        )
    }

    private fun Grade.auditIdentity(): String = listOfNotNull(requirementGroupId, courseCode, courseName).joinToString("|")

    private fun String?.statusName(): String? = when (this) {
        "01" -> "已通过"
        "02" -> "未通过"
        "03" -> "修读中"
        "04" -> "未修读"
        else -> null
    }

    private fun String?.natureName(): String? = when (this) {
        "01" -> "必修"
        "05" -> "限修"
        "06" -> "任修"
        else -> this
    }
}

private fun JsonObject.text(key: String): String? =
    (this[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotEmpty)

private fun JsonObject.number(key: String): Double? {
    val value = this[key] as? JsonPrimitive ?: return null
    return value.doubleOrNull ?: value.contentOrNull?.toDoubleOrNull()
}

private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

private fun JsonObject.groupId(): String? = text("KZH") ?: text("courseGroupId") ?: text("id")

private fun JsonObject.parentGroupId(): String? =
    sequenceOf(text("FKZH"), text("F_KZH"), text("PARENTID"), text("PARENT_ID"))
        .filterNotNull()
        .firstOrNull { it.isNotBlank() && it != "-1" && it != "0" }

private fun JsonObject.objectAt(vararg path: String): JsonObject? {
    var current: JsonElement = this
    path.forEach { key -> current = (current as? JsonObject)?.get(key) ?: return null }
    return current as? JsonObject
}

private fun JsonObject.arrayAt(vararg path: String): JsonArray? {
    var current: JsonElement = this
    path.forEach { key -> current = (current as? JsonObject)?.get(key) ?: return null }
    return current as? JsonArray
}

private fun JsonArray?.objects(): List<JsonObject> = this?.mapNotNull { it as? JsonObject }.orEmpty()
