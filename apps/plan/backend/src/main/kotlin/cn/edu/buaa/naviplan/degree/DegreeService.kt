package cn.edu.buaa.naviplan.degree

import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumSnapshot
import cn.edu.buaa.naviplan.ubaa.ByxtCurriculumNode
import cn.edu.buaa.naviplan.ubaa.ByxtStudentProfile
import cn.edu.buaa.naviplan.ubaa.Grade
import cn.edu.buaa.naviplan.ubaa.GradeData
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

private val creditBearingStatuses = setOf(
    CourseRecordStatus.COMPLETED,
    CourseRecordStatus.EXEMPTED,
    CourseRecordStatus.IN_PROGRESS,
    CourseRecordStatus.PLANNED,
)

data class CourseOverride(
    val status: CourseRecordStatus? = null,
    val manualCategory: RequirementCategory? = null,
    val credits: Double? = null,
    val manualNote: String? = null,
)

class DegreeService {
    private val overrides = ConcurrentHashMap<String, CourseOverride>()
    @Volatile private var gradeData: List<GradeData> = emptyList()
    @Volatile private var curriculumPlan: CurriculumPlan = emptyPlan()
    @Volatile private var restoredCourses: List<StudentCourseRecord>? = null

    fun profile(username: String? = null): DegreeProfile =
        DegreeProfile(
            username = username,
            grade = "待导入",
            college = "待导入",
            major = "待导入",
            portal = "undergraduate-byxt",
            autoDetected = false,
            message = "尚未导入个人学业进度，不展示推测的年级、学院、专业或培养方案。",
        )

    fun profileFromByxt(byxtProfile: ByxtStudentProfile?): DegreeProfile =
        DegreeProfile(
            username = byxtProfile?.username,
            grade = byxtProfile?.grade ?: "待识别",
            college = byxtProfile?.college ?: "BYXT 已连接，学院待识别",
            major = byxtProfile?.major ?: "BYXT 已连接，专业待识别",
            portal = "undergraduate-byxt",
            autoDetected = byxtProfile?.major != null || byxtProfile?.college != null || byxtProfile?.grade != null,
            message = if (byxtProfile == null) {
                "请先连接北航 BYXT；连接后会读取学籍档案、全部学期课表和课程学分。"
            } else {
                "年级、学院、专业和培养方案均来自本科教务个人学业进度。"
            },
        )

    fun syncCurriculum(): CurriculumSyncResult {
        curriculumPlan = emptyPlan()
        return CurriculumSyncResult(
            plan = curriculumPlan,
            autoFetched = false,
            message = "尚未导入个人学业进度。",
        )
    }

    fun syncCurriculumFromByxt(snapshot: ByxtCurriculumSnapshot?): CurriculumSyncResult {
        restoredCourses = null
        curriculumPlan = snapshot?.toCurriculumPlan() ?: emptyPlan()
        if (snapshot?.courses?.isNotEmpty() == true) {
            gradeData = snapshot.courses
                .groupBy { it.termCode ?: "unknown" }
                .map { (termCode, grades) -> GradeData(termCode, grades) }
                .sortedBy { it.termCode }
        }
        return CurriculumSyncResult(
            plan = curriculumPlan,
            autoFetched = snapshot?.nodes?.isNotEmpty() == true,
            message = if (snapshot?.nodes?.isNotEmpty() == true) {
                "已从 BYXT 培养方案接口读取要求树：${snapshot.endpointUsed ?: "未知接口"}。课程归类仍可手动校正。"
            } else {
                "未能从个人学业进度解析要求树；没有生成任何推测数据。"
            },
        )
    }

    fun curriculum(): CurriculumPlan = curriculumPlan

    fun replaceGradeData(data: List<GradeData>): GradeSyncAllResult {
        restoredCourses = null
        gradeData = data
        return GradeSyncAllResult(
            importedTerms = data.size,
            importedCourses = data.sumOf { it.grades.size },
            message = "已同步 ${data.size} 个学期、${data.sumOf { it.grades.size }} 条真实成绩；学分审计将优先使用成绩记录。",
        )
    }

