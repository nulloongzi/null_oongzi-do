// share.js
// 공유 이미지 생성: 네임카드 + 도시락 + 식단표 캡처 → 미리보기 → 다운로드
// Depends on: qrcode-generator (CDN, 선택), data.js, i18n.js

// 포장하기(내 네임카드 공유)는 js/my-card.js 가 canvas 로 직접 그린다.
// 예전엔 여기서 화면 DOM을 복제해 html2canvas 로 찍었는데, transform:scale 이
// 레이아웃 박스를 바꾸지 않아 배치가 어긋나고 빈 칸 안내문구까지 그대로 나갔다.
// showShareOptions / generateShareImage 는 my-card.js 에서 정의한다.

window.closePreview = function () {
    var overlay = document.getElementById('previewOverlay');
    overlay.style.display = 'none';

    // 메모리 절약을 위해 기존 이미지 삭제
    document.getElementById('previewImgBox').innerHTML = "";
};

window.downloadImage = function () {
    var imgBox = document.getElementById('previewImgBox');
    var img = imgBox.querySelector('img');

    if (img) {
        var link = document.createElement('a');
        link.href = img.src;

        // 파일명 생성: nulloong_날짜_시간.png
        var now = new Date();
        var fileName = 'nulloong_' + now.getFullYear() + (now.getMonth() + 1) + now.getDate() + '_' + now.getHours() + now.getMinutes() + '.png';

        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        alert(window.t('no_image'));
    }
};

// ── 클럽 딥링크 공유 (카카오 / 웹공유 / 링크복사 폴백) ──

window.SITE_BASE_URL = 'https://do.nulloongzi.com/';

window.buildClubShareUrl = function (id) {
    return window.SITE_BASE_URL + '?club=' + encodeURIComponent(id);
};

window.buildSpotShareUrl = function (id) {
    return window.SITE_BASE_URL + '?spot=' + encodeURIComponent(id);
};

window.initKakaoShare = function () {
    try {
        if (window.Kakao && !window.Kakao.isInitialized()) {
            // Maps appkey와 동일한 JavaScript 키 재사용
            window.Kakao.init('69f821ba943db5e3532ac90ea5ca1080');
        }
    } catch (e) {
        console.warn('Kakao SDK 초기화 실패:', e);
    }
};

function copyShareLink(url) {
    function done() { alert(window.t('link_copied')); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url); done(); });
    } else {
        fallbackCopy(url);
        done();
    }
}

function fallbackCopy(url) {
    var t = document.createElement('input');
    t.value = url;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
}

window.shareClub = function (club) {
    if (!club || !club.id) return;
    var url = window.buildClubShareUrl(club.id);
    var shareText = (club.name ? club.name + ' · ' : '') + window.t('sh_view_club_text');

    // 1) 카카오 공유 카드 (리치 미리보기) — 모바일 우선
    //    링크 탭이 동작하려면 [제품 링크 관리]>웹 도메인(대표 도메인)에 도메인 등록 필요.
    //    (JS SDK 도메인은 카드 '전송'만 허용 — 대표 도메인 미등록 시 카드는 떠도 탭이 안 열림)
    if (window.Kakao && window.Kakao.isInitialized() && window.Kakao.Share) {
        try {
            var desc = (club.target || '');
            if (club.schedule) desc += (desc ? ' · ' : '') + club.schedule;
            window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: club.name || window.t('sh_club_fallback'),
                    description: desc || window.t('sh_view_on'),
                    imageUrl: window.SITE_BASE_URL + 'app_ui/nulloongzido%20logo_512px.png',
                    link: { mobileWebUrl: url, webUrl: url }
                },
                buttons: [
                    { title: window.t('sh_view_club_btn'), link: { mobileWebUrl: url, webUrl: url } }
                ]
            });
            if (window.track) window.track('share', { method: 'kakao', club_id: club.id });
            return;
        } catch (e) {
            console.warn('카카오 공유 실패, 폴백 진행:', e);
        }
    }

    // 2) OS 네이티브 공유 시트 (카카오 SDK 미초기화/미지원 시 폴백 — 일반 링크라 도메인 등록 불필요)
    if (navigator.share) {
        navigator.share({ title: club.name || window.t('brand'), text: shareText, url: url })
            .catch(function () { /* 사용자 취소 등은 무시 */ });
        if (window.track) window.track('share', { method: 'web', club_id: club.id });
        return;
    }

    // 3) 링크 복사 폴백
    copyShareLink(url);
    if (window.track) window.track('share', { method: 'copy', club_id: club.id });
};

// ── 픽업 스팟 공유 (?spot= 딥링크) — shareClub과 동일 폴백 체인 ──
window.sharePickup = function (spot) {
    if (!spot || !spot.id) return;
    var url = window.buildSpotShareUrl(spot.id);
    var name = spot.title || window.t('sh_club_fallback');
    var shareText = name + ' · ' + window.t('sh_view_on');

    if (window.Kakao && window.Kakao.isInitialized() && window.Kakao.Share) {
        try {
            var desc = window.pkSportLabel ? window.pkSportLabel(spot.sport) : (spot.sport || '');
            if (spot.schedule || spot.schedule_text) desc += ' · ' + (spot.schedule || spot.schedule_text);
            if (spot.this_week) desc += ' · ' + spot.this_week;
            window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: name,
                    description: desc || window.t('sh_view_on'),
                    imageUrl: window.SITE_BASE_URL + 'app_ui/nulloongzido%20logo_512px.png',
                    link: { mobileWebUrl: url, webUrl: url }
                },
                buttons: [{ title: window.t('sh_view_on'), link: { mobileWebUrl: url, webUrl: url } }]
            });
            if (window.track) window.track('share', { method: 'kakao', spot_id: spot.id });
            return;
        } catch (e) { console.warn('카카오 공유 실패, 폴백:', e); }
    }
    if (navigator.share) {
        navigator.share({ title: name, text: shareText, url: url }).catch(function () { });
        if (window.track) window.track('share', { method: 'web', spot_id: spot.id });
        return;
    }
    copyShareLink(url);
    if (window.track) window.track('share', { method: 'copy', spot_id: spot.id });
};

