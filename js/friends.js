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
// 식단표 공유·겸상은 2·3단계. 이 파일은 관계만 다룬다.
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

    window.ensureMyInviteCode = function () {
        var uid = state.uid;
        if (!uid || !db()) return Promise.reject(new Error('login'));
        if (state.myCode) return Promise.resolve(state.myCode);
        return privateRef(uid).get().then(function (snap) {
            var c = snap.exists ? (snap.data() || {}).invite_code : null;
            if (c) return c;
            return claimNewCode(uid).then(function (code) {
                return privateRef(uid).set({ invite_code: code }, { merge: true }).then(function () { return code; });
            });
        }).then(function (code) { state.myCode = code; return code; });
    };

    // 새 코드 받기: 새 코드를 먼저 잡고, 저장하고, 옛 코드를 지운다(순서가 바뀌면 코드가 없는 순간이 생긴다).
    window.regenerateInviteCode = function () {
        var uid = state.uid, old = state.myCode;
        return claimNewCode(uid).then(function (code) {
            return privateRef(uid).set({ invite_code: code }, { merge: true }).then(function () {
                state.myCode = code;
                if (old) return db().collection('invite_codes').doc(old).delete().catch(function () { }).then(function () { return code; });
                return code;
            });
        });
    };

    function loadProfile(uid) {
        if (state.profiles[uid]) return Promise.resolve(state.profiles[uid]);
        return db().collection('users').doc(uid).get().then(function (snap) {
            var d = snap.exists ? snap.data() : {};
            var name = d.full_nickname || d.nickname || T('fr_unknown');
            var rice = d.nickname || String(name).split('-')[0];
            var p = { name: name, color: d.color || (window.riceColorOf ? window.riceColorOf(rice) : '#FFF9C4') };
            state.profiles[uid] = p;
            return p;
        }).catch(function () { return { name: T('fr_unknown'), color: '#FFF9C4' }; });
    }

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
    var REQ_DAY_KEY = 'nurungji_friend_req_day';
    function requestsToday() { try { return countToday(localStorage.getItem(REQ_DAY_KEY), Date.now()); } catch (e) { return 0; } }
    function bumpRequestsToday() {
        try { localStorage.setItem(REQ_DAY_KEY, JSON.stringify({ d: dayKey(Date.now()), n: requestsToday() + 1 })); } catch (e) { }
    }

    window.acceptFriend = function (id) {
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
    }

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
    var SEEN_KEY = 'nurungji_seen_friend_req';
    function seenIds() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
    function markSeen() {
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(state.incoming.map(function (x) { return x.id; }))); } catch (e) { }
    }
    function hasUnseen() {
        var seen = seenIds();
        if (state.incoming.some(function (x) { return seen.indexOf(x.id) === -1; })) return true;
        if (window.needsFriendShareConfirm && window.needsFriendShareConfirm()) return true;
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
        track('friends_open');
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
    }
    // 이번 주 겸상 친구가 있으면 🍚 버블에도 김과 금빛 테두리(가장 높은 익힘 단계).
    function syncFabWarmth() {
        var fab = document.getElementById('fabProfile');
        if (!fab) return;
        var tier = 0;
        if (state.uid && window.friendMeal) {
            state.friends.forEach(function (f) { tier = Math.max(tier, window.friendMeal(f.other).tier); });
        }
        fab.classList.remove('warm-1', 'warm-2', 'warm-3');
        fab.classList.toggle('fab-warm', tier > 0);
        var steam = fab.querySelector('.fab-steam');
        if (!tier) {
            if (steam) steam.remove();
            fab.removeAttribute('title');
            return;
        }
        fab.classList.add('warm-' + tier);
        fab.title = T('fr_meal_fab');
        // 김: 뜸은 한 줄, 노릇·누룽지는 두 줄
        var lines = Math.min(tier, 2);
        if (steam && steam.children.length !== lines) { steam.remove(); steam = null; }
        if (!steam) {
            steam = el('span', 'fab-steam');
            steam.setAttribute('aria-hidden', 'true');
            for (var i = 0; i < lines; i++) steam.appendChild(el('i'));
            fab.appendChild(steam);
        }
    }
    window.syncFriendsBadge = function () { syncBadge(); syncFabWarmth(); };

    // 팝업을 열 때마다 첫 장부터. auth.js 의 toggleProfileCard 가 부른다.
    window.resetProfilePager = function () {
        state.view = 'list'; state.confirm = null;
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
    var BOWL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3D2C22" d="M12 4.6c-1.9 0-3.2 1-3.9 2.2-1-.4-2.4.3-2.4 1.7 0 .9.7 1.5 1.4 1.5h9.8c.7 0 1.4-.6 1.4-1.5 0-1.4-1.4-2.1-2.4-1.7-.7-1.2-2-2.2-3.9-2.2zM4.2 11.6h15.6c0 3.1-2.5 5.6-5.8 6.2v.9c0 .4-.3.7-.7.7h-2.6c-.4 0-.7-.3-.7-.7v-.9c-3.3-.6-5.8-3.1-5.8-6.2z"/></svg>';
    function avatar(color, size) {
        var a = el('div', 'fr-av');
        a.style.background = color || '#FFF9C4';
        if (size) { a.style.width = size + 'px'; a.style.height = size + 'px'; }
        a.innerHTML = BOWL;   // 고정 SVG — 사용자 입력 아님
        return a;
    }
    // 익힘 효과를 두른 아바타. big 이 아니면 테두리 색만 — 목록 스크롤이 요란하지 않게.
    //   1 뜸: 옅은 테두리 + 김 한 줄 · 2 노릇: 금빛 테두리가 숨 쉬듯 · 3 누룽지: 도는 갈색 테두리 + 부스러기
    function warmAvatar(color, size, tier, big) {
        var a = avatar(color, size);
        if (!tier) return a;
        var w = el('div', 'fr-warm warm-' + tier + (big ? ' big' : ''));
        w.appendChild(a);
        if (big) {
            for (var i = 0; i < Math.min(tier, 2); i++) w.appendChild(el('i', 'fr-steam s' + i));
            if (tier === 3) for (var k = 0; k < 5; k++) w.appendChild(el('i', 'fr-crumb c' + k));
        }
        return w;
    }
    function mealOf(uid) { return window.friendMeal ? window.friendMeal(uid) : { n: 0, tier: 0, overlaps: [] }; }
    function profileOf(uid) { return state.profiles[uid] || { name: '…', color: '#F3E9D2' }; }
    function fmtDate(t) {
        var ms = toMillis(t);
        if (!ms) return '';
        var d = new Date(ms);
        return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    }
    function toast(msg) {
        var box = document.getElementById('friendsToast');
        if (!box) return;
        box.textContent = msg;
        box.hidden = false;
        clearTimeout(box._t);
        box._t = setTimeout(function () { box.hidden = true; }, 2400);
    }
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
                acts.appendChild(btn(T('fr_reject'), 'ghost', function () { window.removeFriendship(x.id, 'reject'); }));
                acts.appendChild(btn(T('fr_accept'), 'yellow', function () {
                    window.acceptFriend(x.id).then(function () { toast(TF('fr_accepted_toast', { name: p.name })); })
                        .catch(function () { toast(T('fr_err_generic')); });
                }));
                row.appendChild(acts);
                body.appendChild(row);
            });
        }

        if (window.needsFriendShareConfirm && window.needsFriendShareConfirm()) body.appendChild(shareConfirmCard());

        var hot = state.friends.map(function (x) { return { x: x, m: mealOf(x.other) }; })
            .filter(function (v) { return v.m.n > 0; })
            .sort(function (a, b) { return b.m.n - a.m.n; });
        if (hot.length) {
            body.appendChild(el('div', 'fr-label', T('fr_meal_title')));
            body.appendChild(el('p', 'fr-note fr-meal-hint', T('fr_meal_hint')));   // 겸상이 낯선 사람에게 한 줄
            var strip = el('div', 'fr-meal-strip');
            hot.forEach(function (v) {
                var p = profileOf(v.x.other);
                var b = el('button', 'fr-meal');
                b.type = 'button';
                b.onclick = function () { go('detail', { detailId: v.x.id }); };
                b.appendChild(warmAvatar(p.color, 48, v.m.tier, true));
                b.appendChild(el('b', null, p.name));
                b.appendChild(el('span', 'warm-' + v.m.tier, TF('fr_meal_tier', { tier: T('fr_warm_' + v.m.tier), n: v.m.n })));
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
            // 겸상 많은 순, 같으면 이름순
            state.friends.slice().sort(function (a, b) {
                return (mealOf(b.other).n - mealOf(a.other).n) ||
                    profileOf(a.other).name.localeCompare(profileOf(b.other).name, 'ko');
            }).forEach(function (x) {
                var p = profileOf(x.other);
                var meal = mealOf(x.other);
                var row = el('button', 'fr-row');
                row.type = 'button';
                row.onclick = function () { go('detail', { detailId: x.id }); };
                row.appendChild(warmAvatar(p.color, 38, meal.tier, false));
                var meta = el('div', 'fr-meta');
                meta.appendChild(el('b', null, p.name));
                var since = fmtDate(x.doc.accepted_at);
                var changed = window.isFriendLunchboxChanged && window.isFriendLunchboxChanged(x.other);
                if (changed) meta.firstChild.appendChild(el('i', 'fr-changed-dot'));
                meta.appendChild(el('span', null, changed ? T('fr_lb_changed')
                    : meal.n ? TF('fr_meal_tier', { tier: T('fr_warm_' + meal.tier), n: meal.n })
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
                row.appendChild(btn(T('fr_cancel'), 'ghost small', function () { window.removeFriendship(x.id, 'cancel'); }));
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
        if (state.lookup && state.lookup.code) input.value = state.lookup.code;
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
                    toast(T(out === 'accepted' ? 'fr_accepted_short' : 'fr_sent_toast'));
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
        var ids = [];
        (p.bookmarks || []).slice(0, 5).forEach(function (id) {
            if (id == null) return;
            var team = window.findClub ? window.findClub(id) : null;
            if (!team) return;
            ids.push(id);
            var lab = el('label', 'fr-check');
            var cb = el('input');
            cb.type = 'checkbox';
            cb.checked = (p.friend_hidden || []).indexOf(id) === -1;
            cb.value = id;
            lab.appendChild(cb);
            lab.appendChild(el('span', null, (team.isCustom ? '🍙 ' : '') + (team.name || '')));
            list.appendChild(lab);
        });
        if (!ids.length) list.appendChild(el('p', 'fr-note', T('fr_share_none')));
        box.appendChild(list);
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
            // 겸상 목록을 글로 한 번 더 — 표만으로는 요일·시각을 읽기 어렵다
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
        mini.appendChild(warmAvatar('#FFFFFF', 56, meal.tier, true));
        var t = el('div', 'fr-meta');
        t.appendChild(el('b', null, p.name));
        if (meal.tier) t.appendChild(el('em', 'fr-warm-tag warm-' + meal.tier, TF('fr_meal_tier', { tier: T('fr_warm_' + meal.tier), n: meal.n })));
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
            history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
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
})();
