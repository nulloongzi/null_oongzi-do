// friends.js — 밥친구 1단계: 초대코드 · 신청 · 수락 · 거절 · 끊기.
//
// 🍚 네임카드 팝업을 옆으로 넘기면 둘째 장이 밥친구다(팝업 구조는 그대로).
// 위의 도트 두 개가 두 장을 알려주고, 받은 신청이 있으면 둘째 도트가 커지고 빛난다.
// 🍚 버블에는 받은 신청 수 배지.
//
// 친구 찾기는 초대코드 하나뿐이다(밥이름 검색 없음) — 밥이름은 공개라서 검색을 열면
// 아무나 신청할 수 있다. 코드를 넣어도 바로 친구가 되지 않고 상대가 수락해야 한다.
// 보안 규칙: firestore.rules 의 invite_codes · friendships.
//
// 데이터
//   invite_codes/{CODE}          { uid, created_at }       코드 → 주인
//   users/{uid}/private/profile  { invite_code }           내 현재 코드(본인만)
//   friendships/{작은uid_큰uid}  { members, requested_by, requested_to,
//                                  status: pending|accepted, code, created_at, accepted_at }
//
// 식단표 공유·합석은 2·3단계. 이 파일은 관계만 다룬다.
// Depends on: firebase-init.js, i18n.js, profile.js (riceColorOf), share.js (SITE_BASE_URL)

