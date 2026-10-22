package cn.edu.buaa.naviplan

import cn.edu.buaa.naviplan.degree.DegreeService
import cn.edu.buaa.naviplan.plan.EvaluateRequest
import cn.edu.buaa.naviplan.plan.PassportIdentity
import cn.edu.buaa.naviplan.plan.PassportVerifier
import cn.edu.buaa.naviplan.plan.PlanImportService
import cn.edu.buaa.naviplan.ubaa.BuaaAuthFailure
import cn.edu.buaa.naviplan.ubaa.BuaaGradeFailure
import cn.edu.buaa.naviplan.ubaa.BuaaScheduleFailure
import cn.edu.buaa.naviplan.ubaa.CaptchaRequired
import cn.edu.buaa.naviplan.ubaa.EmbeddedUbaaScheduleConnector
import cn.edu.buaa.naviplan.ubaa.LoginRequest
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.callloging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.plugins.statuspages.exception
import io.ktor.server.request.receive
import io.ktor.server.request.httpMethod
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

fun main() {
    embeddedServer(
        Netty,
        port = System.getenv("PORT")?.toIntOrNull() ?: 8090,
        host = System.getenv("HOST") ?: "127.0.0.1",
    ) { module() }.start(wait = true)
}

fun Application.module(
    identityVerifier: suspend (ApplicationCall) -> PassportIdentity = PassportVerifier()::verify,
    connector: EmbeddedUbaaScheduleConnector = EmbeddedUbaaScheduleConnector(),
) {
    val imports = PlanImportService(connector)
    val allowedOrigins = (System.getenv("NAVIPLAN_ALLOWED_ORIGINS")
        ?: "https://study.example.test,http://127.0.0.1:5173")
        .split(',')
        .map { it.trim().trimEnd('/') }
        .filter { it.isNotEmpty() }
        .toSet()

    install(ContentNegotiation) {
        json(Json { prettyPrint = false; ignoreUnknownKeys = true; encodeDefaults = true })
    }
    install(CallLogging)
    intercept(ApplicationCallPipeline.Plugins) {
        val origin = call.request.headers[HttpHeaders.Origin]?.trimEnd('/')
        if (origin != null && origin !in allowedOrigins) {
            call.respond(HttpStatusCode.Forbidden, ApiErrorEnvelope(error = ApiError("invalid_origin", "请求来源未获授权。", requestId(call))))
            finish()
            return@intercept
        }
        if (origin != null) {
            call.response.header(HttpHeaders.AccessControlAllowOrigin, origin)
            call.response.header(HttpHeaders.AccessControlAllowCredentials, "true")
            call.response.header(HttpHeaders.Vary, "Origin")
        }
        if (call.request.httpMethod == HttpMethod.Options) {
            call.response.header(HttpHeaders.AccessControlAllowMethods, "GET, POST, OPTIONS")
            call.response.header(HttpHeaders.AccessControlAllowHeaders, "Content-Type, Authorization, X-CSRF-Token")
            call.respond(HttpStatusCode.NoContent)
            finish()
        }
    }
    install(StatusPages) {
        exception<CaptchaRequired> { call, cause -> call.respond(HttpStatusCode.UnprocessableEntity, cause.response) }
        exception<PassportFailure> { call, cause -> call.respond(cause.status, ApiErrorEnvelope(error = ApiError(cause.code, cause.message, requestId(call)))) }
        exception<BuaaAuthFailure> { call, cause -> call.respond(HttpStatusCode.Unauthorized, ApiErrorEnvelope(error = ApiError("buaa_auth_error", cause.message ?: "北航认证失败。", requestId(call)))) }
        exception<BuaaScheduleFailure> { call, cause -> call.respond(HttpStatusCode.BadGateway, ApiErrorEnvelope(error = ApiError("buaa_schedule_error", cause.message ?: "北航课表查询失败。", requestId(call)))) }
        exception<BuaaGradeFailure> { call, cause -> call.respond(HttpStatusCode.BadGateway, ApiErrorEnvelope(error = ApiError("buaa_grade_error", cause.message ?: "北航成绩查询失败。", requestId(call)))) }
        exception<IllegalArgumentException> { call, cause -> call.respond(HttpStatusCode.BadRequest, ApiErrorEnvelope(error = ApiError("invalid_request", cause.message ?: "请求参数不正确。", requestId(call)))) }
        exception<Throwable> { call, cause ->
            call.application.environment.log.error("NaviPlan request {} failed: {}", requestId(call), cause.javaClass.simpleName)
            call.respond(HttpStatusCode.InternalServerError, ApiErrorEnvelope(error = ApiError("internal_error", "服务暂时不可用，请稍后重试。", requestId(call))))
        }
    }

    routing {
        get("/health") { call.respond(mapOf("status" to "ok", "service" to "naviplan-import")) }

        post("/api/import/preload") {
            val identity = identityVerifier(call)
            call.respond(imports.preload(identity.id))
        }

        post("/api/import/run") {
            val identity = identityVerifier(call)
            val request = call.receive<LoginRequest>()
            call.respond(imports.run(identity.id, request))
        }

        post("/api/evaluate") {
            identityVerifier(call)
            val request = call.receive<EvaluateRequest>()
            val degree = DegreeService()
            val completeCourses = mergeSnapshotCourses(request.snapshot.coursePool, request.snapshot.courses)
            degree.restore(request.snapshot.plan, completeCourses, request.manualCorrections)
            call.respond(imports.snapshot(degree, request.snapshot.student, request.snapshot.importedAt, request.snapshot.source))
        }
    }
}

internal fun mergeSnapshotCourses(
    coursePool: List<cn.edu.buaa.naviplan.degree.StudentCourseRecord>,
    auditedCourses: List<cn.edu.buaa.naviplan.degree.StudentCourseRecord>,
) = (coursePool + auditedCourses).associateBy { it.id }.values.toList()

private fun requestId(call: ApplicationCall): String =
    call.request.headers["X-Request-Id"]?.take(80) ?: UUID.randomUUID().toString()

@Serializable
data class ApiError(val code: String, val message: String, val requestId: String)

@Serializable
data class ApiErrorEnvelope(val ok: Boolean = false, val error: ApiError)

class PassportFailure(val code: String, override val message: String, val status: HttpStatusCode) : RuntimeException(message)
