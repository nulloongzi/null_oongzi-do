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
                    '<h3>' + window.t('vf_title') + '</h3>' +
                    '<span class="reg-modal-close" onclick="window.closeVerificationModal()">&times;</span>' +
                '</div>' +
                '<div class="reg-modal-body">' +
                    '<div style="background:rgba(255,193,7,0.1);border-left:3px solid #ffc107;padding:10px 15px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.4;border-radius:4px;">' +
                        window.t('vf_desc') +
                    '</div>' +
                    '<div class="reg-form-group">' +
                        '<label>' + window.t('vf_photo_label') + '</label>' +
                        '<input type="file" id="verifyPhoto" accept="image/*" style="width:100%;padding:10px;background:rgba(255,255,255,0.7);border-radius:10px;border:1px solid #e0e0e0;font-size:14px;">' +
                    '</div>' +
                    '<button id="verifySubmitBtn" class="reg-submit-btn">' + window.t('vf_submit') + '</button>' +
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
    if (!window.currentUser) {
        alert(window.t('vf_login_required'));
        return;
    }
    var photoInput = document.getElementById('verifyPhoto');
    var photoFile = photoInput.files[0];
    if (!photoFile) {
        alert(window.t('vf_photo_required'));
        return;
    }

    var btn = document.getElementById('verifySubmitBtn');
    btn.innerText = window.t('processing');
    btn.disabled = true;

    try {
        // 1. Firebase Storage에 사진 업로드
        // 경로: verification_photos/{uid}/{club_id}_{ts}_{safeName}
        // Storage rules가 uid 격리·확장자·사이즈를 검증한다.
        var safeName = window.sanitizeFilename(photoFile.name || 'photo');
        var fileName = club.id + '_' + Date.now() + '_' + safeName;
        var photoRef = window.firebaseRef(
            window.firebaseStorage,
            'verification_photos/' + window.currentUser.uid + '/' + fileName
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
        await window.firebaseAddDoc(collRef, requestData);

        // 카카오톡 알림은 Cloud Functions의 onVerificationCreated 트리거가 자동 발송한다.
        // (기존 무인증 verificationNotify HTTP 엔드포인트는 폐기됨)

        alert(window.t('vf_done'));
        window.closeVerificationModal();

    } catch (error) {
        console.error('인증 신청 오류:', error);
        alert(window.t('vf_error') + error.message);
    } finally {
        btn.innerText = window.t('vf_submit');
        btn.disabled = false;
    }
};

// ══════════════════════════════════════════════════════════
// 팀 관리자 권한 신청
// ══════════════════════════════════════════════════════════
// 구글시트로 접수한 팀들은 등록자가 없어 아무도 정보를 못 고친다. 그 팀의
// 운영자가 스스로 손을 들고, 운영자(사람)가 사진을 보고 승인하는 통로다.
//
// 인증 신청과 흐름이 같아서 코드 모양도 같게 뒀다 — 쓰는 사람도 읽는 사람도
// 새로 배울 게 없다. 다만 **사진이 증명해야 하는 것이 다르다**(i18n ad_desc 참고).