// ══════════════════════════════════════════════════════════════════════════
// 공유 카드 (스토리 9:16 · 피드 3:4 PNG) + 네이티브 브리지 (탭=딥링크)
// ──────────────────────────────────────────────────────────────────────────
// 팀·픽업을 따뜻한 누룽지 톤 카드로 그린다. 규격·토큰은 docs/design-system.md §7.
//  - 스토리(9:16): 셸(Flutter WebView)이면 window.NativeShare 로 카드 PNG + 딥링크를 넘겨
//    네이티브 IG 스토리 공유(스티커 탭 → 딥링크). 일반 브라우저는 미리보기/저장(QR 포함).
//  - 피드(3:4): 미리보기/저장 — 인스타 피드·카톡에 이미지로 올리는 용도.
// 카드는 <canvas> 2D로 직접 그린다 — html2canvas 대비 결정적·동기적이고 QR 픽셀 제어가 쉽다.
// 캔버스 텍스트는 HTML이 아니므로 사용자 입력(제목/메모)도 XSS 위험이 없다(escape 불필요).
// QR은 window.qrcode(qrcode-generator, CDN) 사용 — 미로드 시 QR 없이 텍스트만 그려 폴백.

window.STORY_CARD_W = 1080;
window.STORY_CARD_H = 1920;

// 이미지 로드(로고). 실패해도 카드 생성은 진행하도록 null로 resolve.
function storyLoadImage(src) {
    return new Promise(function (resolve) {
        try {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = src;
        } catch (e) { resolve(null); }
    });
}

function storyRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// 텍스트를 maxWidth/maxLines에 맞춰 줄바꿈(한글 글자 단위, 넘치면 … 말줄임). 줄 배열 반환.
function storyWrapLines(ctx, text, maxWidth, maxLines) {
    var chars = Array.from(text == null ? '' : String(text));
    var lines = [], cur = '', truncated = false;
    for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        if (cur && ctx.measureText(cur + ch).width > maxWidth) {
            lines.push(cur);
            cur = ch;
            if (lines.length === maxLines) { truncated = true; break; }
        } else {
            cur += ch;
        }
    }
    if (!truncated && cur && lines.length < maxLines) lines.push(cur);
    if (truncated && lines.length) {
        var last = lines[lines.length - 1];
        while (last && ctx.measureText(last + '…').width > maxWidth) {
            var a = Array.from(last); a.pop(); last = a.join('');
        }
        lines[lines.length - 1] = last + '…';
    }
    return lines;
}

// QR 코드를 캔버스에 그린다. window.qrcode(qrcode-generator) 없으면 false 반환(폴백).
function storyDrawQR(ctx, text, x, y, size) {
    if (!window.qrcode) return false;
    try {
        var qr = window.qrcode(0, 'M');   // 0 = 버전 자동, M = 에러정정
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var quiet = 4;                    // 표준 quiet zone(여백) 4모듈
        var cell = size / (count + quiet * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#1c140d';        // 스캐너 대비 위해 거의 검정(살짝 웜)
        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillRect(
                        Math.floor(x + (c + quiet) * cell),
                        Math.floor(y + (r + quiet) * cell),
                        Math.ceil(cell), Math.ceil(cell)
                    );
                }
            }
        }
        return true;
    } catch (e) { console.warn('QR 생성 실패:', e); return false; }
}

// 아래 캔버스 헬퍼는 my-card.js(포장하기)도 함께 쓴다 — 카드 두 종류가
// 같은 QR·같은 라운드·같은 줄바꿈 규칙으로 그려져야 한 브랜드로 보인다.
window.storyLoadImage = storyLoadImage;
window.storyRoundRect = storyRoundRect;
window.storyWrapLines = storyWrapLines;
window.storyDrawQR = storyDrawQR;

// 주소 → 지역 라벨 ("서울 송파구 올림픽로 25" → "서울 송파구")
function storyRegion(address) {
    if (!address) return '';
    var p = String(address).trim().split(/\s+/);
    return p.slice(0, 2).join(' ');
}

// 가장 가까운 지하철역(카카오 SW8 카테고리) → Promise<{name,distance}|null>.
// kakao services 미로드/실패/타임아웃이면 null → 카드는 지역 텍스트로 폴백.
function storyFindNearestStation(lat, lng) {
    return new Promise(function (resolve) {
        try {
            if (!lat || !lng || !window.kakao || !kakao.maps || !kakao.maps.services) { resolve(null); return; }
            var done = false;
            var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 2500);
            var ps = new kakao.maps.services.Places();
            ps.categorySearch('SW8', function (data, status) {
                if (done) return;
                done = true; clearTimeout(timer);
                if (status === kakao.maps.services.Status.OK && data && data[0]) {
                    var d = data[0];
                    var nm = (d.place_name || '').replace(/\s*\d+호선.*$/, '').trim() || d.place_name || '';
                    resolve({ name: nm, distance: parseInt(d.distance, 10) || 0 });
                } else { resolve(null); }
            }, { location: new kakao.maps.LatLng(lat, lng), radius: 2000, sort: kakao.maps.services.SortBy.DISTANCE });
        } catch (e) { resolve(null); }
    });
}

// ── 공유 카드 키트 ─────────────────────────────────────────────────────────
// 팀·픽업 카드(아래)와 내 카드(js/my-card.js)가 같은 규격·토큰·머리글·푸터를 쓴다.
// 숫자는 docs/design-system.md §7 과 앱 lib/widgets/share_card_kit.dart 와 같아야 한다 —
// 한쪽만 바꾸면 같은 카드가 플랫폼마다 달라진다.
var CARD = {
    W: 1080,
    M: 80,                      // 좌우 여백 → 본문 폭 920
    FORMATS: {
        // 스토리: 위는 프로필·진행바, 아래는 답장바가 덮는다(인스타 UI) → 글·QR은 250 안쪽에.
        // 그 띠를 비워두지 않는다 — 위는 히어로(지도·밥색), 아래는 티켓 스텁이 채운다.
        story: { h: 1920, top: 250, bottom: 250, qr: 172 },
        // 피드 3:4: 인스타 피드·그리드가 3:4를 그대로 보여준다(2025~). 덮는 UI가 없다.
        feed: { h: 1440, top: 72, bottom: 72, qr: 148 }
    },
    HEADER_H: 64,               // 머리글 알약 높이
    OVERLAP: 72,                // 본문 카드가 히어로 아랫단을 덮는 깊이
    GAP: 32,                    // 블록 사이
    STUB_PAD: 36,               // 스텁 절취선 ↔ QR 타일
    C: {
        cream: '#FBF3E2', card: '#FFFDF8', ink: '#3D2C22', dark: '#4E342E',
        brown: '#8D6E63', sub: '#A99A8C', yellow: '#FAC710', teal: '#12A89E',
        hair: 'rgba(141,110,99,0.28)', qr: '#1C140D'
    },
    FONT: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif'
};
window.SHARE_CARD = CARD;