    fun updateCourse(id: String, request: CourseOverrideRequest): StudentCourseRecord? {
        val current = courses().firstOrNull { it.id == id } ?: return null
        overrides[id] = CourseOverride(
            status = request.status ?: current.status,
            manualCategory = request.manualCategory ?: current.manualCategory ?: current.category,
            credits = request.credits ?: current.credits,
            manualNote = request.manualNote ?: current.manualNote,
        )
        return courses().firstOrNull { it.id == id }
    }

    fun courses(): List<StudentCourseRecord> {
        val base = restoredCourses ?: gradeCourses()
        return base.map { course ->
            val override = overrides[course.id]
            if (override == null) course else course.copy(
                status = override.status ?: course.status,
                category = override.manualCategory ?: course.category,
                credits = override.credits ?: course.credits,
                manualCategory = override.manualCategory,
                manualNote = override.manualNote,
            )
        }.sortedWith(
            compareBy<StudentCourseRecord> { it.termCode }.thenBy { it.courseName }
        )
    }

    fun restore(plan: CurriculumPlan, courses: List<StudentCourseRecord>, corrections: Map<String, CourseOverrideRequest>) {
        curriculumPlan = plan
        gradeData = emptyList()
        restoredCourses = courses
        overrides.clear()
        corrections.forEach { (id, request) ->
            overrides[id] = CourseOverride(request.status, request.manualCategory, request.credits, request.manualNote)
        }
    }

    fun manualCorrections(): Map<String, CourseOverrideRequest> = overrides.mapValues { (_, value) ->
        CourseOverrideRequest(value.status, value.manualCategory, value.credits, value.manualNote)
    }

    private fun gradeCourses(): List<StudentCourseRecord> =
        gradeData.flatMap { term ->
            term.grades.mapNotNull { grade ->
                val courseName = grade.courseName ?: grade.replacementCourseName ?: return@mapNotNull null
                val courseCode = grade.courseCode ?: grade.replacementCourseCode
                val id = grade.id ?: courseIdentity(courseCode, courseName, grade.termCode ?: term.termCode)
                val baseCategory = inferGradeCategory(grade) ?: inferCategory(courseCode, courseName)
                val override = overrides[id]
                StudentCourseRecord(
                    id = id,
                    courseCode = courseCode?.takeIf { it.isNotBlank() },
                    courseName = courseName,
                    credits = override?.credits ?: grade.credit ?: inferCredits(courseCode, courseName, null),
                    termCode = grade.termCode ?: term.termCode,
                    termName = grade.termName ?: termName(grade.termCode ?: term.termCode),
                    category = override?.manualCategory ?: baseCategory,
                    source = if (grade.statusCode == "04") "BUAA/培养方案课程池" else "BUAA/个人学业进度",
                    status = override?.status ?: inferGradeStatus(grade),
                    manualCategory = override?.manualCategory,
                    manualNote = override?.manualNote,
                    requirementGroupId = grade.requirementGroupId,
                    requirementGroupName = grade.courseGroup,
                    courseNature = grade.courseNature ?: grade.courseAttribute,
                    plannedTermCode = grade.plannedTermCode,
                    plannedTermName = grade.plannedTermName,
                    offeredTermCode = grade.offeredTermCode,
                    offeredTermName = grade.offeredTermName,
                    offeringClassCount = grade.offeringClassCount,
                    offeredThisTerm = grade.offeredThisTerm,
                    selectedThisTerm = grade.selectedThisTerm,
                )
            }
        }