window.openAdminRequestModal = function (club) {
    var overlay = document.getElementById('adminReqModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'adminReqModalOverlay';
        overlay.className = 'reg-modal-overlay';
        overlay.innerHTML =
            '<div class="reg-modal-content">' +
                '<div class="reg-modal-header">' +
                    '<h3>' + window.t('ad_title') + '</h3>' +
                    '<span class="reg-modal-close" onclick="window.closeAdminRequestModal()">&times;</span>' +
                '</div>' +
                '<div class="reg-modal-body">' +
                    '<div style="background:rgba(255,193,7,0.1);border-left:3px solid #ffc107;padding:10px 15px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.5;border-radius:4px;">' +
                        window.t('ad_desc') +
                    '</div>' +
                    '<div class="reg-form-group">' +
                        '<label>' + window.t('ad_photo_label') + '</label>' +
                        '<input type="file" id="adminReqPhoto" accept="image/*" style="width:100%;padding:10px;background:rgba(255,255,255,0.7);border-radius:10px;border:1px solid #e0e0e0;font-size:14px;">' +
                    '</div>' +
                    '<button id="adminReqSubmitBtn" class="reg-submit-btn">' + window.t('ad_submit') + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';
    var photoInput = document.getElementById('adminReqPhoto');
    if (photoInput) photoInput.value = '';

    document.getElementById('adminReqSubmitBtn').onclick = function () {
        window.submitAdminRequest(club);
    };
};

window.closeAdminRequestModal = function () {
    var overlay = document.getElementById('adminReqModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

window.submitAdminRequest = async function (club) {
    if (!window.currentUser || window.currentUser.isAnonymous) {
        alert(window.t('ad_login_required'));
        return;
    }
    var photoInput = document.getElementById('adminReqPhoto');
    var photoFile = photoInput && photoInput.files[0];
    if (!photoFile) {
        alert(window.t('ad_photo_required'));
        return;
    }

    // 정원이 찼으면 사진부터 올리게 두지 않는다 — 올려봐야 거절될 뿐이고,
    // 남의 이름이 찍힌 캡처가 괜히 저장소에 남는다.
    if (window.clubAdminUids(club).length >= window.MAX_CLUB_ADMINS) {
        alert(window.t('ad_full'));
        return;
    }

    var btn = document.getElementById('adminReqSubmitBtn');
    btn.innerText = window.t('processing');
    btn.disabled = true;

    try {
        var safeName = window.sanitizeFilename(photoFile.name || 'photo');
        var fileName = club.id + '_' + Date.now() + '_' + safeName;
        var photoRef = window.firebaseRef(
            window.firebaseStorage,
            'admin_request_photos/' + window.currentUser.uid + '/' + fileName
        );
        var snapshot = await window.firebaseUploadBytes(photoRef, photoFile);
        var photo_url = await snapshot.ref.getDownloadURL();

        // 필드 집합은 firestore.rules 의 화이트리스트와 정확히 같아야 한다.
        await window.firebaseDB.collection('club_admin_requests').add({
            club_id: club.id,
            club_name: (club.name || '').slice(0, 120),
            photo_url: photo_url,
            requested_by: window.currentUser.uid,
            requested_at: window.firebaseServerTimestamp(),
            status: 'pending'
        });

        // 운영자 카톡 알림은 onClubAdminRequestCreated 트리거가 보낸다.
        if (window.track) window.track('club_admin_request', { id: club.id });
        alert(window.t('ad_done'));
        window.closeAdminRequestModal();
    } catch (error) {
        console.error('관리자 신청 오류:', error);
        alert(window.t('ad_error') + error.message);
    } finally {
        btn.innerText = window.t('ad_submit');
        btn.disabled = false;
    }
};

// 스스로 관리자에서 빠진다. 남을 빼는 건 운영자만 한다.
window.leaveClubAdmin = async function (club) {
    if (!window.currentUser || !club) return;
    if (!confirm(window.t('ad_leave_confirm'))) return;
    try {
        var fn = firebase.functions().httpsCallable('leaveClubAdmin');
        await fn({ clubId: club.id });
        alert(window.t('ad_leave_done'));
        // 메모리의 클럽 객체에서도 빼준다 — 안 그러면 시트를 다시 열 때까지
        // 수정 버튼이 그대로 남아, 눌렀다가 규칙에 거부당한다.
        var uid = window.currentUser.uid;
        ['allClubs', 'clubs'].forEach(function (key) {
            if (!Array.isArray(window[key])) return;
            window[key].forEach(function (c) {
                if (String(c.id) !== String(club.id)) return;
                c.admins = window.clubAdminUids(c).filter(function (u) { return u !== uid; });
            });
        });
        club.admins = window.clubAdminUids(club).filter(function (u) { return u !== uid; });
        if (window.closeBottomSheet) window.closeBottomSheet();
    } catch (e) {
        console.error('관리자 탈퇴 실패:', e && e.message);
        alert(window.t('ad_leave_error'));
    }
};
