var { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
var { onDocumentCreated } = require("firebase-functions/v2/firestore");
var { defineSecret } = require("firebase-functions/params");
var admin = require("firebase-admin");
var pure = require("./lib/pure");
// 카카오 호출은 전역 fetch 금지 — 이유는 lib/provider-http.js 상단 주석 참고(406/KOE001).
var providerHttp = require("./lib/provider-http");

admin.initializeApp();
var db = admin.firestore();

var KAKAO_TOKEN = defineSecret("KAKAO_ACCESS_TOKEN");
var KAKAO_REFRESH_TOKEN = defineSecret("KAKAO_REFRESH_TOKEN");
var KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
var KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");
var APP_SECRET = defineSecret("WEBHOOK_SECRET");
// 네이버 클라우드 플랫폼 Maps(지오코딩). 콘솔에서 해당 앱에 'Geocoding' 활성화 필요.
//   firebase functions:secrets:set NAVER_MAP_CLIENT_ID
//   firebase functions:secrets:set NAVER_MAP_CLIENT_SECRET
var NAVER_MAP_CLIENT_ID = defineSecret("NAVER_MAP_CLIENT_ID");
var NAVER_MAP_CLIENT_SECRET = defineSecret("NAVER_MAP_CLIENT_SECRET");

// ══════════════════════════════════════════════════════════
// 챗봇 스킬 공통 옵션. 모든 스킬 엔드포인트가 같은 시크릿을 읽어야 한다.
// cpu·memory 를 올린 이유는 요금이 아니라 **5초**다.
//
// 카카오 스킬 타임아웃은 5초인데, 운영자가 며칠에 한 번 쓰는 스킬이라 인스턴스가
// 늘 0으로 내려가 있고 매번 콜드로 뜬다. 게다가 스킬 17개가 각각 별개의 Cloud
// Run 서비스라 '팀관리' 로 하나를 덥혀도 이어 누르는 '승인' 은 또 콜드다.
// 실측(2026-09-16): 아무 일도 안 하는 chatbotHelp 조차 콜드 2.5초 / 웜 0.005초,
// chatbotTeamList 는 5.16초를 찍어 실제로 카카오가 먼저 끊었다.
//
// 콜드 시간의 대부분은 컨테이너 기동 + firebase-admin 로드라 CPU 를 탄다.
// 256MiB/1vCPU 는 그걸 감당하기엔 얇다.
//
// 상시 인스턴스(minInstances)와 달리 이건 **호출이 도는 동안만** 과금된다.
// 하루 몇 번 부르는 스킬이라 단가가 올라도 총액은 그대로 0 에 가깝다.
// 같은 이유로 minInstances 는 넣지 않았다 — 그쪽은 17개 서비스가 24시간 켜진다.
var CHATBOT_OPTS = { cors: true, invoker: "public", memory: "512MiB", cpu: 2 };

// 이 요청이 정말 카카오에서 온 것인가. 누가 보냈는지(권한)와는 별개 층이다.
//   ① skillCallAllowed  — 채널이 맞나         (주소를 아는 아무나 차단)
//   ② isAllowedKakaoUser — 이 사람이 운영자인가 (관리자 전용 발화만)
// 공개 발화는 ①만 지나고 ②는 타지 않는다.
// 스킬 키는 Secret Manager 가 아니라 system/chatbot_skill_key 에 둔다.
// defineSecret 을 쓰면 (1) 시크릿이 없으면 배포 자체가 거부되고
// (2) 값을 바꿀 때마다 재배포해야 한다. 카카오 토큰 회전 때 같은 이유로
// system 문서를 택했던 것과 같은 판단이다. 이 컬렉션은 규칙상 read·write 모두
// false 라 Functions 말고는 아무도 못 본다.
var skillKeyCache = { keys: null, enforce: true, at: 0 };
var SKILL_KEY_TTL_MS = 60 * 1000;

async function currentSkillConfig() {
    // 값이 있을 때만 캐시한다. 미설정 상태를 캐시하면 방금 넣은 키가 1분 동안
    // 안 먹어서 "설정했는데 왜 안 되지"가 된다.
    if (skillKeyCache.keys && Date.now() - skillKeyCache.at < SKILL_KEY_TTL_MS) {
        return skillKeyCache;
    }
    try {
        var snap = await db.collection("system").doc("chatbot_skill_key").get();
        var d = (snap.exists && snap.data()) || {};
        var keys = Array.isArray(d.keys) ? d.keys : [];
        var enforce = d.mode !== "audit";
        if (keys.length) skillKeyCache = { keys: keys, enforce: enforce, at: Date.now() };
        return { keys: keys, enforce: enforce, at: Date.now() };
    } catch (e) {
        console.error("스킬 키 조회 실패:", e && e.message);
        // 조회가 죽었을 때 문을 닫으면 Firestore 잠깐 흔들릴 때 챗봇이 통째로
        // 멈춘다. 열어두되, 관리 발화는 바로 뒤 isAllowedKakaoUser 가 같은
        // Firestore 를 읽고 **실패 시 거부**하므로 실제로 열리는 건 공개 발화뿐이다.
        return skillKeyCache.keys ? skillKeyCache : { keys: [], enforce: true, at: 0 };
    }
}

async function skillCallAllowed(req) {
    var conf = await currentSkillConfig();
    // req.get 은 Express 가 주지만, 없다고 여기서 터지면 챗봇이 통째로 멈춘다.
    var header = "";
    try {
        header = (typeof req.get === "function" && req.get("X-Nurungji-Skill-Key"))
            || (req.headers && (req.headers["x-nurungji-skill-key"] || req.headers["X-Nurungji-Skill-Key"]))
            || "";
    } catch (e) { header = ""; }
    var provided = header || (req.query && req.query.k) || "";

    var verdict = pure.skillKeyMatches(provided, conf.keys);
    if (!verdict.configured) {
        console.warn("⚠️ 스킬 키 미설정 — 호출을 검증 없이 통과시키는 중 "
            + "(adminSetChatbotSkillKey 로 설정하세요)");
        return true;
    }
    if (verdict.ok) return true;

    // 어느 스킬이 헤더를 안 달고 왔는지 이름으로 남긴다. 콘솔 스킬이 17개라
    // 하나 빠뜨리기 쉽고, 이름이 없으면 로그를 봐도 어딜 고쳐야 할지 모른다.
    var who = process.env.K_SERVICE || "(함수명 불명)";
    if (!conf.enforce) {
        // audit: 막지 않고 기록만. 대기 건이 0이라 실제로 눌러볼 수 없는 스킬이
        // 많아서, 켜자마자 막으면 '쓰려는 순간에야' 죽은 걸 알게 된다.
        console.warn("📋 [audit] 스킬 키 없음/불일치 — 통과시킴: " + who);
        return true;
    }
    console.warn("⛔ 스킬 키 불일치 — 카카오 밖에서 온 호출로 본다: " + who);
    return false;
}

// 카카오가 아닌 곳에서 온 호출이다. 챗봇 말풍선이 아니라 평범한 401 로 끊는다 —
// "권한이 없습니다" 카드를 돌려줘 엔드포인트가 살아 있음을 알릴 이유가 없다.
function rejectSkillCall(res) {
    res.status(401).json({ error: "unauthorized" });
}

// 챗봇 관리자 인증: /admin_kakao_ids/{kakao_user_id} 문서 존재 여부
// ══════════════════════════════════════════════════════════
async function isAllowedKakaoUser(req) {
    var user = req.body && req.body.userRequest && req.body.userRequest.user;
    var userId = user && user.id;
    if (!userId) {
        console.warn("챗봇 권한 체크 실패: user.id 누락");
        return { allowed: false, userId: null };
    }
    try {
        var snap = await db.collection("admin_kakao_ids").doc(userId).get();
        if (!snap.exists) {
            console.warn("⛔ 비관리자 챗봇 접근 시도 - kakao user.id:", userId);
            return { allowed: false, userId: userId };
        }
        return { allowed: true, userId: userId };
    } catch (e) {
        console.error("admin_kakao_ids 조회 오류:", e && e.message);
        return { allowed: false, userId: userId };
    }
}

// 순수 로직(토큰/파싱/템플릿)은 functions/lib/pure.js — 루트 node --test로 검증됨.
var unauthorizedResponse = pure.unauthorizedResponse;
var generateToken = pure.generateToken;

// 카카오 refresh token 회전분을 Firestore에 보관한다.
//
// 카카오는 refresh token 유효기간이 60일이고, 갱신 응답에 새 refresh_token을
// 실어주는 건 "남은 유효기간이 1개월 미만"일 때뿐이다. 예전 코드는 그 새 토큰을
// 로그로만 남기고 버려서, 60일마다 사람이 손으로 secret을 갈아끼우지 않으면
// 알림이 통째로 끊겼다(2026-09-08 KOE322 장애).
//
// 그렇다고 함수가 Secret Manager에 새 버전을 써도 소용이 없다 — 배포된 함수는
// 배포 시점의 시크릿 버전에 고정되므로 재배포 전까지 새 버전을 읽지 못한다.
// (같은 장애에서 secret만 갈고 재배포를 건너뛰었다가 그대로 실패했다.)
// 그래서 회전된 토큰은 admin SDK만 접근 가능한 system/kakao_token에 둔다
// (firestore.rules: system/{docId} 는 read, write 모두 false).
//
// 시크릿은 "seed" 역할만 한다. 운영자가 secret을 새 값으로 교체하면
// 지문(fp)이 달라지므로 저장분을 버리고 새 seed를 쓴다 — 수동 복구가 항상 이긴다.
// 그 선택 규칙 자체는 pure.chooseRefreshToken 에 있다(tests/functions-pure.test.js).
async function requestKakaoToken(refreshToken, restApiKey, clientSecret) {
    var body = "grant_type=refresh_token" +
        "&client_id=" + encodeURIComponent(restApiKey) +
        "&refresh_token=" + encodeURIComponent(refreshToken);
    if (clientSecret) {
        body += "&client_secret=" + encodeURIComponent(clientSecret);
    }
    var res = await providerHttp.postForm(providerHttp.KAUTH_HOST, "/oauth/token", body);
    return { status: res.status, raw: res.body, json: providerHttp.parseJson(res.body) };
}

// 카카오 액세스 토큰 획득 (Firestore 캐시 + refresh token 자동 갱신/회전 저장)
// 만료 1분 전에 미리 갱신한다.
async function getKakaoAccessToken() {
    var tokenRef = db.collection("system").doc("kakao_token");
    var tokenSnap = await tokenRef.get();
    var now = Date.now();
    var cached = tokenSnap.exists ? (tokenSnap.data() || {}) : {};

    if (cached.access_token && cached.expires_at && cached.expires_at > now + 60000) {
        return cached.access_token;
    }

    var seedRefresh = providerHttp.secretValue(KAKAO_REFRESH_TOKEN);
    var restApiKey = providerHttp.secretValue(KAKAO_REST_API_KEY);
    var clientSecret = providerHttp.secretValue(KAKAO_CLIENT_SECRET);
    if (!seedRefresh || !restApiKey) {
        console.warn("KAKAO_REFRESH_TOKEN 또는 KAKAO_REST_API_KEY 미설정 - seed access token 사용");
        return providerHttp.secretValue(KAKAO_TOKEN);
    }

    var choice = pure.chooseRefreshToken(cached, seedRefresh);
    var seedFp = choice.seedFp;
    var usingStored = choice.usingStored;

    var attempt = await requestKakaoToken(choice.token, restApiKey, clientSecret);

    // 저장분이 죽었으면 seed로 한 번 더 — 저장분 손상이 secret 복구를 막아선 안 된다.
    if (!attempt.json.access_token && usingStored) {
        console.warn("저장된 refresh token 갱신 실패 - secret seed로 재시도:", attempt.status);
        usingStored = false;
        attempt = await requestKakaoToken(seedRefresh, restApiKey, clientSecret);
    }

    var result = attempt.json;

    if (!result.access_token) {
        // 실패 사유를 한 곳에 남긴다. 로그만 보면 아무도 안 본다.
        try {
            await tokenRef.set({
                last_refresh_error: String(attempt.status) + " " + String(attempt.raw || "").slice(0, 300),
                last_refresh_error_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.error("토큰 갱신 실패 기록 실패:", e && e.message);
        }
        console.error("카카오 토큰 갱신 실패:", attempt.status, attempt.raw);
        throw new Error("카카오 토큰 갱신 실패: " + attempt.status + " " + attempt.raw);
    }

    var expiresAt = now + (result.expires_in * 1000);
    var update = {
        access_token: result.access_token,
        expires_at: expiresAt,
        refreshed_at: admin.firestore.FieldValue.serverTimestamp(),
        last_refresh_error: admin.firestore.FieldValue.delete(),
        last_refresh_error_at: admin.firestore.FieldValue.delete()
    };

    // 회전된 refresh token은 값 자체를 로그에 찍지 않는다 — Cloud Logging은 장기 보관된다.
    if (result.refresh_token) {
        update.refresh_token = result.refresh_token;
        update.refresh_token_seed_fp = seedFp;
        update.refresh_token_rotated_at = admin.firestore.FieldValue.serverTimestamp();
        console.log("카카오 refresh token 회전 - Firestore에 저장함(secret 교체 불필요)");
    }

    await tokenRef.set(update, { merge: true });
    return result.access_token;
}

// 알림 실패를 문서에 남긴다. 조용히 실패하면 운영자는 신고가 들어온 사실조차 모른다.
// admin SDK 라 firestore.rules 의 필드 화이트리스트/update 금지를 우회한다.
async function markNotifyResult(ref, ok, message) {
    try {
        if (ok) {
            await ref.set({
                notify_failed: false,
                notify_error: admin.firestore.FieldValue.delete(),
                notify_failed_at: admin.firestore.FieldValue.delete(),
                notified_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else {
            await ref.set({
                notify_failed: true,
                notify_error: String(message || "").slice(0, 300),
                notify_failed_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.error("알림 상태 기록 실패:", e && e.message);
    }
}

// ── 트리거 1: 인증 신청 생성 시 카카오톡 알림 ──
// 기존 verificationNotify(공개 HTTP POST)는 무인증 호출로 임의 알림
// 스팸/Functions 비용 폭격이 가능했음. Firestore onDocumentCreated으로
// 교체하여 인증·존재검증·중복방지를 rule + trigger로 자동 보장.
// Firestore rule에서 verification_requests create는 status='pending'이고
// requested_by==auth.uid인 경우만 허용되므로 신뢰 가능한 입력만 도착.
exports.onVerificationCreated = onDocumentCreated(
    {
        document: "verification_requests/{requestId}",
        secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET]
    },
    async function (event) {
        var snap = event.data;
        if (!snap) {
            console.warn("onVerificationCreated: snapshot 없음");
            return;
        }
        var data = snap.data() || {};
        if (data.status !== "pending") {
            console.log("onVerificationCreated: status가 pending이 아님 - 알림 생략", data.status);
            return;
        }
        if (!data.club_name) {
            console.warn("onVerificationCreated: club_name 누락 - 알림 생략");
            return;
        }

        var kakaoToken = null;
        try {
            kakaoToken = await getKakaoAccessToken();
        } catch (tokenErr) {
            console.error("카카오 토큰 획득 실패:", tokenErr);
            await markNotifyResult(snap.ref, false, "토큰 획득 실패: " + (tokenErr && tokenErr.message));
            return;
        }
        if (!kakaoToken) {
            console.warn("KAKAO_ACCESS_TOKEN 미설정 - 카카오톡 알림 생략");
            await markNotifyResult(snap.ref, false, "KAKAO_ACCESS_TOKEN 미설정");
            return;
        }

        try {
            var templateObject = {
                object_type: "text",
                text: "[인증 신청] " + data.club_name + "\n\n새로운 팀 인증 신청이 도착했습니다.\n\n카카오톡 챗봇에서 '인증관리'를 입력하여 사진 확인 및 승인/거절을 진행해주세요.",
                link: pure.kakaoLink("club", data.club_id)
            };
            var body = "template_object=" + encodeURIComponent(JSON.stringify(templateObject));
            var kakaoRes = await providerHttp.postForm(
                providerHttp.KAPI_HOST, "/v2/api/talk/memo/default/send", body, kakaoToken);
            console.log("카카오톡 메시지 전송 결과:", kakaoRes.status, kakaoRes.body);
            await markNotifyResult(snap.ref, providerHttp.isOk(kakaoRes.status),
                "전송 응답 " + kakaoRes.status + " " + String(kakaoRes.body || ""));
        } catch (kakaoErr) {
            console.error("카카오톡 메시지 전송 실패:", kakaoErr);
            await markNotifyResult(snap.ref, false, "전송 예외: " + (kakaoErr && kakaoErr.message));
        }
    }
);

// ── 엔드포인트 2: 승인/거절 처리 (관리자가 링크 클릭) ──
exports.verificationAction = onRequest({ invoker: "public", secrets: [APP_SECRET] }, async function (req, res) {
    var requestId = req.query.id;
    var action = req.query.action;
    var token = req.query.token;

    if (!requestId || !action || !token) {
        res.status(400).send("잘못된 요청입니다.");
        return;
    }

    var secret = APP_SECRET.value();
    var expectedToken = generateToken(secret, requestId, action);
    if (token !== expectedToken) {
        res.status(403).send("유효하지 않은 토큰입니다.");
        return;
    }

    if (action !== "approve" && action !== "reject") {
        res.status(400).send("잘못된 액션입니다.");
        return;
    }

    try {
        var requestRef = db.collection("verification_requests").doc(requestId);
        var requestSnap = await requestRef.get();

        if (!requestSnap.exists) {
            res.status(404).send(renderResultPage("오류", "해당 인증 요청을 찾을 수 없습니다."));
            return;
        }

        var requestData = requestSnap.data();

        if (requestData.status !== "pending") {
            res.send(renderResultPage("이미 처리됨", "이 인증 요청은 이미 " + requestData.status + " 처리되었습니다."));
            return;
        }

        if (action === "approve") {
            var verified = await markClubVerified(requestData.club_id);
            if (!verified.ok) {
                if (verified.reason === "club_missing") {
                    await requestRef.update({
                        status: "rejected",
                        reject_reason: "club_missing",
                        reviewed_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                    res.send(renderResultPage(
                        "없어진 팀",
                        (requestData.club_name || "") + " 팀이 이미 삭제되어 요청을 거절 처리했습니다."
                    ));
                    return;
                }
                res.status(500).send(renderResultPage("오류", "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
                return;
            }
            await requestRef.update({
                status: "approved",
                reviewed_at: admin.firestore.FieldValue.serverTimestamp()
            });
            await grantClubAdmin(requestData.club_id, requestData.requested_by);
            res.send(renderResultPage("승인 완료 ✅", requestData.club_name + " 팀의 인증이 승인되었습니다."));
        } else {
            await requestRef.update({
                status: "rejected",
                reviewed_at: admin.firestore.FieldValue.serverTimestamp()
            });
            res.send(renderResultPage("거절 완료", requestData.club_name + " 팀의 인증이 거절되었습니다."));
        }
    } catch (error) {
        console.error("인증 처리 오류:", error);
        res.status(500).send(renderResultPage("오류", "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
    }
});

// 결과 페이지: pure.renderResultPage — 사용자 유래 문자열(club_name/status)을
// 이스케이프하여 삽입 (기존엔 미이스케이프 → 관리자 브라우저 XSS 가능성).
var renderResultPage = pure.renderResultPage;

// ══════════════════════════════════════════════════════════
// 카카오 i 오픈빌더 챗봇 스킬 엔드포인트
// ══════════════════════════════════════════════════════════

// ── 스킬 1: 대기 중인 인증 요청 목록 ──
exports.chatbotPending = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var pendingSnap = await db.collection("verification_requests")
            .where("status", "==", "pending")
            .orderBy("requested_at", "desc")
            .limit(10)
            .get();

        if (pendingSnap.empty) {
            res.json({
                version: "2.0",
                template: {
                    outputs: [{ simpleText: { text: "대기 중인 인증 요청이 없습니다. ✅" } }]
                }
            });
            return;
        }

        var items = [];
        pendingSnap.forEach(function (doc) {
            var d = doc.data();
            var dateStr = d.requested_at ? d.requested_at.toDate().toLocaleDateString("ko-KR") : "알 수 없음";
            items.push({
                title: d.club_name,
                description: "신청일: " + dateStr,
                // fixedRatio: 카카오 썸네일은 기본이 '잘라서 채우기'다. 단톡방 캡처처럼
                // 세로로 긴 사진은 위아래가 날아가 정작 봐야 할 부분이 안 보인다.
                // link: 썸네일을 눌러도 사진으로 가게 한다(전엔 이미지만 박혀 있었다).
                thumbnail: { imageUrl: d.photo_url, fixedRatio: true, link: { web: d.photo_url } },
                buttons: [
                    // 보고 나서 판단하는 순서라 원본 보기를 맨 앞에 둔다.
                    // basicCard 버튼은 최대 3개 — 여기가 상한이다.
                    { label: "🔍 사진 크게 보기", action: "webLink", webLinkUrl: d.photo_url },
                    { label: "✅ 승인", action: "block", blockId: "69dceb1b8b61cd58b1783efd", extra: { request_id: doc.id, club_name: d.club_name } },
                    { label: "❌ 거절", action: "block", blockId: "69dcebea3ef175f7be5c15e2", extra: { request_id: doc.id, club_name: d.club_name } }
                ]
            });
        });

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    carousel: {
                        type: "basicCard",
                        items: items
                    }
                }]
            }
        });
    } catch (error) {
        console.error("chatbotPending 오류:", error);
        res.json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." } }]
            }
        });
    }
});

// ── 스킬 2: 승인 처리 ──
exports.chatbotApprove = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // Button action="block"의 extra로 전달된 request_id를 우선 사용, 없으면 utterance 파싱 (폴백)
        var parsed = pure.extractRequestId(req.body);
        var requestId = parsed.requestId;
        console.log("chatbotApprove - requestId:", JSON.stringify(requestId), "source:", parsed.source);

        var requestRef = db.collection("verification_requests").doc(requestId);
        var requestSnap = await requestRef.get();
        console.log("chatbotApprove - exists:", requestSnap.exists);

        if (!requestSnap.exists) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "해당 인증 요청을 찾을 수 없습니다. (id: " + requestId + ")" } }] }
            });
            return;
        }

        var requestData = requestSnap.data();

        if (requestData.status !== "pending") {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "이미 " + requestData.status + " 처리된 요청입니다." } }] }
            });
            return;
        }

        // 팀부터 확인한다. 예전에는 요청을 approved 로 바꾼 **뒤에** 팀을 썼다 —
        // 팀이 없으면 요청만 승인된 채 남거나(이메일 경로) 유령 문서가 생겼다.
        var verified = await markClubVerified(requestData.club_id);
        if (!verified.ok) {
            if (verified.reason === "club_missing") {
                await requestRef.update({
                    status: "rejected",
                    reject_reason: "club_missing",
                    reviewed_at: admin.firestore.FieldValue.serverTimestamp()
                });
                res.json({
                    version: "2.0",
                    template: {
                        outputs: [{ simpleText: { text: "❌ " + (requestData.club_name || "") + " 팀이 이미 없어졌습니다.\n요청을 거절 처리했습니다." } }],
                        quickReplies: [{ label: "📋 인증 목록", action: "message", messageText: "인증관리" }]
                    }
                });
                return;
            }
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "승인 처리 중 오류가 발생했습니다." } }] }
            });
            return;
        }

        await requestRef.update({
            status: "approved",
            reviewed_at: admin.firestore.FieldValue.serverTimestamp()
        });
        // 인증을 신청한 사람이 곧 그 팀을 돌보는 사람이다. 배지만 주고 수정
        // 권한을 안 주면, 정작 정보를 고칠 사람이 없는 팀이 인증만 받는다.
        await grantClubAdmin(requestData.club_id, requestData.requested_by);

        res.json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "✅ " + requestData.club_name + " 팀 인증이 승인되었습니다!" } }],
                quickReplies: [
                    { label: "📋 인증 목록", action: "message", messageText: "인증관리" }
                ]
            }
        });
    } catch (error) {
        console.error("chatbotApprove 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "승인 처리 중 오류가 발생했습니다." } }] }
        });
    }
});