    fun audit(): CreditAudit {
        val now = System.currentTimeMillis()
        val plan = curriculumPlan
        val allCourses = dedupeCourses(courses())
        val requirementAudits = flattenGroups(plan.groups).map { group ->
            val matched = allCourses.filter { course ->
                if (group.rules.isNotEmpty()) matchesGroup(course, group) else course.category == group.category
            }
            val effective = matched.filter { it.status in creditBearingStatuses }
            val candidateIds = matched.filter { it.status == CourseRecordStatus.CANDIDATE }.map { it.id }
            val useSourceAudit = overrides.isEmpty() && group.sourceEarnedCredits != null
            val earned = if (useSourceAudit) group.sourceEarnedCredits ?: 0.0 else matched.filter { it.status == CourseRecordStatus.COMPLETED || it.status == CourseRecordStatus.EXEMPTED }.sumOf { it.credits }
            val inProgress = if (useSourceAudit) group.sourceInProgressCredits ?: 0.0 else matched.filter { it.status == CourseRecordStatus.IN_PROGRESS }.sumOf { it.credits }
            val planned = if (useSourceAudit) group.sourcePlannedCredits ?: 0.0 else matched.filter { it.status == CourseRecordStatus.PLANNED }.sumOf { it.credits }
            val missingCredits = max(0.0, group.requiredCredits - earned - inProgress - planned)
            val missingCourses = max(0, group.requiredCourses - effective.size)
            RequirementAudit(
                group = group,
                earnedCredits = earned,
                inProgressCredits = inProgress,
                plannedCredits = planned,
                missingCredits = missingCredits,
                earnedCourseCount = matched.count { it.status == CourseRecordStatus.COMPLETED || it.status == CourseRecordStatus.EXEMPTED },
                inProgressCourseCount = matched.count { it.status == CourseRecordStatus.IN_PROGRESS },
                plannedCourseCount = matched.count { it.status == CourseRecordStatus.PLANNED },
                candidateCourseIds = candidateIds,
                missingCourseCount = missingCourses,
                satisfied = if (useSourceAudit && group.sourceSatisfied != null) group.sourceSatisfied else missingCredits <= 0.0 && missingCourses <= 0,
                matchedCourseIds = matched.map { it.id },
            )
        }
        val risks = buildRisks(allCourses, requirementAudits)
        return CreditAudit(
            plan = plan,
            courses = allCourses,
            totalEarnedCredits = plan.sourceEarnedCredits.takeIf { overrides.isEmpty() }
                ?: plan.groups.mapNotNull { it.sourceEarnedCredits }.takeIf { overrides.isEmpty() && it.isNotEmpty() }?.sum()
                ?: allCourses.filter { it.status == CourseRecordStatus.COMPLETED || it.status == CourseRecordStatus.EXEMPTED }.sumOf { it.credits },
            totalInProgressCredits = plan.sourceInProgressCredits.takeIf { overrides.isEmpty() }
                ?: plan.groups.mapNotNull { it.sourceInProgressCredits }.takeIf { overrides.isEmpty() && it.isNotEmpty() }?.sum()
                ?: allCourses.filter { it.status == CourseRecordStatus.IN_PROGRESS }.sumOf { it.credits },
            totalPlannedCredits = plan.groups.mapNotNull { it.sourcePlannedCredits }.takeIf { overrides.isEmpty() && it.isNotEmpty() }?.sum()
                ?: allCourses.filter { it.status == CourseRecordStatus.PLANNED }.sumOf { it.credits },
            totalRequiredCredits = plan.sourceRequiredCredits ?: plan.groups.sumOf { it.requiredCredits },
            requirementAudits = requirementAudits,
            risks = risks,
            generatedAt = now,
        )
    }

    fun recommendations(): List<CourseRecommendation> {
        val audit = audit()
        return actionableAudits(audit.requirementAudits)
            .filter { !it.satisfied }
            .flatMap { item ->
                val candidateCourses = audit.courses
                    .filter { it.status in setOf(CourseRecordStatus.CANDIDATE, CourseRecordStatus.FAILED) && matchesGroup(it, item.group) }
                val candidates = prioritizedCandidateCourses(item.group, candidateCourses, audit.courses)
                    .map { course ->
                        CourseRecommendation(
                            id = "candidate-${course.id}",
                            groupId = item.group.id,
                            category = item.group.category,
                            courseCode = course.courseCode,
                            courseName = course.courseName,
                            credits = course.credits,
                            usuallyOfferedTerms = listOfNotNull(course.offeredTermName, course.plannedTermName ?: course.termName).distinct(),
                            suggestedTerm = course.offeredTermName ?: course.plannedTermName ?: course.termName,
                            reason = recommendationReason(item, course, candidateCourses, audit.courses),
                        )
                    }
                candidates.take(if (item.group.ruleKind == RequirementRuleKind.CHOOSE_COURSES_FROM_POOL) 5 else 6)
            }
            .sortedWith(
                compareBy<CourseRecommendation> { recommendationPriority(audit, it) }
                    .thenBy { it.suggestedTerm }
                    .thenByDescending { it.credits }
                    .thenBy { it.courseName }
            )
            .distinctBy { it.courseCode?.takeIf(String::isNotBlank) ?: it.courseName }
    }

