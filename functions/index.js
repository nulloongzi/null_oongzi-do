var { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
var { onDocumentCreated } = require("firebase-functions/v2/firestore");
var { defineSecret } = require("firebase-functions/params");
var admin = require("firebase-admin");
var crypto = require("crypto");

admin.initializeApp();
var db = admin.firestore();

var KAKAO_TOKEN = defineSecret("KAKAO_ACCESS_TOKEN");
var KAKAO_REFRESH_TOKEN = defineSecret("KAKAO_REFRESH_TOKEN");
var KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
var KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");
var APP_SECRET = defineSecret("WEBHOOK_SECRET");
// 네이버 클라우드 Maps(지오코딩) 인증 — 시크릿은 서버측만(앱에 노출 금지).
var NAVER_MAP_CLIENT_ID = defineSecret("NAVER_MAP_CLIENT_ID");
var NAVER_MAP_CLIENT_SECRET = defineSecret("NAVER_MAP_CLIENT_SECRET");

// ══════════════════════════════════════════════════════════
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

// 권한 없음 응답 (통일 포맷)
function unauthorizedResponse() {
    return {
        version: "2.0",
        template: {
            outputs: [{
                simpleText: {
                    text: "⛔ 권한이 없습니다.\n\n이 명령어는 관리자 전용입니다."
                }
            }]
        }
    };
}

// HMAC 토큰 생성 (승인/거절 링크 보안용)
function generateToken(secret, requestId, action) {
    return crypto
        .createHmac("sha256", secret)
        .update(requestId + action)
        .digest("hex")
        .substring(0, 16);
}

// 카카오 액세스 토큰 획득 (Firestore 캐시 + refresh token 자동 갱신)
// 만료 1분 전에 미리 갱신. refresh token이 새로 내려오면 경고 로그 (secret 수동 교체 필요)
async function getKakaoAccessToken() {
    var tokenRef = db.collection("system").doc("kakao_token");
    var tokenSnap = await tokenRef.get();
    var now = Date.now();

    if (tokenSnap.exists) {
        var cached = tokenSnap.data();
        if (cached.access_token && cached.expires_at && cached.expires_at > now + 60000) {
            return cached.access_token;
        }
    }

    var refreshToken = KAKAO_REFRESH_TOKEN.value();
    var restApiKey = KAKAO_REST_API_KEY.value();
    var clientSecret = KAKAO_CLIENT_SECRET.value();
    if (!refreshToken || !restApiKey) {
        console.warn("KAKAO_REFRESH_TOKEN 또는 KAKAO_REST_API_KEY 미설정 - seed access token 사용");
        return KAKAO_TOKEN.value();
    }

    var body = "grant_type=refresh_token" +
        "&client_id=" + encodeURIComponent(restApiKey) +
        "&refresh_token=" + encodeURIComponent(refreshToken);
    if (clientSecret) {
        body += "&client_secret=" + encodeURIComponent(clientSecret);
    }

    var refreshRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: body
    });
    var result = await refreshRes.json();

    if (!result.access_token) {
        console.error("카카오 토큰 갱신 실패:", result);
        throw new Error("카카오 토큰 갱신 실패: " + JSON.stringify(result));
    }

    var expiresAt = now + (result.expires_in * 1000);
    await tokenRef.set({
        access_token: result.access_token,
        expires_at: expiresAt,
        refreshed_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (result.refresh_token) {
        console.warn("⚠️ 새 refresh_token 발급됨 - KAKAO_REFRESH_TOKEN secret 교체 필요:", result.refresh_token);
    }

    return result.access_token;
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
            return;
        }
        if (!kakaoToken) {
            console.warn("KAKAO_ACCESS_TOKEN 미설정 - 카카오톡 알림 생략");
            return;
        }

        try {
            var templateObject = {
                object_type: "text",
                text: "[인증 신청] " + data.club_name + "\n\n새로운 팀 인증 신청이 도착했습니다.\n\n카카오톡 챗봇에서 '인증관리'를 입력하여 사진 확인 및 승인/거절을 진행해주세요.",
                link: {
                    web_url: "https://nulloongzido.com",
                    mobile_web_url: "https://nulloongzido.com"
                }
            };
            var body = "template_object=" + encodeURIComponent(JSON.stringify(templateObject));
            var kakaoRes = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + kakaoToken,
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
                },
                body: body
            });
            var kakaoResult = await kakaoRes.json();
            console.log("카카오톡 메시지 전송 결과:", kakaoResult);
        } catch (kakaoErr) {
            console.error("카카오톡 메시지 전송 실패:", kakaoErr);
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
            await requestRef.update({
                status: "approved",
                reviewed_at: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("clubs").doc(requestData.club_id).update({
                is_verified: true
            });
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

function renderResultPage(title, message) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>누룽지도 인증 관리</title>' +
        '<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fff8e1;}' +
        '.card{background:#fff;border-radius:20px;padding:40px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px;}' +
        'h1{color:#4e342e;font-size:24px;}p{color:#666;font-size:16px;line-height:1.5;}</style></head>' +
        '<body><div class="card"><h1>' + title + '</h1><p>' + message + '</p></div></body></html>';
}

// ══════════════════════════════════════════════════════════
// 카카오 i 오픈빌더 챗봇 스킬 엔드포인트
// ══════════════════════════════════════════════════════════

// ── 스킬 1: 대기 중인 인증 요청 목록 ──
exports.chatbotPending = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
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
                thumbnail: { imageUrl: d.photo_url },
                buttons: [
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
exports.chatbotApprove = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // Button action="block"의 extra로 전달된 request_id를 우선 사용, 없으면 utterance 파싱 (폴백)
        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var requestId = clientExtra.request_id || "";
        if (!requestId) {
            var utterance = (req.body.userRequest && req.body.userRequest.utterance) || "";
            var parts = utterance.split(/\s+/);
            requestId = parts.length > 1 ? parts[parts.length - 1].trim() : "";
        }
        console.log("chatbotApprove - requestId:", JSON.stringify(requestId), "source:", clientExtra.request_id ? "clientExtra" : "utterance");

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

        await requestRef.update({
            status: "approved",
            reviewed_at: admin.firestore.FieldValue.serverTimestamp()
        });
        try {
            await db.collection("clubs").doc(requestData.club_id).update({
                is_verified: true
            });
        } catch (clubErr) {
            console.warn("clubs 문서 업데이트 실패 (문서 없을 수 있음):", clubErr.message);
            await db.collection("clubs").doc(requestData.club_id).set({
                is_verified: true
            }, { merge: true });
        }

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
exports.chatbotRejectAsk = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // Button action="block"의 extra로 전달된 request_id를 우선 사용, 없으면 utterance 파싱 (폴백)
        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var requestId = clientExtra.request_id || "";
        if (!requestId) {
            var utterance = (req.body.userRequest && req.body.userRequest.utterance) || "";
            var parts = utterance.split(/\s+/);
            requestId = parts.length > 1 ? parts[parts.length - 1].trim() : "";
        }

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
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        // QuickReply action=block의 extra 우선 사용 (reason 포함), 없으면 컨텍스트/utterance 폴백
        var clientExtra = (req.body.action && req.body.action.clientExtra) || {};
        var requestId = clientExtra.request_id || null;
        var clubName = clientExtra.club_name || null;
        var reason = clientExtra.reason || (req.body.userRequest && req.body.userRequest.utterance) || "";
        var contexts = clientExtra.contexts || req.body.contexts || [];

        // 폴백: action.params (컨텍스트 파라미터)
        if (!requestId && req.body.action && req.body.action.params) {
            requestId = req.body.action.params.request_id;
            clubName = req.body.action.params.club_name;
        }
        // 폴백: context.values
        if (!requestId && Array.isArray(contexts)) {
            for (var i = 0; i < contexts.length; i++) {
                if (contexts[i].name === "reject_context") {
                    requestId = contexts[i].params.request_id && contexts[i].params.request_id.value;
                    clubName = contexts[i].params.club_name && contexts[i].params.club_name.value;
                    break;
                }
            }
        }
        console.log("chatbotRejectConfirm - requestId:", requestId, "reason:", reason, "source:", clientExtra.request_id ? "clientExtra" : "fallback");

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
                    link: { web_url: "https://nulloongzido.com", mobile_web_url: "https://nulloongzido.com" }
                };
                await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + kakaoToken,
                        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
                    },
                    body: "template_object=" + encodeURIComponent(JSON.stringify(templateObject))
                });
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
var TEAM_LIST_BLOCK_ID = "69e62f64d2b391b64c603714";       // 팀관리 블록 (발화: 팀관리)
var TEAM_DELETE_ASK_BLOCK_ID = "69e62f884cb5cb85009b4b19";  // 팀삭제확인 블록 (action=block 전용)
var TEAM_DELETE_BLOCK_ID = "69e62fa62ba171220dde09da";     // 팀삭제완료 블록 (action=block 전용)


