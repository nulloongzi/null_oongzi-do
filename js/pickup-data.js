// pickup-data.js
// 픽업 스팟 데이터: pickup_games 컬렉션 (발견형).
// "보통 여기서 6인제 픽업이 열린다"(상시 스팟) + "이번주" 메모 + 들어가는 문(contact_link).
// 결제·정원·RSVP 없음. 무로그인 등록 = 익명 인증(소유권 유지·등록 벽 제거).
// Depends on: firebase-init.js, auth.js (window.currentUser), firebase compat global

(function () {
    window.pickupGames = []; // 메모리 캐시 (전체 스팟)

    window.toJsDate = function (v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        if (v instanceof Date) return v;
        return new Date(v);
    };

    // 스팟은 상시 핀 → 전부 로드 (이벤트가 아니므로 날짜 필터 없음)
    window.loadPickupGames = function () {
        if (!window.firebaseDB) { window.pickupGames = []; return Promise.resolve([]); }
        return window.firebaseDB.collection('pickup_games').get()
            .then(function (snap) {
                var spots = [];
                snap.docs.forEach(function (doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    if (d.coordinates) { d.lat = d.coordinates.lat; d.lng = d.coordinates.lng; }
                    spots.push(d);
                });
                window.pickupGames = spots;
                return spots;
            })
            .catch(function (e) {
                console.error('pickup_games fetch error:', e);
                window.pickupGames = [];
                return [];
            });
    };

    window.findPickupGame = function (id) {
        if (!id) return null;
        var s = String(id).trim();
        return window.pickupGames.find(function (g) {
            return String(g.id).trim() === s && s !== 'undefined';
        }) || null;
    };

    // 등록자 본인인가 (수정/삭제 권한)
    window.isPickupHost = function (spot) {
        return !!(window.currentUser && spot && spot.owner_uid === window.currentUser.uid);
    };

    // 무로그인 등록: 로그인 안 했으면 익명 인증으로 uid 확보 (등록 벽 제거 + 소유권 유지)
    function ensureUid() {
        if (window.currentUser) return Promise.resolve(window.currentUser.uid);
        return firebase.auth().signInAnonymously().then(function (cred) { return cred.user.uid; });
    }

    function spotPayload(data, ownerUid) {
        return {
            owner_uid: ownerUid,
            title: data.title,
            sport: data.sport || '6s',
            level: data.level || 'any',
            beginner_friendly: !!data.beginner_friendly,
            english_ok: !!data.english_ok,
            venue_name: data.venue_name || '',
            address: data.address || '',
            coordinates: data.coordinates,
            schedule: data.schedule || '',             // 구조화 일정 텍스트 "토 19:00~22:00, 일 ..."
            schedule_raw: data.schedule_raw || [],     // [{day,start,end}] (동호회와 동일 포맷)
            schedule_text: data.schedule_text || '',   // 일정 메모(비정기·기타)
            fee_info: data.fee_info || '',             // 정보용 텍스트 "보통 1만·현장" (거래 X)
            contact_link: data.contact_link || '',     // 들어가는 문: 단톡/Meetup/IG
            this_week: data.this_week || '',           // 이번주 메모 (가벼운 시한 공지)
            notes: data.notes || ''
        };
    }

    // ── 등록 (누구나 · 무로그인=익명) ──
    window.createPickupGame = function (data) {
        return ensureUid().then(function (uid) {
            var now = window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date();
            var doc = spotPayload(data, uid);
            doc.created_at = now;
            doc.updated_at = now;
            return window.firebaseDB.collection('pickup_games').add(doc).then(function (ref) {
                doc.id = ref.id;
                if (data.coordinates) { doc.lat = data.coordinates.lat; doc.lng = data.coordinates.lng; }
                window.pickupGames.push(doc);
                return doc;
            });
        });
    };

    // ── 수정 (소유자) ──
    window.updatePickupGame = function (id, fields) {
        fields.updated_at = window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date();
        return window.firebaseDB.collection('pickup_games').doc(id).update(fields).then(function () {
            var g = window.findPickupGame(id);
            if (g) {
                Object.keys(fields).forEach(function (k) { g[k] = fields[k]; });
                if (fields.coordinates) { g.lat = fields.coordinates.lat; g.lng = fields.coordinates.lng; }
            }
            return g;
        });
    };

    // ── 삭제 (소유자/관리자) ──
    window.deletePickupGame = function (id) {
        return window.firebaseDB.collection('pickup_games').doc(id).delete().then(function () {
            window.pickupGames = window.pickupGames.filter(function (g) { return String(g.id) !== String(id); });
        });
    };
})();