    private fun dedupeCourses(records: List<StudentCourseRecord>): List<StudentCourseRecord> =
        records.groupBy { it.courseCode ?: it.courseName }.values.map { group ->
            group.sortedWith(
                compareByDescending<StudentCourseRecord> { statusRank(it.status) }
                    .thenByDescending { it.credits }
                    .thenBy { it.termCode }
            ).first()
        }

    private fun statusRank(status: CourseRecordStatus): Int = when (status) {
        CourseRecordStatus.EXEMPTED -> 7
        CourseRecordStatus.COMPLETED -> 6
        CourseRecordStatus.IN_PROGRESS -> 5
        CourseRecordStatus.PLANNED -> 4
        CourseRecordStatus.FAILED -> 3
        CourseRecordStatus.CANDIDATE -> 2
        CourseRecordStatus.IGNORED -> 1
    }

    private fun flattenGroups(groups: List<RequirementGroup>): List<RequirementGroup> =
        groups.flatMap { group -> listOf(group) + flattenGroups(group.children) }

    private fun actionableAudits(audits: List<RequirementAudit>): List<RequirementAudit> =
        audits.filter { it.group.children.isEmpty() }

    private fun buildRisks(courses: List<StudentCourseRecord>, audits: List<RequirementAudit>): List<PlanningRisk> {
        val risks = mutableListOf<PlanningRisk>()
        actionableAudits(audits).filter { !it.satisfied }.forEach {
            val courseText = if (it.missingCourseCount > 0) "、还差 ${it.missingCourseCount} 门" else ""
            val candidateText = if (it.candidateCourseIds.isNotEmpty()) "，课程池里还有 ${it.candidateCourseIds.size} 门候选课可选" else ""
            risks += PlanningRisk(
                id = "missing-${it.group.id}",
                severity = if (it.missingCredits >= 6.0) "HIGH" else "MEDIUM",
                title = "${it.group.name}还差 ${formatCredits(it.missingCredits)} 学分$courseText",
                message = "当前已获 ${formatCredits(it.earnedCredits)}，在修 ${formatCredits(it.inProgressCredits)}，规划 ${formatCredits(it.plannedCredits)}$candidateText。${it.group.ruleHint ?: "建议优先补齐该类别。"}",
                groupId = it.group.id,
            )
        }
        courses.filter { it.status == CourseRecordStatus.FAILED || it.status == CourseRecordStatus.IGNORED }.forEach {
            risks += PlanningRisk(
                id = "excluded-${it.id}",
                severity = "MEDIUM",
                title = "${it.courseName}未计入有效学分",
                message = "该课程被标记为${if (it.status == CourseRecordStatus.FAILED) "未通过" else "不计入"}，不会贡献毕业学分。",
                courseId = it.id,
            )
        }
        courses.filter { it.status != CourseRecordStatus.CANDIDATE && it.category == RequirementCategory.FREE_ELECTIVE && it.manualCategory == null }.take(6).forEach {
            risks += PlanningRisk(
                id = "unmatched-${it.id}",
                severity = "LOW",
                title = "${it.courseName}需要确认归属",
                message = "系统未能稳定匹配培养方案类别，已暂放入任选/待确认。你可以手动改为限修、美育、劳育等类别。",
                courseId = it.id,
            )
        }
        return risks
    }