// ── 스킬 3: 거절 - 사유 선택 QuickReply 표시 ──
exports.chatbotRejectAsk = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // Button action="block"의 extra로 전달된 request_id를 우선 사용, 없으면 utterance 파싱 (폴백)
        var requestId = pure.extractRequestId(req.body).requestId;

        var requestSnap = await db.collection("verification_requests").doc(requestId).get();

        if (!requestSnap.exists) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "해당 인증 요청을 찾을 수 없습니다." } }] }
            });
            return;
        }

        var requestData = requestSnap.data();

        if (requestData.status !== "pending") {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "이미 " + requestData.status + " 처리된 요청입니다." } }] }
            });
            return;
        }

        // QuickReply로 preset 거절 사유 제공 (action=block으로 거절확정 블록 직접 호출)
        var REJECT_CONFIRM_BLOCK_ID = "69dcf06a192d2e03bfe549e2"; // 거절확정 블록 ID
        var reasons = ["사진 불분명", "관련 없는 사진", "내용 부족", "중복 신청", "기타 부적합"];
        var quickReplies = reasons.map(function (reason) {
            return {
                label: reason,
                action: "block",
                blockId: REJECT_CONFIRM_BLOCK_ID,
                extra: { request_id: requestId, club_name: requestData.club_name, reason: reason }
            };
        });

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "'" + requestData.club_name + "' 팀의 거절 사유를 선택해주세요."
                    }
                }],
                quickReplies: quickReplies
            }
        });
    } catch (error) {
        console.error("chatbotRejectAsk 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "오류가 발생했습니다." } }] }
        });
    }
});

