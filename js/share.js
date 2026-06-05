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

// 픽업 스팟 → 9:16 PNG dataURL (Promise). 로고/폰트 로드가 비동기라 Promise 반환.
window.generateSpotStoryCard = function (spot) {
    var W = window.STORY_CARD_W, H = window.STORY_CARD_H;
    var FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
    var DARK = '#4e342e', BROWN = '#8d6e63', YELLOW = '#fac710', BG = '#fff8e1';
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fontsReady.catch(function () { }).then(function () {
        return storyLoadImage('./nulloongzido logo_512px.png');
    }).then(function (logo) {
        // ── 배경(따뜻한 누룽지 그라데이션 + 은은한 점 패턴) ──
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#fffdf3'); g.addColorStop(0.55, BG); g.addColorStop(1, '#ffe9ad');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(250,199,16,0.10)';
        for (var py = 70; py < 250; py += 54) {
            for (var px = 70; px < W; px += 54) { ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); }
        }

        var pad = 80;
        // ── 상단 브랜드(로고 + 워드마크) ──
        var brand = window.t ? window.t('brand') : '누룽지도';
        ctx.font = '900 60px ' + FONT;
        var brandW = ctx.measureText(brand).width;
        var logoSize = 96, gap = 28;
        var gx = (W - ((logo ? logoSize + gap : 0) + brandW)) / 2, gy = 116;
        if (logo) {
            ctx.save();
            ctx.beginPath(); ctx.arc(gx + logoSize / 2, gy + logoSize / 2, logoSize / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
            ctx.drawImage(logo, gx, gy, logoSize, logoSize);
            ctx.restore();
            gx += logoSize + gap;
        }
        ctx.fillStyle = DARK; ctx.textBaseline = 'middle';
        ctx.fillText(brand, gx, gy + logoSize / 2 + 2);
        ctx.textBaseline = 'top';

        // ── 본문 카드(흰 패널) ──
        var cardX = pad, cardY = 290, cardW = W - pad * 2, cardH = 1500 - cardY;
        ctx.save();
        ctx.shadowColor = 'rgba(93,64,55,0.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.fillStyle = '#ffffff'; storyRoundRect(ctx, cardX, cardY, cardW, cardH, 48); ctx.fill();
        ctx.restore();

        var ix = cardX + 64, iw = cardW - 128, y = cardY + 76;

        // 제목
        ctx.fillStyle = DARK; ctx.font = '800 78px ' + FONT;
        var titleLines = storyWrapLines(ctx, spot.title || (window.t ? window.t('sh_club_fallback') : ''), iw, 3);
        for (var ti = 0; ti < titleLines.length; ti++) { ctx.fillText(titleLines[ti], ix, y); y += 96; }
        y += 16;

        // 태그 칩(종목·레벨·초보환영·English OK)
        var chips = [];
        if (window.pkSportLabel) chips.push({ t: window.pkSportLabel(spot.sport), bg: YELLOW, fg: DARK });
        if (window.pkLevelLabel) chips.push({ t: window.pkLevelLabel(spot.level), bg: '#f0ece2', fg: '#6d6258' });
        if (spot.beginner_friendly && window.t) chips.push({ t: window.t('pk_beginner_ok'), bg: '#e7f6e7', fg: '#2e7d32' });
        if (spot.english_ok && window.t) chips.push({ t: window.t('pk_english_ok'), bg: '#e6f0fb', fg: '#1565c0' });
        ctx.font = '700 34px ' + FONT;
        var chipH = 60, chipPad = 26, chipGap = 16, cx = ix, cy = y;
        ctx.textBaseline = 'middle';
        for (var k = 0; k < chips.length; k++) {
            var cw = ctx.measureText(chips[k].t).width + chipPad * 2;
            if (cx + cw > ix + iw) { cx = ix; cy += chipH + chipGap; }
            ctx.fillStyle = chips[k].bg; storyRoundRect(ctx, cx, cy, cw, chipH, chipH / 2); ctx.fill();
            ctx.fillStyle = chips[k].fg; ctx.fillText(chips[k].t, cx + chipPad, cy + chipH / 2 + 1);
            cx += cw + chipGap;
        }
        ctx.textBaseline = 'top';
        y = cy + chipH + 38;

        // "이번주" 배너(있으면 강조)
        if (spot.this_week && window.t) {
            ctx.font = '700 36px ' + FONT;
            var twLines = storyWrapLines(ctx, spot.this_week, iw - 48, 2);
            var twBadge = window.t('pk_thisweek_badge');
            var bannerH = 88 + twLines.length * 46 + 20;
            ctx.fillStyle = 'rgba(250,199,16,0.22)'; storyRoundRect(ctx, ix, y, iw, bannerH, 22); ctx.fill();
            ctx.font = '800 30px ' + FONT;
            var badgeW = ctx.measureText(twBadge).width + 36;
            ctx.fillStyle = YELLOW; storyRoundRect(ctx, ix + 24, y + 26, badgeW, 46, 23); ctx.fill();
            ctx.fillStyle = DARK; ctx.textBaseline = 'middle'; ctx.fillText(twBadge, ix + 24 + 18, y + 26 + 24); ctx.textBaseline = 'top';
            ctx.font = '700 36px ' + FONT; ctx.fillStyle = DARK;
            var lineY = y + 88;
            for (var bi = 0; bi < twLines.length; bi++) { ctx.fillText(twLines[bi], ix + 24, lineY); lineY += 46; }
            y += bannerH + 34;
        }

        // 정보 행: 일정 / 게임비 / 장소
        ctx.font = '600 40px ' + FONT;
        function infoRow(icon, text, maxLines) {
            if (!text) return;
            ctx.fillStyle = DARK; ctx.fillText(icon, ix, y);
            var lines = storyWrapLines(ctx, text, iw - 66, maxLines || 2);
            for (var li = 0; li < lines.length; li++) { ctx.fillText(lines[li], ix + 66, y); y += 52; }
            y += 14;
        }
        infoRow('🗓', spot.schedule || spot.schedule_text, 2);
        infoRow('💰', spot.fee_info, 1);
        infoRow('📍', spot.venue_name || spot.address, 2);

        // ── 하단: QR + CTA(탭/스캔하면 누룽지도에서 열림) ──
        var url = window.buildSpotShareUrl(spot.id);
        var footY = 1540, footH = 300, qrSize = 260;
        var qrX = pad, qrY = footY + (footH - qrSize) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#fff'; storyRoundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 24); ctx.fill();
        ctx.restore();
        var haveQR = storyDrawQR(ctx, url, qrX, qrY, qrSize);
        if (!haveQR) {  // QR 라이브러리 미로드 시 자리표시
            ctx.fillStyle = BROWN; ctx.font = '700 28px ' + FONT; ctx.textBaseline = 'middle';
            ctx.fillText(brand, qrX + 8, qrY + qrSize / 2); ctx.textBaseline = 'top';
        }
        var tx = qrX + qrSize + 60, tw = W - pad - tx;
        ctx.fillStyle = DARK; ctx.font = '800 50px ' + FONT;
        var ctaLines = storyWrapLines(ctx, window.t ? window.t('sh_card_cta') : '', tw, 2);
        var cyy = footY + 64;
        for (var cl = 0; cl < ctaLines.length; cl++) { ctx.fillText(ctaLines[cl], tx, cyy); cyy += 58; }
        ctx.fillStyle = BROWN; ctx.font = '600 30px ' + FONT;
        var urlLines = storyWrapLines(ctx, url.replace(/^https?:\/\//, ''), tw, 2);
        cyy += 10;
        for (var ul = 0; ul < urlLines.length; ul++) { ctx.fillText(urlLines[ul], tx, cyy); cyy += 38; }

        ctx.textBaseline = 'alphabetic';
        return canvas.toDataURL('image/png');
    });
};

// 카드 미리보기 오버레이(브라우저 폴백) — 기존 previewOverlay/저장 버튼 재사용.
function showSpotCardPreview(dataUrl) {
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

// 픽업 스팟을 인스타 스토리로 공유. 셸이면 네이티브 IG, 아니면 카드 미리보기 폴백.
// 웹↔Flutter 계약 JSON(양쪽이 맞춰야 함):
//   { type:'ig_story', stickerImage:'data:image/png;base64,…', contentUrl:'…?spot=ID',
//     topColor:'#fff8e1', bottomColor:'#fac710' }
window.shareSpotToStory = function (spot) {
    if (!spot || !spot.id) return Promise.resolve();
    return window.generateSpotStoryCard(spot).then(function (dataUrl) {
        if (window.NativeShare && typeof window.NativeShare.postMessage === 'function') {
            window.NativeShare.postMessage(JSON.stringify({
                type: 'ig_story',
                stickerImage: dataUrl,
                contentUrl: window.buildSpotShareUrl(spot.id),
                topColor: '#fff8e1',
                bottomColor: '#fac710'
            }));
            if (window.track) window.track('share', { method: 'ig_story', spot_id: spot.id });
            return 'ig_story';
        }
        showSpotCardPreview(dataUrl);
        if (window.track) window.track('share', { method: 'story_card', spot_id: spot.id });
        return 'story_card';
    }).catch(function (e) {
        console.error('스토리 카드 공유 실패, 기본 공유로 폴백:', e);
        if (window.sharePickup) window.sharePickup(spot);
        return 'fallback';
    });
};
