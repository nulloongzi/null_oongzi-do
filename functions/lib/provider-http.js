// provider-http.js — 소셜 제공자(카카오/네이버) API 호출용 HTTP 헬퍼 (전역 fetch 금지)
//
// 왜 fetch를 안 쓰나:
// Node 22 전역 fetch(undici)는 우리가 지정하지 않은 브라우저용 헤더를 자동으로 붙인다.
// 실측(Node 22.22): accept-language: *, sec-fetch-mode: cors, user-agent: node.
// 406은 원래 Accept-* 협상 실패 코드이고, 카카오 인증 서버(kauth) 엣지가 이 조합을
// 거부해 본문과 무관하게 406 not_acceptable(KOE001)을 돌려준다.
// (로컬 curl/axios는 성공하고 GCF 배포본만 실패하는 증상이 정확히 이것)
// fetch로는 sec-fetch-mode를 지울 수 없어(forbidden header) User-Agent만 붙여선
// 해결되지 않는다. 그래서 node:https로 헤더를 100% 우리가 통제해서 보낸다.
//
// 제공자로 나가는 요청은 전부 이 모듈을 거쳐야 한다. fetch로 직접 부르면 같은 증상이 재발한다.
// (네이버로도 같은 헤더가 나가므로 동일한 잠재 결함이 있어 함께 이 경로를 쓴다.)

var https = require("node:https");

var UA = "nulloongzi-do-functions/1.0";
var TIMEOUT_MS = 10000; // 소켓이 물리면 함수 타임아웃(60s)까지 끌지 않도록

// 저수준 요청. { status, body(문자열) } 로 resolve. 상태코드가 4xx/5xx여도 reject하지 않는다
// (카카오는 에러 본문에 error_code를 담아 보내므로 호출부가 읽어야 한다).
function requestRaw(options, payload) {
    return new Promise(function (resolve, reject) {
        options.timeout = TIMEOUT_MS;
        var req = https.request(options, function (res) {
            var chunks = [];
            res.on("data", function (c) { chunks.push(c); });
            res.on("end", function () {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString("utf8")
                });
            });
        });
        req.on("timeout", function () { req.destroy(new Error("카카오 응답 시간 초과")); });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// application/x-www-form-urlencoded POST. accessToken을 주면 Bearer 헤더를 붙인다.
function postForm(host, path, form, accessToken) {
    var payload = Buffer.from(form, "utf8");
    var headers = {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "Content-Length": payload.length,
        "Accept": "application/json",
        "User-Agent": UA
    };
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    return requestRaw({ host: host, path: path, method: "POST", headers: headers }, payload);
}

// 토큰 없는 GET (네이버 code 교환처럼 쿼리스트링으로 보내는 엔드포인트)
function getJson(host, path) {
    return requestRaw({
        host: host,
        path: path,
        method: "GET",
        headers: { "Accept": "application/json", "User-Agent": UA }
    });
}

// Bearer 토큰 GET (kapi 사용자 API, 네이버 /nid/me)
function getWithToken(host, path, accessToken) {
    return requestRaw({
        host: host,
        path: path,
        method: "GET",
        headers: {
            Authorization: "Bearer " + accessToken,
            "Accept": "application/json",
            "User-Agent": UA
        }
    });
}

// 카카오가 엣지 단에서 막으면 JSON이 아니라 HTML을 줄 수도 있다. 절대 throw하지 않는다.
function parseJson(text) {
    try {
        var parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

// 시크릿 값에 붙은 개행/공백 제거.
// `firebase functions:secrets:set` 을 파이프/붙여넣기로 넣으면 끝에 \n 이 남고,
// 그대로 client_id에 실리면 카카오가 요청을 통째로 거부한다.
function secretValue(param) {
    try {
        var v = param && param.value();
        return typeof v === "string" ? v.trim() : "";
    } catch (e) {
        return "";
    }
}

module.exports = {
    postForm: postForm,
    getJson: getJson,
    getWithToken: getWithToken,
    parseJson: parseJson,
    secretValue: secretValue,
    KAUTH_HOST: "kauth.kakao.com",
    KAPI_HOST: "kapi.kakao.com",
    NAVER_AUTH_HOST: "nid.naver.com",
    NAVER_API_HOST: "openapi.naver.com"
};