function cardFormat(format) { return CARD.FORMATS[format === 'feed' ? 'feed' : 'story']; }
function cardFont(px, wt) { return wt + ' ' + px + 'px ' + CARD.FONT; }
// 스텁 윗단(절취선) y. QR 타일 아래끝이 아래 안전선에 닿게 놓는다.
function cardStubTop(fmt) { return fmt.h - fmt.bottom - (CARD.STUB_PAD + fmt.qr + 20); }

// 그림자 두 단계만 쓴다 — 카드(큰 것)와 알약·QR 타일(작은 것).
function cardShadow(ctx, small) {
    ctx.shadowColor = small ? 'rgba(93,64,55,0.12)' : 'rgba(93,64,55,0.15)';
    ctx.shadowBlur = small ? 16 : 32;
    ctx.shadowOffsetY = small ? 4 : 8;
}
function cardNoShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

function cardBackground(ctx, h) {
    ctx.fillStyle = CARD.C.cream; ctx.fillRect(0, 0, CARD.W, h);
}

// 알약 하나(흰 바탕 + 작은 그림자). 머리글·지역·역 표시가 같은 모양을 쓴다.
function cardPill(ctx, x, y, w, h) {
    storyRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = '#fff'; cardShadow(ctx, true); ctx.fill(); cardNoShadow(ctx);
}

// 머리글: 흰 알약 안에 로고 44 + 워드마크 30/800. 히어로(지도·밥색) 위에 얹혀도 읽힌다.
// right: 같은 줄 오른쪽 끝에 붙일 알약 글(지역 등, 선택). 반환: 알약 아래끝 y.
function cardHeader(ctx, y, logo, right) {
    var h = CARD.HEADER_H, M = CARD.M, brand = window.t ? window.t('brand') : '누룽지도';
    ctx.font = cardFont(30, 800);
    var w = 10 + 44 + 14 + ctx.measureText(brand).width + 26;
    cardPill(ctx, M, y, w, h);
    var cx = M + 10 + 22, cy = y + h / 2;
    if (logo) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logo, cx - 22, cy - 22, 44, 44); ctx.restore();
    } else {
        cardVolley(ctx, cx, cy, 15, CARD.C.yellow);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = CARD.C.ink;
    ctx.fillText(brand, M + 10 + 44 + 14, cy + 1);
    if (right) {
        ctx.font = cardFont(28, 700);
        var maxW = CARD.W - M * 2 - w - 24;
        var txt = storyWrapLines(ctx, right, maxW - 80, 1)[0] || '';
        var rw = ctx.measureText(txt).width + 80, rx = CARD.W - M - rw;
        cardPill(ctx, rx, y, rw, h);
        cardIcoPin(ctx, rx + 20, y + 17, 30, CARD.C.brown);
        ctx.fillStyle = CARD.C.ink; ctx.fillText(txt, rx + 58, cy + 1);
    }
    ctx.textBaseline = 'top';
    return y + h;
}