// ── 스킬 4: 거절 확정 + 사유 저장 ──
exports.chatbotRejectConfirm = onRequest({ cors: true, invoker: "public", secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET] }, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // QuickReply extra 우선(reason 포함) → action.params → contexts 3중 폴백 (pure.extractRejectInfo)
        var info = pure.extractRejectInfo(req.body);
        var requestId = info.requestId;
        var clubName = info.clubName;
        var reason = info.reason;
        console.log("chatbotRejectConfirm - requestId:", requestId, "reason:", reason, "source:", info.source);

        if (!requestId) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "거절 처리할 요청 정보를 찾을 수 없습니다.\n'인증관리'를 입력하여 다시 시작해주세요." } }] }
            });
            return;
        }

        var requestRef = db.collection("verification_requests").doc(requestId);
        var requestSnap = await requestRef.get();

        if (!requestSnap.exists || requestSnap.data().status !== "pending") {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "해당 요청이 없거나 이미 처리되었습니다." } }] }
            });
            return;
        }

        // Firestore에 거절 사유 저장
        await requestRef.update({
            status: "rejected",
            reject_reason: reason,
            reviewed_at: admin.firestore.FieldValue.serverTimestamp()
        });

        // 카카오톡 알림 (나에게 보내기로 거절 사유 기록)
        var kakaoToken = null;
        try {
            kakaoToken = await getKakaoAccessToken();
        } catch (tokenErr) {
            console.error("카카오 토큰 획득 실패:", tokenErr);
        }
        if (kakaoToken) {
            try {
                var templateObject = {
                    object_type: "text",
                    text: "[인증 거절 완료]\n\n팀: " + clubName + "\n사유: " + reason,
                    link: pure.kakaoLink("club", requestSnap.data().club_id)
                };
                await providerHttp.postForm(providerHttp.KAPI_HOST, "/v2/api/talk/memo/default/send",
                    "template_object=" + encodeURIComponent(JSON.stringify(templateObject)),
                    kakaoToken);
            } catch (kakaoErr) {
                console.error("거절 알림 전송 실패:", kakaoErr);
            }
        }

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "❌ " + clubName + " 팀 인증이 거절되었습니다.\n\n사유: " + reason
                    }
                }],
                quickReplies: [
                    { label: "📋 인증 목록", action: "message", messageText: "인증관리" }
                ]
            }
        });
    } catch (error) {
        console.error("chatbotRejectConfirm 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "거절 처리 중 오류가 발생했습니다." } }] }
        });
    }
});

// ══════════════════════════════════════════════════════════
// 팀 관리 스킬 (Phase B1) - 관리자 전용: 목록 + 삭제
// ══════════════════════════════════════════════════════════

// 오픈빌더 블록 ID: 배포 후 실제 ID로 교체 필요
var TEAM_LIST_SIZE = 10;                                   // 카카오 carousel 상한은 10
var TEAM_LIST_BLOCK_ID = "69e62f64d2b391b64c603714";       // 팀관리 블록 (발화: 팀관리)
var TEAM_DELETE_ASK_BLOCK_ID = "69e62f884cb5cb85009b4b19";  // 팀삭제확인 블록 (action=block 전용)
var TEAM_DELETE_BLOCK_ID = "69e62fa62ba171220dde09da";     // 팀삭제완료 블록 (action=block 전용)


// ── 스킬 5: 팀 목록 (최신 10개) ──
exports.chatbotTeamList = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }

        // 권한 확인과 목록 조회를 **같이** 띄운다. 콜드 인스턴스에서 Firestore
        // 왕복은 한 번에 수백 ms 라, 순서대로 기다리면 그만큼 5초 타임아웃에
        // 가까워진다. 실제로 이 스킬은 늘 콜드이고(운영자가 며칠에 한 번 쓴다)
        // 3.0~4.3초를 찍어 왔다.
        //
        // 스킬 키를 이미 통과했으니 카카오에서 온 호출이다. 권한이 없으면 아래에서
        // 목록을 그대로 버린다 — 밖으로 나가지 않는다.
        //
        // 정렬은 Firestore 에 맡기고 10개만 받는다. 예전에는 62개를 통째로 받아
        // 메모리에서 정렬했는데, created_at 이 없는 문서는 0 으로 밀려 어차피
        // 상위 10개에 못 들었다(현재 그런 문서는 테스트 잔해 2개뿐이다).
        // 즉 보이는 목록은 그대로다.
        var authP = isAllowedKakaoUser(req);
        var snapP = db.collection("clubs")
            .orderBy("metadata.created_at", "desc")
            .limit(TEAM_LIST_SIZE)
            .get();

        var auth = await authP;
        if (!auth.allowed) {
            snapP.catch(function () {});   // 버릴 거라도 rejection 은 받아준다
            res.json(unauthorizedResponse());
            return;
        }

        var snap = await snapP;
        if (snap.empty) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "등록된 팀이 없습니다." } }] }
            });
            return;
        }

        var top = [];
        snap.forEach(function (doc) {
            var d = doc.data();
            d._id = doc.id;
            top.push(d);
        });

        var DEFAULT_THUMB = "https://do.nulloongzi.com/app_ui/nulloongzido%20logo_512px.png";
        var items = top.map(function (c) {
            var verifyText = c.is_verified ? "✅ 인증됨" : "⏳ 미인증";
            var ownerText = c.registered_by ? "" : " · 레거시";
            var desc = (c.address || "주소 없음") + "\n" + verifyText + ownerText;
            return {
                title: c.name || "이름 없음",
                description: desc,
                thumbnail: { imageUrl: DEFAULT_THUMB },
                buttons: [
                    {
                        label: "🗑 삭제",
                        action: "block",
                        blockId: TEAM_DELETE_ASK_BLOCK_ID,
                        extra: { club_id: c._id, club_name: c.name || "" }
                    }
                ]
            };
        });

        res.json({
            version: "2.0",
            template: {
                outputs: [{ carousel: { type: "basicCard", items: items } }]
            }
        });
    } catch (error) {
        console.error("chatbotTeamList 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "팀 목록 조회 중 오류가 발생했습니다." } }] }
        });
    }
});

// ── 스킬 6: 팀 삭제 확인 ──
exports.chatbotTeamDeleteAsk = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var clubId = clientExtra.club_id;
        var clubName = clientExtra.club_name || "이 팀";

        if (!clubId) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "삭제 대상 팀 정보가 없습니다. '팀관리'로 다시 시도해주세요." } }] }
            });
            return;
        }

        // 존재 재확인 (이미 삭제되었을 수 있음)
        var doc = await db.collection("clubs").doc(clubId).get();
        if (!doc.exists) {
            res.json({
                version: "2.0",
                template: {
                    outputs: [{ simpleText: { text: "해당 팀이 이미 삭제되었거나 존재하지 않습니다." } }],
                    quickReplies: [{ label: "📋 팀관리", action: "block", blockId: TEAM_LIST_BLOCK_ID }]
                }
            });
            return;
        }

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "'" + clubName + "' 팀을 삭제하시겠어요?\n\n⚠️ 관련 인증 요청도 함께 삭제됩니다.\n삭제 후 복구는 불가능합니다."
                    }
                }],
                quickReplies: [
                    { label: "✅ 확인 삭제", action: "block", blockId: TEAM_DELETE_BLOCK_ID, extra: { club_id: clubId, club_name: clubName } },
                    { label: "❌ 취소", action: "block", blockId: TEAM_LIST_BLOCK_ID }
                ]
            }
        });
    } catch (error) {
        console.error("chatbotTeamDeleteAsk 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "삭제 확인 중 오류가 발생했습니다." } }] }
        });
    }
});

// ── 스킬 7: 팀 삭제 + verification_requests cleanup ──
exports.chatbotTeamDelete = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var clubId = clientExtra.club_id;
        var clubName = clientExtra.club_name || "해당 팀";

        if (!clubId) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "삭제 대상 팀 정보가 없습니다." } }] }
            });
            return;
        }

        // 관련 verification_requests 조회
        var verifySnap = await db.collection("verification_requests")
            .where("club_id", "==", clubId)
            .get();

        // Batch: club 삭제 + 관련 인증 요청 일괄 삭제
        var batch = db.batch();
        batch.delete(db.collection("clubs").doc(clubId));
        verifySnap.forEach(function (d) { batch.delete(d.ref); });
        await batch.commit();

        console.log("팀 삭제 완료 - club_id:", clubId, "verification_requests cleaned:", verifySnap.size);

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "✅ " + clubName + " 팀이 삭제되었습니다.\n관련 인증 요청 " + verifySnap.size + "건도 함께 정리됐습니다."
                    }
                }],
                quickReplies: [{ label: "📋 팀관리", action: "block", blockId: TEAM_LIST_BLOCK_ID }]
            }
        });
    } catch (error) {
        console.error("chatbotTeamDelete 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "삭제 처리 중 오류가 발생했습니다." } }] }
        });
    }
});

// ══════════════════════════════════════════════════════════
// 잘못된 정보 신고 (guidelines.html 3-1)
//
// 인증 배지 심사와 같은 파이프를 그대로 탄다: Firestore 문서 생성 → 운영자 카톡
// 알림 → 챗봇에서 확인·처리. mailto와 달리 신고 이력이 데이터로 남아서 "정정 요청이
// 몇 건 들어왔고 며칠 만에 처리됐나"를 나중에 셀 수 있다.
//
// 신고자는 익명 인증(무로그인)일 수 있다 — 제3자는 신고하려고 로그인하지 않는다.
// 스팸 방어는 firestore.rules 의 reportFieldsValid()가 맡는다.
// ══════════════════════════════════════════════════════════

