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

        // ── 배경: 따뜻한 누룽지 그라데이션 + 누룽지(밥알) 텍스처 ──
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#fff7e3'); g.addColorStop(0.5, '#ffe9b8'); g.addColorStop(1, '#f7d27e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        var seed = 1234567;
        function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
        var specks = ['rgba(216,164,65,0.20)', 'rgba(180,120,50,0.16)', 'rgba(255,255,255,0.22)'];
        for (var sp = 0; sp < 520; sp++) {
            ctx.fillStyle = specks[sp % specks.length];
            ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 1.5 + rnd() * 4, 0, Math.PI * 2); ctx.fill();
        }

        // ── 상단 브랜드 ──
        var brand = window.t ? window.t('brand') : '누룽지도';
        ctx.font = '900 58px ' + FONT;
        var brandW = ctx.measureText(brand).width;
        var logoSize = 92, gap = 26;
        var gx = (W - ((logo ? logoSize + gap : 0) + brandW)) / 2, gy = 96;
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

        // ── 위치 패널: 일러스트 지도 + 핀 + 지하철역 ──
        var mpX = pad, mpY = 250, mpW = W - pad * 2, mpH = 540;
        ctx.save();
        ctx.shadowColor = 'rgba(93,64,55,0.18)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
        ctx.fillStyle = '#fffaf0'; storyRoundRect(ctx, mpX, mpY, mpW, mpH, 44); ctx.fill();
        ctx.restore();
        ctx.save();
        storyRoundRect(ctx, mpX, mpY, mpW, mpH, 44); ctx.clip();
        // 추상 동네 블록(누룽지 톤)
        var bseed = 99; function brnd() { bseed = (bseed * 1103515245 + 12345) & 0x7fffffff; return bseed / 0x7fffffff; }
        for (var bx = mpX + 10; bx < mpX + mpW - 30; bx += 150) {
            for (var by = mpY + 10; by < mpY + mpH - 70; by += 120) {
                ctx.fillStyle = brnd() > 0.5 ? '#f1e3bf' : '#efe6cf';
                storyRoundRect(ctx, bx + brnd() * 18, by + brnd() * 14, 84 + brnd() * 46, 60 + brnd() * 34, 12); ctx.fill();
            }
        }
        // 하천 느낌
        ctx.fillStyle = 'rgba(150,200,220,0.45)';
        ctx.beginPath();
        ctx.moveTo(mpX, mpY + mpH - 60);
        ctx.bezierCurveTo(mpX + mpW * 0.3, mpY + mpH - 100, mpX + mpW * 0.6, mpY + mpH - 20, mpX + mpW, mpY + mpH - 70);
        ctx.lineTo(mpX + mpW, mpY + mpH); ctx.lineTo(mpX, mpY + mpH); ctx.closePath(); ctx.fill();
        ctx.restore();
        // 핀
        var pinX = mpX + mpW / 2, headY = mpY + 178, R = 66;
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.beginPath(); ctx.ellipse(pinX, headY + 104, 46, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.20)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.moveTo(pinX - 36, headY + 22); ctx.lineTo(pinX + 36, headY + 22); ctx.lineTo(pinX, headY + 100); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(pinX, headY, R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pinX, headY, 42, 0, Math.PI * 2); ctx.fill();
        ctx.font = '44px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(data.icon || '🏐', pinX, headY + 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        // 지역(상단 작게) + 지하철역/위치 칩(하단)
        var region = storyRegion(data.address);
        if (region) { ctx.font = '700 26px ' + FONT; ctx.fillStyle = BROWN; ctx.textAlign = 'center'; ctx.fillText('📍 ' + region, pinX, mpY + 34); ctx.textAlign = 'left'; }
        var chipText;
        if (station && station.name) {
            var walk = station.distance ? Math.max(1, Math.round(station.distance / 67)) : 0;
            chipText = '🚇 ' + station.name + (station.distance ? '  ' + station.distance + 'm · 도보 ' + walk + '분' : '');
        } else { chipText = data.venue || region || ''; }
        if (chipText) {
            ctx.font = '800 34px ' + FONT;
            var chW = Math.min(mpW - 60, ctx.measureText(chipText).width + 56), chX = mpX + (mpW - chW) / 2, chY = mpY + mpH - 94;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.14)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#ffffff'; storyRoundRect(ctx, chX, chY, chW, 64, 32); ctx.fill();
            ctx.restore();
            ctx.fillStyle = DARK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(chipText, mpX + mpW / 2, chY + 33);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        }

        // ── 정보 카드 ──
        var cardX = pad, cardY = 830, cardW = W - pad * 2, cardH = 1500 - cardY;
        ctx.save();
        ctx.shadowColor = 'rgba(93,64,55,0.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.fillStyle = '#ffffff'; storyRoundRect(ctx, cardX, cardY, cardW, cardH, 44); ctx.fill();
        ctx.restore();
        var ix = cardX + 60, iw = cardW - 120, y = cardY + 60;

        // 제목 (+ 인증 ✔)
        ctx.fillStyle = DARK; ctx.font = '800 72px ' + FONT;
        var titleLines = storyWrapLines(ctx, data.title || (window.t ? window.t('sh_club_fallback') : ''), iw - (data.verified ? 64 : 0), 2);
        for (var ti = 0; ti < titleLines.length; ti++) {
            ctx.fillText(titleLines[ti], ix, y);
            if (ti === 0 && data.verified) {
                var tw0 = ctx.measureText(titleLines[0]).width;
                ctx.fillStyle = '#1DA1F2'; ctx.font = '700 46px ' + FONT; ctx.fillText('✔', ix + tw0 + 14, y + 10);
                ctx.fillStyle = DARK; ctx.font = '800 72px ' + FONT;
            }
            y += 86;
        }
        y += 10;

        // 칩
        var chips = data.tags || [];
        ctx.font = '700 32px ' + FONT;
        var chipH = 58, chipPad = 24, chipGap = 14, cx = ix, cl0 = y;
        ctx.textBaseline = 'middle';
        for (var k = 0; k < chips.length; k++) {
            var cw = ctx.measureText(chips[k].t).width + chipPad * 2;
            if (cx + cw > ix + iw) { cx = ix; cl0 += chipH + chipGap; }
            ctx.fillStyle = chips[k].bg; storyRoundRect(ctx, cx, cl0, cw, chipH, chipH / 2); ctx.fill();
            ctx.fillStyle = chips[k].fg; ctx.fillText(chips[k].t, cx + chipPad, cl0 + chipH / 2 + 1);
            cx += cw + chipGap;
        }
        ctx.textBaseline = 'top';
        y = cl0 + (chips.length ? chipH + 32 : 0);

        // 이번주 배너
        if (data.thisWeek) {
            ctx.font = '700 34px ' + FONT;
            var twLines = storyWrapLines(ctx, data.thisWeek, iw - 48, 2);
            var twBadge = data.thisWeekBadge || (window.t ? window.t('pk_thisweek_badge') : '이번주');
            var bannerH = 84 + twLines.length * 44 + 18;
            ctx.fillStyle = 'rgba(250,199,16,0.22)'; storyRoundRect(ctx, ix, y, iw, bannerH, 20); ctx.fill();
            ctx.font = '800 28px ' + FONT;
            var badgeW = ctx.measureText(twBadge).width + 32;
            ctx.fillStyle = YELLOW; storyRoundRect(ctx, ix + 22, y + 22, badgeW, 44, 22); ctx.fill();
            ctx.fillStyle = DARK; ctx.textBaseline = 'middle'; ctx.fillText(twBadge, ix + 22 + 16, y + 22 + 23); ctx.textBaseline = 'top';
            ctx.font = '700 34px ' + FONT; ctx.fillStyle = DARK;
            var ly = y + 84;
            for (var bi = 0; bi < twLines.length; bi++) { ctx.fillText(twLines[bi], ix + 22, ly); ly += 44; }
            y += bannerH + 30;
        }

        // 정보 행
        ctx.font = '600 38px ' + FONT;
        function infoRow(icon, text, maxLines) {
            if (!text) return;
            ctx.fillStyle = DARK; ctx.fillText(icon, ix, y);
            var lines = storyWrapLines(ctx, text, iw - 62, maxLines || 2);
            for (var li = 0; li < lines.length; li++) { ctx.fillText(lines[li], ix + 62, y); y += 50; }
            y += 12;
        }
        infoRow('🗓', data.schedule, 2);
        infoRow('💰', data.fee, 1);
        infoRow('📍', data.venue ? (data.venue + (data.address ? ' · ' + data.address : '')) : data.address, 2);

        // ── 푸터: QR + CTA ──
        var url = data.url;
        var footY = 1545, footH = 300, qrSize = 250;
        var qrX = pad, qrY = footY + (footH - qrSize) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#fff'; storyRoundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 24); ctx.fill();
        ctx.restore();
        var haveQR = storyDrawQR(ctx, url, qrX, qrY, qrSize);
        if (!haveQR) { ctx.fillStyle = BROWN; ctx.font = '700 26px ' + FONT; ctx.textBaseline = 'middle'; ctx.fillText(brand, qrX + 8, qrY + qrSize / 2); ctx.textBaseline = 'top'; }
        var tx = qrX + qrSize + 56, twf = W - pad - tx;
        ctx.fillStyle = DARK; ctx.font = '800 48px ' + FONT;
        var ctaLines = storyWrapLines(ctx, window.t ? window.t('sh_card_cta') : '', twf, 2);
        var fy = footY + 60;
        for (var cl = 0; cl < ctaLines.length; cl++) { ctx.fillText(ctaLines[cl], tx, fy); fy += 56; }
        ctx.fillStyle = BROWN; ctx.font = '600 28px ' + FONT;
        var urlLines = storyWrapLines(ctx, String(url).replace(/^https?:\/\//, ''), twf, 2);
        fy += 8;
        for (var ul = 0; ul < urlLines.length; ul++) { ctx.fillText(urlLines[ul], tx, fy); fy += 36; }

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
    // 📸 인스타 스토리 (헤드라인)
    addItem(T('sh_menu_story'), true, function () {
        if (isClub) { if (window.shareClubToStory) window.shareClubToStory(item); }
        else { if (window.shareSpotToStory) window.shareSpotToStory(item); }
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
