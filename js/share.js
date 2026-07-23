// share.js
// 공유 이미지 생성: 네임카드 + 도시락 + 식단표 캡처 → 미리보기 → 다운로드
// Depends on: html2canvas (CDN), lunchbox.js (renderLunchboxGrid, renderCombinedSchedule)
//             window.currentProfileData

window.showShareOptions = function () {
    if (confirm(window.t('sh_pick_shape'))) {
        window.generateShareImage('feed');
    } else {
        window.generateShareImage('story');
    }
};

window.generateShareImage = async function (mode) {
    try {
        // 1. 데이터 준비
        if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }

        if (!window.currentProfileData.tempSlots && window.currentProfileData.bookmarks) {
            window.currentProfileData.tempSlots = window.currentProfileData.bookmarks.slice();
            while (window.currentProfileData.tempSlots.length < 5) window.currentProfileData.tempSlots.push(null);
        }

        window.renderLunchboxGrid();
        window.renderCombinedSchedule();

        // 2. 캡처 무대 설정
        var stage = document.getElementById('captureStage');
        stage.innerHTML = "";
        stage.className = (mode === 'story') ? 'capture-mode-story' : 'capture-mode-feed';

        // 3. 요소 복제 함수
        function cloneAndStripIds(elementId, customClass) {
            var original = document.getElementById(elementId) || document.querySelector(elementId);
            if (!original) return null;

            var clone = original.cloneNode(true);
            clone.classList.add('cloned-element', customClass);

            clone.removeAttribute('id');
            var allDescendants = clone.querySelectorAll('*');
            allDescendants.forEach(function (el) { el.removeAttribute('id'); });

            return clone;
        }

        // [A] 네임카드 복제
        var clonedCard = cloneAndStripIds('#myProfileCard', 'cloned-card');
        var loginSection = clonedCard.querySelector('.login-section');
        if (loginSection) loginSection.remove();

        // [B] 도시락통 복제
        var clonedBox = cloneAndStripIds('.lunchbox-wrapper', 'cloned-box');
        var dietContainer = clonedBox.querySelector('.diet-plan-container');
        if (dietContainer) dietContainer.remove();
        var dietBtn = clonedBox.querySelector('.diet-toggle-btn');
        if (dietBtn) dietBtn.remove();

        // [C] 로고 생성
        var logoBox = document.createElement('div');
        logoBox.className = 'capture-watermark';
        logoBox.innerHTML =
            '<img src="./nulloongzido logo_512px.png" onerror="this.style.display=\'none\'">' +
            '<span>' + window.t('brand') + '</span>';

        // 4. 레이아웃 조립
        if (mode === 'story') {
            stage.appendChild(clonedCard);
            stage.appendChild(clonedBox);
            stage.appendChild(logoBox);
        } else {
            // [피드 모드]
            var leftCol = document.createElement('div');
            leftCol.className = 'feed-left-col';
            leftCol.appendChild(clonedCard);
            leftCol.appendChild(clonedBox);

            var rightCol = document.createElement('div');
            rightCol.className = 'feed-right-col';

            var dietHeader = document.createElement('div');
            dietHeader.className = 'feed-diet-header';
            dietHeader.innerText = window.t('sh_weekly_plan');

            var dietBody = document.createElement('div');
            dietBody.className = 'feed-diet-body';

            // 식단표 내용 복제
            var originalDietBody = document.getElementById('dietPlanBody');

            // 높이 계산 (body-wrapper 내부 기준)
            var originalCol = originalDietBody.querySelector('.diet-body-wrapper .diet-day-col');
            var originalFullHeight = 1;
            if (originalCol && originalCol.style.height) {
                originalFullHeight = parseFloat(originalCol.style.height);
            } else if (originalCol) {
                originalFullHeight = originalCol.scrollHeight;
            }
            if (originalFullHeight < 100) originalFullHeight = 300;

            // HTML 복사
            dietBody.innerHTML = originalDietBody.innerHTML;
            dietBody.querySelectorAll('*').forEach(function (el) { el.removeAttribute('id'); });

            // (1) 위치/높이 보정
            var events = dietBody.querySelectorAll('.diet-event');
            events.forEach(function (el) {
                var oldTop = parseFloat(el.style.top);
                var oldHeight = parseFloat(el.style.height);
                var topPercent = (oldTop / originalFullHeight) * 100;
                var heightPercent = (oldHeight / originalFullHeight) * 100;
                el.style.top = topPercent + '%';
                el.style.height = heightPercent + '%';
            });

            // (2) 이모지 깨짐 방지 세로쓰기 (Array.from 사용)
            // XSS 방지: 각 문자를 escape 후 <br>로 join (사용자 입력 가능성)
            var titles = dietBody.querySelectorAll('.evt-title');
            titles.forEach(function (span) {
                var text = span.innerText.trim();
                var charArray = Array.from(text);
                var verticalText = charArray.map(window.escapeHtml).join('<br>');
                span.innerHTML = verticalText;
            });

            rightCol.appendChild(dietHeader);
            rightCol.appendChild(dietBody);

            stage.appendChild(leftCol);
            stage.appendChild(rightCol);
            stage.appendChild(logoBox);
        }

        // 5. 이미지 생성
        setTimeout(function () {
            html2canvas(stage, {
                scale: 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: false
            }).then(function (canvas) {
                var imgData = canvas.toDataURL("image/png");
                var previewBox = document.getElementById('previewImgBox');
                previewBox.innerHTML = "";
                var img = document.createElement('img');
                img.src = imgData;
                previewBox.appendChild(img);

                document.getElementById('profileOverlay').style.display = 'none';
                document.getElementById('previewOverlay').style.display = 'flex';
                stage.innerHTML = "";
            }).catch(function (err) {
                console.error(err);
                alert(window.t('sh_error') + err);
            });
        }, 500);

    } catch (e) {
        alert(window.t('sh_run_fail') + e.message);
    }
};

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