// 챗봇 블록 ID는 카카오 챗봇 콘솔에서 스킬을 만들 때 정해진다. 아직 안 만들었으면
// 빈 값 → 버튼 없이 텍스트 목록만 내려서 배포 즉시 동작한다(설정은 나중에 추가).
//
// defineString 이 아니라 process.env 로 읽는다. 선언된 파라미터는 값이 없으면
// 비대화형 배포(CI)에서 "have no value for ... REPORT_DONE_BLOCK_ID" 로 멈춘다 —
// 빈 기본값도 미설정으로 취급된다(KAKAO_APP_ID 는 .env 에 실제 값이 있어 통과했던 것).
// 이 값은 없어도 되는 선택 설정이라 배포를 막으면 안 된다.
// 나중에 functions/.env.nulloongzi-do 에 REPORT_DONE_BLOCK_ID=<블록ID> 를 넣으면
// 코드 변경 없이 버튼 모드로 바뀐다.
function reportDoneBlockId() {
    return (process.env.REPORT_DONE_BLOCK_ID || "").trim();
}

var REPORT_REASON_LABELS = {
    wrong_info: "정보가 틀림",
    closed: "운영 종료/해체",
    duplicate: "중복 등록",
    inappropriate: "부적절한 내용",
    other: "기타"
};

function reportReasonLabel(reason) {
    return REPORT_REASON_LABELS[reason] || reason || "사유 없음";
}

// 신고 접수 즉시 운영자에게 알린다. guidelines.html 이 약속한 "영업일 7일 이내 확인"은
// 알림이 실시간으로 도착해야 지킬 수 있는 값이다.
exports.onReportCreated = onDocumentCreated(
    {
        document: "reports/{reportId}",
        secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET]
    },
    async function (event) {
        var snap = event.data;
        if (!snap) {
            console.warn("onReportCreated: snapshot 없음");
            return;
        }
        var d = snap.data() || {};
        if (d.status !== "open") {
            console.log("onReportCreated: status가 open이 아님 - 알림 생략", d.status);
            return;
        }

        var kakaoToken = null;
        try {
            kakaoToken = await getKakaoAccessToken();
        } catch (tokenErr) {
            // 알림이 실패해도 신고 문서는 남는다 — 챗봇 '신고관리'로 따라잡을 수 있다.
            // 다만 실패했다는 사실을 문서에 남겨야 '신고관리'에서 눈에 띈다.
            console.error("카카오 토큰 획득 실패(신고 알림):", tokenErr);
            await markNotifyResult(snap.ref, false, "토큰 획득 실패: " + (tokenErr && tokenErr.message));
            return;
        }
        if (!kakaoToken) {
            console.warn("KAKAO_ACCESS_TOKEN 미설정 - 신고 알림 생략");
            await markNotifyResult(snap.ref, false, "KAKAO_ACCESS_TOKEN 미설정");
            return;
        }

        var kindLabel = pure.reportKindLabel(d.kind);
        var lines = [
            "[신고 접수] " + kindLabel + " · " + (d.target_name || d.target_id || ""),
            "",
            "사유: " + reportReasonLabel(d.reason)
        ];
        if (d.detail) lines.push("내용: " + String(d.detail).slice(0, 200));
        lines.push("", "카카오톡 챗봇에서 '신고관리'를 입력해 확인·처리해주세요.");

        try {
            var templateObject = {
                object_type: "text",
                text: lines.join("\n"),
                link: pure.kakaoLink(d.kind, d.target_id)
            };
            var body = "template_object=" + encodeURIComponent(JSON.stringify(templateObject));
            var kakaoRes = await providerHttp.postForm(
                providerHttp.KAPI_HOST, "/v2/api/talk/memo/default/send", body, kakaoToken);
            console.log("신고 알림 전송 결과:", kakaoRes.status, kakaoRes.body);
            await markNotifyResult(snap.ref, providerHttp.isOk(kakaoRes.status),
                "전송 응답 " + kakaoRes.status + " " + String(kakaoRes.body || ""));
        } catch (kakaoErr) {
            console.error("신고 알림 전송 실패:", kakaoErr);
            await markNotifyResult(snap.ref, false, "전송 예외: " + (kakaoErr && kakaoErr.message));
        }
    }
);

// ── 스킬 8: 미처리 신고 목록 (발화: 신고관리) ──
exports.chatbotReports = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // orderBy + where 조합은 복합 인덱스를 요구하므로 status만 걸고 메모리에서 정렬한다.
        // (신고는 미처리분만 보므로 건수가 작다)
        var snap = await db.collection("reports").where("status", "==", "open").limit(30).get();

        if (snap.empty) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "미처리 신고가 없습니다. ✅" } }] }
            });
            return;
        }

        var items = [];
        snap.forEach(function (doc) {
            var d = doc.data();
            d._id = doc.id;
            d._ms = d.created_at && d.created_at.toMillis ? d.created_at.toMillis() : 0;
            items.push(d);
        });
        items.sort(function (a, b) { return b._ms - a._ms; });
        var top = items.slice(0, 10);

        // 알림이 안 나간 신고는 "운영자가 카톡을 못 받았다"는 뜻이다.
        // 목록에서 먼저 눈에 띄지 않으면 조용한 실패가 그대로 방치된다.
        var failedCount = items.filter(function (d) { return d.notify_failed === true; }).length;
        var failedNotice = failedCount
            ? "\n⚠️ 알림 미발송 " + failedCount + "건 — 카카오 토큰 상태를 확인해주세요.\n"
            : "";

        var doneBlockId = reportDoneBlockId();

        // 블록 ID가 아직 없으면 버튼 대신 텍스트로 — 콘솔 설정 전에도 목록은 보여야 한다.
        if (!doneBlockId) {
            var text = top.map(function (d, i) {
                var kindLabel = pure.reportKindLabel(d.kind);
                var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
                return (i + 1) + ". " + (d.notify_failed ? "⚠️ " : "") + "[" + kindLabel + "] " + (d.target_name || d.target_id)
                    + "\n   " + reportReasonLabel(d.reason) + " · " + dateStr
                    + (d.detail ? "\n   \"" + String(d.detail).slice(0, 60) + "\"" : "")
                    + "\n   id: " + d._id;
            }).join("\n\n");
            res.json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: "미처리 신고 " + snap.size + "건\n" + failedNotice + "\n" + text
                                + "\n\n※ '처리완료' 버튼을 쓰려면 챗봇 콘솔에서 신고처리 블록을 만들고"
                                + " REPORT_DONE_BLOCK_ID 파라미터에 넣어주세요."
                        }
                    }]
                }
            });
            return;
        }

        var DEFAULT_THUMB = "https://do.nulloongzi.com/app_ui/nulloongzido%20logo_512px.png";
        var cards = top.map(function (d) {
            var kindLabel = pure.reportKindLabel(d.kind);
            var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
            var desc = kindLabel + " · " + reportReasonLabel(d.reason) + "\n" + dateStr;
            if (d.detail) desc += "\n" + String(d.detail).slice(0, 60);
            if (d.notify_failed) desc += "\n⚠️ 알림 미발송";
            return {
                title: (d.notify_failed ? "⚠️ " : "") + (d.target_name || d.target_id || "대상 없음"),
                description: desc,
                thumbnail: { imageUrl: DEFAULT_THUMB },
                buttons: [{
                    label: "✅ 처리완료",
                    action: "block",
                    blockId: doneBlockId,
                    extra: { report_id: d._id, target_name: d.target_name || "" }
                }]
            };
        });

        var outputs = [];
        if (failedCount) {
            outputs.push({ simpleText: { text: "⚠️ 알림 미발송 " + failedCount + "건 — 카카오 토큰 상태를 확인해주세요." } });
        }
        outputs.push({ carousel: { type: "basicCard", items: cards } });

        res.json({ version: "2.0", template: { outputs: outputs } });
    } catch (error) {
        console.error("chatbotReports 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "신고 목록 조회 중 오류가 발생했습니다." } }] }
        });
    }
});

// ── 스킬 9: 신고 처리 완료 ──
// 신고 문서는 지우지 않고 status만 바꾼다 — 처리 이력이 남아야 "며칠 만에 확인했나"를
// 나중에 셀 수 있다(guidelines.html 3-2 의 7일 약속을 검증하는 유일한 근거).
exports.chatbotReportDone = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var params = (req.body.action && req.body.action.params) || {};
        // 버튼(clientExtra)이 없으면 발화 파라미터로도 받는다 — 블록 미설정 상태의 폴백.
        var reportId = clientExtra.report_id || params.report_id;

        if (!reportId) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "처리할 신고 id가 없습니다. '신고관리'로 다시 시도해주세요." } }] }
            });
            return;
        }

        var ref = db.collection("reports").doc(String(reportId));
        var doc = await ref.get();
        if (!doc.exists) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "해당 신고를 찾을 수 없습니다." } }] }
            });
            return;
        }
        var d = doc.data() || {};
        if (d.status !== "open") {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "이미 처리된 신고입니다." } }] }
            });
            return;
        }

        await ref.update({
            status: "resolved",
            resolved_at: admin.firestore.FieldValue.serverTimestamp(),
            resolved_by: auth.userId || "unknown"
        });

        console.log("신고 처리 완료 - report_id:", reportId);

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "✅ 처리 완료로 표시했습니다.\n대상: " + (d.target_name || d.target_id || "")
                    }
                }]
            }
        });
    } catch (error) {
        console.error("chatbotReportDone 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "신고 처리 중 오류가 발생했습니다." } }] }
        });
    }
});

// ══════════════════════════════════════════════════════════
// 관리자 전용: 팀 소유자 재할당 (이메일 → uid)
// users.email이 비공개 서브컬렉션으로 옮겨져 클라이언트에서 직접
// 이메일로 uid를 조회할 수 없으므로 Admin SDK를 통한 onCall로 제공.
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// 팀 소유권 클레임 — 구글시트 접수 메일 ↔ 가입자 매핑
//
// 초기 51개 팀은 구글시트로 접수했고(PHILOSOPHY.md), 그때 받은 담당자 메일이
// 있다. 같은 메일로 가입한 사람이 나타나면 그 팀의 소유자로 이어준다.
//
// 자동으로 바로 넘기지 않는다. 두 겹을 둔다:
//   1) 메일이 **검증된** 사람만 (Firebase 의 emailVerified). 이메일/비번 가입은
//      기본이 미검증이라, 이게 없으면 남의 팀 담당자 메일을 아는 사람이 그
//      주소로 가입해 팀을 가져갈 수 있다.
//   2) 그래도 자동 부여는 안 한다 — 운영자가 챗봇 '클레임관리'에서 승인한다.
//      시트의 메일이 낡았거나 담당자가 바뀌었을 수 있고, 한 번 넘어간 소유권은
//      되돌리기가 번거롭다.
// ══════════════════════════════════════════════════════════

var CLAIM_APPROVE_BLOCK_ID = (process.env.CLAIM_APPROVE_BLOCK_ID || "").trim();
var CLAIM_REJECT_BLOCK_ID = (process.env.CLAIM_REJECT_BLOCK_ID || "").trim();