(function () {
    // ── 순수 규칙 (tests/friends.test.js) ────────────────────────────
    // 헷갈리는 0·O·1·I 를 뺀 32자. firestore.rules 의 정규식과 같아야 한다.
    var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var CODE_LEN = 6;
    var CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
    var PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 신청은 7일 뒤 조용히 사라진다
    var MAX_FRIENDS = 100;
    var MAX_REQ_PER_DAY = 30;   // 스팸 방지 — 룰로는 셀 수 없어 이 기기에서만 센다

    function makeInviteCode(rand) {
        rand = rand || randomInt;
        var s = '';
        for (var i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET.charAt(rand(CODE_ALPHABET.length));
        return s;
    }
    function randomInt(n) {
        if (window.crypto && window.crypto.getRandomValues) {
            var a = new Uint32Array(1);
            window.crypto.getRandomValues(a);
            return a[0] % n;
        }
        return Math.floor(Math.random() * n);
    }
    // 사람이 친 코드 → 정규형. 공백·하이픈은 버리고 대문자로. 형식이 아니면 ''.
    // 헷갈리는 글자는 고쳐 준다(0→O 가 아니라, 우리 알파벳엔 O 가 없으니 거절이 맞다).
    function normalizeCode(v) {
        var s = String(v == null ? '' : v).toUpperCase().replace(/[\s-]/g, '');
        return CODE_RE.test(s) ? s : '';
    }
    function pairId(a, b) { return a < b ? a + '_' + b : b + '_' + a; }
    // 하루 신청 횟수: localStorage 에 { d: '2026-9-28', n } 로 둔다. 날이 바뀌면 0 부터.
    function dayKey(now) { var d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function countToday(raw, now) {
        try { var v = JSON.parse(raw || '{}'); return v && v.d === dayKey(now) ? (Number(v.n) || 0) : 0; } catch (e) { return 0; }
    }
    function toMillis(t) {
        if (!t) return 0;
        if (typeof t.toMillis === 'function') return t.toMillis();
        if (t.seconds != null) return t.seconds * 1000;
        if (t instanceof Date) return t.getTime();
        return 0;
    }
    function isExpired(d, now) {
        if (!d || d.status !== 'pending') return false;
        var c = toMillis(d.created_at);
        // 서버 시각이 아직 안 채워진 막 만든 신청은 만료가 아니다
        return c > 0 && now - c > PENDING_TTL_MS;
    }
    // 내 관계 문서들 → { friends, incoming, outgoing }. 만료된 신청은 뺀다.
    function partition(docs, me, now) {
        var out = { friends: [], incoming: [], outgoing: [] };
        for (var i = 0; i < docs.length; i++) {
            var d = docs[i].data || {};
            var other = (d.members || []).filter(function (u) { return u !== me; })[0];
            if (!other) continue;
            var item = { id: docs[i].id, other: other, doc: d };
            if (d.status === 'accepted') out.friends.push(item);
            else if (d.status === 'pending' && !isExpired(d, now)) {
                if (d.requested_to === me) out.incoming.push(item);
                else if (d.requested_by === me) out.outgoing.push(item);
            }
        }
        return out;
    }

    window.friendsPure = {
        CODE_ALPHABET: CODE_ALPHABET, CODE_LEN: CODE_LEN, PENDING_TTL_MS: PENDING_TTL_MS, MAX_FRIENDS: MAX_FRIENDS,
        MAX_REQ_PER_DAY: MAX_REQ_PER_DAY, dayKey: dayKey, countToday: countToday,
        makeInviteCode: makeInviteCode, normalizeCode: normalizeCode, pairId: pairId,
        isExpired: isExpired, partition: partition
    };

    // ── 상태 ─────────────────────────────────────────────────────
    var state = {
        uid: null,
        loaded: false,
        friends: [], incoming: [], outgoing: [],
        profiles: {},            // uid → { name, color }
        view: 'list',            // list | add | detail
        detailId: null,
        myCode: null,
        lookup: null,            // { code, uid, name, color, status }
        confirm: null            // 두 단계 확인 중인 동작 키
    };
    var unsub = null;
    window.friendState = state;

    function T(k) { return window.t ? window.t(k) : k; }
    function TF(k, p) { return window.tf ? window.tf(k, p) : k; }
    function db() { return window.firebaseDB; }
    function ts() { return window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(); }
    function track(n, p) { if (window.track) window.track(n, p || {}); }
    function inviteUrl(code) { return (window.SITE_BASE_URL || 'https://do.nulloongzi.com/') + '?invite=' + encodeURIComponent(code); }

    // ── 데이터 ───────────────────────────────────────────────────
    function privateRef(uid) { return db().collection('users').doc(uid).collection('private').doc('profile'); }

    // 새 코드 하나를 만들어 등록. 이미 있는 코드와 부딪히면(룰이 덮어쓰기 거부) 다시 뽑는다.
    function claimNewCode(uid, tries) {
        tries = tries || 0;
        var code = makeInviteCode();
        return db().collection('invite_codes').doc(code).set({ uid: uid, created_at: ts() })
            .then(function () { return code; })
            .catch(function (e) {
                if (tries < 4) return claimNewCode(uid, tries + 1);
                throw e;
            });
    }

    // 진행 중인 발급이 있으면 그걸 기다린다 — 겹쳐 부르면(재렌더마다) 코드가 두 개 발급되고
    // 하나는 프로필에 없는데도 룰이 받아 주는 '유령 코드'가 된다.
    var codeInFlight = null;
    window.ensureMyInviteCode = function () {
        var uid = state.uid;
        if (!uid || !db()) return Promise.reject(new Error('login'));
        if (state.myCode) return Promise.resolve(state.myCode);
        if (codeInFlight) return codeInFlight;
        codeInFlight = privateRef(uid).get().then(function (snap) {
            var c = snap.exists ? (snap.data() || {}).invite_code : null;
            if (c) return c;
            return claimNewCode(uid).then(function (code) {
                return privateRef(uid).set({ invite_code: code }, { merge: true }).then(function () { return code; });
            });
        }).then(function (code) {
            codeInFlight = null;
            if (state.uid === uid) state.myCode = code;
            return code;
        }, function (e) { codeInFlight = null; throw e; });
        return codeInFlight;
    };

    // 새 코드 받기: 새 코드를 먼저 잡고, 저장하고, 옛 코드를 지운다(순서가 바뀌면 코드가 없는 순간이 생긴다).
    window.regenerateInviteCode = function () {
        var uid = state.uid;
        // 화면이 옛 코드를 모르면(로드 실패) 서버의 것을 읽어 지운다 — 옛 코드가 살아남으면 안 된다
        var oldP = state.myCode ? Promise.resolve(state.myCode)
            : privateRef(uid).get().then(function (snap) { return snap.exists ? (snap.data() || {}).invite_code : null; }).catch(function () { return null; });
        return oldP.then(function (old) { return claimNewCode(uid).then(function (code) {
            return privateRef(uid).set({ invite_code: code }, { merge: true }).then(function () {
                state.myCode = code;
                if (old) return db().collection('invite_codes').doc(old).delete().catch(function () { }).then(function () { return code; });
                return code;
            });
        }); });
    };

    function loadProfile(uid) {
        if (state.profiles[uid]) return Promise.resolve(state.profiles[uid]);
        return db().collection('users').doc(uid).get().then(function (snap) {
            var d = snap.exists ? snap.data() : {};
            var name = d.full_nickname || d.nickname || T('fr_unknown');
            var rice = d.nickname || String(name).split('-')[0];
            var p = { name: name, rice: rice, color: d.color || (window.riceColorOf ? window.riceColorOf(rice) : '#FFF9C4') };
            state.profiles[uid] = p;
            return p;
        }).catch(function () { return { name: T('fr_unknown'), color: '#FFF9C4' }; });
    }

    // 밥도감용: 밥친구 전체의 밥 이름. 프로필을 아직 안 받은 친구는 받아서 센다.
    // 나가는 건 밥 종류뿐 — 친구 이름·팀·일정은 카드에 없다.
    window.loadFriendRices = function () {
        if (!state.uid || !state.friends.length) return Promise.resolve([]);
        return Promise.all(state.friends.map(function (f) { return loadProfile(f.other); })).then(function (ps) {
            return ps.map(function (p) { return p.rice || String(p.name || '').split('-')[0]; });
        });
    };

    // 코드 → 주인. 결과 status: ok | self | friend | sent | received | not_found | invalid
    window.lookupInviteCode = function (raw) {
        var code = normalizeCode(raw);
        if (!code) return Promise.resolve({ status: 'invalid' });
        return db().collection('invite_codes').doc(code).get().then(function (snap) {
            if (!snap.exists) return { status: 'not_found', code: code };
            var uid = snap.data().uid;
            if (uid === state.uid) return { status: 'self', code: code };
            return loadProfile(uid).then(function (p) {
                var r = { status: 'ok', code: code, uid: uid, name: p.name, color: p.color };
                var id = pairId(state.uid, uid);
                if (state.friends.some(function (f) { return f.id === id; })) r.status = 'friend';
                else if (state.outgoing.some(function (f) { return f.id === id; })) r.status = 'sent';
                else if (state.incoming.some(function (f) { return f.id === id; })) r.status = 'received';
                return r;
            });
        });
    };

    window.sendFriendRequest = function (code, toUid) {
        var me = state.uid;
        if (state.friends.length >= MAX_FRIENDS) return Promise.reject(new Error(T('fr_err_full')));
        var id = pairId(me, toUid);
        var ref = db().collection('friendships').doc(id);
        return ref.get().then(function (snap) {
            if (snap.exists) {
                var d = snap.data();
                // 상대가 먼저 신청해 둔 상태면 내 신청은 곧 수락이다
                if (d.status === 'pending' && d.requested_to === me) return window.acceptFriend(id).then(function () { return 'accepted'; });
                if (d.status === 'accepted') return 'friend';
                if (!isExpired(d, Date.now())) return 'sent';
                return ref.delete().then(function () { return create(); });   // 만료된 내 신청 → 새로
            }
            return create();
        });
        function create() {
            if (requestsToday() >= MAX_REQ_PER_DAY) return Promise.reject(new Error(T('fr_err_daily')));
            var m = [me, toUid].sort();
            return ref.set({
                members: m, requested_by: me, requested_to: toUid,
                status: 'pending', code: code, created_at: ts()
            }).then(function () { bumpRequestsToday(); track('friend_request_send'); return 'sent'; });
        }
    };
    // 기기 저장 키는 계정별 — 한 기기에서 계정을 바꿔도 '오늘 신청 수'·'본 신청'이 섞이지 않게
    function reqDayKey() { return 'nurungji_friend_req_day:' + (state.uid || ''); }
    function requestsToday() { try { return countToday(localStorage.getItem(reqDayKey()), Date.now()); } catch (e) { return 0; } }
    function bumpRequestsToday() {
        try { localStorage.setItem(reqDayKey(), JSON.stringify({ d: dayKey(Date.now()), n: requestsToday() + 1 })); } catch (e) { }
    }

    window.acceptFriend = function (id) {
        if (state.friends.length >= MAX_FRIENDS) return Promise.reject(new Error(T('fr_err_full')));
        return db().collection('friendships').doc(id).update({ status: 'accepted', accepted_at: ts() })
            .then(function () { track('friend_accept'); });
    };
    // 거절·취소·끊기 — 모두 조용히 지운다(상대에게 알리지 않는다)
    window.removeFriendship = function (id, why) {
        return db().collection('friendships').doc(id).delete().then(function () { track('friend_remove', { why: why || '' }); });
    };

    function startListener(uid) {
        stopListener();
        state.uid = uid;
        unsub = db().collection('friendships').where('members', 'array-contains', uid)
            .onSnapshot(function (snap) {
                var docs = snap.docs.map(function (d) { return { id: d.id, data: d.data() }; });
                var p = partition(docs, uid, Date.now());
                state.friends = p.friends; state.incoming = p.incoming; state.outgoing = p.outgoing;
                state.loaded = true;
                var others = [].concat(p.friends, p.incoming, p.outgoing).map(function (x) { return x.other; });
                Promise.all(others.map(loadProfile)).then(render);
                // 2단계: 친구 도시락 사본 — '도시락 바뀜' 표시와 둘째 도트 신호에 쓴다
                if (window.loadFriendLunchbox) {
                    Promise.all(p.friends.map(function (f) { return window.loadFriendLunchbox(f.other, true); })).then(render);
                }
                render();
            }, function (e) { console.warn('밥친구 구독 실패:', e && e.message); });
    }
    function stopListener() {
        if (unsub) { unsub(); unsub = null; }
        codeInFlight = null;
    }

    // 동호회 목록(loadAllClubs)이 첫 친구 스냅샷보다 늦게 오면 친구 도시락이 빈 채로 캐시된다
    // → app.js 가 목록을 받은 뒤 부른다. '보일 팀' 확인 카드도 그때 팀 이름이 채워진다.
    window.refreshFriendLunchboxes = function () {
        if (!state.uid || !window.loadFriendLunchbox) return Promise.resolve();
        return Promise.all(state.friends.map(function (f) { return window.loadFriendLunchbox(f.other, true); })).then(render);
    };

    // ── 로그인 연동 ─────────────────────────────────────────────
    // auth.js setupAuthListener 가 부른다. user=null 이면 로그아웃·익명.
    window.onFriendsAuth = function (user) {
        if (!user || user.isAnonymous || !db()) {
            stopListener();
            state.uid = null; state.loaded = false; state.myCode = null;
            state.friends = []; state.incoming = []; state.outgoing = [];
            state.view = 'list'; state.lookup = null;
            if (window.resetFriendShareCache) window.resetFriendShareCache();
            render();
            return;
        }
        startListener(user.uid);
        resumeInviteLink();
        // 다른 기기에서 도시락을 바꿨을 수 있다 → 사본을 지금 도시락에 맞춘다(같으면 쓰지 않음)
        if (window.syncFriendShare) window.syncFriendShare();
        render();
    };

    // ── 팝업 두 장 · 도트 ───────────────────────────────────────
    function seenKey() { return 'nurungji_seen_friend_req:' + (state.uid || ''); }
    function seenIds() { try { return JSON.parse(localStorage.getItem(seenKey()) || '[]'); } catch (e) { return []; } }
    function markSeen() {
        try { localStorage.setItem(seenKey(), JSON.stringify(state.incoming.map(function (x) { return x.id; }))); } catch (e) { }
    }
    function hasUnseen() {
        var seen = seenIds();
        if (state.incoming.some(function (x) { return seen.indexOf(x.id) === -1; })) return true;
        if (window.needsFriendShareConfirm && window.needsFriendShareConfirm()) return true;
        if (unseenMealTier() > 0) return true;   // 처음 합석하게 된 밥친구
        return !!window.isFriendLunchboxChanged && state.friends.some(function (f) { return window.isFriendLunchboxChanged(f.other); });
    }

    function pager() { return document.getElementById('pcPager'); }
    function currentPage() {
        var p = pager();
        if (!p || !p.clientWidth) return 0;
        return Math.round(p.scrollLeft / p.clientWidth);
    }
    window.goProfilePage = function (i, smooth) {
        var p = pager();
        if (!p) return;
        p.scrollTo({ left: i * p.clientWidth, behavior: smooth === false ? 'auto' : 'smooth' });
        if (i === 1) onFriendsPageShown();
        syncDots(i);
    };
    function onFriendsPageShown() {
        markSeen();
        markMealSeen();
        syncFabWarmth();
        // goProfilePage 와 스크롤 핸들러가 둘 다 부른다 → 팝업 열기당 한 번만 센다
        if (!state.shownTracked) { state.shownTracked = true; track('friends_open'); }
    }
    function syncDots(page) {
        var dots = document.getElementById('pcDots');
        if (!dots) return;
        if (page == null) page = currentPage();
        var ds = dots.querySelectorAll('.pc-dot');
        var labels = [T('fr_page_card'), T('fr_page_friends')];
        for (var i = 0; i < ds.length; i++) {
            ds[i].setAttribute('aria-label', labels[i] || '');
            ds[i].classList.toggle('on', i === page);
            ds[i].setAttribute('aria-selected', i === page ? 'true' : 'false');
        }
        if (ds[1]) ds[1].classList.toggle('sig', page !== 1 && hasUnseen());
        syncPagerHeight(page);
    }
    // 두 장의 높이가 다르다. 팝업은 가운데 정렬이라 긴 장에 맞추면 짧은 장(내 카드)이
    // 도트에서 멀리 떨어져 뜬다 → 보고 있는 장 높이로 맞춘다.
    function syncPagerHeight(page) {
        var p = pager();
        if (!p) return;
        var cards = p.querySelectorAll(':scope > .profile-card:not([hidden])');
        // 한 장뿐(로그아웃)이면 고정하지 않는다 — 로그인 폼·안내문이 늘어나도 잘리지 않게
        if (cards.length < 2) { p.style.height = ''; return; }
        var c = cards[Math.min(page, cards.length - 1)];
        if (!c) return;
        var cs = getComputedStyle(p);
        p.style.height = (c.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 'px';
    }
    function syncBadge() {
        var fab = document.getElementById('fabProfile');
        if (!fab) return;
        var b = fab.querySelector('.fab-badge');
        var n = state.incoming.length;
        if (!n) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement('span'); b.className = 'fab-badge'; fab.appendChild(b); }
        b.textContent = n > 9 ? '9+' : String(n);
        b.setAttribute('aria-label', TF('fr_badge_aria', { n: n }));
        syncFabLabel();
    }
    // 🍚 버튼 이름: 버튼의 aria-label 이 안쪽 배지 글자를 덮으므로 신청 수·합석 알림을 이름에 합친다.
    // 기본 이름은 data-i18n-aria 키로 둬서 언어를 바꿔도(applyI18n) 맞는 이름이 남는다.
    function syncFabLabel() {
        var fab = document.getElementById('fabProfile');
        if (!fab) return;
        var key = fab.classList.contains('fab-warm') ? 'fr_meal_fab' : 'fab_profile';
        fab.setAttribute('data-i18n-aria', key);
        var name = T(key), n = state.incoming.length;
        if (n) name += ', ' + TF('fr_badge_aria', { n: n });
        fab.setAttribute('aria-label', name);
        fab.setAttribute('title', name);
    }
    // 처음 합석하게 된 밥친구가 있으면 🍚 버블에 단계 색 테두리(가장 높은 합석 단계).
    // 합석 알림은 처음 한 번만: 어떤 밥친구와 처음 합석하게 됐을 때 🍚 버블 테두리와 둘째 도트로
    // 알리고, 밥친구 장을 열면 꺼진다. 이미 본 합석 친구는 다시 알리지 않는다(계정별로 기기에 둔다).
    function mealSeenKey() { return 'nurungji_meal_seen:' + (state.uid || ''); }
    function mealSeen() { try { return JSON.parse(localStorage.getItem(mealSeenKey()) || '[]'); } catch (e) { return []; } }
    function mealFriends() {
        if (!state.uid || !window.friendMeal) return [];
        return state.friends.map(function (f) { return { uid: f.other, tier: window.friendMeal(f.other).tier }; })
            .filter(function (x) { return x.tier > 0; });
    }
    function unseenMealTier() {
        var seen = mealSeen(), tier = 0;
        mealFriends().forEach(function (x) { if (seen.indexOf(x.uid) === -1) tier = Math.max(tier, x.tier); });
        return tier;
    }
    function markMealSeen() {
        var seen = mealSeen();
        mealFriends().forEach(function (x) { if (seen.indexOf(x.uid) === -1) seen.push(x.uid); });
        try { localStorage.setItem(mealSeenKey(), JSON.stringify(seen)); } catch (e) { }
    }
    function syncFabWarmth() {
        var fab = document.getElementById('fabProfile');
        if (!fab) return;
        var tier = unseenMealTier();
        fab.classList.remove('warm-1', 'warm-2', 'warm-3');
        fab.classList.toggle('fab-warm', tier > 0);
        if (tier) fab.classList.add('warm-' + tier);
        syncFabLabel();
    }
    window.syncFriendsBadge = function () { syncBadge(); syncFabWarmth(); };

    // 팝업을 열 때마다 첫 장부터. auth.js 의 toggleProfileCard 가 부른다.
    window.resetProfilePager = function () {
        state.view = 'list'; state.confirm = null; state.shownTracked = false; state.typed = '';
        render();
        requestAnimationFrame(function () { window.goProfilePage(0, false); });
    };

    (function bindPager() {
        function bind() {
            var p = pager();
            if (!p || p._frBound) return;
            p._frBound = true;
            var t = null;
            // 카드 내용이 바뀌어 높이가 달라지면(프로필 렌더, 목록 갱신) 다시 맞춘다
            if (window.ResizeObserver) {
                var ro = new window.ResizeObserver(function () { syncPagerHeight(currentPage()); });
                var cs = p.querySelectorAll(':scope > .profile-card');
                for (var i = 0; i < cs.length; i++) ro.observe(cs[i]);
            }
            p.addEventListener('scroll', function () {
                clearTimeout(t);
                t = setTimeout(function () {
                    var pg = currentPage();
                    if (pg === 1) onFriendsPageShown();
                    syncDots(pg);
                }, 80);
            }, { passive: true });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
    })();

    // ── 그리기 (DOM 직접 — 사용자 입력은 전부 textContent) ──────────
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function btn(label, cls, onClick) {
        var b = el('button', 'fr-btn ' + (cls || ''), label);
        b.type = 'button';
        b.onclick = onClick;
        return b;
    }
    // 밥그릇 아이콘 = 로고 단순화(assets/logo/nulloongzido-logo.svg 를 24 단위로). 이음선은 구멍
    var BOWL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3D2C22" fill-rule="evenodd" d="M11.04 19.56C9.67 19.44 8.56 19.07 8.31 18.66C8.25 18.56 8.21 18.41 8.21 18.24C8.21 18.01 8.20 17.97 8.08 17.90C7.08 17.30 6.03 16.32 5.47 15.47C4.74 14.36 4.32 13.19 4.22 11.94C4.18 11.41 4.22 11.23 4.43 11.01L4.61 10.82L4.68 11.06C4.75 11.28 4.74 11.31 4.65 11.51C4.48 11.85 4.51 11.93 4.86 12.27C5.26 12.65 5.56 12.79 6.56 13.05C7.18 13.21 7.74 13.30 8.78 13.42C9.03 13.45 9.31 13.48 9.40 13.50C10.09 13.60 14.41 13.56 15.05 13.45C15.09 13.44 15.28 13.42 15.48 13.40C15.99 13.35 17.09 13.14 17.63 12.99C18.44 12.77 18.71 12.64 19.08 12.29C19.45 11.93 19.48 11.84 19.32 11.52C19.25 11.38 19.24 11.30 19.27 11.21C19.30 11.14 19.32 11.01 19.32 10.93L19.32 10.77L19.52 10.97C19.77 11.22 19.81 11.38 19.76 11.95C19.53 14.36 18.17 16.52 16.10 17.77L15.77 17.97L15.75 18.29C15.73 18.54 15.70 18.65 15.61 18.74C15.33 19.03 14.50 19.35 13.69 19.46C13.47 19.50 13.23 19.53 13.15 19.54C12.84 19.59 11.49 19.60 11.04 19.56ZM10.29 13.00C10.28 12.99 10.04 12.97 9.75 12.95C8.63 12.88 7.33 12.69 6.51 12.48C5.97 12.34 5.95 12.33 5.72 12.08C5.36 11.68 5.21 11.44 5.28 11.38C5.32 11.34 5.32 11.29 5.28 11.23C5.20 11.08 5.22 10.76 5.32 10.61C5.38 10.51 5.40 10.40 5.39 10.22C5.38 9.91 5.48 9.70 5.69 9.57C5.83 9.49 5.84 9.46 5.84 9.19C5.84 8.91 5.84 8.89 6.04 8.72C6.43 8.38 6.38 8.37 6.79 8.79C7.67 9.71 8.83 10.46 10.13 10.96C10.59 11.14 11.47 11.39 11.64 11.39C11.70 11.39 11.76 11.44 11.79 11.52C11.88 11.75 12.13 12.78 12.13 12.91L12.13 13.03L11.22 13.02C10.72 13.02 10.30 13.01 10.29 13.00ZM12.85 12.80C12.81 12.50 12.61 11.69 12.50 11.40L12.43 11.18L12.61 10.96C12.88 10.64 13.62 10.00 14.11 9.66L14.52 9.38L14.64 9.53C15.17 10.19 15.71 11.20 15.97 12.01C16.23 12.83 16.28 12.74 15.53 12.83C14.79 12.92 14.35 12.96 13.49 13.01L12.89 13.04L12.85 12.80ZM16.86 12.46C16.66 11.51 16.06 10.26 15.32 9.25L15.15 9.02L15.44 8.90C16.03 8.63 16.47 8.49 17.36 8.29C17.53 8.25 18.18 9.00 18.18 9.24C18.18 9.31 18.23 9.39 18.30 9.43C18.48 9.55 18.58 9.81 18.57 10.14C18.56 10.35 18.59 10.49 18.67 10.67C18.77 10.89 18.78 10.94 18.73 11.13C18.68 11.30 18.69 11.37 18.74 11.48C18.89 11.77 18.87 11.94 18.65 12.07C18.42 12.20 17.72 12.43 17.23 12.54L16.89 12.62L16.86 12.46ZM11.29 10.57C10.68 10.40 10.03 10.16 9.64 9.97C9.25 9.77 9.25 9.83 9.58 9.13C10.45 7.27 11.86 5.97 13.66 5.36C14.58 5.04 15.19 5.14 15.49 5.63C15.60 5.80 15.67 5.86 15.87 5.93C16.07 6.00 16.14 6.05 16.24 6.23C16.33 6.39 16.42 6.46 16.53 6.49C16.72 6.54 17.10 6.96 17.07 7.09C17.06 7.14 17.07 7.19 17.09 7.20C17.12 7.22 17.14 7.31 17.14 7.41L17.14 7.60L16.73 7.69C15.18 8.03 13.16 9.24 12.15 10.42C11.89 10.73 11.88 10.74 11.29 10.57ZM8.23 9.12C7.76 8.77 7.34 8.39 7.07 8.07L6.87 7.82L7.00 7.38C7.12 6.99 7.16 6.93 7.28 6.88C7.37 6.85 7.43 6.79 7.45 6.70C7.56 6.21 7.80 5.92 8.15 5.86C8.52 5.80 8.56 5.78 8.64 5.64C8.72 5.48 8.83 5.41 9.11 5.37C9.25 5.35 9.32 5.30 9.41 5.16C9.59 4.87 9.80 4.79 10.22 4.82C10.49 4.85 10.60 4.83 10.72 4.77C10.82 4.72 10.93 4.71 11.06 4.73C11.22 4.75 11.27 4.74 11.38 4.63C11.65 4.37 12.04 4.33 12.42 4.52C12.61 4.61 12.70 4.63 12.93 4.61C13.39 4.57 13.45 4.63 13.10 4.78C11.28 5.52 9.84 6.93 8.90 8.88C8.77 9.17 8.65 9.41 8.64 9.41C8.63 9.41 8.44 9.28 8.23 9.12Z"/></svg>';
    function avatar(color, size, tier) {
        var a = el('div', 'fr-av' + (tier ? ' warm-' + tier : ''));
        a.style.background = color || '#FFF9C4';
        if (size) { a.style.width = size + 'px'; a.style.height = size + 'px'; }
        a.innerHTML = tier ? fillBowl(tier) : BOWL;   // 고정 SVG — 사용자 입력 아님
        return a;
    }
    // 합석 단계는 밥그릇이 차오르는 양으로 보여준다: 한 숟갈 1/3 · 한 그릇 2/3 · 한솥밥 가득.
    // 테두리·빛남 같은 장식 없이 그릇 안에서만. 색은 앱 _BowlPainter · 공유 카드와 같다.
    var BOWL_D = 'M11.04 19.56C9.67 19.44 8.56 19.07 8.31 18.66C8.25 18.56 8.21 18.41 8.21 18.24C8.21 18.01 8.20 17.97 8.08 17.90C7.08 17.30 6.03 16.32 5.47 15.47C4.74 14.36 4.32 13.19 4.22 11.94C4.18 11.41 4.22 11.23 4.43 11.01L4.61 10.82L4.68 11.06C4.75 11.28 4.74 11.31 4.65 11.51C4.48 11.85 4.51 11.93 4.86 12.27C5.26 12.65 5.56 12.79 6.56 13.05C7.18 13.21 7.74 13.30 8.78 13.42C9.03 13.45 9.31 13.48 9.40 13.50C10.09 13.60 14.41 13.56 15.05 13.45C15.09 13.44 15.28 13.42 15.48 13.40C15.99 13.35 17.09 13.14 17.63 12.99C18.44 12.77 18.71 12.64 19.08 12.29C19.45 11.93 19.48 11.84 19.32 11.52C19.25 11.38 19.24 11.30 19.27 11.21C19.30 11.14 19.32 11.01 19.32 10.93L19.32 10.77L19.52 10.97C19.77 11.22 19.81 11.38 19.76 11.95C19.53 14.36 18.17 16.52 16.10 17.77L15.77 17.97L15.75 18.29C15.73 18.54 15.70 18.65 15.61 18.74C15.33 19.03 14.50 19.35 13.69 19.46C13.47 19.50 13.23 19.53 13.15 19.54C12.84 19.59 11.49 19.60 11.04 19.56ZM10.30 13.01C10.28 13.00 10.04 12.97 9.75 12.95C7.83 12.83 5.82 12.41 5.21 12.01C5.07 11.92 5.09 11.65 5.24 11.43C5.30 11.34 5.32 11.28 5.28 11.22C5.20 11.08 5.22 10.75 5.32 10.61C5.38 10.51 5.40 10.40 5.39 10.22C5.38 9.91 5.48 9.70 5.68 9.57C5.82 9.49 5.83 9.47 5.84 9.08C5.86 8.61 5.98 8.41 6.36 8.19C6.55 8.08 6.58 8.04 6.58 7.90C6.58 7.48 6.83 7.09 7.21 6.92C7.36 6.85 7.43 6.79 7.45 6.69C7.56 6.21 7.81 5.92 8.15 5.86C8.52 5.80 8.56 5.78 8.64 5.64C8.72 5.48 8.83 5.41 9.11 5.37C9.25 5.35 9.32 5.30 9.41 5.16C9.59 4.87 9.80 4.79 10.22 4.82C10.49 4.85 10.60 4.83 10.72 4.77C10.82 4.72 10.93 4.71 11.06 4.73C11.22 4.75 11.27 4.74 11.38 4.63C11.65 4.37 12.04 4.33 12.42 4.52C12.61 4.61 12.70 4.63 12.96 4.61C13.21 4.59 13.30 4.61 13.43 4.69C13.54 4.75 13.64 4.78 13.75 4.76C13.95 4.73 14.24 4.87 14.37 5.05C14.46 5.17 14.51 5.19 14.73 5.19C15.05 5.19 15.31 5.35 15.49 5.64C15.60 5.80 15.68 5.86 15.87 5.93C16.07 6.00 16.14 6.05 16.24 6.23C16.33 6.39 16.42 6.46 16.53 6.49C16.70 6.54 17.09 6.95 17.08 7.07C17.07 7.24 17.16 7.38 17.34 7.47C17.64 7.63 17.80 7.87 17.82 8.23C17.84 8.48 17.87 8.57 17.98 8.70C18.07 8.80 18.13 8.93 18.15 9.11C18.18 9.29 18.22 9.38 18.30 9.44C18.48 9.55 18.58 9.82 18.57 10.14C18.56 10.35 18.59 10.49 18.67 10.67C18.77 10.89 18.78 10.94 18.73 11.13C18.68 11.30 18.69 11.37 18.74 11.48C18.89 11.77 18.87 11.94 18.65 12.07C18.16 12.35 16.69 12.70 15.40 12.85C15.03 12.89 14.62 12.93 14.48 12.95C14.19 12.99 10.33 13.04 10.30 13.01Z';   // 밥 더미 + 그릇 윤곽(채움·테두리용)
    var BOWL_SEAMS = 'M12.11 12.57C11.99 11.96 11.82 11.43 11.73 11.39C11.69 11.37 11.41 11.29 11.12 11.22C9.60 10.85 8.10 10.02 6.96 8.90L6.41 8.37L6.28 8.46C6.21 8.52 6.12 8.59 6.08 8.64C5.97 8.77 5.83 8.83 5.87 8.73C5.93 8.55 6.14 8.31 6.36 8.19C6.55 8.08 6.58 8.04 6.58 7.90C6.58 7.63 6.72 7.30 6.91 7.12C7.01 7.03 7.08 6.99 7.06 7.03C7.05 7.08 6.99 7.27 6.93 7.47L6.82 7.82L7.02 8.07C7.38 8.49 8.52 9.46 8.65 9.45C8.67 9.45 8.83 9.15 9.02 8.77C9.76 7.25 10.79 6.09 12.10 5.32C12.62 5.01 13.40 4.68 13.48 4.73C13.51 4.75 13.65 4.76 13.79 4.77C13.99 4.77 14.09 4.80 14.24 4.92C14.46 5.09 14.50 5.05 13.72 5.29C12.12 5.78 10.71 6.98 9.76 8.66C9.61 8.93 9.26 9.73 9.26 9.80C9.26 9.92 10.86 10.54 11.60 10.70L11.89 10.76L12.27 10.36C13.47 9.09 15.00 8.18 16.62 7.77C17.08 7.65 17.16 7.62 17.18 7.53C17.20 7.40 17.20 7.40 17.38 7.50C17.64 7.63 17.80 7.89 17.82 8.23C17.84 8.48 17.87 8.57 17.99 8.70C18.26 9.02 18.12 8.93 17.79 8.58L17.46 8.22L17.14 8.29C16.42 8.46 15.79 8.67 15.34 8.89L15.10 9.01L15.33 9.32C15.90 10.10 16.37 11.01 16.63 11.83C16.89 12.64 16.89 12.61 16.59 12.67C16.21 12.75 16.22 12.76 16.13 12.37C15.94 11.60 15.58 10.84 14.99 9.97C14.52 9.27 14.58 9.29 14.10 9.62C13.62 9.95 12.83 10.64 12.57 10.96L12.38 11.18L12.51 11.57C12.63 11.96 12.82 12.78 12.82 12.94C12.82 13.01 12.78 13.02 12.51 13.02L12.20 13.02L12.11 12.57ZM5.44 12.12C5.12 11.96 5.12 11.96 5.13 11.76C5.15 11.46 5.19 11.47 5.52 11.89C5.69 12.11 5.82 12.28 5.80 12.28C5.78 12.28 5.62 12.21 5.44 12.12Z';   // 공 이음선
    var BOWL_TOP = 4.4, BOWL_BOT = 19.6;
    var MEAL_FILL = ['', '#F1D9A6', '#F5B82E', '#E0A800'];
    var MEAL_LEVEL = [0, 1 / 3, 2 / 3, 1];
    var bowlSeq = 0;
    function fillBowl(tier) {
        var id = 'frb' + (++bowlSeq);
        var y = BOWL_BOT - (BOWL_BOT - BOWL_TOP) * MEAL_LEVEL[tier];
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + BOWL_D + '"/></clipPath></defs>' +
            '<g clip-path="url(#' + id + ')"><rect width="24" height="24" fill="#3D2C22" opacity=".28"/>' +
            '<rect x="0" y="' + y.toFixed(2) + '" width="24" height="24" fill="' + MEAL_FILL[tier] + '"/>' +
            '<path d="' + BOWL_SEAMS + '" fill="#3D2C22" opacity=".55"/></g>' +
            '<path d="' + BOWL_D + '" fill="none" stroke="#3D2C22" stroke-width="1.2"/></svg>';
    }
    function warmAvatar(color, size, tier) { return avatar(color, size, tier); }
    function mealOf(uid) { return window.friendMeal ? window.friendMeal(uid) : { n: 0, teams: 0, tier: 0, overlaps: [] }; }
    function profileOf(uid) { return state.profiles[uid] || { name: '…', color: '#F3E9D2' }; }
    function fmtDate(t) {
        var ms = toMillis(t);
        if (!ms) return '';
        var d = new Date(ms);
        return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    }
    // 공용 토스트(js/toast.js)로 — 사이트 전체가 같은 모양
    function toast(msg) { if (window.showToast) window.showToast(msg); }
    function copy(text, okMsg) {
        function done() { toast(okMsg); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
        } else fallback();
        function fallback() {
            var i = document.createElement('input');
            i.value = text; document.body.appendChild(i); i.select();
            try { document.execCommand('copy'); } catch (e) { }
            document.body.removeChild(i);
            done();
        }
    }

    function render() {
        var card = document.getElementById('friendsCard');
        var dots = document.getElementById('pcDots');
        var loggedIn = !!state.uid;
        if (card) card.hidden = !loggedIn;
        if (dots) dots.hidden = !loggedIn;
        syncBadge();
        syncFabWarmth();
        syncDots();
        var body = document.getElementById('friendsBody');
        if (!body || !loggedIn) { syncPagerHeight(0); return; }
        body.innerHTML = '';
        if (state.view === 'add') renderAdd(body);
        else if (state.view === 'detail') renderDetail(body);
        else renderList(body);
        syncPagerHeight(currentPage());
    }
    window.renderFriendsPage = render;

    function header(title, onBack, right) {
        var h = el('div', 'fr-head');
        if (onBack) {
            var back = btn('‹', 'fr-back', onBack);
            back.setAttribute('aria-label', T('fr_back'));
            h.appendChild(back);
        }
        h.appendChild(el('h3', 'fr-title', title));
        if (right) h.appendChild(right);
        return h;
    }
    function go(view, extra) {
        state.view = view; state.confirm = null;
        if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
        render();
        var card = document.getElementById('friendsCard');
        if (card) card.scrollTop = 0;
    }
    window.openFriendsAdd = function (prefill) {
        go('add', { lookup: null });
        if (prefill) {
            var input = document.getElementById('frCodeInput');
            if (input) { input.value = prefill; doLookup(prefill); }
        }
    };

    function renderList(body) {
        var add = btn(T('fr_add_btn'), 'fr-add-top', function () { window.openFriendsAdd(); });
        body.appendChild(header(TF('fr_title_n', { n: state.friends.length }), null, add));

        if (!state.loaded) { body.appendChild(el('p', 'fr-empty', T('fr_loading'))); return; }

        if (state.incoming.length) {
            body.appendChild(el('div', 'fr-label', T('fr_incoming')));
            state.incoming.forEach(function (x) {
                var p = profileOf(x.other);
                var row = el('div', 'fr-req');
                row.appendChild(avatar(p.color, 36));
                var meta = el('div', 'fr-meta');
                meta.appendChild(el('b', null, p.name));
                meta.appendChild(el('span', null, T('fr_req_sub')));
                row.appendChild(meta);
                var acts = el('div', 'fr-acts');
                acts.appendChild(btn(T('fr_reject'), 'ghost', function () { window.removeFriendship(x.id, 'reject').catch(function () { toast(T('fr_err_generic')); }); }));
                acts.appendChild(btn(T('fr_accept'), 'yellow', function () {
                    window.acceptFriend(x.id).then(function () { toast(TF('fr_accepted_toast', { name: p.name })); })
                        .catch(function (err) { toast((err && err.message && err.message !== 'login') ? err.message : T('fr_err_generic')); });
                }));
                row.appendChild(acts);
                body.appendChild(row);
            });
        }

        if (window.needsFriendShareConfirm && window.needsFriendShareConfirm()) body.appendChild(shareConfirmCard());

        var hot = state.friends.map(function (x) { return { x: x, m: mealOf(x.other) }; })
            .filter(function (v) { return v.m.teams > 0; })
            .sort(function (a, b) { return (b.m.teams - a.m.teams) || (b.m.n - a.m.n); });
        if (hot.length) {
            body.appendChild(el('div', 'fr-label', T('fr_meal_title')));
            body.appendChild(el('p', 'fr-note fr-meal-hint', T('fr_meal_hint')));   // 합석이 낯선 사람에게 한 줄
            var strip = el('div', 'fr-meal-strip');
            hot.forEach(function (v) {
                var p = profileOf(v.x.other);
                var b = el('button', 'fr-meal');
                b.type = 'button';
                b.onclick = function () { go('detail', { detailId: v.x.id }); };
                b.appendChild(warmAvatar(p.color, 48, v.m.tier));
                b.appendChild(el('b', null, p.name));
                b.appendChild(el('span', 'warm-' + v.m.tier, TF('fr_meal_tier', { tier: T('fr_warm_' + v.m.tier), n: v.m.teams })));
                strip.appendChild(b);
            });
            body.appendChild(strip);
        }

        if (!state.friends.length) {
            var empty = el('div', 'fr-empty-box');
            empty.appendChild(el('b', null, T('fr_empty_title')));
            empty.appendChild(el('p', null, T('fr_empty_body')));
            empty.appendChild(btn(T('fr_add_btn'), 'yellow', function () { window.openFriendsAdd(); }));
            body.appendChild(empty);
        } else {
            var list = el('div', 'fr-list');
            // 합석 많은 순, 같으면 이름순
            state.friends.slice().sort(function (a, b) {
                return (mealOf(b.other).teams - mealOf(a.other).teams) ||
                    profileOf(a.other).name.localeCompare(profileOf(b.other).name, 'ko');
            }).forEach(function (x) {
                var p = profileOf(x.other);
                var meal = mealOf(x.other);
                var row = el('button', 'fr-row');
                row.type = 'button';
                row.onclick = function () { go('detail', { detailId: x.id }); };
                row.appendChild(warmAvatar(p.color, 38, meal.tier));
                var meta = el('div', 'fr-meta');
                meta.appendChild(el('b', null, p.name));
                var since = fmtDate(x.doc.accepted_at);
                var changed = window.isFriendLunchboxChanged && window.isFriendLunchboxChanged(x.other);
                if (changed) meta.firstChild.appendChild(el('i', 'fr-changed-dot'));
                meta.appendChild(el('span', null, changed ? T('fr_lb_changed')
                    : meal.teams ? TF('fr_meal_tier', { tier: T('fr_warm_' + meal.tier), n: meal.teams })
                        : (since ? TF('fr_since', { d: since }) : T('fr_friend'))));
                row.appendChild(meta);
                row.appendChild(el('span', 'fr-chev', '›'));
                list.appendChild(row);
            });
            body.appendChild(list);
        }

        if (state.outgoing.length) {
            body.appendChild(el('div', 'fr-label', T('fr_outgoing')));
            state.outgoing.forEach(function (x) {
                var p = profileOf(x.other);
                var row = el('div', 'fr-row static');
                row.appendChild(avatar(p.color, 30));
                var meta = el('div', 'fr-meta');
                meta.appendChild(el('b', null, p.name));
                meta.appendChild(el('span', null, T('fr_waiting')));
                row.appendChild(meta);
                row.appendChild(btn(T('fr_cancel'), 'ghost small', function () { window.removeFriendship(x.id, 'cancel').catch(function () { toast(T('fr_err_generic')); }); }));
                body.appendChild(row);
            });
        }
        if (state.friends.length && window.isFriendHideAll) body.appendChild(visibilityRow());
    }

    function renderAdd(body) {
        body.appendChild(header(T('fr_add_title'), function () { go('list'); }));

        // 내 코드
        body.appendChild(el('div', 'fr-label', T('fr_my_code')));
        var codeBox = el('div', 'fr-code');
        var codeText = el('b', 'fr-code-text', state.myCode || '······');
        codeBox.appendChild(codeText);
        var copyBtn = btn(T('fr_copy'), 'yellow small', function () {
            if (!state.myCode) return;
            copy(state.myCode, T('fr_code_copied'));
            track('invite_code_copy', { kind: 'code' });
        });
        codeBox.appendChild(copyBtn);
        body.appendChild(codeBox);

        var row = el('div', 'fr-inline');
        row.appendChild(btn(T('fr_copy_link'), 'ghost small', function () {
            if (!state.myCode) return;
            copy(inviteUrl(state.myCode), T('fr_link_copied'));
            track('invite_code_copy', { kind: 'link' });
        }));
        var qrWrap = el('div', 'fr-qr');
        qrWrap.hidden = true;
        row.appendChild(btn(T('fr_show_qr'), 'ghost small', function () {
            if (!state.myCode) return;
            qrWrap.hidden = !qrWrap.hidden;
            if (!qrWrap.hidden && !qrWrap.firstChild) drawQr(qrWrap, inviteUrl(state.myCode));
        }));
        // 새 코드 받기: 옛 코드는 바로 무효라 두 단계로 확인
        var regen = state.confirm === 'regen'
            ? btn(T('fr_regen_confirm'), 'danger small', function () {
                state.confirm = null;
                window.regenerateInviteCode().then(function () { render(); toast(T('fr_regen_done')); })
                    .catch(function () { render(); toast(T('fr_err_generic')); });
            })
            : btn(T('fr_regen'), 'ghost small', function () { state.confirm = 'regen'; render(); });
        if (!state.myCode) regen.disabled = true;   // 아직 못 받은 코드는 바꿀 수 없다(옛 코드가 살아남는다)
        row.appendChild(regen);
        body.appendChild(row);
        if (state.confirm === 'regen') body.appendChild(el('p', 'fr-note', T('fr_regen_note')));
        body.appendChild(qrWrap);

        if (!state.myCode) {
            window.ensureMyInviteCode().then(render).catch(function () { codeText.textContent = T('fr_err_generic'); });
        }

        // 친구 코드 넣기
        body.appendChild(el('div', 'fr-divider', T('fr_enter_divider')));
        var form = el('form', 'fr-form');
        var input = el('input', 'fr-input');
        input.id = 'frCodeInput';
        input.setAttribute('inputmode', 'text');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'characters');
        input.maxLength = 8;
        input.placeholder = T('fr_code_ph');
        input.setAttribute('aria-label', T('fr_code_ph'));
        // 코드 발급이 끝나면 render() 가 다시 그린다 — 그때 입력 중이던 글자가 날아가지 않게 state 에 둔다
        input.value = state.lookup && state.lookup.code ? state.lookup.code : (state.typed || '');
        input.addEventListener('input', function () { state.typed = input.value; });
        form.appendChild(input);
        var find = el('button', 'fr-btn yellow', T('fr_find'));
        find.type = 'submit';
        form.appendChild(find);
        form.onsubmit = function (e) { e.preventDefault(); doLookup(input.value); };
        body.appendChild(form);

        var res = el('div', 'fr-result');
        res.id = 'frLookupResult';
        body.appendChild(res);
        renderLookup(res);
        body.appendChild(el('p', 'fr-note', T('fr_accept_note')));
    }

    function doLookup(raw) {
        state.lookup = { status: 'loading', code: normalizeCode(raw) || raw };
        renderLookup(document.getElementById('frLookupResult'));
        window.lookupInviteCode(raw).then(function (r) {
            state.lookup = r;
            renderLookup(document.getElementById('frLookupResult'));
        }).catch(function () {
            state.lookup = { status: 'error' };
            renderLookup(document.getElementById('frLookupResult'));
        });
    }

    function renderLookup(box) {
        if (!box) return;
        box.innerHTML = '';
        var r = state.lookup;
        if (!r) return;
        var msgKey = { loading: 'fr_lk_loading', invalid: 'fr_lk_invalid', not_found: 'fr_lk_not_found', self: 'fr_lk_self', error: 'fr_err_generic' }[r.status];
        if (msgKey) { box.appendChild(el('p', 'fr-msg', T(msgKey))); return; }
        var hit = el('div', 'fr-hit');
        hit.appendChild(avatar(r.color, 36));
        var meta = el('div', 'fr-meta');
        meta.appendChild(el('b', null, r.name));
        var subKey = { ok: 'fr_lk_ok', friend: 'fr_lk_friend', sent: 'fr_lk_sent', received: 'fr_lk_received' }[r.status];
        meta.appendChild(el('span', null, T(subKey)));
        hit.appendChild(meta);
        if (r.status === 'ok' || r.status === 'received') {
            hit.appendChild(btn(T(r.status === 'received' ? 'fr_accept' : 'fr_request'), 'yellow', function (e) {
                e.currentTarget.disabled = true;
                window.sendFriendRequest(r.code, r.uid).then(function (out) {
                    r.status = out === 'accepted' || out === 'friend' ? 'friend' : 'sent';
                    toast(T(out === 'accepted' ? 'fr_accepted_short' : out === 'friend' ? 'fr_lk_friend' : 'fr_sent_toast'));
                    renderLookup(box);
                }).catch(function (err) {
                    toast((err && err.message && err.message !== 'login') ? err.message : T('fr_err_generic'));
                    renderLookup(box);
                });
            }));
        }
        box.appendChild(hit);
    }

    // ── 2단계: 식단표 공유 조각 ──────────────────────────────────
    // 첫 밥친구 때 '보일 팀' 확인. 기본이 전부 보이기라, 이걸 마치기 전에는 사본을 쓰지 않는다.
    function shareConfirmCard() {
        var p = window.currentProfileData || {};
        var box = el('div', 'fr-confirm');
        box.appendChild(el('b', null, T('fr_share_title')));
        box.appendChild(el('p', null, T('fr_share_body')));
        var list = el('div', 'fr-checks');
        var ids = [], unresolved = false;
        (p.bookmarks || []).slice(0, 5).forEach(function (id) {
            if (id == null) return;
            var team = (window.findClub ? window.findClub(id) : null) || (p.customTeams && p.customTeams[id]);
            // 동호회 목록이 아직 안 왔거나 실패했으면 이 팀을 보여줄 수 없다 — 그 상태로 '이대로 보이기'를
            // 누르면 못 본 팀까지 공개되므로 버튼을 두지 않는다(목록이 오면 refreshFriendLunchboxes 가 다시 그린다)
            if (!team) { unresolved = true; return; }
            ids.push(id);
            var lab = el('label', 'fr-check');
            var cb = el('input');
            cb.type = 'checkbox';
            cb.checked = (p.friend_hidden || []).map(String).indexOf(String(id)) === -1;
            cb.value = id;
            lab.appendChild(cb);
            lab.appendChild(el('span', null, (team.isCustom ? '🍙 ' : '') + (team.name || '')));
            list.appendChild(lab);
        });
        if (!ids.length && !unresolved) list.appendChild(el('p', 'fr-note', T('fr_share_none')));
        box.appendChild(list);
        if (unresolved) { box.appendChild(el('p', 'fr-note', T('fr_loading'))); return box; }
        box.appendChild(btn(T('fr_share_ok'), 'yellow', function (e) {
            e.currentTarget.disabled = true;
            var hidden = [];
            list.querySelectorAll('input[type=checkbox]').forEach(function (c) { if (!c.checked) hidden.push(c.value); });
            window.confirmFriendShare(hidden).then(function () { render(); toast(T('fr_share_done')); })
                .catch(function () { render(); toast(T('fr_err_generic')); });
        }));
        return box;
    }

    // '밥친구에게 내 식단표 보이기' 스위치 (끄면 친구에게는 네임카드만)
    function visibilityRow() {
        var on = !window.isFriendHideAll();
        var row = el('label', 'fr-vis');
        var meta = el('div', 'fr-meta');
        meta.appendChild(el('b', null, T('fr_vis_title')));
        meta.appendChild(el('span', null, T(on ? 'fr_vis_on' : 'fr_vis_off')));
        row.appendChild(meta);
        var sw = el('input', 'fr-switch');
        sw.type = 'checkbox';
        sw.setAttribute('role', 'switch');
        sw.checked = on;
        sw.onchange = function () {
            window.setFriendHideAll(!sw.checked).then(render).catch(function () { toast(T('fr_err_generic')); });
        };
        row.appendChild(sw);
        return row;
    }

    function renderFriendLunchbox(host, other) {
        host.appendChild(el('p', 'fr-note center', T('fr_loading')));
        window.loadFriendLunchbox(other, true).then(function (r) {
            host.innerHTML = '';
            if (r.status !== 'ok') {
                host.appendChild(el('p', 'fr-note center', T(r.status === 'hidden' ? 'fr_lb_hidden' : 'fr_lb_none')));
                return;
            }
            window.markFriendLunchboxSeen(other);
            syncDots();
            host.appendChild(el('div', 'fr-label', T('fr_lb_title')));
            var chips = el('div', 'fr-chips');
            if (!r.teams.length) chips.appendChild(el('span', 'fr-note', T('fr_lb_empty')));
            r.teams.forEach(function (t) {
                var c = el('span', 'fr-chip slot-' + (t.slot % 5), (t.isCustom ? '🍙 ' : '') + t.name);
                chips.appendChild(c);
            });
            host.appendChild(chips);
            host.appendChild(el('div', 'fr-label', T('fr_tt_title')));
            var tt = el('div', 'fr-tt-host');
            host.appendChild(tt);
            var meal = mealOf(other);
            window.renderFriendTimetable(tt, window.myFriendEvents(), window.friendSharePure.scheduleEvents(r.teams), meal.overlaps);
            if (!meal.n) { host.appendChild(el('p', 'fr-note center', T('fr_meal_zero'))); return; }
            // 합석 목록을 글로 한 번 더 — 표만으로는 요일·시각을 읽기 어렵다
            var ses = el('div', 'fr-sess-list');
            window.friendSharePure.sortOverlaps(meal.overlaps).forEach(function (o) {
                var row = el('div', 'fr-sess');
                row.appendChild(el('b', null, (window.i18nDay ? window.i18nDay(o.day) : o.day) + ' ' + window.friendSharePure.fmtRange(o.start, o.end)));
                var c = window.findClub ? window.findClub(o.id) : null;
                row.appendChild(el('span', null, c ? (c.name || '') : ''));
                ses.appendChild(row);
            });
            host.appendChild(ses);
        });
    }

    function renderDetail(body) {
        var x = state.friends.filter(function (f) { return f.id === state.detailId; })[0];
        if (!x) { go('list'); return; }
        var p = profileOf(x.other);
        body.appendChild(header(p.name, function () { go('list'); }));
        var mini = el('div', 'fr-mini');
        mini.style.background = p.color;
        var meal = mealOf(x.other);
        mini.appendChild(warmAvatar('#FFFFFF', 56, meal.tier));
        var t = el('div', 'fr-meta');
        t.appendChild(el('b', null, p.name));
        if (meal.tier) t.appendChild(el('em', 'fr-warm-tag warm-' + meal.tier, TF('fr_meal_tier', { tier: T('fr_warm_' + meal.tier), n: meal.teams })));
        var since = fmtDate(x.doc.accepted_at);
        t.appendChild(el('span', null, since ? TF('fr_since', { d: since }) : T('fr_friend')));
        mini.appendChild(t);
        body.appendChild(mini);
        var lb = el('div', 'fr-lb');
        body.appendChild(lb);
        renderFriendLunchbox(lb, x.other);

        var end = state.confirm === 'unfriend'
            ? btn(T('fr_unfriend_confirm'), 'danger', function () {
                window.removeFriendship(x.id, 'unfriend').then(function () { go('list'); toast(T('fr_unfriended')); })
                    .catch(function () { toast(T('fr_err_generic')); });
            })
            : btn(T('fr_unfriend'), 'ghost', function () { state.confirm = 'unfriend'; render(); });
        var foot = el('div', 'fr-foot');
        foot.appendChild(end);
        body.appendChild(foot);
        if (state.confirm === 'unfriend') body.appendChild(el('p', 'fr-note center', T('fr_unfriend_note')));
    }

    function drawQr(host, url) {
        if (!window.qrcode) { host.appendChild(el('p', 'fr-note', url)); return; }
        try {
            var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
            var n = qr.getModuleCount(), quiet = 4, cell = 4;
            var c = document.createElement('canvas');
            c.width = c.height = (n + quiet * 2) * cell;
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = '#1C140D';
            for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) {
                if (qr.isDark(r, k)) ctx.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
            }
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', T('fr_qr_aria'));
            host.appendChild(c);
        } catch (e) { host.appendChild(el('p', 'fr-note', url)); }
    }

    // ── ?invite=CODE 착지 ───────────────────────────────────────
    // 로그인 전이면 코드를 세션에 두고 네임카드(로그인) 팝업을 연다. 로그인되면 이어서 둘째 장·추가 화면.
    var INVITE_KEY = 'nurungji_pending_invite';
    function readInviteParam() {
        try { return normalizeCode(new URLSearchParams(location.search).get('invite')); } catch (e) { return ''; }
    }
    function resumeInviteLink() {
        var code = '';
        try { code = sessionStorage.getItem(INVITE_KEY) || ''; sessionStorage.removeItem(INVITE_KEY); } catch (e) { }
        code = code || readInviteParam();
        if (!code) return;
        clearInviteParam();
        var overlay = document.getElementById('profileOverlay');
        if (overlay) overlay.style.display = 'flex';
        render();
        requestAnimationFrame(function () {
            window.goProfilePage(1, false);
            window.openFriendsAdd(code);
        });
        track('deep_link_open', { invite: 1 });
    }
    function clearInviteParam() {
        try {
            var u = new URL(location.href);
            if (!u.searchParams.has('invite')) return;
            u.searchParams.delete('invite');
            history.replaceState(history.state, '', u.pathname + (u.search ? u.search : '') + u.hash);
        } catch (e) { }
    }
    // 로그인 안 된 채 초대 링크로 들어온 경우: 코드를 기억해 두고 로그인 팝업을 띄운다.
    window.addEventListener('load', function () {
        var code = readInviteParam();
        if (!code) return;
        setTimeout(function () {
            if (state.uid) return;   // 이미 로그인 → onFriendsAuth 가 처리
            try { sessionStorage.setItem(INVITE_KEY, code); } catch (e) { }
            clearInviteParam();
            var overlay = document.getElementById('profileOverlay');
            if (overlay && overlay.style.display !== 'flex') overlay.style.display = 'flex';
        }, 1500);
    });

    document.addEventListener('nurungji:langchange', render);
    document.addEventListener('nurungji:langchange', syncFabLabel);
})();