// 스텁 푸터: 전폭 패널 + 절취선(양끝 반원 홈 + 점선) + QR 타일 + SCAN · CTA · URL.
// 스토리는 링크가 안 걸리는 매체라 QR이 유일한 유입 경로 — 표 한 장을 떼어 가는 은유.
// QR 라이브러리가 없으면(CDN 차단) 타일 없이 글만 왼쪽부터.
function cardStub(ctx, fmt, url, cta) {
    var M = CARD.M, q = fmt.qr, top = cardStubTop(fmt), W = CARD.W;
    ctx.save(); ctx.shadowColor = 'rgba(93,64,55,0.10)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = -4;
    ctx.fillStyle = CARD.C.card; ctx.fillRect(0, top, W, fmt.h - top); ctx.restore();
    // 홈: 배경색 반원으로 파낸다
    ctx.fillStyle = CARD.C.cream;
    ctx.beginPath(); ctx.arc(0, top, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W, top, 22, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.setLineDash([14, 12]); ctx.strokeStyle = CARD.C.hair; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(40, top); ctx.lineTo(W - 40, top); ctx.stroke(); ctx.restore();

    var tileY = top + CARD.STUB_PAD;
    var probe = ctx.canvas && ctx.canvas.ownerDocument ? ctx.canvas.ownerDocument.createElement('canvas') : null;
    var haveQR = !!window.qrcode;
    if (probe && probe.getContext) { probe.width = probe.height = 8; haveQR = storyDrawQR(probe.getContext('2d'), url, 0, 0, 8); }
    if (haveQR) {
        storyRoundRect(ctx, M, tileY, q + 20, q + 20, 18);
        ctx.fillStyle = '#fff'; cardShadow(ctx, true); ctx.fill(); cardNoShadow(ctx);
        storyDrawQR(ctx, url, M + 10, tileY + 10, q);
    }
    var tx = haveQR ? M + q + 20 + 40 : M, tw = W - M - tx;
    ctx.font = cardFont(34, 800);
    var ctaLines = storyWrapLines(ctx, cta || '', tw, 2);
    var blockH = 30 + ctaLines.length * 42 + 8 + 30;           // SCAN + CTA + URL
    var y = tileY + (q + 20 - blockH) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = cardFont(22, 700); ctx.fillStyle = CARD.C.sub;
    ctx.fillText('S C A N', tx, y);
    y += 30;
    ctx.font = cardFont(34, 800); ctx.fillStyle = CARD.C.ink;
    for (var i = 0; i < ctaLines.length; i++) { ctx.fillText(ctaLines[i], tx, y); y += 42; }
    y += 8;
    ctx.font = cardFont(26, 500); ctx.fillStyle = CARD.C.brown;
    var shown = String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillText(storyWrapLines(ctx, shown, tw, 1)[0] || '', tx, y);
}

// ── 벡터 아이콘 (캔버스 안 이모지 금지 — 앱 캔버스에서 □로 깨진다) ──
function cardStroke(ctx, c, lw) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
function cardVolley(ctx, cx, cy, r, c) {
    cardStroke(ctx, c, r * 0.14);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 1.1, -0.5, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 0.5, cy + r * 0.6, r * 1.1, 3.3, 4.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy + r * 0.7, r * 1.1, 1.5, 2.6); ctx.stroke();
}
function cardIcoCal(ctx, x, y, s, c) {
    cardStroke(ctx, c, s * 0.08);
    storyRoundRect(ctx, x + s * 0.1, y + s * 0.16, s * 0.8, s * 0.72, s * 0.13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.1, y + s * 0.36); ctx.lineTo(x + s * 0.9, y + s * 0.36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.32, y + s * 0.06); ctx.lineTo(x + s * 0.32, y + s * 0.24);
    ctx.moveTo(x + s * 0.68, y + s * 0.06); ctx.lineTo(x + s * 0.68, y + s * 0.24); ctx.stroke();
}
function cardIcoWon(ctx, x, y, s, c) {
    cardStroke(ctx, c, s * 0.08);
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2); ctx.stroke();
    // ₩ 를 선으로: W 한 획 + 가로줄 둘 (글꼴에 기대지 않는다)
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y + s * 0.32); ctx.lineTo(x + s * 0.39, y + s * 0.68);
    ctx.lineTo(x + s * 0.5, y + s * 0.42); ctx.lineTo(x + s * 0.61, y + s * 0.68);
    ctx.lineTo(x + s * 0.7, y + s * 0.32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.28, y + s * 0.47); ctx.lineTo(x + s * 0.72, y + s * 0.47); ctx.stroke();
}
function cardIcoPin(ctx, x, y, s, c) {
    cardStroke(ctx, c, s * 0.08);
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.4, s * 0.28, Math.PI * 0.85, Math.PI * 0.15, false);
    ctx.lineTo(x + s / 2, y + s * 0.9); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.4, s * 0.11, 0, Math.PI * 2); ctx.stroke();
}
function cardIcoSub(ctx, x, y, s, c) {
    cardStroke(ctx, c, s * 0.08);
    storyRoundRect(ctx, x + s * 0.18, y + s * 0.12, s * 0.64, s * 0.6, s * 0.16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.44); ctx.lineTo(x + s * 0.82, y + s * 0.44); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + s * 0.34, y + s * 0.58, s * 0.05, 0, Math.PI * 2);
    ctx.arc(x + s * 0.66, y + s * 0.58, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.74); ctx.lineTo(x + s * 0.22, y + s * 0.9);
    ctx.moveTo(x + s * 0.7, y + s * 0.74); ctx.lineTo(x + s * 0.78, y + s * 0.9); ctx.stroke();
}
function cardCheckBadge(ctx, cx, cy, r) {
    ctx.fillStyle = CARD.C.teal; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    cardStroke(ctx, '#fff', r * 0.23);
    ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy); ctx.lineTo(cx - r * 0.13, cy + r * 0.36); ctx.lineTo(cx + r * 0.5, cy - r * 0.36); ctx.stroke();
}

// my-card.js 가 쓰는 키트
window.cardFormat = cardFormat;
window.cardFont = cardFont;
window.cardStubTop = cardStubTop;
window.cardShadow = cardShadow;
window.cardNoShadow = cardNoShadow;
window.cardBackground = cardBackground;
window.cardPill = cardPill;
window.cardHeader = cardHeader;
window.cardStub = cardStub;
window.cardVolley = cardVolley;

// ── 팀·픽업 카드 ───────────────────────────────────────────────────────────
// 구조: 전폭 지도(히어로, 탄력) / 정보 카드(지도 아랫단을 덮음) / 티켓 스텁(QR).
// 지도가 남는 세로를 흡수한다 — 고정 좌표로 두면 짧은 팀은 아래가 비고, 긴 픽업은
// 정보 카드가 QR을 덮었다(2026-09 이전 카드의 실제 버그).
// 지도 최소 높이(맨 위 ~ 정보 카드 윗단): 머리글 + 핀이 들어갈 자리.
var SPOT_MAP_MIN = { story: 640, feed: 440 };
// 정보가 넘치면 이 순서로 줄 수를 줄인다. QR을 덮는 것보다 말줄임이 낫다.
var SPOT_BUDGETS = [
    { title: 2, week: 2, row: 2, chips: 3 },
    { title: 2, week: 1, row: 1, chips: 2 },
    { title: 1, week: 1, row: 1, chips: 1 }
];
var SPOT_INFO = { pad: 48, titleFs: 60, titleLh: 70, chipH: 52, chipFs: 28, chipPad: 22, chipGap: 12, rowIcon: 36, rowFs: 32, rowLh: 44, rowGap: 14 };