// 운영자 전용: 시트의 (팀, 메일) 목록을 club_claims 에 넣는다.
// clubId 를 모르면 clubName 으로도 지정할 수 있다 — 시트엔 보통 팀 이름만 있다.
exports.adminSetClubClaimEmails = onCall(async function (request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    var adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");

    var rows = (request.data && request.data.rows) || [];
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new HttpsError("invalid-argument", "rows 배열이 필요합니다.");
    }
    if (rows.length > 500) throw new HttpsError("invalid-argument", "한 번에 500개까지.");

    var results = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var email = pure.normalizeEmail(row.email);
        if (!email) { results.push({ input: row.clubId || row.clubName, ok: false, reason: "bad_email" }); continue; }

        var clubId = row.clubId;
        if (!clubId && row.clubName) {
            var q = await db.collection("clubs").where("name", "==", String(row.clubName)).get();
            if (q.empty) { results.push({ input: row.clubName, ok: false, reason: "club_not_found" }); continue; }
            // 이름이 겹치면 사람이 골라야 한다 — 엉뚱한 팀에 메일을 붙이면
            // 그 팀이 통째로 남에게 넘어간다.
            if (q.size > 1) { results.push({ input: row.clubName, ok: false, reason: "ambiguous_name" }); continue; }
            clubId = q.docs[0].id;
        }
        if (!clubId) { results.push({ input: "(없음)", ok: false, reason: "no_club_ref" }); continue; }

        await db.collection("club_claims").doc(String(clubId)).set({
            email: email,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_by: request.auth.uid
        }, { merge: true });
        results.push({ input: clubId, ok: true, email: pure.maskEmail(email) });
    }
    return { ok: true, results: results };
});

// 로그인한 사용자가 부르는 진입점. 자기 메일로 등록된 팀이 있으면 요청을 만든다.
exports.claimMyClubs = onCall(
    { secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET] },
    async function (request) {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        var uid = request.auth.uid;

        // 메일은 클라이언트가 준 값을 절대 믿지 않는다 — Auth 레코드에서 읽는다.
        var user;
        try {
            user = await admin.auth().getUser(uid);
        } catch (e) {
            console.error("claimMyClubs getUser 실패:", e && e.message);
            throw new HttpsError("internal", "사용자 조회에 실패했습니다.");
        }
        var email = pure.normalizeEmail(user.email);
        if (!email) return { status: "no_email", matches: [] };
        // 카카오/네이버 커스텀 토큰 로그인은 메일 자체가 없어 여기서 걸린다.
        if (!user.emailVerified) return { status: "needs_verification", email: pure.maskEmail(email), matches: [] };

        var claimSnap = await db.collection("club_claims").where("email", "==", email).get();
        if (claimSnap.empty) return { status: "no_match", matches: [] };

        var created = [], skipped = [];
        for (var i = 0; i < claimSnap.docs.length; i++) {
            var clubId = claimSnap.docs[i].id;
            var clubDoc = await db.collection("clubs").doc(clubId).get();
            var club = clubDoc.exists ? clubDoc.data() : null;

            var blocked = pure.claimBlockReason(club);
            if (blocked) { skipped.push({ clubId: clubId, reason: blocked }); continue; }
            if (club.registered_by === uid) { skipped.push({ clubId: clubId, reason: "already_yours" }); continue; }

            // 같은 (팀, 사람) 요청이 이미 있으면 다시 만들지 않는다 —
            // 로그인할 때마다 부르는 함수라 안 막으면 운영자 목록이 도배된다.
            //
            // 조회로 막던 걸 문서 id 고정 + 트랜잭션으로 바꿨다. 조회는 읽고 쓰는
            // 사이가 비어 있어서, 같은 사람의 호출이 겹치면 둘 다 통과해 요청이
            // 두 개 생겼다. 트랜잭션은 같은 문서를 건드리는 호출을 직렬화한다.
            var reqId = pure.claimRequestId(clubId, uid);
            if (!reqId) { skipped.push({ clubId: clubId, reason: "bad_id" }); continue; }
            var reqRef = db.collection("club_claim_requests").doc(reqId);
            var clubName = (club && club.name) || "";
            var outcome = await db.runTransaction(async function (tx) {
                var cur = await tx.get(reqRef);
                var reuse = pure.claimReuseReason(cur.exists ? cur.data() : null);
                if (reuse) return reuse;
                tx.set(reqRef, {
                    club_id: clubId,
                    club_name: clubName,
                    uid: uid,
                    email_masked: pure.maskEmail(email),
                    status: "pending",
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
                return null;
            });
            if (outcome) { skipped.push({ clubId: clubId, reason: outcome }); continue; }

            created.push({ clubId: clubId, requestId: reqRef.id, clubName: clubName });
        }

        if (created.length) await notifyClaimRequests(created, pure.maskEmail(email));
        return {
            status: created.length ? "requested" : "no_actionable_match",
            matches: created, skipped: skipped
        };
    }
);

// ══════════════════════════════════════════════════════════
// 팀 관리자 권한
// ══════════════════════════════════════════════════════════
// 구글시트로 접수한 팀들은 등록자가 없어서 아무도 정보를 못 고친다. 그 팀의
// 운영자가 스스로 손을 들고, 운영자(사람)가 사진을 보고 승인하는 통로다.
//
// 인증 신청과 같은 모양을 쓴다 — 이미 있는 절차라 신청자도 운영자도 새로
// 배울 게 없다. 다만 **증명하려는 것이 다르다**: 인증 사진은 "이 팀이 실제로
// 활동한다"를, 관리자 신청 사진은 "내가 이 팀 사람이다"를 보여야 한다.
// 공개된 인스타 사진은 앞의 것만 증명하므로 뒤의 용도로는 못 쓴다.
var ADMIN_APPROVE_BLOCK_ID = (process.env.ADMIN_APPROVE_BLOCK_ID || "").trim();
var ADMIN_REJECT_BLOCK_ID = (process.env.ADMIN_REJECT_BLOCK_ID || "").trim();

// 팀 문서를 다시 읽어 정원을 확인하고 명단에 넣는다.
// 읽고-쓰는 사이에 다른 승인이 끼어들면 정원이 넘을 수 있어 트랜잭션으로 묶는다.
// 인증 승인은 팀 문서가 **있을 때만** 배지를 단다.
//
// 예전 챗봇 경로는 set({ is_verified: true }, { merge: true }) 를 썼다. merge 는
// 문서가 없으면 만든다 — 그래서 삭제된 팀의 인증 요청을 승인하면 is_verified
// 하나만 든 유령 문서가 생겼다. 이름도 좌표도 없으니 지도에 안 뜨고, 목록에만
// 남아 운영자가 "이게 뭐지"를 반복하게 된다. 실제로 clubs 62건 중 2건이
// 그렇게 생긴 것이었다(wp4qeje5fac 는 테스트 인증 승인 1초 뒤에 만들어졌다).
//
// 읽고 쓰는 사이에 팀이 지워질 수 있으므로 트랜잭션 안에서 본다.
// grantClubAdmin 이 이미 같은 모양이다.
async function markClubVerified(clubId) {
    if (!clubId) return { ok: false, reason: "club_missing" };
    var ref = db.collection("clubs").doc(String(clubId));
    try {
        return await db.runTransaction(async function (tx) {
            var snap = await tx.get(ref);
            if (!snap.exists) return { ok: false, reason: "club_missing" };
            tx.update(ref, { is_verified: true });
            return { ok: true, reason: null };
        });
    } catch (e) {
        console.error("markClubVerified 실패 - club:", clubId, e && e.message);
        return { ok: false, reason: "error" };
    }
}

async function grantClubAdmin(clubId, uid) {
    if (!clubId || !uid) return { added: false, reason: "no_uid" };
    var clubRef = db.collection("clubs").doc(String(clubId));
    try {
        return await db.runTransaction(async function (tx) {
            var snap = await tx.get(clubRef);
            if (!snap.exists) return { added: false, reason: "not_found" };
            var result = pure.addClubAdmin(snap.data(), uid);
            if (!result.added) return { added: false, reason: result.reason };
            tx.update(clubRef, { admins: result.admins });
            return { added: true, reason: null, admins: result.admins };
        });
    } catch (e) {
        console.error("grantClubAdmin 실패 - club:", clubId, e && e.message);
        return { added: false, reason: "error" };
    }
}

// 관리자 신청 접수 → 운영자에게 알린다.
exports.onClubAdminRequestCreated = onDocumentCreated(
    {
        document: "club_admin_requests/{requestId}",
        secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET]
    },
    async function (event) {
        var snap = event.data;
        if (!snap) return;
        var d = snap.data() || {};
        if (d.status !== "pending") return;

        var kakaoToken = null;
        try {
            kakaoToken = await getKakaoAccessToken();
        } catch (e) {
            console.error("카카오 토큰 획득 실패(관리자 신청 알림):", e && e.message);
            await markNotifyResult(snap.ref, false, "토큰 획득 실패: " + (e && e.message));
            return;
        }
        if (!kakaoToken) {
            await markNotifyResult(snap.ref, false, "KAKAO_ACCESS_TOKEN 미설정");
            return;
        }

        var lines = [
            "[관리자 권한 신청] " + (d.club_name || d.club_id || ""),
            "",
            "카카오톡 챗봇에서 '관리자관리'를 입력해 사진을 확인하고 승인해주세요."
        ];
        try {
            var templateObject = {
                object_type: "text",
                text: lines.join("\n"),
                link: pure.kakaoLink("club", d.club_id)
            };
            var kakaoRes = await providerHttp.postForm(
                providerHttp.KAPI_HOST, "/v2/api/talk/memo/default/send",
                "template_object=" + encodeURIComponent(JSON.stringify(templateObject)), kakaoToken);
            await markNotifyResult(snap.ref, providerHttp.isOk(kakaoRes.status),
                "전송 응답 " + kakaoRes.status);
        } catch (e) {
            console.error("관리자 신청 알림 전송 실패:", e && e.message);
            await markNotifyResult(snap.ref, false, "전송 예외: " + (e && e.message));
        }
    }
);

// ── 스킬: 관리자 권한 신청 목록 (발화: 관리자관리) ──
exports.chatbotAdminRequests = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var snap = await db.collection("club_admin_requests")
            .where("status", "==", "pending").limit(30).get();

        if (snap.empty) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "대기 중인 관리자 권한 신청이 없습니다. ✅" } }] }
            });
            return;
        }

        var items = [];
        snap.forEach(function (doc) {
            var d = doc.data();
            d._id = doc.id;
            d._ms = d.requested_at && d.requested_at.toMillis ? d.requested_at.toMillis() : 0;
            items.push(d);
        });
        items.sort(function (a, b) { return b._ms - a._ms; });
        var top = items.slice(0, 10);

        // 블록 ID 가 아직 없으면 텍스트로 — 콘솔 설정 전에도 목록은 보여야 한다.
        // (신고·클레임과 같은 규칙. docs/chatbot-blocks.md 참고)
        if (!ADMIN_APPROVE_BLOCK_ID) {
            var text = top.map(function (d, i) {
                var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
                return (i + 1) + ". " + (d.club_name || d.club_id) + " · " + dateStr
                    + "\n   사진: " + (d.photo_url || "없음")
                    + "\n   id: " + d._id;
            }).join("\n\n");
            res.json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: "관리자 권한 신청 " + snap.size + "건\n\n" + text
                                + "\n\n※ 승인 버튼을 쓰려면 챗봇 콘솔에서 관리자승인/관리자거절 블록을 만들고"
                                + " ADMIN_APPROVE_BLOCK_ID · ADMIN_REJECT_BLOCK_ID 에 넣어주세요."
                        }
                    }]
                }
            });
            return;
        }

        var cards = top.map(function (d) {
            var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
            var buttons = [
                // 증빙을 보고 판단하는 순서라 원본 보기가 먼저다. basicCard 상한 3개.
                { label: "🔍 사진 크게 보기", action: "webLink", webLinkUrl: d.photo_url },
                {
                    label: "✅ 승인", action: "block", blockId: ADMIN_APPROVE_BLOCK_ID,
                    extra: { request_id: d._id, club_name: d.club_name || "" }
                }
            ];
            if (ADMIN_REJECT_BLOCK_ID) {
                buttons.push({
                    label: "❌ 거절", action: "block", blockId: ADMIN_REJECT_BLOCK_ID,
                    extra: { request_id: d._id, club_name: d.club_name || "" }
                });
            }
            return {
                title: d.club_name || d.club_id || "대상 없음",
                description: "신청일: " + dateStr,
                // 단톡방 캡처처럼 세로로 긴 사진이 잘리면 정작 볼 부분이 사라진다.
                thumbnail: { imageUrl: d.photo_url, fixedRatio: true, link: { web: d.photo_url } },
                buttons: buttons
            };
        });

        res.json({
            version: "2.0",
            template: { outputs: [{ carousel: { type: "basicCard", items: cards } }] }
        });
    } catch (error) {
        console.error("chatbotAdminRequests 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "관리자 신청 목록 조회 중 오류가 발생했습니다." } }] }
        });
    }
});

