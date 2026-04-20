var { onRequest } = require("firebase-functions/v2/https");
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

// ── 엔드포인트 1: 인증 신청 알림 (클라이언트에서 호출) ──
exports.verificationNotify = onRequest({ cors: true, invoker: "public", secrets: [KAKAO_TOKEN, KAKAO_REFRESH_TOKEN, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET] }, async function (req, res) {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    var data = req.body;
    if (!data.request_id || !data.club_name) {
        res.status(400).json({ error: "request_id and club_name are required" });
        return;
    }

    // 카카오톡 "나에게 보내기" API로 알림 전송
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
                text: "[인증 신청] " + data.club_name + "\n\n새로운 팀 인증 신청이 도착했습니다.\n\n카카오톡 챗봇에서 '인증관리'를 입력하여 사진 확인 및 승인/거절을 진행해주세요.",
                link: {
                    web_url: "https://nulloongzido.com",
                    mobile_web_url: "https://nulloongzido.com"
                }
            };

            var jsonStr = JSON.stringify(templateObject);
            var body = "template_object=" + encodeURIComponent(jsonStr);

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
    } else {
        console.warn("KAKAO_ACCESS_TOKEN이 설정되지 않았습니다.");
        console.log("승인 URL:", approveUrl);
        console.log("거절 URL:", rejectUrl);
    }

    res.json({ success: true });
});

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
        res.status(500).send(renderResultPage("오류", "처리 중 오류가 발생했습니다: " + error.message));
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
                outputs: [{ simpleText: { text: "오류가 발생했습니다: " + error.message } }]
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
            template: { outputs: [{ simpleText: { text: "승인 처리 중 오류: " + error.message } }] }
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
            template: { outputs: [{ simpleText: { text: "오류: " + error.message } }] }
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
            template: { outputs: [{ simpleText: { text: "거절 처리 중 오류: " + error.message } }] }
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

        var items = top.map(function (c) {
            var verifyText = c.is_verified ? "✅ 인증됨" : "⏳ 미인증";
            var ownerText = c.registered_by ? "" : " · 레거시";
            var desc = (c.address || "주소 없음") + "\n" + verifyText + ownerText;
            return {
                title: c.name || "이름 없음",
                description: desc,
                buttons: [{
                    label: "🗑 삭제",
                    action: "block",
                    blockId: TEAM_DELETE_ASK_BLOCK_ID,
                    extra: { club_id: c._id, club_name: c.name || "" }
                }]
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
            template: { outputs: [{ simpleText: { text: "팀 목록 조회 중 오류: " + error.message } }] }
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
            template: { outputs: [{ simpleText: { text: "삭제 확인 중 오류: " + error.message } }] }
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
            template: { outputs: [{ simpleText: { text: "삭제 처리 중 오류: " + error.message } }] }
        });
    }
});