// 정보 카드 내용 측정 → { h, title, chips, week, rows }. 그리기와 같은 값을 쓴다.
function spotMeasureInfo(ctx, data, budget) {
    var S = SPOT_INFO, iw = CARD.W - CARD.M * 2 - S.pad * 2;
    ctx.font = cardFont(S.titleFs, 800);
    var title = storyWrapLines(ctx, data.title || (window.t ? window.t('sh_club_fallback') : ''), iw - (data.verified ? 60 : 0), budget.title);
    var h = title.length * S.titleLh;

    ctx.font = cardFont(S.chipFs, 700);
    var chips = [], cx = 0, row = 0, tags = data.tags || [];
    for (var i = 0; i < tags.length; i++) {
        var w = Math.min(iw, ctx.measureText(tags[i].t).width + S.chipPad * 2);
        if (cx + w > iw && cx > 0) { row++; cx = 0; }
        if (row >= budget.chips) { row = budget.chips - 1; break; }   // 넘치는 칩은 뺀다
        chips.push({ tag: tags[i], x: cx, row: row, w: w });
        cx += w + S.chipGap;
    }
    var chipRows = chips.length ? row + 1 : 0;
    if (chipRows) h += 20 + chipRows * S.chipH + (chipRows - 1) * S.chipGap;

    var week = null;
    if (data.thisWeek) {
        ctx.font = cardFont(30, 700);
        week = { badge: data.thisWeekBadge || (window.t ? window.t('pk_thisweek_badge') : '이번주'), lines: storyWrapLines(ctx, data.thisWeek, iw - 40, budget.week) };
        week.h = 20 + 40 + 12 + week.lines.length * 40 + 20;
        h += 24 + week.h;
    }

    var defs = [['cal', data.schedule], ['won', data.fee], ['pin', data.venue ? data.venue + (data.address ? ' · ' + data.address : '') : data.address]];
    var rows = [];
    ctx.font = cardFont(S.rowFs, 500);
    for (var k = 0; k < defs.length; k++) {
        if (!defs[k][1]) continue;
        var ln = storyWrapLines(ctx, defs[k][1], iw - S.rowIcon - 20, budget.row);
        rows.push({ icon: defs[k][0], lines: ln, h: Math.max(S.rowIcon, ln.length * S.rowLh) });
    }
    if (rows.length) {
        h += 24;
        for (var r = 0; r < rows.length; r++) h += rows[r].h + (r ? S.rowGap : 0);
    }
    return { h: h + S.pad * 2, title: title, chips: chips, chipRows: chipRows, week: week, rows: rows, iw: iw };
}

// 배치 계산(그리기와 분리 — 테스트가 좌표로 겹침을 검증한다).
function spotLayout(ctx, data, format) {
    var fmt = cardFormat(format), key = format === 'feed' ? 'feed' : 'story';
    var stubTop = cardStubTop(fmt);
    var cardBot = stubTop - CARD.GAP;
    var info = null, cardY = 0;
    for (var b = 0; b < SPOT_BUDGETS.length; b++) {
        info = spotMeasureInfo(ctx, data, SPOT_BUDGETS[b]);
        cardY = cardBot - info.h;
        if (cardY >= SPOT_MAP_MIN[key] - CARD.OVERLAP) break;
    }
    // 가장 빠듯한 예산으로도 모자라면 지도를 더 줄인다 — QR을 덮지 않는 게 먼저다.
    // 머리글 아래 핀 자리(120)는 남긴다.
    cardY = Math.max(cardY, fmt.top + CARD.HEADER_H + 120);
    return {
        fmt: fmt, headerY: fmt.top, stubTop: stubTop, info: info,
        map: { x: 0, y: 0, w: CARD.W, h: cardY + CARD.OVERLAP },
        card: { x: CARD.M, y: cardY, w: CARD.W - CARD.M * 2, h: info.h }
    };
}
window.spotCardLayout = function (data, format) {
    var c = document.createElement('canvas');
    return spotLayout(c.getContext('2d'), data, format);
};