// 승인/거절 공통.
async function resolveAdminRequest(req, res, approve) {
    if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
    var auth = await isAllowedKakaoUser(req);
    if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

    var parsed = pure.extractRequestId(req.body);
    var requestId = parsed.requestId;
    function say(text) {
        res.json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: text } }],
                quickReplies: [{ label: "📋 관리자관리", action: "message", messageText: "관리자관리" }]
            }
        });
    }
    if (!requestId) { say("처리할 신청 id가 없습니다. '관리자관리'로 다시 시도해주세요."); return; }

    var ref = db.collection("club_admin_requests").doc(String(requestId));
    var doc = await ref.get();
    if (!doc.exists) { say("해당 신청을 찾을 수 없습니다."); return; }
    var d = doc.data() || {};
    if (d.status !== "pending") { say("이미 처리된 신청입니다."); return; }

    if (!approve) {
        await ref.update({
            status: "rejected",
            reviewed_at: admin.firestore.FieldValue.serverTimestamp()
        });
        say("❌ 거절했습니다.\n대상: " + (d.club_name || d.club_id || ""));
        return;
    }

    // 정원은 승인 시점에 다시 본다 — 신청이 접수된 뒤 3명이 찼을 수 있다.
    var granted = await grantClubAdmin(d.club_id, d.requested_by);
    if (!granted.added) {
        await ref.update({
            status: "rejected",
            reject_reason: granted.reason,
            reviewed_at: admin.firestore.FieldValue.serverTimestamp()
        });
        say(granted.reason === "full"
            ? "관리자가 이미 3명이라 승인하지 않았습니다.\n대상: " + (d.club_name || "")
            : granted.reason === "already_admin"
                ? "이미 이 팀의 관리자입니다.\n대상: " + (d.club_name || "")
                : "팀 문서를 찾을 수 없어 승인하지 않았습니다.");
        return;
    }

    await ref.update({
        status: "approved",
        reviewed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    say("✅ 승인했습니다.\n대상: " + (d.club_name || d.club_id || "")
        + "\n관리자 " + granted.admins.length + "/" + pure.MAX_CLUB_ADMINS + "명");
}

exports.chatbotAdminApprove = onRequest(CHATBOT_OPTS, async function (req, res) {
    try { await resolveAdminRequest(req, res, true); } catch (error) {
        console.error("chatbotAdminApprove 오류:", error);
        res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "승인 처리 중 오류가 발생했습니다." } }] } });
    }
});

exports.chatbotAdminReject = onRequest(CHATBOT_OPTS, async function (req, res) {
    try { await resolveAdminRequest(req, res, false); } catch (error) {
        console.error("chatbotAdminReject 오류:", error);
        res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "거절 처리 중 오류가 발생했습니다." } }] } });
    }
});

// 스스로 관리자에서 빠진다. 팀을 그만둔 사람이 수정 권한을 쥔 채 남지 않도록.
// 남을 빼는 건 못 한다 — 그건 운영자가 한다.
exports.leaveClubAdmin = onCall(async function (request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    var uid = request.auth.uid;
    var clubId = request.data && request.data.clubId;
    if (!clubId) throw new HttpsError("invalid-argument", "clubId 가 필요합니다.");

    var clubRef = db.collection("clubs").doc(String(clubId));
    return await db.runTransaction(async function (tx) {
        var snap = await tx.get(clubRef);
        if (!snap.exists) throw new HttpsError("not-found", "팀을 찾을 수 없습니다.");
        var result = pure.removeClubAdmin(snap.data(), uid);
        if (!result.removed) return { status: "not_admin", remaining: result.admins.length };
        tx.update(clubRef, { admins: result.admins });
        return { status: "left", remaining: result.admins.length };
    });
});

// 운영자에게 알린다. 실패해도 요청 문서는 남고 '클레임관리'로 따라잡을 수 있다.
async function notifyClaimRequests(created, emailMasked) {
    var kakaoToken = null;
    try {
        kakaoToken = await getKakaoAccessToken();
    } catch (e) {
        console.error("카카오 토큰 획득 실패(클레임 알림):", e && e.message);
        return;
    }
    if (!kakaoToken) return;
    var names = created.map(function (c) { return c.clubName || c.clubId; }).join(", ");
    var lines = [
        "[소유권 클레임] " + created.length + "건",
        "",
        "대상: " + names,
        "신청자 메일: " + emailMasked,
        "",
        "카카오톡 챗봇에서 '클레임관리'를 입력해 확인·승인해주세요."
    ];
    try {
        var templateObject = {
            object_type: "text",
            text: lines.join("\n"),
            // 여러 팀을 한 번에 신청했으면 아무거나 골라 보내면 오히려 헷갈린다.
            // 하나일 때만 그 팀으로, 아니면 첫 화면 그대로.
            link: pure.kakaoLink("club", created.length === 1 ? created[0].clubId : null)
        };
        await providerHttp.postForm(providerHttp.KAPI_HOST, "/v2/api/talk/memo/default/send",
            "template_object=" + encodeURIComponent(JSON.stringify(templateObject)), kakaoToken);
    } catch (e) {
        console.error("클레임 알림 전송 실패:", e && e.message);
    }
}

// ── 스킬 10: 대기 중인 소유권 클레임 (발화: 클레임관리) ──
exports.chatbotClaims = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var snap = await db.collection("club_claim_requests")
            .where("status", "==", "pending").limit(30).get();
        if (snap.empty) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "대기 중인 소유권 클레임이 없습니다. ✅" } }] }
            });
            return;
        }

        var items = [];
        snap.forEach(function (doc) {
            var d = doc.data(); d._id = doc.id;
            d._ms = d.created_at && d.created_at.toMillis ? d.created_at.toMillis() : 0;
            items.push(d);
        });
        items.sort(function (a, b) { return b._ms - a._ms; });
        var top = items.slice(0, 10);

        // 승인/거절 블록이 아직 없으면 목록만 — 콘솔 설정 전에도 확인은 돼야 한다.
        if (!CLAIM_APPROVE_BLOCK_ID) {
            var text = top.map(function (d, i) {
                var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
                return (i + 1) + ". " + (d.club_name || d.club_id)
                    + "\n   신청자: " + (d.email_masked || "") + " · " + dateStr
                    + "\n   id: " + d._id;
            }).join("\n\n");
            res.json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: "대기 중인 클레임 " + snap.size + "건\n\n" + text
                                + "\n\n※ 승인 버튼을 쓰려면 챗봇 콘솔에 클레임승인/클레임거절 블록을 만들고"
                                + " CLAIM_APPROVE_BLOCK_ID · CLAIM_REJECT_BLOCK_ID 에 넣어주세요."
                        }
                    }]
                }
            });
            return;
        }

        var DEFAULT_THUMB = "https://do.nulloongzi.com/app_ui/nulloongzido%20logo_512px.png";
        var cards = top.map(function (d) {
            var dateStr = d._ms ? new Date(d._ms).toLocaleDateString("ko-KR") : "날짜 없음";
            var buttons = [{
                label: "✅ 승인", action: "block", blockId: CLAIM_APPROVE_BLOCK_ID,
                extra: { claim_id: d._id, club_name: d.club_name || "" }
            }];
            if (CLAIM_REJECT_BLOCK_ID) {
                buttons.push({
                    label: "❌ 거절", action: "block", blockId: CLAIM_REJECT_BLOCK_ID,
                    extra: { claim_id: d._id, club_name: d.club_name || "" }
                });
            }
            return {
                title: d.club_name || d.club_id || "팀 없음",
                description: "신청자: " + (d.email_masked || "") + "\n" + dateStr,
                thumbnail: { imageUrl: DEFAULT_THUMB },
                buttons: buttons
            };
        });
        res.json({
            version: "2.0",
            template: { outputs: [{ carousel: { type: "basicCard", items: cards } }] }
        });
    } catch (error) {
        console.error("chatbotClaims 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "클레임 목록 조회 중 오류가 발생했습니다." } }] }
        });
    }
});

// 승인/거절 공통. 승인일 때만 clubs.registered_by 를 바꾼다.
async function resolveClaim(req, res, approve) {
    if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
    var auth = await isAllowedKakaoUser(req);
    if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

    var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
    var params = (req.body.action && req.body.action.params) || {};
    var claimId = clientExtra.claim_id || params.claim_id;
    function say(text) {
        res.json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: text } }],
                quickReplies: [{ label: "📋 클레임관리", action: "message", messageText: "클레임관리" }]
            }
        });
    }
    if (!claimId) { say("처리할 클레임 id가 없습니다. '클레임관리'로 다시 시도해주세요."); return; }

    var ref = db.collection("club_claim_requests").doc(String(claimId));
    var doc = await ref.get();
    if (!doc.exists) { say("해당 클레임을 찾을 수 없습니다."); return; }
    var d = doc.data() || {};
    if (d.status !== "pending") { say("이미 처리된 클레임입니다."); return; }

    if (!approve) {
        await ref.update({
            status: "rejected",
            resolved_at: admin.firestore.FieldValue.serverTimestamp(),
            resolved_by: auth.userId || "unknown"
        });
        say("❌ 거절했습니다.\n대상: " + (d.club_name || d.club_id || ""));
        return;
    }

    // 승인 시점에 소유 상태를 **다시** 본다. 요청이 접수된 뒤 누군가 그 팀을
    // 가져갔을 수 있고, 그걸 덮으면 소유권을 빼앗는 셈이 된다.
    var clubRef = db.collection("clubs").doc(String(d.club_id));
    var clubDoc = await clubRef.get();
    var blocked = pure.claimBlockReason(clubDoc.exists ? clubDoc.data() : null);
    if (blocked) {
        await ref.update({
            status: "rejected",
            reject_reason: blocked,
            resolved_at: admin.firestore.FieldValue.serverTimestamp(),
            resolved_by: auth.userId || "unknown"
        });
        say(blocked === "already_owned"
            ? "이미 다른 사람이 소유한 팀이라 승인하지 않았습니다.\n대상: " + (d.club_name || "")
            : "팀 문서를 찾을 수 없어 승인하지 않았습니다.");
        return;
    }

    await clubRef.set({ registered_by: d.uid }, { merge: true });
    await ref.update({
        status: "approved",
        resolved_at: admin.firestore.FieldValue.serverTimestamp(),
        resolved_by: auth.userId || "unknown"
    });
    console.log("클레임 승인 - club:", d.club_id, "uid:", d.uid);
    say("✅ 승인했습니다.\n대상: " + (d.club_name || d.club_id || "") + "\n이제 이 분이 팀 정보를 수정할 수 있습니다.");
}

// ── 스킬 11·12: 클레임 승인 / 거절 ──
exports.chatbotClaimApprove = onRequest(CHATBOT_OPTS, async function (req, res) {
    try { await resolveClaim(req, res, true); } catch (error) {
        console.error("chatbotClaimApprove 오류:", error);
        res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "승인 처리 중 오류가 발생했습니다." } }] } });
    }
});

