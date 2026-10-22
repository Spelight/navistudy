package cn.edu.buaa.naviplan.plan

import cn.edu.buaa.naviplan.PassportFailure
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import io.ktor.server.application.ApplicationCall
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PassportVerifier(
    private val accountUrl: String = System.getenv("NAVIPASSPORT_ACCOUNT_URL")
        ?: "https://study.example.test/naviplan/navistudy-api/api/v1/account",
    private val client: HttpClient = HttpClient(CIO) { expectSuccess = false },
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun verify(call: ApplicationCall): PassportIdentity {
        val authorization = call.request.headers[HttpHeaders.Authorization]
        val cookie = call.request.headers[HttpHeaders.Cookie]
        if (authorization.isNullOrBlank() && cookie.isNullOrBlank()) {
            throw PassportFailure("authentication_required", "请先登录 Navi Passport。", HttpStatusCode.Unauthorized)
        }
        val response = client.get(accountUrl) {
            authorization?.let { header(HttpHeaders.Authorization, it) }
            cookie?.let { header(HttpHeaders.Cookie, it) }
            header(HttpHeaders.Accept, "application/json")
        }
        if (!response.status.isSuccess()) {
            throw PassportFailure("authentication_required", "Navi Passport 登录已失效，请重新登录。", HttpStatusCode.Unauthorized)
        }
        val root = runCatching { json.parseToJsonElement(response.bodyAsText()).jsonObject }.getOrNull()
            ?: throw PassportFailure("passport_unavailable", "Navi Passport 返回无法解析。", HttpStatusCode.BadGateway)
        val account = root["account"]?.jsonObject
            ?: throw PassportFailure("passport_unavailable", "Navi Passport 未返回账号信息。", HttpStatusCode.BadGateway)
        val id = account["id"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            ?: throw PassportFailure("passport_unavailable", "Navi Passport 账号标识缺失。", HttpStatusCode.BadGateway)
        val username = account["username"]?.jsonPrimitive?.content.orEmpty()
        return PassportIdentity(id, username)
    }
}