window.SITE_BASE_URL = 'https://nulloongzi.github.io/null_oongzi-do/';

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
// 인스타 스토리 카드 (9:16 PNG) + 네이티브 브리지 (탭=딥링크)
// ──────────────────────────────────────────────────────────────────────────
// 픽업 스팟을 따뜻한 누룽지 톤 9:16 카드로 그려 인스타 스토리에 공유한다.
//  - 셸(Flutter WebView): window.NativeShare 로 카드 PNG + ?spot= 딥링크를 넘겨
//    네이티브 IG 스토리 공유(스티커 탭 → 딥링크). 계약 JSON은 아래 shareSpotToStory.
//  - 일반 브라우저: 카드 미리보기/저장(QR 포함) 폴백. (탭=링크는 네이티브에서만 가능)
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

// 정규화된 data로 9:16 누룽지 스토리 카드 생성 (Promise<dataURL>).
// C 미감: 따뜻한 누룽지 텍스처 배경 + 일러스트 지도 패널(핀 + 가까운 지하철역) + 정보 카드 + QR.
// data: { title, url, lat, lng, verified, accent, icon, tags:[{t,bg,fg}],
//         thisWeek, thisWeekBadge, schedule, fee, venue, address }
window.generateStoryCard = function (data) {
    var W = window.STORY_CARD_W, H = window.STORY_CARD_H;
    var FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
    var DARK = '#4e342e', BROWN = '#8d6e63', YELLOW = '#fac710';
    var accent = data.accent || '#13a89e';
    var pad = 80;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fontsReady.catch(function () { }).then(function () {
        return Promise.all([
            storyLoadImage('./nulloongzido logo_512px.png'),
            storyFindNearestStation(data.lat, data.lng)
        ]);
    }).then(function (res) {
        var logo = res[0], station = res[1];

        // ===== 리디자인 카드 (에디토리얼 일러스트 지도 + 라인 아이콘) =====
        var INK = '#3d2c22', SUB = '#a99a8c', accentC = accent;
        var brand = window.t ? window.t('brand') : '누룽지도';
        var url = data.url;
        function rr(x, y, w, h, r) { storyRoundRect(ctx, x, y, w, h, r); }
        function sh(a, blur, dy) { ctx.shadowColor = 'rgba(93,64,55,' + a + ')'; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy; }
        function nosh() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
        function strk(c, lw) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
        function icoCal(x, y, s, c) { strk(c, s * 0.08); rr(x + s * 0.1, y + s * 0.16, s * 0.8, s * 0.72, s * 0.13); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.1, y + s * 0.36); ctx.lineTo(x + s * 0.9, y + s * 0.36); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.32, y + s * 0.06); ctx.lineTo(x + s * 0.32, y + s * 0.24); ctx.moveTo(x + s * 0.68, y + s * 0.06); ctx.lineTo(x + s * 0.68, y + s * 0.24); ctx.stroke(); }
        function icoWon(x, y, s, c) { strk(c, s * 0.08); ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.4, 0, 7); ctx.stroke(); ctx.font = '700 ' + (s * 0.5) + 'px ' + FONT; ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('\u20A9', x + s / 2, y + s / 2 + s * 0.03); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; }
        function icoPin(x, y, s, c) { strk(c, s * 0.08); ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.4, s * 0.28, Math.PI * 0.85, Math.PI * 0.15, false); ctx.lineTo(x + s / 2, y + s * 0.9); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.4, s * 0.11, 0, 7); ctx.stroke(); }
        function icoSub(x, y, s, c) { strk(c, s * 0.08); rr(x + s * 0.18, y + s * 0.12, s * 0.64, s * 0.6, s * 0.16); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.44); ctx.lineTo(x + s * 0.82, y + s * 0.44); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + s * 0.34, y + s * 0.58, s * 0.05, 0, 7); ctx.arc(x + s * 0.66, y + s * 0.58, s * 0.05, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.74); ctx.lineTo(x + s * 0.22, y + s * 0.9); ctx.moveTo(x + s * 0.7, y + s * 0.74); ctx.lineTo(x + s * 0.78, y + s * 0.9); ctx.stroke(); }
        function volley(cx, cy, r, c) { strk(c, r * 0.12); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 1.1, -0.5, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + r * 0.5, cy + r * 0.6, r * 1.1, 3.3, 4.4); ctx.stroke(); ctx.beginPath(); ctx.arc(cx - r * 0.4, cy + r * 0.7, r * 1.1, 1.5, 2.6); ctx.stroke(); }

        // 배경: 절제된 크림 + 은은한 웜 비네트
        ctx.fillStyle = '#fbf3e2'; ctx.fillRect(0, 0, W, H);
        var vg = ctx.createRadialGradient(W / 2, H * 0.42, 200, W / 2, H * 0.42, H * 0.7);
        vg.addColorStop(0, 'rgba(255,252,240,0.6)'); vg.addColorStop(1, 'rgba(240,226,196,0.5)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

        // 브랜드 헤더 (로고 타일 + 워드마크)
        ctx.font = '800 50px ' + FONT;
        var wmW = ctx.measureText(brand).width, tile = 64, tgap = 18;
        var total = tile + tgap + wmW, hsx = (W - total) / 2, hty = 118;
        ctx.save(); sh(0.16, 14, 6); ctx.fillStyle = YELLOW; rr(hsx, hty, tile, tile, 18); ctx.fill(); ctx.restore();
        volley(hsx + tile / 2, hty + tile / 2, 20, '#fff');
        ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(brand, hsx + tile + tgap, hty + tile / 2 + 1); ctx.textBaseline = 'top';

        // ===== 히어로: 에디토리얼 일러스트 지도 =====
        var mx = pad, my = 252, mw = W - pad * 2, mh = 560, PANEL_R = 28;
        ctx.save(); sh(0.15, 36, 18); ctx.fillStyle = '#fff'; rr(mx, my, mw, mh, PANEL_R); ctx.fill(); ctx.restore();
        ctx.save(); rr(mx, my, mw, mh, PANEL_R); ctx.clip();
        ctx.fillStyle = '#f7edd6'; ctx.fillRect(mx, my, mw, mh);
        // 실제 좌표로 시드 (장소마다 고유·안정)
        var mseed = Math.floor(Math.abs((Math.round((data.lat || 37.55) * 1e4) * 73856093) ^ (Math.round((data.lng || 126.98) * 1e4) * 19349663))) % 2147483647 || 12345;
        function mr() { mseed = (mseed * 1103515245 + 12345) & 0x7fffffff; return mseed / 0x7fffffff; }
        // 공원 + 나무
        ctx.fillStyle = '#dbe4bf'; ctx.beginPath(); ctx.ellipse(mx + mw * 0.78, my + mh * 0.3, 150, 120, 0.3, 0, 7); ctx.fill();
        ctx.fillStyle = '#c3d29a'; for (var tI = 0; tI < 4; tI++) { ctx.beginPath(); ctx.arc(mx + mw * 0.72 + tI * 34, my + mh * 0.24 + (tI % 2) * 30, 11, 0, 7); ctx.fill(); }
        // 물길
        ctx.fillStyle = '#d7e6e4'; ctx.beginPath();
        ctx.moveTo(mx, my + mh * 0.72); ctx.bezierCurveTo(mx + mw * 0.28, my + mh * 0.64, mx + mw * 0.34, my + mh * 0.9, mx + mw * 0.62, my + mh * 0.86);
        ctx.lineTo(mx + mw * 0.62, my + mh); ctx.lineTo(mx, my + mh); ctx.closePath(); ctx.fill();
        // 구획 블록 (좌표 시드로 약간 변주)
        var blocks = [[0.08, 0.12, 120, 88], [0.3, 0.1, 96, 78], [0.1, 0.4, 104, 70], [0.32, 0.44, 110, 84], [0.55, 0.14, 86, 76], [0.53, 0.5, 96, 70], [0.8, 0.62, 110, 80], [0.16, 0.7, 92, 66]];
        for (var bI = 0; bI < blocks.length; bI++) { var b = blocks[bI]; ctx.fillStyle = mr() > 0.5 ? '#ecdfbb' : '#e6d6ac'; rr(mx + mw * b[0] + (mr() - 0.5) * 20, my + mh * b[1] + (mr() - 0.5) * 16, b[2], b[3], 10); ctx.fill(); }
        // 도로 (곡선 리본) + 점선 센터라인
        strk('#fdf8ec', 30);
        ctx.beginPath(); ctx.moveTo(mx - 20, my + mh * 0.58); ctx.bezierCurveTo(mx + mw * 0.35, my + mh * 0.5, mx + mw * 0.5, my + mh * 0.66, mx + mw + 20, my + mh * 0.52); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx + mw * 0.42, my - 20); ctx.bezierCurveTo(mx + mw * 0.46, my + mh * 0.4, mx + mw * 0.38, my + mh * 0.6, mx + mw * 0.44, my + mh + 20); ctx.stroke();
        ctx.save(); strk('#e8cf94', 4); ctx.setLineDash([16, 18]);
        ctx.beginPath(); ctx.moveTo(mx - 20, my + mh * 0.58); ctx.bezierCurveTo(mx + mw * 0.35, my + mh * 0.5, mx + mw * 0.5, my + mh * 0.66, mx + mw + 20, my + mh * 0.52); ctx.stroke();
        ctx.restore();
        ctx.restore();

        // 지역 pill (상단, 한 번만)
        var region = storyRegion(data.address);
        if (region) {
            ctx.font = '700 27px ' + FONT; var rw = ctx.measureText(region).width + 72;
            ctx.save(); sh(0.12, 8, 4); ctx.fillStyle = '#fff'; rr(mx + (mw - rw) / 2, my + 24, rw, 54, 27); ctx.fill(); ctx.restore();
            icoPin(mx + (mw - rw) / 2 + 18, my + 24 + 13, 28, BROWN);
            ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(region, mx + (mw - rw) / 2 + 52, my + 24 + 28); ctx.textBaseline = 'top';
        }

        // 핀 (중앙, 라인아트 배구공)
        var px = mx + mw / 2, py = my + mh * 0.48, pr = 52;
        ctx.fillStyle = 'rgba(93,64,55,0.14)'; ctx.beginPath(); ctx.ellipse(px, py + 82, 40, 12, 0, 0, 7); ctx.fill();
        ctx.save(); sh(0.22, 16, 8); ctx.fillStyle = accentC;
        ctx.beginPath(); ctx.moveTo(px - 30, py + 14); ctx.lineTo(px + 30, py + 14); ctx.lineTo(px, py + 80); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 34, 0, 7); ctx.fill();
        volley(px, py, 22, accentC);

        // 지오 힌트 pill (하단): 가까운 역 우선 → 장소명
        var stTxt = '', stIsSub = false;
        if (station && station.name) { var walk = station.distance ? Math.max(1, Math.round(station.distance / 67)) : 0; stTxt = station.name + (station.distance ? ' \u00B7 ' + station.distance + 'm \u00B7 \uB3C4\uBCF4 ' + walk + '\uBD84' : ''); stIsSub = true; }
        else if (data.venue) { stTxt = data.venue; }
        if (stTxt) {
            ctx.font = '700 30px ' + FONT; var sw = Math.min(mw - 40, ctx.measureText(stTxt).width + 82);
            var ssx = mx + (mw - sw) / 2, ssy = my + mh - 82;
            ctx.save(); sh(0.16, 10, 5); ctx.fillStyle = '#fff'; rr(ssx, ssy, sw, 60, 30); ctx.fill(); ctx.restore();
            if (stIsSub) icoSub(ssx + 20, ssy + 15, 30, accentC); else icoPin(ssx + 20, ssy + 15, 30, accentC);
            ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(stTxt, ssx + 58, ssy + 31); ctx.textBaseline = 'top';
        }

        // ===== 정보 카드 (콘텐츠 맞춤 높이 + 존 중앙) =====
        var cardX = pad, cardW = W - pad * 2, cpad = 56, ix = cardX + cpad, iw = cardW - cpad * 2;
        ctx.font = '800 64px ' + FONT;
        var titleLines = storyWrapLines(ctx, data.title || (window.t ? window.t('sh_club_fallback') : ''), iw - (data.verified ? 66 : 0), 2);
        var titleH = titleLines.length * 76;
        var chips = data.tags || [];
        var chipH = 54, chipPad = 22, chipGap = 12;
        ctx.font = '600 30px ' + FONT;
        var chipLayout = [], ccx = 0, crow = 0;
        for (var k = 0; k < chips.length; k++) { var cw = ctx.measureText(chips[k].t).width + chipPad * 2; if (ccx + cw > iw && ccx > 0) { crow++; ccx = 0; } chipLayout.push({ t: chips[k], x: ccx, row: crow, w: cw }); ccx += cw + chipGap; }
        var chipRows = chips.length ? crow + 1 : 0;
        var chipsH = chipRows ? (chipRows * chipH + (chipRows - 1) * chipGap + 30) : 0;
        var twLines = null, bannerBodyH = 0, twBadge = '';
        if (data.thisWeek) { ctx.font = '700 32px ' + FONT; twLines = storyWrapLines(ctx, data.thisWeek, iw - 44, 2); twBadge = data.thisWeekBadge || (window.t ? window.t('pk_thisweek_badge') : '이번주'); bannerBodyH = 76 + twLines.length * 42 + 16; }
        var bannerH = twLines ? bannerBodyH + 28 : 0;
        ctx.font = '500 36px ' + FONT;
        var infoDefs = [['cal', data.schedule, 2], ['won', data.fee, 1], ['pin', data.venue ? (data.venue + (data.address ? ' \u00B7 ' + data.address : '')) : data.address, 2]];
        var infoItems = [], infoH = 0;
        for (var q = 0; q < infoDefs.length; q++) { if (!infoDefs[q][1]) continue; var ln = storyWrapLines(ctx, infoDefs[q][1], iw - 62, infoDefs[q][2]); infoItems.push({ icon: infoDefs[q][0], lines: ln }); infoH += Math.max(54, ln.length * 46) + 18; }
        var contentH = titleH + chipsH + bannerH + infoH;
        var cardH = contentH + cpad * 2 - 6;
        var zoneTop = my + mh + 34, zoneBot = 1444;
        var cardY = Math.round(Math.max(zoneTop, Math.min(zoneBot - cardH, zoneTop + (zoneBot - zoneTop - cardH) / 2)));
        ctx.save(); sh(0.15, 40, 20); ctx.fillStyle = '#fffdf8'; rr(cardX, cardY, cardW, cardH, 28); ctx.fill(); ctx.restore();

        var y = cardY + cpad;
        ctx.fillStyle = INK; ctx.font = '800 64px ' + FONT;
        for (var ti = 0; ti < titleLines.length; ti++) {
            ctx.fillText(titleLines[ti], ix, y);
            if (ti === 0 && data.verified) { var tw0 = ctx.measureText(titleLines[0]).width; ctx.fillStyle = '#12a89e'; ctx.beginPath(); ctx.arc(ix + tw0 + 34, y + 34, 22, 0, 7); ctx.fill(); strk('#fff', 5); ctx.beginPath(); ctx.moveTo(ix + tw0 + 24, y + 34); ctx.lineTo(ix + tw0 + 31, y + 42); ctx.lineTo(ix + tw0 + 45, y + 26); ctx.stroke(); ctx.fillStyle = INK; }
            y += 76;
        }
        y += 8;
        if (chipRows) {
            ctx.font = '600 30px ' + FONT; ctx.textBaseline = 'middle';
            for (var ci = 0; ci < chipLayout.length; ci++) { var it = chipLayout[ci], cxx = ix + it.x, cyy = y + it.row * (chipH + chipGap); ctx.fillStyle = it.t.bg || '#f4ecdb'; rr(cxx, cyy, it.w, chipH, chipH / 2); ctx.fill(); ctx.fillStyle = it.t.fg || BROWN; ctx.fillText(it.t.t, cxx + chipPad, cyy + chipH / 2 + 1); }
            ctx.textBaseline = 'top'; y += chipRows * chipH + (chipRows - 1) * chipGap + 30;
        }
        if (twLines) {
            ctx.fillStyle = 'rgba(250,199,16,0.22)'; rr(ix, y, iw, bannerBodyH, 18); ctx.fill();
            ctx.font = '800 27px ' + FONT; var badgeW = ctx.measureText(twBadge).width + 30;
            ctx.fillStyle = YELLOW; rr(ix + 22, y + 20, badgeW, 42, 21); ctx.fill();
            ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.fillText(twBadge, ix + 22 + 15, y + 20 + 22); ctx.textBaseline = 'top';
            ctx.font = '700 32px ' + FONT; var ly = y + 76; for (var bi = 0; bi < twLines.length; bi++) { ctx.fillText(twLines[bi], ix + 22, ly); ly += 42; }
            y += bannerH;
        }
        for (var iiI = 0; iiI < infoItems.length; iiI++) {
            var ic = infoItems[iiI].icon;
            if (ic === 'cal') icoCal(ix, y - 2, 40, BROWN); else if (ic === 'won') icoWon(ix, y - 2, 40, BROWN); else icoPin(ix, y - 2, 40, BROWN);
            ctx.fillStyle = DARK; ctx.font = '500 36px ' + FONT; ctx.textBaseline = 'middle';
            var lines = infoItems[iiI].lines, iy = y + 20;
            for (var li = 0; li < lines.length; li++) { ctx.fillText(lines[li], ix + 62, iy); iy += 46; }
            ctx.textBaseline = 'top'; y += Math.max(54, lines.length * 46) + 18;
        }

        // ===== 푸터: QR + CTA =====
        var footH = 210, qrSize = 190, footY = 1670 - footH, qrX = pad, qrY = footY + (footH - qrSize) / 2;
        ctx.save(); sh(0.14, 16, 8); ctx.fillStyle = '#fff'; rr(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 18); ctx.fill(); ctx.restore();
        var haveQR = storyDrawQR(ctx, url, qrX, qrY, qrSize);
        if (!haveQR) { ctx.fillStyle = BROWN; ctx.font = '700 24px ' + FONT; ctx.textBaseline = 'middle'; ctx.fillText(brand, qrX + 8, qrY + qrSize / 2); ctx.textBaseline = 'top'; }
        var tx = qrX + qrSize + 50;
        ctx.fillStyle = SUB; ctx.font = '700 24px ' + FONT; ctx.fillText('S C A N', tx, footY + 30);
        ctx.fillStyle = INK; ctx.font = '800 42px ' + FONT;
        var ctaLines = storyWrapLines(ctx, window.t ? window.t('sh_card_cta') : '', W - pad - tx, 2);
        var fy = footY + 66;
        for (var cl = 0; cl < ctaLines.length; cl++) { ctx.fillText(ctaLines[cl], tx, fy); fy += 50; }
        ctx.fillStyle = BROWN; ctx.font = '500 27px ' + FONT; fy += 4;
        ctx.fillText(String(url).replace(/^https?:\/\//, '').replace(/\/$/, ''), tx, fy);

        ctx.textBaseline = 'alphabetic';
        return canvas.toDataURL('image/png');
    });
};