    private fun ByxtCurriculumSnapshot.toCurriculumPlan(): CurriculumPlan? {
        if (nodes.isEmpty()) return null
        fun descendantCodes(node: ByxtCurriculumNode): List<String> =
            (node.courseCodes + node.children.flatMap(::descendantCodes)).distinct()
        fun descendantNames(node: ByxtCurriculumNode): List<String> =
            (node.courseNameKeywords + node.children.flatMap(::descendantNames)).distinct()
        fun toGroup(node: ByxtCurriculumNode, fallbackId: String): RequirementGroup {
            val codes = descendantCodes(node)
            val names = descendantNames(node)
            val localNames = node.courseNameKeywords.distinct()
            return RequirementGroup(
                id = node.id ?: fallbackId,
                name = node.name,
                category = inferRequirementCategory(node.name, localNames),
                requiredCredits = node.requiredCredits ?: 0.0,
                requiredCourses = node.requiredCourses ?: 0,
                ruleKind = inferRuleKind(
                    node.name,
                    localNames,
                    node.requiredCredits,
                    node.candidateCourseCount,
                    node.candidateCredits,
                ),
                ruleHint = inferRuleHint(
                    node.name,
                    localNames,
                    node.requiredCredits,
                    node.candidateCourseCount,
                    node.candidateCredits,
                ),
                rules = listOf(
                    RequirementRule(
                        id = "byxt-rule-${node.id ?: fallbackId}",
                        label = "BYXT课组课程清单",
                        courseCodes = codes,
                        courseNameKeywords = names,
                    )
                ).filter { it.courseCodes.isNotEmpty() || it.courseNameKeywords.isNotEmpty() },
                children = node.children.mapIndexed { childIndex, child ->
                    toGroup(child, "$fallbackId-$childIndex")
                },
                sourceEarnedCredits = node.earnedCredits,
                sourceInProgressCredits = node.inProgressCredits,
                sourcePlannedCredits = node.plannedCredits,
                sourceSatisfied = node.passed,
            )
        }
        return CurriculumPlan(
            id = "byxt-curriculum-${endpointUsed ?: "unknown"}".lowercase().replace(Regex("[^a-z0-9-]+"), "-"),
            version = title ?: "BYXT个人培养方案",
            studentGrade = studentGrade ?: "BYXT",
            college = college ?: "BYXT",
            major = major ?: title ?: "BYXT 培养方案",
            source = "BYXT ${endpointUsed ?: "curriculum endpoint"}",
            updatedAt = System.currentTimeMillis(),
            groups = nodes.mapIndexed { index, node -> toGroup(node, "byxt-$index") },
            sourceRequiredCredits = totalCredits,
            sourceEarnedCredits = earnedCredits,
            sourceInProgressCredits = inProgressCredits,
            sourceOutOfProgramCredits = outOfProgramCredits,
        )
    }

    private fun inferRequirementCategory(name: String, courseNames: List<String> = emptyList()): RequirementCategory {
        val text = (listOf(name) + courseNames).joinToString(" ")
        return when {
            name.contains("美育") -> RequirementCategory.AESTHETIC
            name.contains("劳育") || name.contains("劳动") -> RequirementCategory.LABOR
            name.contains("四史") || name.contains("限修") || name.contains("限选") -> RequirementCategory.LIMITED_ELECTIVE
            name.contains("博雅") || name.contains("通识") || name.contains("综合素养") -> RequirementCategory.GENERAL
            name.contains("一般专业类") || name.contains("选修") -> RequirementCategory.MAJOR_ELECTIVE
            name.contains("科研课堂") || name.contains("实践") || name.contains("实验") || name.contains("实习") || name.contains("毕业设计") -> RequirementCategory.PRACTICE
            name.contains("二外") || name.contains("第二外语") ||
                name.contains("必修") || name.contains("核心") || name.contains("基础课") ||
                name.contains("外语类课") || name.contains("体育课") || name.contains("军理课") ||
                name.contains("思政公共课") -> RequirementCategory.REQUIRED
            name.contains("任选") || name.contains("任修") -> RequirementCategory.FREE_ELECTIVE
            text.contains("美育") -> RequirementCategory.AESTHETIC
            text.contains("劳育") || text.contains("劳动") -> RequirementCategory.LABOR
            text.contains("限修") || text.contains("限选") -> RequirementCategory.LIMITED_ELECTIVE
            text.contains("选修") -> RequirementCategory.MAJOR_ELECTIVE
            text.contains("实践") || text.contains("实验") || text.contains("实习") -> RequirementCategory.PRACTICE
            text.contains("必修") || text.contains("核心") -> RequirementCategory.REQUIRED
            text.contains("任选") || text.contains("任修") -> RequirementCategory.FREE_ELECTIVE
            else -> RequirementCategory.FREE_ELECTIVE
        }
    }