exports.chatbotClaimReject = onRequest(CHATBOT_OPTS, async function (req, res) {
    try { await resolveClaim(req, res, false); } catch (error) {
        console.error("chatbotClaimReject 오류:", error);
        res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "거절 처리 중 오류가 발생했습니다." } }] } });
    }
});

// 스킬 키를 넣고 빼는 유일한 경로. system/ 은 규칙상 클라이언트가 못 쓰므로
// 운영자도 여기를 거쳐야 한다(adminSetClubClaimEmails 와 같은 모양).
//
// keys 가 목록인 이유는 회전 때문이다. 하나만 두면 콘솔과 서버 중 어느 쪽을
// 먼저 고쳐도 그 사이 챗봇이 죽는다:
//   1) add 로 새 키를 **더한다**  → 옛 키·새 키 둘 다 통한다
//   2) 카카오 콘솔 헤더를 새 키로 교체
//   3) remove 로 옛 키를 뺀다
exports.adminSetChatbotSkillKey = onCall(async function (request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    var adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");

    var data = request.data || {};
    var mode = String(data.mode || "add");
    var key = String(data.key == null ? "" : data.key).trim();

    var ref = db.collection("system").doc("chatbot_skill_key");
    var snap = await ref.get();
    var keys = ((snap.exists && snap.data()) || {}).keys;
    keys = Array.isArray(keys) ? keys.slice() : [];

    var cur = (snap.exists && snap.data()) || {};
    var enforce = cur.mode !== "audit";

    if (mode === "list") {
        // 값은 돌려주지 않는다 — 있는지, 몇 개인지, 막고 있는지만.
        return { ok: true, count: keys.length, configured: keys.length > 0, enforce: enforce };
    }
    // audit 은 '기록만 하고 통과'. 콘솔 스킬이 17개라 하나 빠뜨리기 쉽고, 대기 건이
    // 0인 스킬은 눌러볼 수도 없다. 켜자마자 막으면 쓰려는 순간에야 죽은 걸 안다.
    // 그래서 audit 으로 며칠 굴려 로그를 보고, 빠진 게 없으면 enforce 로 넘어간다.
    if (mode === "audit" || mode === "enforce") {
        await ref.set({
            mode: mode === "audit" ? "audit" : "enforce",
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_by: request.auth.uid
        }, { merge: true });
        skillKeyCache = { keys: null, enforce: true, at: 0 };
        return { ok: true, count: keys.length, configured: keys.length > 0, enforce: mode === "enforce" };
    }
    if (!key) throw new HttpsError("invalid-argument", "key 가 필요합니다.");

    if (mode === "add") {
        if (key.length < 24) {
            throw new HttpsError("invalid-argument", "키는 24자 이상으로 해주세요.");
        }
        if (keys.indexOf(key) === -1) keys.push(key);
    } else if (mode === "remove") {
        keys = keys.filter(function (k) { return k !== key; });
    } else {
        throw new HttpsError("invalid-argument", "mode 는 add · remove · list · audit · enforce 중 하나입니다.");
    }

    await ref.set({
        keys: keys,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: request.auth.uid
    }, { merge: true });

    // 최대 1분은 옛 캐시가 남는다(다른 인스턴스는 각자 만료된다).
    skillKeyCache = { keys: null, enforce: true, at: 0 };
    return { ok: true, count: keys.length, configured: keys.length > 0, enforce: enforce };
});

// ── 공개 발화 ─────────────────────────────────────────────────────
// 여기서부터는 **누구나** 쓸 수 있다. 스킬 키(①)는 지나지만 관리자 검사(②)는
// 타지 않는다. 위의 관리 발화와 같은 파일에 있으니 옮길 때 섞이지 않게 주의.
//
// 챗봇이 지도를 흉내내지 않는다. 지도는 앱·웹이 훨씬 잘한다. 챗봇이 유일하게
// 잘하는 건 **앱을 안 깐 사람을 지도까지 데려다주는 것**과 **앱 없이 제보를
// 받는 것** 두 가지다(PHILOSOPHY.md 가치 필터 #4 — 지도가 wedge).

var SITE = "https://do.nulloongzi.com";
var LOGO = SITE + "/app_ui/nulloongzido%20logo_512px.png";

// 길잡이. 도움말 발화와 폴백(무슨 말인지 모를 때)이 같이 쓴다.
exports.chatbotHelp = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }
        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    basicCard: {
                        title: "누룽지도 🏐",
                        description: "전국 배구 동호회를 지도 한 눈에.\n소개해줄 친구가 없어도, 집 근처에서 배구를 시작하게.\n\n· 우리 팀 등록: 지도에서 로그인 후 '+' 버튼\n· 정보가 틀렸을 때: 아래 '정보가 틀려요'",
                        thumbnail: { imageUrl: LOGO, fixedRatio: true },
                        buttons: [
                            { label: "🗺 지도 보기", action: "webLink", webLinkUrl: SITE }
                        ]
                    }
                }],
                quickReplies: [
                    { label: "✏️ 정보가 틀려요", action: "message", messageText: "제보 " },
                    { label: "🗺 지도 보기", action: "message", messageText: "지도" }
                ]
            }
        });
    } catch (error) {
        console.error("chatbotHelp 오류:", error);
        res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "누룽지도 — " + SITE } }] } });
    }
});

// 제보 접수. "제보 GVT 주소가 바뀌었어요" 한 줄이면 끝난다.
// 앱 신고와 같은 reports 컬렉션에 넣는다 — 운영자가 '신고관리' 하나만 보면 되게.
exports.chatbotPublicReport = onRequest(CHATBOT_OPTS, async function (req, res) {
    try {
        if (!(await skillCallAllowed(req))) { rejectSkillCall(res); return; }

        var body = req.body || {};
        var utterance = (body.userRequest && body.userRequest.utterance) || "";
        var parsed = pure.parsePublicReport(utterance);

        if (!parsed.ok) {
            res.json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: "어떤 정보가 틀렸는지 한 줄로 적어주세요.\n\n예) 제보 GVT 운동 시간이 바뀌었어요\n예) 제보 파주 임팩트 이제 활동 안 해요"
                        }
                    }]
                }
            });
            return;
        }

        // 제보자를 특정할 수 있는 건 카카오 user id 뿐이고, 그걸로 답장을 보낼
        // 수단이 없다(채널 메시지는 별도 API·비용). 그래서 저장은 하되 답장은
        // 약속하지 않는다 — 응답 문구가 그 사실을 먼저 말한다.
        var reporter = (body.userRequest && body.userRequest.user && body.userRequest.user.id) || "";

        await db.collection("reports").add({
            kind: "chatbot",
            target_id: "",
            target_name: "카카오톡 채널 제보",
            reason: "other",
            detail: parsed.text,
            status: "open",
            reporter_kakao_id: reporter,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            version: "2.0",
            template: {
                outputs: [{
                    simpleText: {
                        text: "제보 고맙습니다 🙏\n영업일 7일 안에 확인합니다.\n\n확인 결과를 따로 답장드리진 못해요. 대신 지도에 반영되면 바로 보실 수 있습니다."
                    }
                }],
                quickReplies: [{ label: "🗺 지도 보기", action: "webLink", webLinkUrl: SITE }]
            }
        });
    } catch (error) {
        console.error("chatbotPublicReport 오류:", error);
        res.json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "제보 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." } }] }
        });
    }
});

exports.adminReassignOwner = onCall(async function (request) {
    var auth = request.auth;
    if (!auth) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    var adminSnap = await db.collection("admins").doc(auth.uid).get();
    if (!adminSnap.exists) {
        throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
    }
    var data = request.data || {};
    var clubId = data.clubId;
    var email = data.email;
    if (!clubId || !email) {
        throw new HttpsError("invalid-argument", "clubId와 email이 필요합니다.");
    }
    var emailNorm = String(email).trim().toLowerCase();
    var userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(emailNorm);
    } catch (e) {
        if (e && e.code === "auth/user-not-found") {
            throw new HttpsError(
                "not-found",
                "해당 이메일의 사용자를 찾을 수 없습니다. (사용자가 먼저 한 번 로그인해야 합니다)"
            );
        }
        console.error("adminReassignOwner getUserByEmail 오류:", e);
        throw new HttpsError("internal", "사용자 조회 중 오류가 발생했습니다.");
    }
    try {
        await db.collection("clubs").doc(clubId).update({
            registered_by: userRecord.uid
        });
    } catch (e) {
        console.error("adminReassignOwner clubs.update 오류:", e);
        throw new HttpsError("internal", "팀 소유자 업데이트 중 오류가 발생했습니다.");
    }
    return { ok: true, uid: userRecord.uid };
});

// ══════════════════════════════════════════════════════════
// 관리자 전용: users 공개/비공개 분리 일괄 마이그레이션
// 클라이언트 lazy migration이 실행되지 않은 사용자(휴면/장기 미접속)를
// 강제로 정리. idempotent — 이미 분리된 사용자는 무시. dry-run 모드 지원.
//
// 호출:
//   const fn = firebase.functions().httpsCallable('migrateUsersPrivate');
//   await fn({ dryRun: true });          // 영향만 분석
//   await fn({ dryRun: false });         // 실제 이관
//   await fn({ dryRun: false, limit: 100 }); // 일부만
// ══════════════════════════════════════════════════════════
exports.migrateUsersPrivate = onCall({ timeoutSeconds: 540 }, async function (request) {
    var auth = request.auth;
    if (!auth) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    var adminSnap = await db.collection("admins").doc(auth.uid).get();
    if (!adminSnap.exists) {
        throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
    }

    var data = request.data || {};
    var dryRun = data.dryRun !== false; // 기본 true (안전)
    var limit = typeof data.limit === "number" ? data.limit : 0; // 0 = 전체

    var PRIVATE_KEYS = ["email", "bookmarks", "customTeams"];
    var stats = {
        scanned: 0,
        alreadyMigrated: 0,
        needMigration: 0,
        migrated: 0,
        failed: 0,
        errors: []
    };

    var query = db.collection("users");
    if (limit > 0) query = query.limit(limit);
    var snap = await query.get();

    for (var i = 0; i < snap.docs.length; i++) {
        var userDoc = snap.docs[i];
        var uid = userDoc.id;
        var publicData = userDoc.data() || {};
        stats.scanned += 1;

        var hasPrivateField = PRIVATE_KEYS.some(function (k) {
            return publicData[k] !== undefined;
        });
        if (!hasPrivateField) {
            stats.alreadyMigrated += 1;
            continue;
        }
        stats.needMigration += 1;

        if (dryRun) continue;

        try {
            // 1. private/profile 의 현재 상태 조회
            var privateRef = userDoc.ref.collection("private").doc("profile");
            var privateSnap = await privateRef.get();
            var privateData = privateSnap.exists ? (privateSnap.data() || {}) : {};

            // 2. 비공개 필드를 private/profile로 복사 (private에 이미 값이 있으면 보존)
            var migrated = {};
            PRIVATE_KEYS.forEach(function (k) {
                if (publicData[k] !== undefined && privateData[k] === undefined) {
                    migrated[k] = publicData[k];
                }
            });
            if (Object.keys(migrated).length > 0) {
                await privateRef.set(migrated, { merge: true });
            }

            // 3. public doc에서 해당 필드 제거 (Admin SDK는 rules 우회)
            var cleanup = {};
            PRIVATE_KEYS.forEach(function (k) {
                if (publicData[k] !== undefined) {
                    cleanup[k] = admin.firestore.FieldValue.delete();
                }
            });
            await userDoc.ref.update(cleanup);

            stats.migrated += 1;
        } catch (e) {
            stats.failed += 1;
            stats.errors.push({ uid: uid, message: e && e.message });
            console.error("migrateUsersPrivate 실패 uid=" + uid + ":", e);
        }
    }

    console.log("migrateUsersPrivate 결과:", stats, "dryRun:", dryRun);
    return { ok: true, dryRun: dryRun, stats: stats };
});