// 픽업 스팟 → 카드 data 정규화
function storySpotData(spot) {
    var tags = [];
    if (window.pkSportLabel) tags.push({ t: window.pkSportLabel(spot.sport), bg: '#fac710', fg: '#4e342e' });
    if (window.pkLevelLabel) tags.push({ t: window.pkLevelLabel(spot.level), bg: '#f0ece2', fg: '#6d6258' });
    if (spot.beginner_friendly && window.t) tags.push({ t: window.t('pk_beginner_ok'), bg: '#e7f6e7', fg: '#2e7d32' });
    if (spot.english_ok && window.t) tags.push({ t: window.t('pk_english_ok'), bg: '#e6f0fb', fg: '#1565c0' });
    return {
        title: spot.title, url: window.buildSpotShareUrl(spot.id),
        lat: spot.lat, lng: spot.lng, accent: '#13a89e', icon: '🏐',
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
        lat: club.lat, lng: club.lng, accent: '#fac710', icon: '🏐',
        verified: !!club.is_verified, tags: tags,
        schedule: club.schedule, fee: club.price,
        venue: '', address: club.address
    };
}

window.generateSpotStoryCard = function (spot) { return window.generateStoryCard(storySpotData(spot)); };
window.generateClubStoryCard = function (club) { return window.generateStoryCard(storyClubData(club)); };

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
