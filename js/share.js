// share.js
// 공유 이미지 생성: 네임카드 + 도시락 + 식단표 캡처 → 미리보기 → 다운로드
// Depends on: html2canvas (CDN), lunchbox.js (renderLunchboxGrid, renderCombinedSchedule)
//             window.currentProfileData

window.showShareOptions = function () {
    if (confirm("📸 저장할 모양을 선택해주세요!\n\n[확인] = 🍱 피드용 (네임카드+도시락+식단표)\n[취소] = 📱 스토리용 (네임카드+도시락)")) {
        window.generateShareImage('feed');
    } else {
        window.generateShareImage('story');
    }
};

window.generateShareImage = async function (mode) {
    try {
        // 1. 데이터 준비
        if (!window.currentProfileData) { alert("로그인이 필요합니다."); return; }

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
            '<span>누룽지도</span>';

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
            dietHeader.innerText = "📅 주간 식단표";

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
            var titles = dietBody.querySelectorAll('.evt-title');
            titles.forEach(function (span) {
                var text = span.innerText.trim();
                var charArray = Array.from(text);
                var verticalText = charArray.join('<br>');
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
                alert("오류 발생: " + err);
            });
        }, 500);

    } catch (e) {
        alert("기능 실행 실패: " + e.message);
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
        alert("저장할 이미지가 없습니다.");
    }
};