// 전폭 일러스트 지도. 좌표로 시드를 잡아 장소마다 고유하고 안정적이다.
// 요소는 560 높이 기준 비율로 그리고, 더 크면 한 벌을 아래로 이어 붙인다(지도가 비지 않게).
function spotDrawMap(ctx, m, L, data, station, accent) {
    var W = m.w, H = m.h;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = '#F7EDD6'; ctx.fillRect(0, 0, W, H);
    var seed = Math.floor(Math.abs((Math.round((data.lat || 37.55) * 1e4) * 73856093) ^ (Math.round((data.lng || 126.98) * 1e4) * 19349663))) % 2147483647 || 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var TILE = 560;
    for (var ty = 0; ty < H; ty += TILE) {
        var flip = (ty / TILE) % 2 === 1;
        var ox = flip ? W * 0.18 : 0;
        ctx.fillStyle = '#DBE4BF'; ctx.beginPath(); ctx.ellipse((W * 0.78 + ox) % W, ty + TILE * 0.3, 170, 130, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#C3D29A';
        for (var t = 0; t < 4; t++) { ctx.beginPath(); ctx.arc((W * 0.72 + ox) % W + t * 34, ty + TILE * 0.24 + (t % 2) * 30, 11, 0, Math.PI * 2); ctx.fill(); }
        var blocks = [[0.06, 0.12, 130, 92], [0.28, 0.08, 104, 82], [0.08, 0.42, 112, 74], [0.3, 0.46, 118, 88], [0.55, 0.12, 92, 80], [0.56, 0.52, 104, 74], [0.82, 0.64, 118, 84], [0.14, 0.74, 98, 70], [0.66, 0.84, 110, 76]];
        for (var i = 0; i < blocks.length; i++) {
            var bl = blocks[i]; ctx.fillStyle = rnd() > 0.5 ? '#ECDFBB' : '#E6D6AC';
            storyRoundRect(ctx, (W * bl[0] + ox) % W + (rnd() - 0.5) * 24, ty + TILE * bl[1] + (rnd() - 0.5) * 18, bl[2], bl[3], 10); ctx.fill();
        }
    }
    // 물길: 지도 아랫단(정보 카드 뒤)으로 흘러 나간다
    ctx.fillStyle = '#D7E6E4'; ctx.beginPath();
    ctx.moveTo(0, H * 0.78); ctx.bezierCurveTo(W * 0.28, H * 0.7, W * 0.34, H * 0.92, W * 0.62, H * 0.88);
    ctx.lineTo(W * 0.62, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    var roadY = H * 0.55;
    function road() { ctx.beginPath(); ctx.moveTo(-20, roadY + 40); ctx.bezierCurveTo(W * 0.35, roadY - 30, W * 0.5, roadY + 70, W + 20, roadY - 20); ctx.stroke(); }
    cardStroke(ctx, '#FDF8EC', 32); road();
    ctx.beginPath(); ctx.moveTo(W * 0.42, -20); ctx.bezierCurveTo(W * 0.47, H * 0.4, W * 0.38, H * 0.6, W * 0.44, H + 20); ctx.stroke();
    ctx.save(); cardStroke(ctx, '#E8CF94', 4); ctx.setLineDash([16, 18]); road(); ctx.restore();
    // 아랫단을 크림으로 살짝 녹여 정보 카드와 이어지게
    var fade = ctx.createLinearGradient(0, H - 200, 0, H);
    fade.addColorStop(0, 'rgba(251,243,226,0)'); fade.addColorStop(1, 'rgba(251,243,226,1)');
    ctx.fillStyle = fade; ctx.fillRect(0, H - 200, W, 200);
    ctx.restore();

    // 핀: 머리글 아래 ~ 정보 카드 윗단 사이 가운데. 아래 알약(가까운 역·장소)은 자리가 날 때만.
    var visTop = L.headerY + CARD.HEADER_H, visBot = L.card.y;
    var geo = station && station.name
        ? station.name + (station.distance ? ' · ' + station.distance + 'm · 도보 ' + Math.max(1, Math.round(station.distance / 67)) + '분' : '')
        : (data.venue || '');
    var geoH = geo && visBot - visTop > 360 ? 56 + 28 : 0;
    var px = W / 2, py = visTop + (visBot - visTop - geoH) / 2 - 20, pr = 52;
    ctx.fillStyle = 'rgba(93,64,55,0.14)'; ctx.beginPath(); ctx.ellipse(px, py + 82, 40, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); cardShadow(ctx, false); ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(px - 30, py + 14); ctx.lineTo(px + 30, py + 14); ctx.lineTo(px, py + 80); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 34, 0, Math.PI * 2); ctx.fill();
    cardVolley(ctx, px, py, 22, accent);
    if (geoH) {
        ctx.font = cardFont(28, 700);
        var gw = Math.min(W - CARD.M * 2, ctx.measureText(geo).width + 80), gx = (W - gw) / 2, gy = visBot - 28 - 56;
        cardPill(ctx, gx, gy, gw, 56);
        (station && station.name ? cardIcoSub : cardIcoPin)(ctx, gx + 20, gy + 13, 30, accent);
        ctx.fillStyle = CARD.C.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(storyWrapLines(ctx, geo, gw - 80, 1)[0] || '', gx + 60, gy + 29); ctx.textBaseline = 'top';
    }
}

function spotDrawInfo(ctx, r, info, data) {
    var S = SPOT_INFO, ix = r.x + S.pad, iw = info.iw, INK = CARD.C.ink;
    storyRoundRect(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fillStyle = CARD.C.card; cardShadow(ctx, false); ctx.fill(); cardNoShadow(ctx);
    var y = r.y + S.pad;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = cardFont(S.titleFs, 800); ctx.fillStyle = INK;
    for (var i = 0; i < info.title.length; i++) {
        ctx.fillText(info.title[i], ix, y + 2);
        if (i === 0 && data.verified) cardCheckBadge(ctx, ix + ctx.measureText(info.title[0]).width + 34, y + S.titleLh / 2, 22);
        y += S.titleLh;
    }
    if (info.chipRows) {
        y += 20;
        ctx.font = cardFont(S.chipFs, 700); ctx.textBaseline = 'middle';
        for (var c = 0; c < info.chips.length; c++) {
            var ch = info.chips[c], cx = ix + ch.x, cy = y + ch.row * (S.chipH + S.chipGap);
            ctx.fillStyle = ch.tag.bg || '#F4ECDB'; storyRoundRect(ctx, cx, cy, ch.w, S.chipH, S.chipH / 2); ctx.fill();
            ctx.fillStyle = ch.tag.fg || CARD.C.brown;
            ctx.fillText(storyWrapLines(ctx, ch.tag.t, ch.w - S.chipPad * 2, 1)[0] || '', cx + S.chipPad, cy + S.chipH / 2 + 1);
        }
        ctx.textBaseline = 'top';
        y += info.chipRows * S.chipH + (info.chipRows - 1) * S.chipGap;
    }
    if (info.week) {
        y += 24;
        var wk = info.week;
        ctx.fillStyle = 'rgba(250,199,16,0.22)'; storyRoundRect(ctx, ix, y, iw, wk.h, 18); ctx.fill();
        ctx.font = cardFont(24, 800); var bw = ctx.measureText(wk.badge).width + 32;
        ctx.fillStyle = CARD.C.yellow; storyRoundRect(ctx, ix + 20, y + 20, bw, 40, 20); ctx.fill();
        ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.fillText(wk.badge, ix + 36, y + 41); ctx.textBaseline = 'top';
        ctx.font = cardFont(30, 700);
        for (var w = 0; w < wk.lines.length; w++) ctx.fillText(wk.lines[w], ix + 20, y + 72 + w * 40);
        y += wk.h;
    }
    if (info.rows.length) {
        y += 24;
        for (var k = 0; k < info.rows.length; k++) {
            var row = info.rows[k];
            if (k) y += S.rowGap;
            var ico = row.icon === 'cal' ? cardIcoCal : (row.icon === 'won' ? cardIcoWon : cardIcoPin);
            ico(ctx, ix, y + (S.rowLh - S.rowIcon) / 2, S.rowIcon, CARD.C.brown);
            ctx.font = cardFont(S.rowFs, 500); ctx.fillStyle = CARD.C.dark; ctx.textBaseline = 'middle';
            for (var l = 0; l < row.lines.length; l++) ctx.fillText(row.lines[l], ix + S.rowIcon + 20, y + S.rowLh / 2 + l * S.rowLh);
            ctx.textBaseline = 'top';
            y += row.h;
        }
    }
}

// 정규화된 data로 팀·픽업 카드 생성 (Promise<dataURL>). format: 'story'(9:16, 기본) | 'feed'(3:4).
// data: { title, url, lat, lng, verified, accent, tags:[{t,bg,fg}], thisWeek, thisWeekBadge,
//         schedule, fee, venue, address }
window.generateStoryCard = function (data, format) {
    var fmt = cardFormat(format);
    var canvas = document.createElement('canvas');
    canvas.width = CARD.W; canvas.height = fmt.h;
    var ctx = canvas.getContext('2d');
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fontsReady.catch(function () { }).then(function () {
        return Promise.all([
            storyLoadImage('./nulloongzido logo_512px.png'),
            storyFindNearestStation(data.lat, data.lng)
        ]);
    }).then(function (res) {
        var L = spotLayout(ctx, data, format);
        cardBackground(ctx, fmt.h);
        spotDrawMap(ctx, L.map, L, data, res[1], data.accent || CARD.C.teal);
        cardHeader(ctx, L.headerY, res[0], storyRegion(data.address));
        spotDrawInfo(ctx, L.card, L.info, data);
        cardStub(ctx, fmt, data.url, window.t ? window.t('sh_card_cta') : '');
        ctx.textBaseline = 'alphabetic';
        return canvas.toDataURL('image/png');
    });
};

// 픽업 스팟 → 카드 data 정규화. 칩 문구의 이모지는 뺀다(캔버스 규칙).
function storyStripEmoji(s) {
    return String(s == null ? '' : s).replace(/(?:[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}|\u{200D})/gu, '').replace(/\s{2,}/g, ' ').trim();
}
window.storyStripEmoji = storyStripEmoji;

function storySpotData(spot) {
    var tags = [];
    if (window.pkSportLabel) tags.push({ t: storyStripEmoji(window.pkSportLabel(spot.sport)), bg: '#fac710', fg: '#4e342e' });
    if (window.pkLevelLabel) tags.push({ t: storyStripEmoji(window.pkLevelLabel(spot.level)), bg: '#f0ece2', fg: '#6d6258' });
    if (spot.beginner_friendly && window.t) tags.push({ t: storyStripEmoji(window.t('pk_beginner_ok')), bg: '#e7f6e7', fg: '#2e7d32' });
    if (spot.english_ok && window.t) tags.push({ t: storyStripEmoji(window.t('pk_english_ok')), bg: '#e6f0fb', fg: '#1565c0' });
    return {
        title: spot.title, url: window.buildSpotShareUrl(spot.id),
        lat: spot.lat, lng: spot.lng, accent: '#13a89e',
        tags: tags, thisWeek: spot.this_week,
        schedule: spot.schedule || spot.schedule_text, fee: spot.fee_info,
        venue: spot.venue_name, address: spot.address
    };
}

// 동호회 → 카드 data 정규화
function storyClubData(club) {
    var tags = [];
    var tgt = (club.target || '').split(/[,\s]+/).filter(function (x) { return x; });
    for (var i = 0; i < tgt.length && i < 4; i++) tags.push({ t: tgt[i], bg: '#f0ece2', fg: '#6d6258' });
    return {
        title: club.name, url: window.buildClubShareUrl(club.id),
        lat: club.lat, lng: club.lng, accent: '#fac710',
        verified: !!club.is_verified, tags: tags,
        schedule: club.schedule, fee: club.price,
        venue: '', address: club.address
    };
}

window.generateSpotStoryCard = function (spot, format) { return window.generateStoryCard(storySpotData(spot), format); };
window.generateClubStoryCard = function (club, format) { return window.generateStoryCard(storyClubData(club), format); };

// 카드 미리보기 오버레이(브라우저 폴백) — 기존 previewOverlay/저장 버튼 재사용.
function showStoryCardPreview(dataUrl) {
    var previewBox = document.getElementById('previewImgBox');
    var overlay = document.getElementById('previewOverlay');
    if (!previewBox || !overlay) {  // 오버레이가 없으면 바로 다운로드
        var a = document.createElement('a');
        a.href = dataUrl; a.download = 'nulloong_story.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        return;
    }
    previewBox.innerHTML = '';
    var img = document.createElement('img');
    img.src = dataUrl;
    previewBox.appendChild(img);
    var prof = document.getElementById('profileOverlay');
    if (prof) prof.style.display = 'none';
    overlay.style.display = 'flex';
}

// 공통: 카드 PNG를 셸이면 네이티브 IG 스토리로, 아니면 미리보기로. method 문자열 반환.
// 웹↔Flutter 계약 JSON: { type:'ig_story', stickerImage:'data:image/png;base64,…',
//   contentUrl:'…?spot=ID 또는 ?club=ID', topColor:'#fff8e1', bottomColor:'#fac710' }
function shareStory(dataUrl, contentUrl, idObj) {
    var bridge = window.NativeShare && typeof window.NativeShare.postMessage === 'function';
    var method = bridge ? 'ig_story' : 'story_card';
    if (bridge) {
        window.NativeShare.postMessage(JSON.stringify({
            type: 'ig_story', stickerImage: dataUrl, contentUrl: contentUrl,
            topColor: '#fff8e1', bottomColor: '#fac710'
        }));
    } else {
        showStoryCardPreview(dataUrl);
    }
    if (window.track) {
        var p = { method: method };
        for (var kk in idObj) { if (Object.prototype.hasOwnProperty.call(idObj, kk)) p[kk] = idObj[kk]; }
        window.track('share', p);
    }
    return method;
}

// 픽업 스팟을 인스타 스토리로 공유. 셸이면 네이티브 IG, 아니면 카드 미리보기 폴백.
window.shareSpotToStory = function (spot) {
    if (!spot || !spot.id) return Promise.resolve();
    return window.generateSpotStoryCard(spot).then(function (dataUrl) {
        return shareStory(dataUrl, window.buildSpotShareUrl(spot.id), { spot_id: spot.id });
    }).catch(function (e) {
        console.error('스토리 카드 공유 실패, 기본 공유로 폴백:', e);
        if (window.sharePickup) window.sharePickup(spot);
        return 'fallback';
    });
};

// 동호회를 인스타 스토리로 공유.
window.shareClubToStory = function (club) {
    if (!club || !club.id) return Promise.resolve();
    return window.generateClubStoryCard(club).then(function (dataUrl) {
        return shareStory(dataUrl, window.buildClubShareUrl(club.id), { club_id: club.id });
    }).catch(function (e) {
        console.error('스토리 카드 공유 실패, 기본 공유로 폴백:', e);
        if (window.shareClub) window.shareClub(club);
        return 'fallback';
    });
};

// 팀·픽업 피드 카드(3:4) → 미리보기(저장 버튼). 셸이든 브라우저든 같은 길 — 피드는 IG 스티커가 아니다.
window.shareFeedCard = function (kind, item) {
    if (!item || !item.id) return Promise.resolve();
    var isClub = kind === 'club';
    var gen = isClub ? window.generateClubStoryCard(item, 'feed') : window.generateSpotStoryCard(item, 'feed');
    return gen.then(function (dataUrl) {
        showStoryCardPreview(dataUrl);
        if (window.track) {
            var p = { method: 'feed_card' };
            p[isClub ? 'club_id' : 'spot_id'] = item.id;
            window.track('share', p);
        }
        return 'feed_card';
    }).catch(function (e) {
        console.error('피드 카드 생성 실패:', e);
        alert(window.t('sh_run_fail') || '');
        return 'fallback';
    });
};

// 링크를 조용히 클립보드에 복사 (IG에서 '링크 스티커'로 붙여넣기 쉽게). alert 없음.
function storyCopyLink(url) {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).catch(function () { try { fallbackCopy(url); } catch (e) { } });
        } else { fallbackCopy(url); }
    } catch (e) { try { fallbackCopy(url); } catch (e2) { } }
}

