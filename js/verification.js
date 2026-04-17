// verification.js
// 인증 신청 플로우: 등록한 팀의 소유자가 사진을 제출하여 인증 요청
// Depends on: firebase-init.js, auth.js

window.openVerificationModal = function (club) {
    var overlay = document.getElementById('verifyModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'verifyModalOverlay';
        overlay.className = 'reg-modal-overlay';
        overlay.innerHTML =
            '<div class="reg-modal-content">' +
                '<div class="reg-modal-header">' +
                    '<h3>인증 신청</h3>' +
                    '<span class="reg-modal-close" onclick="window.closeVerificationModal()">&times;</span>' +
                '</div>' +
                '<div class="reg-modal-body">' +
                    '<div style="background:rgba(255,193,7,0.1);border-left:3px solid #ffc107;padding:10px 15px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.4;border-radius:4px;">' +
                        '팀 단체사진 또는 대회 참가 사진을 첨부해주세요.<br>관리자 확인 후 인증 배지가 부여됩니다.' +
                    '</div>' +
                    '<div class="reg-form-group">' +
                        '<label>인증 사진 (필수)</label>' +
                        '<input type="file" id="verifyPhoto" accept="image/*" style="width:100%;padding:10px;background:rgba(255,255,255,0.7);border-radius:10px;border:1px solid #e0e0e0;font-size:14px;">' +
                    '</div>' +
                    '<button id="verifySubmitBtn" class="reg-submit-btn">인증 신청하기</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';
    var photoInput = document.getElementById('verifyPhoto');
    if (photoInput) photoInput.value = '';

    document.getElementById('verifySubmitBtn').onclick = function () {
        window.submitVerificationRequest(club);
    };
};

window.closeVerificationModal = function () {
    var overlay = document.getElementById('verifyModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

window.submitVerificationRequest = async function (club) {
    var photoInput = document.getElementById('verifyPhoto');
    var photoFile = photoInput.files[0];
    if (!photoFile) {
        alert('인증 사진을 첨부해주세요.');
        return;
    }

    var btn = document.getElementById('verifySubmitBtn');
    btn.innerText = '처리중...';
    btn.disabled = true;

    try {
        // 1. Firebase Storage에 사진 업로드
        var photoRef = window.firebaseRef(
            window.firebaseStorage,
            'verification_photos/' + club.id + '_' + Date.now() + '_' + photoFile.name
        );
        var snapshot = await window.firebaseUploadBytes(photoRef, photoFile);
        var photo_url = await snapshot.ref.getDownloadURL();

        // 2. Firestore에 인증 요청 문서 생성
        var requestData = {
            club_id: club.id,
            club_name: club.name,
            photo_url: photo_url,
            requested_by: window.currentUser.uid,
            requested_at: window.firebaseServerTimestamp(),
            status: 'pending',
            reviewed_at: null
        };

        var collRef = window.firebaseCollection(window.firebaseDB, 'verification_requests');
        var docRef = await window.firebaseAddDoc(collRef, requestData);

        // 3. 카카오톡 웹훅 호출 (Cloud Function URL - Phase C에서 설정)
        if (window.VERIFICATION_WEBHOOK_URL) {
            try {
                await fetch(window.VERIFICATION_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        request_id: docRef.id,
                        club_id: club.id,
                        club_name: club.name,
                        photo_url: photo_url
                    })
                });
            } catch (webhookErr) {
                console.warn('웹훅 알림 실패 (인증 요청은 저장됨):', webhookErr.message);
            }
        }

        alert('인증 신청이 완료되었습니다!\n관리자 확인 후 인증 배지가 부여됩니다.');
        window.closeVerificationModal();

    } catch (error) {
        console.error('인증 신청 오류:', error);
        alert('인증 신청 중 오류가 발생했습니다: ' + error.message);
    } finally {
        btn.innerText = '인증 신청하기';
        btn.disabled = false;
    }
};
