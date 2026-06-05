// pickup-data.js
// 픽업 게임 데이터: pickup_games 컬렉션 로드/생성/RSVP/정산 (동호회 clubs와 분리된 단일 소스)
// Depends on: firebase-init.js (window.firebaseDB, window.firebaseServerTimestamp)
//             auth.js (window.currentUser, window.currentProfileData)

(function () {
    window.pickupGames = []; // 메모리 캐시 (다가오는 게임만)

    // Firestore Timestamp / Date / 문자열 어느 쪽이든 JS Date로 정규화.
    // (load 후엔 Timestamp, create 직후 메모리 객체엔 Date가 섞여 들어옴)
    window.toJsDate = function (v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        if (v instanceof Date) return v;
        return new Date(v);
    };

    // 지난 게임은 숨기고, 오늘 0시 이후 시작하는 게임만 시간순으로 로드.
    // status='canceled'는 클라이언트에서 제외 (datetime 범위 쿼리는 단일필드 인덱스로 충분).
    window.loadPickupGames = function () {
        if (!window.firebaseDB) {
            window.pickupGames = [];
            return Promise.resolve([]);
        }
        var cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);

        return window.firebaseDB.collection('pickup_games')
            .where('datetime_start', '>=', cutoff)
            .orderBy('datetime_start', 'asc')
            .get()
            .then(function (snap) {
                var games = [];
                snap.docs.forEach(function (doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    if (d.status === 'canceled') return;
                    if (d.coordinates) { d.lat = d.coordinates.lat; d.lng = d.coordinates.lng; }
                    games.push(d);
                });
                window.pickupGames = games;
                return games;
            })
            .catch(function (e) {
                console.error('pickup_games fetch error:', e);
                window.pickupGames = [];
                return [];
            });
    };

    window.findPickupGame = function (id) {
        if (!id) return null;
        var strId = String(id).trim();
        return window.pickupGames.find(function (g) {
            return String(g.id).trim() === strId && strId !== 'undefined';
        }) || null;
    };

    // 현재 유저가 이 게임의 호스트인가
    window.isPickupHost = function (game) {
        return !!(window.currentUser && game && game.host_uid === window.currentUser.uid);
    };

    // ── 호스트: 게임 개설 ──
    // data: { title, sport, level, beginner_friendly, datetime_start(Date), datetime_end(Date|null),
    //         venue_name, address, coordinates{lat,lng}, capacity(int), fee, pay_link, pay_account,
    //         contact_link, notes }
    window.createPickupGame = function (data) {
        if (!window.currentUser) return Promise.reject(new Error('login required'));
        var nick = (window.currentProfileData && window.currentProfileData.full_nickname) || '';
        var now = window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date();
        var doc = {
            host_uid: window.currentUser.uid,
            host_nickname: nick,
            title: data.title,
            sport: data.sport || 'mixed',
            level: data.level || 'any',
            beginner_friendly: !!data.beginner_friendly,
            datetime_start: data.datetime_start,
            datetime_end: data.datetime_end || null,
            venue_name: data.venue_name || '',
            address: data.address || '',
            coordinates: data.coordinates,
            capacity: data.capacity,
            attending_count: 0,
            fee: data.fee || '',
            pay_link: data.pay_link || '',
            pay_account: data.pay_account || '',
            contact_link: data.contact_link || '',
            notes: data.notes || '',
            status: 'open',
            created_at: now,
            updated_at: now
        };
        return window.firebaseDB.collection('pickup_games').add(doc).then(function (ref) {
            doc.id = ref.id;
            if (data.coordinates) { doc.lat = data.coordinates.lat; doc.lng = data.coordinates.lng; }
            window.pickupGames.push(doc);
            return doc;
        });
    };

    // ── 호스트: 게임 수정 ──
    window.updatePickupGame = function (gameId, fields) {
        if (!window.currentUser) return Promise.reject(new Error('login required'));
        fields.updated_at = window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date();
        return window.firebaseDB.collection('pickup_games').doc(gameId).update(fields).then(function () {
            var g = window.findPickupGame(gameId);
            if (g) {
                Object.keys(fields).forEach(function (k) { g[k] = fields[k]; });
                if (fields.coordinates) { g.lat = fields.coordinates.lat; g.lng = fields.coordinates.lng; }
            }
            return g;
        });
    };

    // ── 호스트: 게임 삭제 ──
    window.deletePickupGame = function (gameId) {
        return window.firebaseDB.collection('pickup_games').doc(gameId).delete().then(function () {
            window.pickupGames = window.pickupGames.filter(function (g) { return String(g.id) !== String(gameId); });
        });
    };

    // ── 참가 신청: 트랜잭션으로 정원 확인 → 'in' 또는 'waitlist' ──
    // 반환: 'in' | 'waitlist'
    window.joinPickupGame = function (gameId) {
        if (!window.currentUser) return Promise.reject(new Error('login required'));
        var uid = window.currentUser.uid;
        var nick = (window.currentProfileData && window.currentProfileData.full_nickname) || '';
        var db = window.firebaseDB;
        var gameRef = db.collection('pickup_games').doc(gameId);
        var partRef = gameRef.collection('participants').doc(uid);
        var ts = window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date();

        return db.runTransaction(function (tx) {
            // 모든 read를 write보다 먼저 수행
            return tx.get(gameRef).then(function (gameSnap) {
                if (!gameSnap.exists) throw new Error('game not found');
                var g = gameSnap.data();
                if (g.status !== 'open') throw new Error('game closed');
                return tx.get(partRef).then(function (partSnap) {
                    if (partSnap.exists) throw new Error('already joined');
                    var count = g.attending_count || 0;
                    var cap = g.capacity || 0;
                    var status = (count < cap) ? 'in' : 'waitlist';
                    tx.set(partRef, { uid: uid, nickname: nick, status: status, paid: false, joined_at: ts });
                    // 부모 doc은 attending_count만 갱신 (rules: onlyAttendingCountChanged)
                    if (status === 'in') tx.update(gameRef, { attending_count: count + 1 });
                    return status;
                });
            });
        }).then(function (status) {
            var g = window.findPickupGame(gameId);
            if (g && status === 'in') g.attending_count = (g.attending_count || 0) + 1;
            return status;
        });
    };

    // ── 참가 취소 ──
    window.leavePickupGame = function (gameId) {
        if (!window.currentUser) return Promise.reject(new Error('login required'));
        var uid = window.currentUser.uid;
        var db = window.firebaseDB;
        var gameRef = db.collection('pickup_games').doc(gameId);
        var partRef = gameRef.collection('participants').doc(uid);

        return db.runTransaction(function (tx) {
            return tx.get(partRef).then(function (partSnap) {
                if (!partSnap.exists) return null;
                var wasIn = partSnap.data().status === 'in';
                return tx.get(gameRef).then(function (gameSnap) {
                    tx.delete(partRef);
                    if (wasIn && gameSnap.exists) {
                        var count = gameSnap.data().attending_count || 0;
                        tx.update(gameRef, { attending_count: Math.max(0, count - 1) });
                    }
                    return wasIn;
                });
            });
        }).then(function (wasIn) {
            var g = window.findPickupGame(gameId);
            if (g && wasIn) g.attending_count = Math.max(0, (g.attending_count || 0) - 1);
            return wasIn;
        });
    };

    // ── 참가자 목록 (상세/정산용) ──
    window.loadParticipants = function (gameId) {
        return window.firebaseDB.collection('pickup_games').doc(gameId)
            .collection('participants').orderBy('joined_at', 'asc').get()
            .then(function (snap) {
                return snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
            });
    };

    // ── 내 참가 상태 ──
    window.getMyParticipation = function (gameId) {
        if (!window.currentUser) return Promise.resolve(null);
        return window.firebaseDB.collection('pickup_games').doc(gameId)
            .collection('participants').doc(window.currentUser.uid).get()
            .then(function (snap) { return snap.exists ? snap.data() : null; });
    };

    // ── 호스트: 입금(정산) 토글 ──
    window.setParticipantPaid = function (gameId, uid, paid) {
        return window.firebaseDB.collection('pickup_games').doc(gameId)
            .collection('participants').doc(uid).update({ paid: !!paid });
    };
})();