// 첫 1회 "링크 스티커" 코치 후 스토리 공유.
// IG는 외부 앱이 탭 링크를 자동 삽입하는 걸 막으므로, 올린 사람이 '링크 스티커'를
// 붙이면 보는 사람이 탭 1번에 입장 가능 → 그 마찰을 (링크 자동복사 + 1회 안내)로 최소화.
function startStoryShare(kind, item, url) {
    storyCopyLink(url);
    var go = function () {
        if (kind === 'club') { if (window.shareClubToStory) window.shareClubToStory(item); }
        else { if (window.shareSpotToStory) window.shareSpotToStory(item); }
    };
    var coached = false;
    try { coached = (typeof localStorage !== 'undefined') && localStorage.getItem('nurungji_story_coach'); } catch (e) { }
    if (coached) { go(); return; }
    showStoryCoach(go);
}

function showStoryCoach(onGo) {
    var T = window.t || function (k, f) { return f || k; };
    var ov = document.createElement('div');
    ov.className = 'share-menu-overlay';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var box = document.createElement('div');
    box.className = 'share-menu';
    var h = document.createElement('div'); h.className = 'share-menu-title'; h.textContent = T('sh_coach_title'); box.appendChild(h);
    var steps = document.createElement('div'); steps.className = 'story-coach-steps'; steps.textContent = T('sh_coach_steps'); box.appendChild(steps);
    var go = document.createElement('button'); go.className = 'share-menu-item primary'; go.textContent = T('sh_coach_go');
    go.onclick = function () { try { if (typeof localStorage !== 'undefined') localStorage.setItem('nurungji_story_coach', '1'); } catch (e) { } close(); onGo(); };
    box.appendChild(go);
    var skip = document.createElement('button'); skip.className = 'share-menu-cancel'; skip.textContent = T('sh_menu_cancel'); skip.onclick = close; box.appendChild(skip);
    ov.appendChild(box);
    document.body.appendChild(ov);
}