    private fun inferRuleKind(
        groupName: String,
        courseNames: List<String>,
        requiredCredits: Double?,
        candidateCourseCount: Int,
        candidateCredits: Double,
    ): RequirementRuleKind {
        val text = (listOf(groupName) + courseNames).joinToString(" ")
        val oversizedPool = requiredCredits != null && requiredCredits > 0.0 &&
            candidateCourseCount >= 3 && candidateCredits > requiredCredits * 2.0
        return when {
            text.contains("二外") || text.contains("第二外语") -> RequirementRuleKind.LANGUAGE_TRACK
            groupName.contains("四史") ||
                groupName.contains("限修") ||
                groupName.contains("限选") ||
                groupName.contains("选修") ||
                groupName.contains("一般专业类") ||
                groupName.contains("博雅") ||
                groupName.contains("科研课堂") ||
                oversizedPool -> RequirementRuleKind.CHOOSE_COURSES_FROM_POOL
            groupName.contains("指标") || groupName.contains("美育") || groupName.contains("劳育") -> RequirementRuleKind.ADDITIONAL_INDICATOR
            else -> RequirementRuleKind.CREDIT_TOTAL
        }
    }

    private fun inferRuleHint(
        groupName: String,
        courseNames: List<String>,
        requiredCredits: Double?,
        candidateCourseCount: Int,
        candidateCredits: Double,
    ): String {
        val text = (listOf(groupName) + courseNames).joinToString(" ")
        val kind = inferRuleKind(groupName, courseNames, requiredCredits, candidateCourseCount, candidateCredits)
        return when {
            text.contains("二外") || text.contains("第二外语") ->
                "二外不是德语、法语、日语全都要学，而是选择一门第二外语并连续修读同一语言序列。"
            groupName.contains("四史") ->
                "四史限修是课程池要求，通常从池内完成 1 门 / 1 学分即可，不需要把所有四史课都修完。"
            kind == RequirementRuleKind.CHOOSE_COURSES_FROM_POOL ->
                "这是选课池要求，${candidateCourseCount.takeIf { it > 0 }?.let { "可从 $it 门候选课中" } ?: "从候选课中"}修够 ${formatCredits(requiredCredits ?: 0.0)} 学分即可，不需要全部修完。"
            groupName.contains("美育") || groupName.contains("劳育") || groupName.contains("指标") ->
                "这是附加指标/标签类要求，按课程标签或指标累计，不等于列表中每门课都必修。"
            else -> "按该课组要求累计学分；未修读课程只作为候选或待规划课程。"
        }
    }

    private fun emptyPlan(): CurriculumPlan =
        CurriculumPlan(
            id = "not-imported",
            version = "empty",
            studentGrade = "待导入",
            college = "待导入",
            major = "待导入",
            source = "NaviPlan empty state",
            updatedAt = System.currentTimeMillis(),
            groups = emptyList(),
        )

    private fun prioritizedCandidateCourses(
        group: RequirementGroup,
        candidates: List<StudentCourseRecord>,
        allCourses: List<StudentCourseRecord>,
    ): List<StudentCourseRecord> {
        val commonOrder = compareBy<StudentCourseRecord> {
            when {
                it.status == CourseRecordStatus.FAILED -> 0
                it.offeredThisTerm == true -> 1
                else -> 2
            }
        }.thenBy { it.plannedTermCode ?: it.termCode }
            .thenByDescending { it.credits }
            .thenBy { it.courseName }
        if (group.ruleKind != RequirementRuleKind.LANGUAGE_TRACK) {
            return candidates.sortedWith(commonOrder)
        }
        val startedLanguages = allCourses
            .filter { it.status in creditBearingStatuses && matchesGroup(it, group) }
            .mapNotNull { languageTrack(it.courseName)?.language }
            .distinct()
        val preferred = startedLanguages.firstOrNull()
        val sorted = candidates.sortedWith(
            compareBy<StudentCourseRecord> { languageTrack(it.courseName)?.sequence ?: Int.MAX_VALUE }
                .then(commonOrder)
        )
        return if (preferred == null) {
            sorted.distinctBy { languageTrack(it.courseName)?.language ?: it.courseName }
        } else {
            sorted.filter { languageTrack(it.courseName)?.language == preferred }
        }
    }

