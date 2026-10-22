package cn.edu.buaa.naviplan.ubaa

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.plugins.cookies.cookies
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Parameters
import io.ktor.http.Url
import io.ktor.http.isSuccess
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.slf4j.LoggerFactory

class EmbeddedUbaaScheduleConnector : cn.edu.buaa.naviplan.plan.PlanImportConnector {
    private val log = LoggerFactory.getLogger(EmbeddedUbaaScheduleConnector::class.java)
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }
    private val sessions = ConcurrentHashMap<String, BuaaSession>()
    private val preloads = ConcurrentHashMap<String, BuaaSession>()
    private val profiles = ConcurrentHashMap<String, ByxtStudentProfile>()
    private val portalTypes = ConcurrentHashMap<String, AcademicPortalType>()
    private val users = ConcurrentHashMap<String, UserData>()
    @Volatile private var currentUsername: String? = null

    override suspend fun preload(): LoginPreloadResponse {
        val clientId = "naviplan-${UUID.randomUUID()}"
        val session = BuaaSession(clientId, newClient())
        preloads[clientId] = session
        val response = session.client.getNoRedirect(loginUrl())
        if (response.status.value in 300..399) {
            return LoginPreloadResponse(clientId = clientId)
        }
        val html = response.bodyAsText()
        val execution = extractExecution(html)
        val captcha = detectCaptcha(html)
        return LoginPreloadResponse(
            clientId = clientId,
            execution = execution.takeIf { it.isNotBlank() },
            captcha = captcha?.let {
                val bytes = getCaptchaBytes(session.client, it.captchaId)
                it.copy(imageUrl = "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(bytes))
            },
            captchaRequired = captcha != null,
        )
    }

    override suspend fun login(request: LoginRequest): LoginResponse {
        require(request.username.isNotBlank()) { "BUAA username is required" }
        require(request.password.isNotBlank()) { "BUAA password is required" }

        val session = request.clientId?.let { preloads.remove(it) } ?: BuaaSession(request.username, newClient())
        val loginPage = session.client.getNoRedirect(loginUrl())
        val html = loginPage.bodyAsText()
        val execution = request.execution?.takeIf { it.isNotBlank() } ?: extractExecution(html)
        val captcha = detectCaptcha(html)
        if (captcha != null && request.captcha.isNullOrBlank()) {
            val bytes = getCaptchaBytes(session.client, captcha.captchaId)
            throw CaptchaRequired(
                LoginPreloadResponse(
                    clientId = request.clientId ?: session.key,
                    execution = execution,
                    captchaRequired = true,
                    captcha = captcha.copy(
                        imageUrl = "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(bytes)
                    ),
                )
            )
        }

        val submit = session.client.postNoRedirect(
            loginUrl(),
            buildLoginParameters(html, request, execution),
        )
        val finalResponse = session.client.followRedirects(submit)
        val finalBody = finalResponse.bodyAsText()
        findLoginError(finalBody)?.let { throw BuaaAuthFailure(it) }
        if (finalBody.contains("input name=\"execution\"", ignoreCase = true)) {
            throw BuaaAuthFailure("北航统一认证未通过，请检查学号、密码或验证码。")
        }

        session.client.getFollowingRedirects(ucLoginUrl())
        val probe = session.client.getFollowingRedirects(currentUserUrl())
        val probeBody = probe.bodyAsText()
        if (!isUndergradReady(probe.status, probe.call.request.url.toString(), probeBody)) {
            if (probeBody.contains("/jwapp/sys/byrhmhsy/", ignoreCase = true)) {
                throw BuaaAuthFailure("研究生账号暂不支持当前本科教务课表接口。")
            }
            throw BuaaAuthFailure("已提交登录，但本科教务 BYXT 会话未就绪。")
        }

        val user = UserData(request.username, request.username, "undergraduate-byxt")
        sessions[request.username] = session
        currentUsername = request.username
        users[request.username] = user
        portalTypes[request.username] = AcademicPortalType.UNDERGRAD
        profiles[request.username] = parseStudentProfile(probeBody).copy(username = request.username)
        return LoginResponse(
            accessToken = "local-${UUID.randomUUID()}",
            refreshToken = "local-refresh-${UUID.randomUUID()}",
            accessTokenExpiresAt = LocalDateTime.now().plusHours(2).toString(),
            refreshTokenExpiresAt = LocalDateTime.now().plusDays(30).toString(),
            user = user,
        )
    }

    fun refresh(request: TokenRefreshRequest): LoginResponse {
        val username = currentUsername ?: throw BuaaAuthFailure("尚未连接北航账号。")
        return LoginResponse(
            accessToken = "local-${UUID.randomUUID()}",
            refreshToken = request.refreshToken,
            accessTokenExpiresAt = LocalDateTime.now().plusHours(2).toString(),
            refreshTokenExpiresAt = LocalDateTime.now().plusDays(30).toString(),
            user = UserData(username, username, "undergraduate-byxt"),
        )
    }

    fun currentUser(): UserData {
        val username = currentUsername ?: throw BuaaAuthFailure("尚未连接北航账号。")
        return users[username] ?: UserData(username, username, "undergraduate-byxt")
    }

    fun status(): SessionStatusResponse {
        val user = currentUser()
        return SessionStatusResponse(user, LocalDateTime.now().toString(), LocalDateTime.now().toString())
    }

    override fun studentProfile(): ByxtStudentProfile {
        val username = currentUsername ?: throw BuaaAuthFailure("请先连接北航账号。")
        return profiles[username] ?: ByxtStudentProfile(username = username)
    }

    suspend fun getTerms(): List<Term> {
        val session = requireUndergradSession()
        val response = session.client.getFollowingRedirects(termsUrl()) { applyScheduleHeaders() }
        val body = response.bodyAsText()
        ensureScheduleResponse(response, body)
        val payload = json.decodeFromString<TermResponse>(body)
        if (payload.code != "0") throw BuaaScheduleFailure(payload.msg ?: "课表学期查询失败。")
        return payload.datas
    }

    suspend fun getWeeks(termCode: String): List<Week> {
        val session = requireUndergradSession()
        val response = session.client.getFollowingRedirects("${weeksUrl()}?termCode=$termCode") { applyScheduleHeaders() }
        val body = response.bodyAsText()
        ensureScheduleResponse(response, body)
        return json.decodeFromString<WeekResponse>(body).datas
    }

    suspend fun getWeeklySchedule(termCode: String, week: Int): WeeklySchedule {
        val session = requireUndergradSession()
        val response = session.client.postNoRedirect(
            weeklyScheduleUrl(),
            Parameters.build {
                append("termCode", termCode)
                append("type", "week")
                append("week", week.toString())
            },
        ) { applyScheduleHeaders() }.let { session.client.followRedirects(it) }
        val body = response.bodyAsText()
        ensureScheduleResponse(response, body)
        return json.decodeFromString<WeeklyScheduleResponse>(body).datas
    }

    suspend fun getTodaySchedule(): List<TodayClass> {
        val session = requireUndergradSession()
        val today = LocalDate.now().toString()
        val response = session.client.getFollowingRedirects("${todayUrl()}?rq=$today&lxdm=student") { applyScheduleHeaders() }
        val body = response.bodyAsText()
        ensureScheduleResponse(response, body)
        return json.decodeFromString<TodayScheduleResponse>(body).datas
    }

    suspend fun getGrades(termCode: String): GradeData {
        val session = requireUndergradSession()
        val term = parseBuaaScoreTermCode(termCode)
        val activationResponse = session.client.getFollowingRedirects(scoreUrl()) { applyGradePageHeaders() }
        val activationBody = activationResponse.bodyAsText()
        if (isScoreSessionExpired(activationResponse, activationBody)) {
            throw BuaaAuthFailure("北航成绩会话已过期，请重新连接。")
        }
        if (!activationResponse.status.isSuccess()) {
            throw BuaaGradeFailure("北航成绩系统返回 ${activationResponse.status.value}。")
        }

        val response = session.client.postNoRedirect(
            scoreUrl(),
            Parameters.build {
                append("xq", term.semester.toString())
                append("year", term.year)
            },
        ) { applyGradeQueryHeaders() }.let { session.client.followRedirects(it) }
        val body = response.bodyAsText()
        if (isScoreSessionExpired(response, body)) {
            throw BuaaAuthFailure("北航成绩会话已过期，请重新连接。")
        }
        if (!response.status.isSuccess()) {
            throw BuaaGradeFailure("北航成绩系统返回 ${response.status.value}。")
        }

        val payload = runCatching { json.decodeFromString<BuaaScoreResponse>(body) }
            .getOrElse { throw BuaaGradeFailure("北航成绩返回无法解析。") }
        if (payload.code != 0) {
            throw BuaaGradeFailure(payload.message ?: "北航成绩查询失败。")
        }
        return GradeData(termCode, payload.data.values.map { it.toGrade(termCode) })
    }

    override suspend fun getAllGrades(): List<GradeData> {
        val snapshot = fetchCurriculumSnapshot()
        if (snapshot != null && snapshot.courses.isNotEmpty()) {
            return snapshot.courses
                .groupBy { it.termCode ?: "unknown" }
                .map { (termCode, grades) -> GradeData(termCode, grades) }
                .sortedBy { it.termCode }
        }
        return getTerms().mapNotNull { term ->
            runCatching { getGrades(term.itemCode) }.getOrNull()
        }
    }

    override suspend fun fetchCurriculumSnapshot(): ByxtCurriculumSnapshot? = fetchDegreeSnapshot()

    suspend fun fetchDegreeSnapshot(): ByxtCurriculumSnapshot? {
        val session = requireUndergradSession()
        runCatching {
            session.client.getFollowingRedirects(xsfacxIndexUrl()) { applyByxtPageHeaders() }.bodyAsText()
            session.client.getFollowingRedirects(xyjctjIndexUrl()) { applyByxtPageHeaders() }.bodyAsText()
        }.onFailure {
            log.warn("BYXT degree warmup failed: {}", it.message)
        }

        val studentPayload = session.client.postByxtJson(queryStudentInfoUrl(), Parameters.build {}, xyjctjIndexUrl())
        val studentObject = studentPayload.digObject("datas", "queryXsjbxx")
        val profileObject = studentObject?.digObject("jbxx")
        val planFromStudent = studentObject?.digArray("faArr")?.firstObject()

        val personalPlanPayload = session.client.postByxtJson(personalPlanUrl(), Parameters.build {}, xsfacxIndexUrl())
        val personalPlan = personalPlanPayload.digArray("datas", "grpyfacx", "rows")?.firstObject()

        val planCode = listOf(planFromStudent?.string("PYFADM"), personalPlan?.string("PYFADM"))
            .firstOrNull { !it.isNullOrBlank() } ?: return null
        val planType = listOf(planFromStudent?.string("XDLXDM"), personalPlan?.string("XDLXDM"))
            .firstOrNull { !it.isNullOrBlank() } ?: "01"

        val groupPayload = session.client.postByxtJson(
            curriculumGroupsUrl(),
            Parameters.build { append("PYFADM", planCode) },
            xsfacxIndexUrl(),
        )

        val coursePayload = session.client.postByxtJson(
            curriculumCoursesUrl(),
            Parameters.build { append("PYFADM", planCode) },
            xsfacxIndexUrl(),
        )

        val auditPayload = session.client.postByxtJson(
            degreeAuditUrl(),
            Parameters.build {
                append("fromPage", "grxyjcbg")
                append("PYFADM", planCode)
                append("SCLX", "04")
                append("XDLX", planType)
            },
            xyjctjIndexUrl(),
        )
        val termCreditsPayload = session.client.postByxtJson(
            termCreditsUrl(),
            Parameters.build { append("PYFADM", planCode) },
            xyjctjIndexUrl(),
        )
        val offerings = runCatching { fetchByxkCourseOfferings(session) }
            .onFailure { log.warn("BYXK current offering lookup unavailable; keeping the complete curriculum pool without live offering flags.") }
            .getOrNull()
        val snapshot = ByxtCurriculumParser.parse(
            studentPayload = studentPayload,
            personalPlanPayload = personalPlanPayload,
            groupPayload = groupPayload,
            coursePayload = coursePayload,
            auditPayload = auditPayload,
            termCreditsPayload = termCreditsPayload,
            offerings = offerings,
        ) ?: return null
        val profile = ByxtStudentProfile(
            username = profileObject?.string("XH") ?: personalPlan?.string("XH") ?: currentUsername,
            name = profileObject?.string("XM") ?: personalPlan?.string("XM"),
            grade = snapshot.studentGrade,
            college = snapshot.college,
            major = snapshot.major,
            rawSource = "BYXT byshapp/queryXsjbxx.do",
        )
        currentUsername?.let { profiles[it] = profile }
        return snapshot
    }

    private suspend fun fetchByxkCourseOfferings(session: BuaaSession): List<ByxkCourseOffering> {
        session.client.getFollowingRedirects(byxkRootUrl()) { applyByxtPageHeaders() }.bodyAsText()
        val token = session.client.cookies(Url(byxkProfileUrl()))
            .firstOrNull { it.name.equals("token", ignoreCase = true) || it.name.equals("Authorization", ignoreCase = true) }
            ?.value
            ?.let(::decodeCookieValuePreservingPlus)
            ?.takeIf { it.isNotBlank() }
            ?: throw BuaaScheduleFailure("当前选课系统未建立临时会话。")

        val studentInfo = session.client.postNoRedirect(
            byxkStudentInfoUrl(),
            Parameters.build { append("token", token) },
        ) { applyByxkHeaders(token, byxkProfileUrl()) }.let { session.client.followRedirects(it) }
        val studentPayload = parseJsonResponse(studentInfo, "当前选课轮次")
        val student = studentPayload.digObject("data", "student")
            ?: throw BuaaScheduleFailure("当前选课系统未返回学生轮次。")
        val batches = (
            student.digArray("electiveBatchList").orEmptyObjects() +
                student.digArray("expElectiveBatchList").orEmptyObjects()
            ).distinctBy { it.string("code") }
        val batch = batches.firstOrNull { it.string("canSelect") == "1" }
            ?: batches.firstOrNull()
            ?: throw BuaaScheduleFailure("当前没有可读取的选课轮次。")
        val batchId = batch.string("code") ?: throw BuaaScheduleFailure("当前选课轮次缺少编号。")
        val termCode = batch.string("schoolTerm")
        val termName = batch.string("schoolTermName") ?: batch.string("name")

        session.client.postNoRedirect(
            byxkElectiveUserUrl(),
            Parameters.build { append("batchId", batchId) },
        ) { applyByxkHeaders(token, byxkProfileUrl()) }.let { session.client.followRedirects(it) }.bodyAsText()

        val inPlan = session.client.postByxkCourseList(token, batchId, "FANKC")
        val selected = session.client.postByxkCourseList(token, batchId, "YXKC")
        val selectedCodes = selected.mapNotNull { it.string("KCH") }.toSet()
        return inPlan.mapNotNull { row ->
            val courseCode = row.string("KCH") ?: return@mapNotNull null
            ByxkCourseOffering(
                courseCode = courseCode,
                termCode = row.string("schoolTerm") ?: termCode,
                termName = termName,
                teachingClassId = row.string("JXBID"),
                selected = courseCode in selectedCodes,
            )
        }
    }

    private suspend fun HttpClient.postByxkCourseList(token: String, batchId: String, type: String): List<JsonObject> {
        val payload = JsonObject(
            mapOf(
                "teachingClassType" to kotlinx.serialization.json.JsonPrimitive(type),
                "pageNumber" to kotlinx.serialization.json.JsonPrimitive(1),
                "pageSize" to kotlinx.serialization.json.JsonPrimitive(1000),
                "orderBy" to kotlinx.serialization.json.JsonPrimitive(""),
                "campus" to kotlinx.serialization.json.JsonPrimitive("1"),
            )
        )
        val response = post(byxkCourseListUrl()) {
            applyByxkHeaders(token, byxkGrabLessonsUrl(batchId))
            header("batchId", batchId)
            header(HttpHeaders.ContentType, "application/json")
            setBody(payload.toString())
        }
        return parseJsonResponse(response, "当前开课列表").digArray("data", "rows").orEmptyObjects()
    }

    private suspend fun parseJsonResponse(response: HttpResponse, label: String): JsonObject {
        val body = response.bodyAsText()
        if (!response.status.isSuccess()) throw BuaaScheduleFailure("$label 请求失败（${response.status.value}）。")
        return runCatching { json.parseToJsonElement(body).jsonObject }
            .getOrElse { throw BuaaScheduleFailure("$label 返回无法解析。") }
    }

    suspend fun discoverCurriculumRaw(): ByxtCurriculumRawResponse {
        val session = requireUndergradSession()
        val discovered = linkedSetOf<String>()
        val menuResponse = session.client.getFollowingRedirects(menusUrl()) { applyScheduleHeaders() }
        val menuBody = menuResponse.bodyAsText()
        ensureScheduleResponse(menuResponse, menuBody)
        val appEndpoints = extractDoEndpoints(menuBody)
        discovered += appEndpoints
        appEndpoints
            .filter { looksLikeCurriculumApp(it) }
            .take(6)
            .forEach { appEndpoint ->
                val appResponse = session.client.getFollowingRedirects(curriculumEndpointUrl(appEndpoint)) { applyScheduleHeaders() }
                val appBody = appResponse.bodyAsText()
                discovered += extractDoEndpoints(appBody, appEndpoint.substringBeforeLast('/', ""))
            }
        curriculumCandidateEndpoints().forEach { discovered += it }

        val results = discovered.take(24).map { endpoint ->
            val url = curriculumEndpointUrl(endpoint)
            val response = session.client.getFollowingRedirects(url) { applyScheduleHeaders() }
            val body = response.bodyAsText()
            ByxtCurriculumEndpointResult(
                endpoint = endpoint,
                status = response.status.value,
                contentType = response.headers[HttpHeaders.ContentType],
                matched = looksLikeCurriculum(body),
                snippet = sanitizeSnippet(body),
            )
        }
        return ByxtCurriculumRawResponse(discovered.toList(), results)
    }

    suspend fun fetchCurriculumSnapshotLegacy(): ByxtCurriculumSnapshot? {
        val raw = discoverCurriculumRaw()
        val best = raw.results.firstOrNull { it.matched && it.status in 200..299 } ?: return null
        val nodes = parseCurriculumNodes(best.snippet)
        return ByxtCurriculumSnapshot(
            title = Regex("""20\d{2}[^"'<>]{0,30}培养方案""").find(best.snippet)?.value ?: "BYXT 培养方案",
            totalCredits = Regex("""要求学分[：:\s]*([0-9]+(?:\.[0-9]+)?)""").find(best.snippet)?.groupValues?.get(1)?.toDoubleOrNull(),
            endpointUsed = best.endpoint,
            nodes = nodes,
            rawSnippet = best.snippet,
        )
    }

    override fun clearTransientSessions() {
        sessions.values.forEach { it.client.close() }
        preloads.values.forEach { it.client.close() }
        sessions.clear()
        preloads.clear()
        profiles.clear()
        portalTypes.clear()
        users.clear()
        currentUsername = null
    }

    private suspend fun requireUndergradSession(): BuaaSession {
        val username = currentUsername ?: throw BuaaAuthFailure("请先连接北航账号。")
        val session = sessions[username] ?: throw BuaaAuthFailure("北航会话不存在，请重新连接。")
        when (portalTypes[username]) {
            AcademicPortalType.UNDERGRAD -> return session
            AcademicPortalType.GRADUATE -> throw BuaaAuthFailure("研究生账号暂不支持当前本科教务接口。")
            AcademicPortalType.UNKNOWN -> Unit
            null -> Unit
        }
        return when (probeAcademicPortal(username, session, failOnUnavailable = true)) {
            AcademicPortalType.UNDERGRAD -> session
            AcademicPortalType.GRADUATE -> throw BuaaAuthFailure("研究生账号暂不支持当前本科教务接口。")
            AcademicPortalType.UNKNOWN -> throw BuaaAuthFailure("本科教务 BYXT 会话未就绪，请稍后重试或重新连接北航账号。")
        }
    }

    private fun requireCurrentSession(): BuaaSession {
        val username = currentUsername ?: throw BuaaAuthFailure("请先连接北航账号。")
        return sessions[username] ?: throw BuaaAuthFailure("北航会话不存在，请重新连接。")
    }

    private suspend fun probeAcademicPortal(
        username: String,
        session: BuaaSession,
        failOnUnavailable: Boolean,
    ): AcademicPortalType {
        byxtWarmupUrls().forEach { url ->
            runCatching {
                session.client.getFollowingRedirects(url) { applyByxtPageHeaders() }.bodyAsText()
            }.onFailure {
                log.warn("BYXT warmup page failed for user={} url={} error={}", username, url, it.message)
            }
        }

        val response = session.client.getFollowingRedirects(currentUserUrl()) { applyScheduleHeaders() }
        val body = response.bodyAsText()
        val finalUrl = response.call.request.url.toString()
        val result = classifyUndergradPortal(response.status, finalUrl, body)
        if (result == AcademicPortalProbeResult.UNAVAILABLE || result == AcademicPortalProbeResult.SSO_REQUIRED) {
            log.warn(
                "BYXT probe not ready for user={} status={} finalUrl={} result={} snippet={}",
                username,
                response.status.value,
                finalUrl.take(240),
                result,
                sanitizeSnippet(body).take(500),
            )
        }
        val stableResult = if (result == AcademicPortalProbeResult.SSO_REQUIRED) {
            runCatching { session.client.getFollowingRedirects(ucLoginUrl()) }
                .onFailure { log.warn("UC reactivation failed for user={} error={}", username, it.message) }
            val retry = session.client.getFollowingRedirects(currentUserUrl()) { applyScheduleHeaders() }
            val retryBody = retry.bodyAsText()
            val retryResult = classifyUndergradPortal(retry.status, retry.call.request.url.toString(), retryBody)
            if (retryResult == AcademicPortalProbeResult.UNDERGRAD_READY) {
                profiles[username] = parseStudentProfile(retryBody).copy(username = username)
            }
            retryResult
        } else {
            result
        }
        return when (stableResult) {
            AcademicPortalProbeResult.UNDERGRAD_READY -> {
                portalTypes[username] = AcademicPortalType.UNDERGRAD
                profiles.putIfAbsent(username, parseStudentProfile(body).copy(username = username))
                AcademicPortalType.UNDERGRAD
            }
            AcademicPortalProbeResult.GRADUATE_READY -> {
                portalTypes[username] = AcademicPortalType.GRADUATE
                AcademicPortalType.GRADUATE
            }
            AcademicPortalProbeResult.SSO_REQUIRED -> {
                if (failOnUnavailable) throw BuaaAuthFailure("北航教务会话已过期，请重新连接。")
                AcademicPortalType.UNKNOWN
            }
            AcademicPortalProbeResult.UNAVAILABLE -> {
                if (failOnUnavailable) throw BuaaAuthFailure("本科教务 BYXT 会话未就绪，请稍后重试或重新连接北航账号。")
                AcademicPortalType.UNKNOWN
            }
        }
    }

    private fun ensureScheduleResponse(response: HttpResponse, body: String) {
        if (!response.status.isSuccess()) throw BuaaScheduleFailure("北航教务接口返回 ${response.status.value}。")
        if (!isUndergradReady(response.status, response.call.request.url.toString(), body)) {
            throw BuaaAuthFailure("北航教务会话已过期，请重新连接。")
        }
    }

    private suspend fun HttpClient.postByxtJson(url: String, form: Parameters, referer: String): JsonObject {
        val response = postNoRedirect(url, form) {
            header(HttpHeaders.Accept, "application/json, text/javascript, */*; q=0.01")
            header("X-Requested-With", "XMLHttpRequest")
            header(HttpHeaders.Referrer, referer)
        }.let { followRedirects(it) }
        val body = response.bodyAsText()
        ensureScheduleResponse(response, body)
        return runCatching { json.parseToJsonElement(body).jsonObject }
            .getOrElse { throw BuaaScheduleFailure("BYXT返回数据无法解析。") }
    }

    private fun collectAuditCourses(
        node: JsonObject?,
        groupsById: Map<String, JsonObject>,
        target: MutableMap<String, MutableList<Grade>>,
    ) {
        if (node == null) return
        val groupId = node.string("courseGroupId") ?: node.string("KZH")
        val groupName = groupId?.let { groupsById[it]?.string("KZM") }
            ?: node.string("courseCategoryName")
            ?: node.string("KZM")
            ?: node.string("KCLBDM_DISPLAY")

        val rows = node.digArray("checkCourseVOS").orEmptyObjects() + node.digArray("data").orEmptyObjects()
        if (groupId != null) {
            rows.mapNotNull { it.toByxtAuditGrade(groupName) }.forEach { grade ->
                target.getOrPut(groupId) { mutableListOf() } += grade
            }
        }
        node.digArray("children").orEmptyObjects().forEach { child ->
            collectAuditCourses(child, groupsById, target)
        }
    }

    private fun JsonObject.toByxtAuditGrade(groupName: String?): Grade? {
        val courseName = string("courseName") ?: string("KCM") ?: string("replacedCourseName") ?: string("TDKCM") ?: return null
        val courseCode = string("courseId") ?: string("KCH") ?: string("replacedCourseId") ?: string("TDKCH")
        val termCode = string("courseSelectionSchoolYearTermCode")
            ?: string("pointSchoolYearTermCode")
            ?: string("schoolYearTerms")
            ?: string("XKXNXQDM")
            ?: string("CJXNXQDM")
            ?: string("JHXNXQDM")
            ?: "unknown"
        val statusCode = string("status") ?: string("ZT")
        val statusName = string("ZT_DISPLAY")
            ?: when (statusCode) {
                "01" -> "已通过"
                "02" -> "未通过"
                "03" -> "修读中"
                "04" -> "未修读"
                else -> null
            }
        val passedValue = boolean("passed")
        val passedText = string("SFJG_DISPLAY") ?: passedValue?.let { if (it) "是" else "否" }
        return Grade(
            id = string("WID") ?: listOfNotNull(courseCode, courseName, termCode).joinToString("-"),
            termCode = termCode,
            termName = string("XKXNXQDM_DISPLAY") ?: string("CJXNXQDM_DISPLAY") ?: string("JHXNXQDM_DISPLAY") ?: termCode,
            courseName = courseName,
            courseCode = courseCode,
            replacementCourseName = string("replacedCourseName") ?: string("TDKCM"),
            replacementCourseCode = string("replacedCourseId") ?: string("TDKCH"),
            credit = double("credit") ?: double("XF"),
            score = string("scoreView") ?: string("XSZCJ") ?: string("CJ") ?: string("DJCJ_DISPLAY"),
            gradePoint = string("gradePoint") ?: string("JD"),
            courseCategory = string("courseCategoryName") ?: string("KCLBDM_DISPLAY") ?: groupName,
            courseGroup = groupName ?: string("XGXKLBDM_DISPLAY"),
            courseAttribute = string("KCXZDM_DISPLAY") ?: string("courseNature"),
            examType = string("KSLXDM_DISPLAY") ?: string("examType"),
            examAttempt = string("CXCKDM_DISPLAY") ?: string("retakeType"),
            passed = passedText,
            effective = string("SFYX_DISPLAY"),
            recognitionType = string("HQFS_DISPLAY") ?: string("obtainType"),
            statusCode = statusCode,
            statusName = statusName,
            tag = string("BQMC") ?: string("bqmc"),
            teachingLanguage = string("SKYZMC_DISPLAY") ?: string("skyzmc"),
        )
    }

    private fun inferRequiredCourses(requiredCredits: Double?, planCourses: List<JsonObject>): Int? {
        if (requiredCredits == null || requiredCredits <= 0.0 || planCourses.isEmpty()) return null
        val credits = planCourses.mapNotNull { it.double("XF") }.filter { it > 0.0 }.distinct()
        if (credits.isEmpty()) return null
        if (planCourses.size > 1 && credits.all { kotlin.math.abs(it - requiredCredits) < 0.001 }) return 1
        return null
    }

    private suspend fun HttpClient.getFollowingRedirects(url: String, block: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {}): HttpResponse =
        followRedirects(getNoRedirect(url, block))

    private suspend fun HttpClient.getNoRedirect(url: String, block: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {}): HttpResponse =
        get(url, block)

    private suspend fun HttpClient.postNoRedirect(
        url: String,
        form: Parameters,
        block: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {},
    ): HttpResponse = post(url) {
        block()
        header(HttpHeaders.ContentType, "application/x-www-form-urlencoded")
        setBody(FormDataContent(form))
    }

    private suspend fun HttpClient.followRedirects(initial: HttpResponse): HttpResponse {
        var response = initial
        repeat(12) {
            if (response.status.value !in 300..399) return response
            val location = response.headers[HttpHeaders.Location] ?: return response
            val next = URI.create(response.call.request.url.toString()).resolve(location).toString()
            response = getNoRedirect(next)
        }
        return response
    }

    private fun newClient(): HttpClient = HttpClient(CIO) {
        followRedirects = false
        install(HttpCookies)
        install(HttpTimeout) {
            requestTimeoutMillis = 20_000
            connectTimeoutMillis = 10_000
            socketTimeoutMillis = 20_000
        }
        expectSuccess = false
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyScheduleHeaders() {
        header(HttpHeaders.Accept, "application/json, text/javascript, */*; q=0.01")
        header("X-Requested-With", "XMLHttpRequest")
        header(HttpHeaders.Referrer, VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html"))
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyByxtPageHeaders() {
        header(HttpHeaders.Accept, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        header(HttpHeaders.Referrer, VpnCipher.toVpnUrl("https://uc.buaa.edu.cn/"))
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyGradePageHeaders() {
        header(HttpHeaders.Accept, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyGradeQueryHeaders() {
        header(HttpHeaders.Accept, "application/json, text/javascript, */*; q=0.01")
        header("X-Requested-With", "XMLHttpRequest")
        header(HttpHeaders.Referrer, VpnCipher.toVpnUrl("https://app.buaa.edu.cn/buaascore/wap/default/index"))
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyByxkHeaders(token: String, referer: String) {
        header(HttpHeaders.Accept, "application/json, text/plain, */*")
        header(HttpHeaders.Authorization, token)
        header(HttpHeaders.Referrer, referer)
    }

    private fun decodeCookieValuePreservingPlus(value: String): String =
        java.net.URLDecoder.decode(value.replace("+", "%2B"), Charsets.UTF_8)

    private suspend fun getCaptchaBytes(client: HttpClient, captchaId: String): ByteArray =
        client.getFollowingRedirects("${captchaBase()}?captchaId=$captchaId").body()

    private fun buildLoginParameters(html: String, request: LoginRequest, execution: String): Parameters =
        Parameters.build {
            hiddenInputs(html).forEach { (name, value) -> append(name, value) }
            append("username", request.username)
            append("password", request.password)
            request.captcha?.takeIf { it.isNotBlank() }?.let {
                append("captcha", it)
                append("captchaResponse", it)
            }
            if (execution.isNotBlank() && this["execution"] == null) append("execution", execution)
            if (this["_eventId"] == null) append("_eventId", "submit")
            append("submit", "登录")
            append("type", "username_password")
        }

    private fun hiddenInputs(html: String): List<Pair<String, String>> =
        Regex("""<input[^>]*name=["']([^"']+)["'][^>]*>""", RegexOption.IGNORE_CASE)
            .findAll(html)
            .mapNotNull { match ->
                val tag = match.value
                if (!tag.contains("type=\"hidden\"", ignoreCase = true) && !tag.contains("type='hidden'", ignoreCase = true)) return@mapNotNull null
                val name = match.groupValues[1]
                val value = Regex("""value=["']([^"']*)["']""", RegexOption.IGNORE_CASE).find(tag)?.groupValues?.get(1).orEmpty()
                name to value
            }
            .toList()

    private fun extractExecution(html: String): String =
        Regex("""<input[^>]*name=["']execution["'][^>]*value=["']([^"']+)["']""", RegexOption.IGNORE_CASE)
            .find(html)?.groupValues?.get(1).orEmpty()

    private fun detectCaptcha(html: String): CaptchaInfo? {
        val match = Regex("""config\.captcha\s*=\s*\{\s*type:\s*['"]([^'"]+)['"],\s*id:\s*['"]([^'"]+)['"]""").find(html)
            ?: return null
        return CaptchaInfo(match.groupValues[2], "${captchaBase()}?captchaId=${match.groupValues[2]}")
    }

    private fun findLoginError(html: String): String? {
        Regex("""<div class=["']tip-text["']>([^<]+)</div>""", RegexOption.IGNORE_CASE).find(html)?.let {
            return it.groupValues[1].trim()
        }
        Regex("""<div[^>]*(error|alert)[^>]*>(.*?)</div>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)).find(html)?.let {
            return it.groupValues[2].replace(Regex("<[^>]+>"), "").trim().takeIf(String::isNotBlank)
        }
        return null
    }

    private fun isUndergradReady(status: HttpStatusCode, finalUrl: String, body: String): Boolean =
        classifyUndergradPortal(status, finalUrl, body) == AcademicPortalProbeResult.UNDERGRAD_READY

    private fun classifyUndergradPortal(status: HttpStatusCode, finalUrl: String, body: String): AcademicPortalProbeResult {
        if (status == HttpStatusCode.Unauthorized) return AcademicPortalProbeResult.SSO_REQUIRED
        if (finalUrl.contains("sso.buaa.edu.cn", ignoreCase = true)) return AcademicPortalProbeResult.SSO_REQUIRED
        if (finalUrl.contains("/jwapp/sys/byrhmhsy/", ignoreCase = true)) {
            val trimmed = body.trimStart()
            return if (trimmed.startsWith("{") || trimmed.startsWith("[") || body.isBlank()) {
                AcademicPortalProbeResult.GRADUATE_READY
            } else {
                AcademicPortalProbeResult.UNAVAILABLE
            }
        }
        val trimmed = body.trimStart()
        if (trimmed.startsWith("<!DOCTYPE html", ignoreCase = true) || trimmed.startsWith("<html", ignoreCase = true)) {
            return if (body.contains("input name=\"execution\"", ignoreCase = true) ||
                body.contains("统一身份认证", ignoreCase = true)
            ) {
                AcademicPortalProbeResult.SSO_REQUIRED
            } else {
                AcademicPortalProbeResult.UNAVAILABLE
            }
        }
        return if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            AcademicPortalProbeResult.UNDERGRAD_READY
        } else {
            AcademicPortalProbeResult.UNAVAILABLE
        }
    }

    private fun isScoreSessionExpired(response: HttpResponse, body: String): Boolean {
        if (response.status == HttpStatusCode.Unauthorized) return true
        val finalUrl = response.call.request.url.toString()
        if (finalUrl.contains("sso.buaa.edu.cn", ignoreCase = true)) return true
        if (finalUrl.contains("d.buaa.edu.cn", ignoreCase = true) && finalUrl.contains("/login", ignoreCase = true)) return true
        return body.contains("input name=\"execution\"", ignoreCase = true) ||
            body.contains("统一身份认证", ignoreCase = true)
    }

    private fun parseByxtDate(value: String): LocalDate =
        LocalDate.parse(value.trim().take(10))

    private fun parseStudentProfile(body: String): ByxtStudentProfile {
        val root = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull()
            ?: return ByxtStudentProfile()

        fun findString(keys: Set<String>): String? {
            fun walk(element: JsonElement): String? {
                if (element !is JsonObject) return null
                element.entries.forEach { (key, value) ->
                    if (key.lowercase() in keys) {
                        val text = runCatching { value.jsonPrimitive.content }.getOrNull()
                        if (!text.isNullOrBlank()) return text
                    }
                }
                element.values.forEach { child ->
                    walk(child)?.let { return it }
                }
                return null
            }
            return walk(root)
        }

        return ByxtStudentProfile(
            username = findString(setOf("username", "userid", "userno", "xh", "studentno", "studentid", "gh")),
            name = findString(setOf("name", "usernamecn", "xm", "displayname", "realname")),
            grade = findString(setOf("grade", "nj", "sznj", "entranceyear", "rxnf")),
            college = findString(setOf("college", "collegename", "department", "departmentname", "yxmc", "dwmc", "academyname")),
            major = findString(setOf("major", "majorname", "zymc", "specialityname", "professionname")),
        )
    }

    private fun curriculumCandidateEndpoints(): List<String> = listOf(
        "/sys/jljhglbuaa/*default/3k2f2hnb3e713n3o30ln3bmu33kl2tqf931.do",
        "/sys/jljhglbuaa/*default/2ek232gv34la3ep52on92ti42mn02nb2791.do",
        "/sys/jljhglbuaa/*default/2e0i3mqn2sur3m9s245v3pnr3gj33rgf991.do",
        "/sys/jljhglbuaa/*default/index.do",
        "ggxxpzd.do?userType=student",
        "queryCommonLink.do?USERTYPE=student",
        "myApps.do",
    )

    private fun curriculumEndpointUrl(endpoint: String): String {
        val decoded = decodeEndpoint(endpoint)
        if (decoded.startsWith("http://") || decoded.startsWith("https://")) return VpnCipher.toVpnUrl(decoded)
        if (decoded.startsWith("/")) return VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp$decoded")
        return VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/$decoded")
    }

    private fun extractDoEndpoints(body: String, basePath: String = ""): List<String> =
        Regex("""["']([^"']+\.do(?:\?[^"']*)?)["']""")
            .findAll(body)
            .map { decodeEndpoint(it.groupValues[1]) }
            .map { endpoint ->
                when {
                    endpoint.startsWith("http://") || endpoint.startsWith("https://") || endpoint.startsWith("/") -> endpoint
                    basePath.isNotBlank() -> "${basePath.trimEnd('/')}/$endpoint"
                    else -> endpoint
                }
            }
            .filterNot { it.contains("logout", ignoreCase = true) }
            .distinct()
            .toList()

    private fun decodeEndpoint(endpoint: String): String =
        endpoint.replace("\\/", "/")
            .replace("\\u002F", "/")
            .replace("&amp;", "&")

    private fun looksLikeCurriculumApp(endpoint: String): Boolean {
        val lower = decodeEndpoint(endpoint).lowercase()
        return listOf("pyfa", "pyfagl", "培养", "jljh", "jhgl", "program", "plan").any { lower.contains(it) }
    }

    private fun looksLikeCurriculum(body: String): Boolean {
        val text = body.take(100_000)
        val score = listOf("培养方案", "要求学分", "核心专业类", "通识", "限修", "美育", "劳育", "毕业").count { text.contains(it) }
        return score >= 2
    }

    private fun sanitizeSnippet(body: String): String =
        body.replace(Regex("""\s+"""), " ").take(12_000)

    private fun parseCurriculumNodes(text: String): List<ByxtCurriculumNode> {
        val nodeRegex = Regex("""([\u4e00-\u9fa5A-Za-z0-9（）()·\-—、]{2,40})[^0-9]{0,12}要求学分[：:\s]*([0-9]+(?:\.[0-9]+)?)""")
        return nodeRegex.findAll(text)
            .map { match ->
                ByxtCurriculumNode(
                    name = match.groupValues[1].trim(' ', '"', '\'', ':', '：', ',', '{', '['),
                    requiredCredits = match.groupValues[2].toDoubleOrNull(),
                )
            }
            .filter { it.requiredCredits != null && it.name.length <= 40 }
            .distinctBy { it.name to it.requiredCredits }
            .take(32)
            .toList()
    }

    private fun loginUrl() = VpnCipher.toVpnUrl("https://sso.buaa.edu.cn/login")
    private fun captchaBase() = VpnCipher.toVpnUrl("https://sso.buaa.edu.cn/captcha")
    private fun ucLoginUrl() = VpnCipher.toVpnUrl("https://uc.buaa.edu.cn/api/login?target=https%3A%2F%2Fuc.buaa.edu.cn%2F%23%2Fuser%2Flogin")
    private fun currentUserUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/currentUser.do")
    private fun byxtWarmupUrls(): List<String> = listOf(
        VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html"),
        VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/home/index.html"),
    )
    private fun menusUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/menus.do?userType=student")
    private fun termsUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/student/schoolCalendars.do")
    private fun weeksUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/getTermWeeks.do")
    private fun weeklyScheduleUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/student/getMyScheduleDetail.do")
    private fun todayUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/teachingSchedule/detail.do")
    private fun scoreUrl() = VpnCipher.toVpnUrl("https://app.buaa.edu.cn/buaascore/wap/default/index")
    private fun xsfacxIndexUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/xsfacx/*default/index.do?THEME=indigo&EMAP_LANG=zh&forceApp=xsfacx&min=1")
    private fun xyjctjIndexUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/xyjctjapp/*default/index.do?THEME=indigo&EMAP_LANG=zh&forceApp=xyjctjapp&min=1")
    private fun queryStudentInfoUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/byshapp/api/grbg/queryXsjbxx.do")
    private fun personalPlanUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/xsfacx/modules/pyfacxepg/grpyfacx.do")
    private fun curriculumGroupsUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/jwpubapp/modules/pyfa/kzcx.do")
    private fun curriculumCoursesUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/jwpubapp/modules/pyfa/kzkccx.do")
    private fun degreeAuditUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/byshapp/api/grbg/queryXyzhbx.do")
    private fun termCreditsUrl() = VpnCipher.toVpnUrl("https://byxt.buaa.edu.cn/jwapp/sys/byshapp/modules/grbg/cxxsxqxf.do")
    private fun byxkRootUrl() = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/")
    private fun byxkProfileUrl() = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/xsxk/profile/index.html")
    private fun byxkStudentInfoUrl() = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/xsxk/web/studentInfo")
    private fun byxkElectiveUserUrl() = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/xsxk/elective/user")
    private fun byxkCourseListUrl() = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/xsxk/elective/buaa/clazz/list")
    private fun byxkGrabLessonsUrl(batchId: String) = VpnCipher.toVpnUrl("https://byxk.buaa.edu.cn/xsxk/elective/grablessons?batchId=$batchId")
}

private fun JsonObject.string(key: String): String? =
    (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

private fun JsonObject.double(key: String): Double? {
    val primitive = this[key] as? kotlinx.serialization.json.JsonPrimitive ?: return null
    return primitive.doubleOrNull ?: primitive.contentOrNull?.toDoubleOrNull()
}

private fun JsonObject.boolean(key: String): Boolean? =
    (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull

private fun JsonObject.digObject(vararg path: String): JsonObject? {
    var current: JsonElement = this
    for (key in path) {
        current = (current as? JsonObject)?.get(key) ?: return null
    }
    return current as? JsonObject
}

private fun JsonObject.digArray(vararg path: String): JsonArray? {
    var current: JsonElement = this
    for (key in path) {
        current = (current as? JsonObject)?.get(key) ?: return null
    }
    return current as? JsonArray
}

private fun JsonArray?.orEmptyObjects(): List<JsonObject> =
    this?.mapNotNull { it as? JsonObject }.orEmpty()

private fun JsonArray.firstObject(): JsonObject? =
    firstOrNull() as? JsonObject

private enum class AcademicPortalType {
    UNKNOWN,
    UNDERGRAD,
    GRADUATE,
}

private enum class AcademicPortalProbeResult {
    UNDERGRAD_READY,
    GRADUATE_READY,
    SSO_REQUIRED,
    UNAVAILABLE,
}

private data class BuaaSession(val key: String, val client: HttpClient)

class BuaaAuthFailure(message: String) : RuntimeException(message)
class BuaaScheduleFailure(message: String) : RuntimeException(message)
class BuaaGradeFailure(message: String) : RuntimeException(message)
class CaptchaRequired(val response: LoginPreloadResponse) : RuntimeException("北航统一认证需要验证码。")

object VpnCipher {
    var isEnabled: Boolean = System.getenv("USE_VPN")?.toBoolean() ?: false
    private const val KEY_STR = "wrdvpnisthebest!"
    private val key = KEY_STR.toByteArray(Charsets.UTF_8)
    private val iv = KEY_STR.toByteArray(Charsets.UTF_8)

    fun toVpnUrl(url: String): String {
        if (!isEnabled) return url
        val u = URI.create(url).toURL()
        if (u.host == "d.buaa.edu.cn") return url
        val protocol = when {
            u.port == -1 -> u.protocol
            u.protocol == "http" && u.port == 80 -> "http"
            u.protocol == "https" && u.port == 443 -> "https"
            else -> "${u.protocol}-${u.port}"
        }
        return "https://d.buaa.edu.cn/$protocol/${encrypt(u.host)}${u.path}${u.query?.let { "?$it" } ?: ""}${u.ref?.let { "#$it" } ?: ""}"
    }

    private fun encrypt(text: String): String {
        val plain = text.toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/CFB/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
        val encrypted = cipher.doFinal(plain + ByteArray((16 - plain.size % 16) % 16) { '0'.code.toByte() })
        return iv.toHex() + encrypted.toHex().substring(0, plain.size * 2)
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