// 통합 공유 메뉴(바텀 액션시트): 인스타 스토리 / 카카오톡 / 링크복사 / 다른앱.
// kind: 'club' | 'spot', item: 해당 객체.
window.openShareMenu = function (kind, item) {
    if (!item || !item.id) return;
    var T = window.t || function (k, f) { return f || k; };
    var isClub = (kind === 'club');
    var url = isClub ? window.buildClubShareUrl(item.id) : window.buildSpotShareUrl(item.id);

    var overlay = document.createElement('div');
    overlay.className = 'share-menu-overlay';
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var menu = document.createElement('div');
    menu.className = 'share-menu';
    var title = document.createElement('div');
    title.className = 'share-menu-title';
    title.textContent = T('sh_menu_title');
    menu.appendChild(title);

    function addItem(label, primary, fn) {
        var b = document.createElement('button');
        b.className = 'share-menu-item' + (primary ? ' primary' : '');
        b.textContent = label;
        b.onclick = function () { close(); fn(); };
        menu.appendChild(b);
    }
    // 📸 인스타 스토리 (헤드라인) + 링크스티커 힌트
    var storyBtn = document.createElement('button');
    storyBtn.className = 'share-menu-item primary';
    var sLabel = document.createElement('div'); sLabel.textContent = T('sh_menu_story'); storyBtn.appendChild(sLabel);
    var sHint = document.createElement('div'); sHint.className = 'share-menu-hint'; sHint.textContent = T('sh_menu_story_hint'); storyBtn.appendChild(sHint);
    storyBtn.onclick = function () { close(); startStoryShare(kind, item, url); };
    menu.appendChild(storyBtn);
    // 🖼 피드 이미지 (3:4) — 인스타 피드·카톡에 이미지로 올리는 용도. 미리보기에서 저장.
    addItem(T('sh_menu_feed'), false, function () {
        window.shareFeedCard(kind, item);
    });
    // 💬 카카오톡 (기존 카카오 우선 폴백 체인)
    addItem(T('sh_menu_kakao'), false, function () {
        if (isClub) { if (window.shareClub) window.shareClub(item); }
        else { if (window.sharePickup) window.sharePickup(item); }
    });
    // 🔗 링크 복사
    addItem(T('sh_menu_copy'), false, function () {
        copyShareLink(url);
        if (window.track) window.track('share', { method: 'copy', kind: kind });
    });
    // 📤 다른 앱(DM 등) — OS 공유시트
    if (navigator.share) {
        addItem(T('sh_menu_more'), false, function () {
            navigator.share({ url: url, title: item.title || item.name || T('brand') }).catch(function () { });
            if (window.track) window.track('share', { method: 'os_sheet', kind: kind });
        });
    }
    var cancel = document.createElement('button');
    cancel.className = 'share-menu-cancel';
    cancel.textContent = T('sh_menu_cancel');
    cancel.onclick = close;
    menu.appendChild(cancel);

    overlay.appendChild(menu);
    document.body.appendChild(overlay);
};