    private fun recommendationReason(
        audit: RequirementAudit,
        course: StudentCourseRecord,
        candidates: List<StudentCourseRecord>,
        allCourses: List<StudentCourseRecord>,
    ): String {
        val contribution = minOf(course.credits, audit.missingCredits)
        val timing = when {
            course.status == CourseRecordStatus.FAILED -> "该课当前为未通过，重修通过后"
            course.offeredThisTerm == true -> "该课本学期开设，修读后"
            !course.plannedTermName.isNullOrBlank() -> "培养方案安排在${course.plannedTermName}，修读后"
            else -> "修读后"
        }
        if (course.status == CourseRecordStatus.FAILED && audit.group.ruleKind != RequirementRuleKind.CHOOSE_COURSES_FROM_POOL) {
            return "该课未通过且属于「${audit.group.name}」固定要求；重修通过可补 ${formatCredits(contribution)} 学分，应优先于新增任选课。"
        }
        if (audit.group.ruleKind == RequirementRuleKind.LANGUAGE_TRACK) {
            val started = allCourses
                .filter { it.status in creditBearingStatuses && matchesGroup(it, audit.group) }
                .mapNotNull { languageTrack(it.courseName)?.language }
                .distinct()
                .firstOrNull()
            return if (started != null) {
                "你已经开始「$started」二外轨道；${timing}可补 ${formatCredits(contribution)} 学分，继续同一语言序列即可。"
            } else {
                "二外应先确定一门语言并连续修读；这是「${audit.group.name}」候选起点，当前仍缺 ${formatCredits(audit.missingCredits)} 学分。"
            }
        }
        if (audit.group.ruleKind == RequirementRuleKind.CHOOSE_COURSES_FROM_POOL) {
            val minimumCourses = minimumCoursesToCloseGap(candidates, audit.missingCredits, audit.missingCourseCount)
            val countText = minimumCourses.takeIf { it > 0 }?.let { "按现有候选课学分，至少还需选择 $it 门；" }.orEmpty()
            return "「${audit.group.name}」还缺 ${formatCredits(audit.missingCredits)} 学分。${countText}${timing}可贡献 ${formatCredits(contribution)} 学分，不需要修完整个课程池。"
        }
        return "「${audit.group.name}」还缺 ${formatCredits(audit.missingCredits)} 学分；${timing}可补 ${formatCredits(contribution)} 学分。"
    }

    private fun minimumCoursesToCloseGap(
        candidates: List<StudentCourseRecord>,
        missingCredits: Double,
        missingCourseCount: Int,
    ): Int {
        if (missingCredits <= 0.0) return missingCourseCount
        var credits = 0.0
        var count = 0
        candidates.map { it.credits }.sortedDescending().forEach { candidateCredits ->
            if (credits >= missingCredits) return@forEach
            credits += candidateCredits
            count += 1
        }
        return max(count, missingCourseCount)
    }

    private fun recommendationPriority(audit: CreditAudit, recommendation: CourseRecommendation): Int {
        val course = audit.courses.firstOrNull { it.courseCode == recommendation.courseCode && it.courseName == recommendation.courseName }
        val group = audit.requirementAudits.firstOrNull { it.group.id == recommendation.groupId }?.group
        return when {
            course?.status == CourseRecordStatus.FAILED && group?.ruleKind != RequirementRuleKind.CHOOSE_COURSES_FROM_POOL -> 0
            course?.offeredThisTerm == true && group?.category == RequirementCategory.REQUIRED -> 1
            recommendation.credits < 1.0 -> 6
            group?.category == RequirementCategory.REQUIRED && group.ruleKind == RequirementRuleKind.CREDIT_TOTAL -> 2
            group?.ruleKind == RequirementRuleKind.LANGUAGE_TRACK -> 3
            course?.offeredThisTerm == true -> 4
            group?.ruleKind == RequirementRuleKind.CHOOSE_COURSES_FROM_POOL -> 5
            else -> 6
        }
    }

    private data class LanguageTrack(val language: String, val sequence: Int)

    private fun languageTrack(courseName: String): LanguageTrack? {
        val match = Regex("""二外(.+?)[（(](\d+)[）)]""").find(courseName) ?: return null
        return LanguageTrack(match.groupValues[1], match.groupValues[2].toIntOrNull() ?: Int.MAX_VALUE)
    }

    private fun matchesGroup(course: StudentCourseRecord, group: RequirementGroup): Boolean =
        group.rules.any { rule ->
            course.courseCode != null && course.courseCode in rule.courseCodes ||
                rule.courseNameKeywords.any { keyword -> course.courseName.contains(keyword, ignoreCase = true) }
        }