// ══════════════════════════════════════════════════════════
// 소셜 로그인(카카오/네이버) → Firebase 커스텀 토큰. 구현은 social-auth.js.
// ══════════════════════════════════════════════════════════
var socialAuth = require("./social-auth");
exports.kakaoCustomToken = socialAuth.kakaoCustomToken;
exports.naverCustomToken = socialAuth.naverCustomToken;

// ══════════════════════════════════════════════════════════
// 릴스 정지 커버 캐싱(발견 카드용) → 크롤러 UA 로 permalink 의 og:image 를 받아 Storage 에 저장. 구현은 insta-cover.js.
// ══════════════════════════════════════════════════════════
var instaCover = require("./insta-cover");
exports.cacheClubReelCovers = instaCover.cacheClubReelCovers;
exports.cachePickupReelCovers = instaCover.cachePickupReelCovers;

// ══════════════════════════════════════════════════════════
// 주소 → 좌표 (네이버 클라우드 지오코딩). 앱 등록 폼에서 호출.
// 시크릿은 함수에만 있고 앱에는 없다. 실패 시 앱은 지도 피커로 폴백한다.
//
// 이 두 함수는 원래 main에 머지되지 않은 브랜치에서만 배포돼 있어서, main 기준으로
// 전체 배포할 때마다 "로컬 소스에 없는 함수"로 삭제됐다. 소스를 여기로 옮겨 고정한다.
// ══════════════════════════════════════════════════════════
// 주소 지오코딩이 0건일 때의 폴백 — 카카오 키워드(장소) 검색.
// nearestStation 이 이미 쓰는 KAKAO_LOCAL_HOST + KAKAO_REST_API_KEY 를 그대로 쓴다.
async function kakaoPlaceSearchOnce(query, restKey) {
    try {
        var path = "/v2/local/search/keyword.json?size=1&query=" + encodeURIComponent(query);
        // 카카오 호스트 → 전역 fetch 금지 (406/KOE001). providerHttp 경유.
        var res = await providerHttp.get(providerHttp.KAKAO_LOCAL_HOST, path, {
            Authorization: "KakaoAK " + restKey
        });
        if (!providerHttp.isOk(res.status)) {
            console.warn("장소 검색 실패:", res.status, String(res.body || "").slice(0, 200));
            return null;
        }
        return pure.pickKakaoPlace(providerHttp.parseJson(res.body));
    } catch (e) {
        console.error("장소 검색 오류:", e && e.message);
        return null;
    }
}

// 좁은 질의부터 넓은 질의까지 차례로 — 첫 히트에서 멈춘다.
// 예전엔 입력을 통째로 한 번만 던지고 0건이면 포기해서, "광남초등학교 체육관"
// 처럼 시설 종류가 뒤에 붙은 흔한 표기가 그대로 실패했다.
async function kakaoPlaceSearch(query) {
    var restKey = providerHttp.secretValue(KAKAO_REST_API_KEY);
    if (!restKey) return null;
    var variants = pure.placeQueryVariants(query);
    for (var i = 0; i < variants.length; i++) {
        var hit = await kakaoPlaceSearchOnce(variants[i], restKey);
        if (hit) {
            if (i > 0) console.log("장소 검색 폴백 적중 - 변형", i, ":", variants[i]);
            return hit;
        }
    }
    return null;
}

exports.geocodeAddress = onCall(
    { secrets: [NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET, KAKAO_REST_API_KEY] },
    async function (request) {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        var address = ((request.data && request.data.address) || "").toString().trim();
        if (!address) {
            throw new HttpsError("invalid-argument", "주소가 비었습니다.");
        }
        if (address.length > 200) {
            throw new HttpsError("invalid-argument", "주소가 너무 깁니다.");
        }

        var keyId = providerHttp.secretValue(NAVER_MAP_CLIENT_ID);
        var key = providerHttp.secretValue(NAVER_MAP_CLIENT_SECRET);
        if (!keyId || !key) {
            throw new HttpsError("failed-precondition", "지오코딩 키가 설정되지 않았습니다.");
        }

        // 구/신 게이트웨이 호스트 순서대로 시도
        var hosts = ["maps.apigw.ntruss.com", "naveropenapi.apigw.ntruss.com"];
        var headers = {
            "x-ncp-apigw-api-key-id": keyId,
            "x-ncp-apigw-api-key": key
        };
        var lastErr = "";
        for (var i = 0; i < hosts.length; i++) {
            try {
                var path = "/map-geocode/v2/geocode?query=" + encodeURIComponent(address);
                var res = await providerHttp.get(hosts[i], path, headers);
                if (!providerHttp.isOk(res.status)) { lastErr = "HTTP " + res.status; continue; }
                var data = providerHttp.parseJson(res.body);
                var list = data && data.addresses;
                if (list && list.length > 0) {
                    var a = list[0];
                    return {
                        lat: parseFloat(a.y),
                        lng: parseFloat(a.x),
                        roadAddress: a.roadAddress || a.jibunAddress || address,
                        source: "address"
                    };
                }
                // 200인데 결과 0건. 여기서 포기하면 '석관중' 같은 **장소 이름**이
                // 영영 안 잡힌다 — 체육관 이름으로 찾는 게 이 폼에선 자연스러운
                // 입력인데도. 장소 검색으로 한 번 더 간다.
                lastErr = "주소 결과 0건";
                break;
            } catch (e) {
                lastErr = (e && e.message) || String(e);
            }
        }

        // 폴백: 장소(키워드) 검색. 네이버가 죽어 있을 때도 여기로 내려온다.
        var place = await kakaoPlaceSearch(address);
        if (place) {
            return {
                lat: place.lat,
                lng: place.lng,
                roadAddress: place.roadAddress || address,
                placeName: place.placeName,
                source: "place"
            };
        }

        // 주소로도 장소로도 못 찾음. 예외가 아니라 '못 찾음'으로 돌려준다 —
        // 호출부(앱·웹)는 이때 지도 피커를 연다.
        console.log("지오코딩·장소검색 모두 실패:", lastErr);
        return { lat: null, lng: null, roadAddress: null, source: null };
    }
);

// 네이버 리버스 지오코딩 result 하나를 한 줄 주소 문자열로.
// roadaddr(도로명)엔 법정동을 넣지 않는다(읍·면만 유지). addr(지번)은 동·리까지.
function formatReverseAddress(r) {
    var region = r.region || {};
    var land = r.land || {};
    function areaName(k) { return (region[k] && region[k].name) || ""; }
    var parts = [areaName("area1"), areaName("area2")];
    if (r.name === "roadaddr") {
        if (/[읍면]$/.test(areaName("area3"))) parts.push(areaName("area3"));
        parts.push(land.name || "");
    } else {
        parts.push(areaName("area3"), areaName("area4"));
    }
    var num = land.number1 || "";
    if (num && land.number2) num += "-" + land.number2;
    // 지번(addr)에서 land.type '2'는 산 지번 — '산 12-3'처럼 접두 (카카오 표기와 동일)
    if (num && r.name !== "roadaddr" && land.type === "2") num = "산 " + num;
    parts.push(num);
    return parts.filter(Boolean).join(" ");
}

// ══════════════════════════════════════════════════════════
// 좌표 → 주소 (네이버 클라우드 리버스 지오코딩). 앱 지도 피커 확정 시 주소칸 자동 채움.
// 웹 등록 폼의 kakao coord2Address 대응. 결과 없거나 오류면 {address:null} → 앱은 직접 입력 유지.
// ══════════════════════════════════════════════════════════
exports.reverseGeocode = onCall(
    { secrets: [NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET] },
    async function (request) {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        var lat = request.data && request.data.lat;
        var lng = request.data && request.data.lng;
        if (typeof lat !== "number" || typeof lng !== "number"
            || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new HttpsError("invalid-argument", "좌표가 필요합니다.");
        }

        var keyId = providerHttp.secretValue(NAVER_MAP_CLIENT_ID);
        var key = providerHttp.secretValue(NAVER_MAP_CLIENT_SECRET);
        if (!keyId || !key) {
            throw new HttpsError("failed-precondition", "지오코딩 키가 설정되지 않았습니다.");
        }

        // geocodeAddress와 동일하게 구/신 게이트웨이 호스트 순서대로 시도
        var hosts = ["maps.apigw.ntruss.com", "naveropenapi.apigw.ntruss.com"];
        var headers = {
            "x-ncp-apigw-api-key-id": keyId,
            "x-ncp-apigw-api-key": key
        };
        var lastErr = "";
        for (var i = 0; i < hosts.length; i++) {
            try {
                var path = "/map-reversegeocode/v2/gc?coords="
                    + encodeURIComponent(lng + "," + lat)
                    + "&orders=roadaddr,addr&output=json";
                var res = await providerHttp.get(hosts[i], path, headers);
                if (!providerHttp.isOk(res.status)) { lastErr = "HTTP " + res.status; continue; }
                var data = providerHttp.parseJson(res.body);
                var results = (data && data.results) || [];
                // roadaddr 우선(도로명), 없으면 addr(지번) — 웹 coord2Address와 같은 우선순위
                var best = null;
                for (var j = 0; j < results.length; j++) {
                    if (results[j].name === "roadaddr") { best = results[j]; break; }
                    if (!best) best = results[j];
                }
                if (!best) return { address: null };
                return { address: formatReverseAddress(best) || null };
            } catch (e) {
                lastErr = (e && e.message) || String(e);
            }
        }
        throw new HttpsError("unavailable", "리버스 지오코딩 실패: " + lastErr);
    }
);

// ══════════════════════════════════════════════════════════
// 좌표 → 가까운 지하철역 (카카오 로컬 SW8). 스토리 카드 enrich용.
// 기존 KAKAO_REST_API_KEY 재사용 (앱의 카카오맵 'Local' API 활성화 필요).
// 결과 없거나 오류면 {name:null} → 카드는 지역 라벨로 폴백.
// ══════════════════════════════════════════════════════════
exports.nearestStation = onCall(
    { secrets: [KAKAO_REST_API_KEY] },
    async function (request) {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        var lat = request.data && request.data.lat;
        var lng = request.data && request.data.lng;
        if (typeof lat !== "number" || typeof lng !== "number") {
            throw new HttpsError("invalid-argument", "좌표가 필요합니다.");
        }
        try {
            var path = "/v2/local/search/category.json"
                + "?category_group_code=SW8&radius=2000&sort=distance&size=1"
                + "&x=" + encodeURIComponent(lng) + "&y=" + encodeURIComponent(lat);
            // 카카오 호스트 → 전역 fetch 금지 (406/KOE001). providerHttp 경유.
            var res = await providerHttp.get(providerHttp.KAKAO_LOCAL_HOST, path, {
                Authorization: "KakaoAK " + providerHttp.secretValue(KAKAO_REST_API_KEY)
            });
            if (!providerHttp.isOk(res.status)) {
                console.error("nearestStation 실패:", res.status, res.body);
                return { name: null, distance: null };
            }
            var data = providerHttp.parseJson(res.body);
            if (data && data.documents && data.documents.length > 0) {
                var d = data.documents[0];
                var nm = (d.place_name || "").replace(/\s*\d+호선.*$/, "").trim()
                    || d.place_name || "";
                return { name: nm, distance: parseInt(d.distance, 10) || 0 };
            }
            return { name: null, distance: null };
        } catch (e) {
            console.error("nearestStation error:", e && e.message);
            return { name: null, distance: null };
        }
    }
);