// ── 스킬 5: 팀 목록 (최신 10개) ──
exports.chatbotTeamList = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
        var auth = await isAllowedKakaoUser(req);
        if (!auth.allowed) { res.json(unauthorizedResponse()); return; }

        var snap = await db.collection("clubs").get();
        if (snap.empty) {
            res.json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "등록된 팀이 없습니다." } }] }
            });
            return;
        }

        // 메모리에서 정렬 (레거시 문서는 metadata.created_at 없을 수 있음)
        var clubs = [];
        snap.forEach(function (doc) {
            var d = doc.data();
            d._id = doc.id;
            var ca = d.metadata && d.metadata.created_at;
            d._createdMs = ca && ca.toMillis ? ca.toMillis() : (ca ? new Date(ca).getTime() : 0);
            clubs.push(d);
        });
        clubs.sort(function (a, b) { return b._createdMs - a._createdMs; });
        var top = clubs.slice(0, 10);

        var DEFAULT_THUMB = "https://nulloongzi.github.io/null_oongzi-do/app_ui/nulloongzido%20logo_512px.png";
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
exports.chatbotTeamDeleteAsk = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
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
exports.chatbotTeamDelete = onRequest({ cors: true, invoker: "public" }, async function (req, res) {
    try {
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
// 관리자 전용: 팀 소유자 재할당 (이메일 → uid)
// users.email이 비공개 서브컬렉션으로 옮겨져 클라이언트에서 직접
// 이메일로 uid를 조회할 수 없으므로 Admin SDK를 통한 onCall로 제공.
// ══════════════════════════════════════════════════════════
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
// 주소 → 좌표 (네이버 클라우드 Maps 지오코딩). 시크릿 서버측 보관.
// 네이티브 등록 폼의 "주소로 검색"이 호출. (구/신 엔드포인트 폴백)
// 시크릿 설정:
//   firebase functions:secrets:set NAVER_MAP_CLIENT_ID      (예: t4mzao93mh)
//   firebase functions:secrets:set NAVER_MAP_CLIENT_SECRET  (NCP 콘솔 Maps 앱의 Client Secret)
// 콘솔에서 해당 앱에 'Geocoding' 서비스가 활성화돼 있어야 함.
// ══════════════════════════════════════════════════════════
exports.geocodeAddress = onCall(
    { secrets: [NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET] },
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

        var keyId = NAVER_MAP_CLIENT_ID.value();
        var key = NAVER_MAP_CLIENT_SECRET.value();
        if (!keyId || !key) {
            throw new HttpsError("failed-precondition", "지오코딩 키가 설정되지 않았습니다.");
        }

        var endpoints = [
            "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
            "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"
        ];
        var headers = {
            "x-ncp-apigw-api-key-id": keyId,
            "x-ncp-apigw-api-key": key,
            "Accept": "application/json"
        };
        var lastErr = "";
        for (var i = 0; i < endpoints.length; i++) {
            try {
                var url = endpoints[i] + "?query=" + encodeURIComponent(address);
                var res = await fetch(url, { headers: headers });
                if (!res.ok) { lastErr = "HTTP " + res.status; continue; }
                var data = await res.json();
                var list = data && data.addresses;
                if (list && list.length > 0) {
                    var a = list[0];
                    return {
                        lat: parseFloat(a.y),
                        lng: parseFloat(a.x),
                        roadAddress: a.roadAddress || a.jibunAddress || address
                    };
                }
                // 200인데 결과 없음 → 주소 못 찾음 (폴백 불필요)
                return { lat: null, lng: null, roadAddress: null };
            } catch (e) {
                lastErr = (e && e.message) || String(e);
            }
        }
        throw new HttpsError("unavailable", "지오코딩 실패: " + lastErr);
    }
);