    private fun inferGradeCategory(grade: Grade): RequirementCategory? {
        val text = listOfNotNull(grade.courseAttribute, grade.courseCategory, grade.courseGroup).joinToString(" ")
        return when {
            text.contains("美育") -> RequirementCategory.AESTHETIC
            text.contains("劳育") || text.contains("劳动") -> RequirementCategory.LABOR
            text.contains("实践") || text.contains("实验") || text.contains("实习") -> RequirementCategory.PRACTICE
            text.contains("通识") -> RequirementCategory.GENERAL
            text.contains("限修") || text.contains("限选") -> RequirementCategory.LIMITED_ELECTIVE
            text.contains("任选") || text.contains("任修") -> RequirementCategory.FREE_ELECTIVE
            text.contains("选修") -> RequirementCategory.MAJOR_ELECTIVE
            text.contains("必修") || text.contains("核心") -> RequirementCategory.REQUIRED
            else -> null
        }
    }

    private fun inferGradeStatus(grade: Grade): CourseRecordStatus {
        when (grade.statusCode) {
            "01" -> return CourseRecordStatus.COMPLETED
            "02" -> return CourseRecordStatus.FAILED
            "03" -> return CourseRecordStatus.IN_PROGRESS
            "04" -> return CourseRecordStatus.CANDIDATE
        }
        val statusName = grade.statusName.orEmpty()
        if (statusName.contains("未修读")) return CourseRecordStatus.CANDIDATE
        if (statusName.contains("修读中")) return CourseRecordStatus.IN_PROGRESS
        if (statusName.contains("未通过")) return CourseRecordStatus.FAILED
        if (statusName.contains("已通过")) return CourseRecordStatus.COMPLETED
        val effective = grade.effective.orEmpty()
        val passed = grade.passed.orEmpty()
        val recognition = grade.recognitionType.orEmpty()
        val score = grade.score.orEmpty().trim()
        if (effective.contains("否")) return CourseRecordStatus.IGNORED
        if (recognition.contains("免")) return CourseRecordStatus.EXEMPTED
        if (passed.contains("否")) return CourseRecordStatus.FAILED
        if (passed.contains("是")) return CourseRecordStatus.COMPLETED
        score.toDoubleOrNull()?.let { return if (it >= 60.0) CourseRecordStatus.COMPLETED else CourseRecordStatus.FAILED }
        if (listOf("不及格", "未通过", "缺考", "缓考").any { score.contains(it) }) return CourseRecordStatus.FAILED
        if (score.isNotBlank()) return CourseRecordStatus.COMPLETED
        return CourseRecordStatus.COMPLETED
    }

    private fun inferCategory(code: String?, name: String): RequirementCategory = when {
        listOf("美学", "艺术", "音乐", "戏剧", "设计").any { name.contains(it) } -> RequirementCategory.AESTHETIC
        name.contains("劳动") -> RequirementCategory.LABOR
        listOf("实验", "实习", "实践", "课程设计", "毕业设计").any { name.contains(it) } -> RequirementCategory.PRACTICE
        listOf("人工智能", "机器学习", "数据库", "网络", "软件工程", "编译").any { name.contains(it) } -> RequirementCategory.MAJOR_ELECTIVE
        listOf("数学", "物理", "英语", "程序设计", "数据结构", "操作系统").any { name.contains(it) } -> RequirementCategory.REQUIRED
        code?.startsWith("CS", ignoreCase = true) == true -> RequirementCategory.MAJOR_ELECTIVE
        else -> RequirementCategory.FREE_ELECTIVE
    }

    private fun inferCredits(code: String?, name: String, notes: String?): Double {
        Regex("""学分[:：]\s*([0-9]+(?:\.[0-9]+)?)""").find(notes.orEmpty())?.groupValues?.get(1)?.toDoubleOrNull()?.let { return it }
        return when {
            name.contains("高等数学") -> 5.0
            name.contains("大学物理") -> 4.0
            name.contains("英语") -> 2.0
            name.contains("劳动") -> 1.0
            name.contains("美学") || name.contains("艺术") -> 2.0
            code?.startsWith("CS", true) == true -> 3.0
            else -> 2.0
        }
    }

    private fun termName(code: String): String =
        code.replace("-1", " 秋季学期").replace("-2", " 春季学期")

    private fun courseIdentity(code: String?, name: String, termCode: String): String =
        "${code?.ifBlank { null } ?: name}-$termCode".lowercase().replace(Regex("[^a-z0-9\\u4e00-\\u9fa5-]+"), "-").trim('-')

    private fun formatCredits(value: Double): String =
        if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(value)
}
