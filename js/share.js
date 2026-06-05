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
