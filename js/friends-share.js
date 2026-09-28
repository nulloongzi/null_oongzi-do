// friends-share.js — 밥친구 2단계: 친구에게 보이는 도시락(식단표) 공유.
//
// 비공개 도시락(users/{uid}/private/profile)을 친구에게 여는 대신, **보이기로 켠 팀만**
// 담은 사본을 users/{uid}/shared/lunchbox 에 둔다. 숨긴 팀은 처음부터 사본에 쓰지 않는다 —
// 받는 쪽 화면에서 가리는 게 아니라 데이터가 안 간다(firestore.rules 가 친구만 읽게 한다).
//
// 설정은 하나(모든 밥친구에게 같은 도시락):
//   private.friend_hidden   [팀id]   숨긴 팀 (도시락 편집의 눈 스위치)
//   private.friend_hide_all bool     식단표 전부 숨기기
//   private.friend_share_ok bool     첫 밥친구 때 '보일 팀' 확인을 마쳤나
// 확인 전에는 사본을 쓰지 않는다 — 기본이 전부 보이기라, 모르는 사이에 공개되는 일이 없게.
//
// Depends on: friends.js (friendState), lunchbox.js, club-detail.js (parseScheduleText),
//             data.js (findClub), i18n.js
(function () {
    // ── 순수 규칙 (tests/friends-share.test.js) ──────────────────────
    // 저장된 도시락 → 친구용 사본. 칸 순서를 지키고 빈칸·숨긴 팀은 뺀다.
    // 직접 추가한 팀은 id 가 친구에게 의미가 없으니 이름·일정만 담는다.
    function buildSharedLunchbox(bookmarks, customTeams, hidden, hideAll) {
        var out = { teams: [], custom: [], hide_all: !!hideAll };
        if (hideAll) return out;
        var hid = hidden || [];
        (bookmarks || []).slice(0, 5).forEach(function (id) {
            if (id == null || hid.indexOf(id) !== -1) return;
            var c = customTeams && customTeams[id];
            if (c) {
                out.custom.push({
                    name: String(c.name || '').slice(0, 80),
                    schedule: String(c.schedule || '').slice(0, 600)
                });
            } else {
                out.teams.push(String(id));
            }
        });
        return out;
    }
    function sharedEqual(a, b) {
        if (!a || !b) return false;
        return JSON.stringify([a.teams, a.custom, !!a.hide_all]) === JSON.stringify([b.teams, b.custom, !!b.hide_all]);
    }
    // 팀 목록([{name, schedule}]) → 식단표 이벤트 [{day, start, end, name, slot}]
    function scheduleEvents(entries, parse) {
        parse = parse || window.parseScheduleText;
        var out = [];
        (entries || []).forEach(function (e, i) {
            var m = parse ? parse(e.schedule) || {} : {};
            Object.keys(m).forEach(function (day) {
                var d = m[day];
                out.push({
                    day: day,
                    start: d.startH + (d.startM || 0) / 60,
                    end: d.endH + (d.endM || 0) / 60,
                    name: e.name,
                    slot: e.slot != null ? e.slot : i
                });
            });
        });
        return out;
    }
    // 겸상: 같은 동호회(id) · 같은 요일 · 30분 이상 겹치는 시간. 직접 추가한 팀은 같은 팀인지
    // 알 수 없어서 넣지 않는다. mine/theirs 는 [{id, events:[{day,start,end}]}] — 양쪽 모두
    // 친구에게 공개한 팀이어야 한다(숨긴 팀까지 세면 두 사람의 숫자가 달라져 숨긴 팀이 드러난다).
    var MEAL_MIN_H = 0.5;
    function mealOverlaps(mine, theirs) {
        var out = [], seen = {};
        (mine || []).forEach(function (m) {
            (theirs || []).forEach(function (o) {
                if (!m.id || m.id !== o.id) return;
                (m.events || []).forEach(function (a) {
                    (o.events || []).forEach(function (b) {
                        if (a.day !== b.day) return;
                        var s = Math.max(a.start, b.start), e = Math.min(a.end, b.end);
                        if (e - s < MEAL_MIN_H) return;
                        var k = m.id + '|' + a.day + '|' + s + '|' + e;
                        if (seen[k]) return;
                        seen[k] = 1;
                        out.push({ id: m.id, day: a.day, start: s, end: e });
                    });
                });
            });
        });
        return out;
    }
    // 익힘 단계: 한 주 겸상 횟수 → 0 생쌀 · 1 뜸 · 2 노릇 · 3 누룽지(3회 이상)
    function warmthTier(n) { return n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0; }
    window.friendSharePure = {
        buildSharedLunchbox: buildSharedLunchbox, sharedEqual: sharedEqual, scheduleEvents: scheduleEvents,
        mealOverlaps: mealOverlaps, warmthTier: warmthTier
    };

    function prof() { return window.currentProfileData; }
    function uid() { return window.friendState && window.friendState.uid; }
    function db() { return window.firebaseDB; }
    function sharedRef(u) { return db().collection('users').doc(u).collection('shared').doc('lunchbox'); }
    function privateSet(data) {
        var u = uid();
        if (!u || !db() || !window.userPrivateRef) return Promise.resolve();
        return window.userPrivateRef(u).set(data, { merge: true });
    }

    // ── 내 설정 ──────────────────────────────────────────────────
    window.isFriendHidden = function (id) {
        var p = prof();
        return !!(p && (p.friend_hidden || []).indexOf(id) !== -1);
    };
    window.isFriendHideAll = function () { var p = prof(); return !!(p && p.friend_hide_all); };
    window.needsFriendShareConfirm = function () {
        var p = prof(), s = window.friendState;
        return !!(p && s && s.uid && s.friends.length > 0 && !p.friend_share_ok);
    };

    window.setFriendHidden = function (id, hide) {
        var p = prof();
        if (!p || !id) return Promise.resolve();
        var list = (p.friend_hidden || []).filter(function (x) { return x !== id; });
        if (hide) list.push(id);
        p.friend_hidden = list;
        if (window.track) window.track('friend_team_visibility', { hidden: hide ? 1 : 0 });
        return privateSet({ friend_hidden: list }).then(window.syncFriendShare);
    };
    window.setFriendHideAll = function (v) {
        var p = prof();
        if (!p) return Promise.resolve();
        p.friend_hide_all = !!v;
        if (window.track) window.track('friend_hide_all', { on: v ? 1 : 0 });
        return privateSet({ friend_hide_all: !!v }).then(window.syncFriendShare);
    };
    // 첫 밥친구 때 '보일 팀' 확인. hiddenIds 는 체크를 끈 팀.
    window.confirmFriendShare = function (hiddenIds) {
        var p = prof();
        if (!p) return Promise.resolve();
        p.friend_hidden = (hiddenIds || []).slice();
        p.friend_share_ok = true;
        if (window.track) window.track('friend_share_confirm', { hidden: p.friend_hidden.length });
        return privateSet({ friend_hidden: p.friend_hidden, friend_share_ok: true }).then(window.syncFriendShare);
    };

    // ── 사본 동기화 ─────────────────────────────────────────────
    // 도시락 저장·설정 변경 때 부른다. 내용이 같으면 쓰지 않는다 — updated_at 이 곧 '도시락 바뀜' 신호라서.
    var lastShared = null, lastLoadedFor = null;
    window.syncFriendShare = function () {
        var u = uid(), p = prof();
        if (!u || !p || !db() || !p.friend_share_ok) return Promise.resolve();
        var want = buildSharedLunchbox(p.bookmarks, p.customTeams, p.friend_hidden, p.friend_hide_all);
        var ready = lastLoadedFor === u ? Promise.resolve() : sharedRef(u).get().then(function (snap) {
            lastLoadedFor = u;
            lastShared = snap.exists ? snap.data() : null;
        }).catch(function () { lastLoadedFor = u; });
        return ready.then(function () {
            if (sharedEqual(want, lastShared)) return;
            var doc = { teams: want.teams, custom: want.custom, hide_all: want.hide_all, updated_at: window.firebaseServerTimestamp() };
            return sharedRef(u).set(doc).then(function () { lastShared = want; });
        }).then(function () {
            // 내 공개 팀이 바뀌면 겸상도 바뀐다 — 🍚 버블의 익힘 효과를 다시 맞춘다
            if (window.syncFriendsBadge) window.syncFriendsBadge();
        }).catch(function (e) { console.warn('밥친구 도시락 공유 실패:', e && e.message); });
    };
    window.resetFriendShareCache = function () { lastShared = null; lastLoadedFor = null; friendCache = {}; };

    // ── 친구 도시락 ─────────────────────────────────────────────
    // uid → { status: 'ok'|'none'|'hidden', teams:[{id,name,schedule,slot}], updatedMs }
    var friendCache = {};
    function toMs(t) { return t && t.toMillis ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : 0); }

    window.loadFriendLunchbox = function (other, force) {
        if (!force && friendCache[other]) return Promise.resolve(friendCache[other]);
        if (!db()) return Promise.resolve({ status: 'none', teams: [] });
        return sharedRef(other).get().then(function (snap) {
            var r;
            if (!snap.exists) r = { status: 'none', teams: [], updatedMs: 0 };
            else {
                var d = snap.data() || {};
                var teams = [];
                (d.teams || []).forEach(function (id) {
                    var c = window.findClub ? window.findClub(id) : null;
                    if (c) teams.push({ id: id, name: c.name || '', schedule: c.schedule || '' });
                });
                (d.custom || []).forEach(function (c, i) {
                    teams.push({ id: 'custom_' + i, name: c.name || '', schedule: c.schedule || '', isCustom: true });
                });
                teams.forEach(function (t, i) { t.slot = i; });
                r = { status: d.hide_all ? 'hidden' : 'ok', teams: d.hide_all ? [] : teams, updatedMs: toMs(d.updated_at) };
            }
            friendCache[other] = r;
            return r;
        }).catch(function () { return { status: 'none', teams: [] }; });
    };
    window.peekFriendLunchbox = function (other) { return friendCache[other] || null; };

    // '도시락 바뀜': 친구 사본의 updated_at 이 마지막으로 본 시각보다 뒤면. 처음 보는 친구는
    // 기준만 잡는다(새 친구를 '바뀜'으로 띄우지 않는다). 기준은 이 기기에만 둔다.
    var SEEN_KEY = 'nurungji_friend_lb_seen';
    function seenMap() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { return {}; } }
    function saveSeen(m) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch (e) { } }
    window.isFriendLunchboxChanged = function (other) {
        var r = friendCache[other];
        if (!r || !r.updatedMs) return false;
        var m = seenMap();
        if (m[other] == null) { m[other] = r.updatedMs; saveSeen(m); return false; }
        return r.updatedMs > m[other];
    };
    window.markFriendLunchboxSeen = function (other) {
        var r = friendCache[other];
        if (!r || !r.updatedMs) return;
        var m = seenMap(); m[other] = r.updatedMs; saveSeen(m);
    };

    // 내 식단표 이벤트(보는 사람은 나라서 숨긴 팀도 포함한다)
    window.myFriendEvents = function () {
        var p = prof();
        if (!p) return [];
        var entries = [];
        (p.bookmarks || []).slice(0, 5).forEach(function (id, i) {
            if (id == null) return;
            var t = window.findClub ? window.findClub(id) : null;
            if (t) entries.push({ name: t.name || '', schedule: t.schedule || '', slot: i });
        });
        return scheduleEvents(entries);
    };

    // ── 겸상 · 익힘 ─────────────────────────────────────────────
    // 내 쪽은 친구에게 실제로 보이는 팀만 센다 — 확인 전이거나 전부 숨기기면 겸상도 없다.
    function clubEntry(id) {
        var c = window.findClub ? window.findClub(id) : null;
        return c ? { id: id, events: scheduleEvents([{ name: c.name || '', schedule: c.schedule || '' }]) } : null;
    }
    window.myMealTeams = function () {
        var p = prof();
        if (!p || !p.friend_share_ok || p.friend_hide_all) return [];
        return buildSharedLunchbox(p.bookmarks, p.customTeams, p.friend_hidden, false).teams
            .map(clubEntry).filter(Boolean);
    };
    // 친구 한 명과의 이번 주 겸상 { n, tier, overlaps }. 친구 도시락은 캐시(loadFriendLunchbox)에서.
    window.friendMeal = function (other) {
        var r = window.peekFriendLunchbox(other);
        if (!r || r.status !== 'ok') return { n: 0, tier: 0, overlaps: [] };
        var theirs = r.teams.filter(function (t) { return !t.isCustom; }).map(function (t) { return clubEntry(t.id); }).filter(Boolean);
        var ov = mealOverlaps(window.myMealTeams(), theirs);
        return { n: ov.length, tier: warmthTier(ov.length), overlaps: ov };
    };

    // ── 겹쳐 보기 식단표 (DOM) ──────────────────────────────────
    // 친구 칸은 도시락 색으로 채우고, 내 칸은 점선, 겸상 칸은 금빛으로 맨 위에 얹는다.
    var FILL = ['#FDE293', '#FABD7B', '#B3D099', '#EB9E88', '#C68ED3'];
    var RAIL = ['#FBC02D', '#F57C00', '#689F38', '#D84315', '#8E24AA'];
    var DAYS = ['월', '화', '수', '목', '금', '토', '일'];

    window.renderFriendTimetable = function (host, mine, theirs, meals) {
        host.innerHTML = '';
        meals = meals || [];
        var all = mine.concat(theirs);
        if (!theirs.length) {
            var p = document.createElement('p');
            p.className = 'fr-note center';
            p.textContent = window.t('fr_tt_empty');
            host.appendChild(p);
            return;
        }
        var minH = 24, maxH = 0;
        all.forEach(function (e) { if (e.start < minH) minH = e.start; if (e.end > maxH) maxH = e.end; });
        var h0 = Math.min(22, Math.max(6, Math.floor(minH) - 1));
        var h1 = Math.min(24, Math.max(h0 + 3, Math.ceil(maxH) + 1));
        var span = h1 - h0;

        var box = document.createElement('div');
        box.className = 'fr-tt';
        var head = document.createElement('div');
        head.className = 'fr-tt-head';
        head.appendChild(document.createElement('span'));
        DAYS.forEach(function (d) {
            var s = document.createElement('span');
            s.textContent = window.i18nDay ? window.i18nDay(d) : d;
            head.appendChild(s);
        });
        box.appendChild(head);

        var body = document.createElement('div');
        body.className = 'fr-tt-body';
        body.style.height = Math.max(180, span * 22) + 'px';
        var hours = document.createElement('div');
        hours.className = 'fr-tt-hours';
        var every = span > 8 ? 2 : 1;
        for (var h = h0; h <= h1; h++) {
            if ((h - h0) % every !== 0 && h !== h1) continue;
            var lb = document.createElement('span');
            lb.style.top = ((h - h0) / span * 100) + '%';
            lb.textContent = String(h);
            hours.appendChild(lb);
        }
        body.appendChild(hours);

        DAYS.forEach(function (day) {
            var col = document.createElement('div');
            col.className = 'fr-tt-col';
            function block(e, cls) {
                var b = document.createElement('div');
                b.className = 'fr-tt-blk ' + cls;
                b.style.top = ((e.start - h0) / span * 100) + '%';
                b.style.height = Math.max(4, (e.end - e.start) / span * 100) + '%';
                if (cls === 'gs') {
                    b.title = window.t('fr_tt_meal_legend') + ' · ' + day + ' ' + fmtH(e.start) + '–' + fmtH(e.end);
                    var g = document.createElement('span');
                    g.textContent = window.t('fr_tt_meal');
                    b.appendChild(g);
                    col.appendChild(b);
                    return;
                }
                if (cls === 'fr') {
                    b.style.background = FILL[e.slot % 5];
                    b.style.borderLeftColor = RAIL[e.slot % 5];
                }
                b.title = e.name + ' · ' + day + ' ' + fmtH(e.start) + '–' + fmtH(e.end);
                var t = document.createElement('span');
                t.textContent = e.name;
                b.appendChild(t);
                col.appendChild(b);
            }
            theirs.filter(function (e) { return e.day === day; }).forEach(function (e) { block(e, 'fr'); });
            mine.filter(function (e) { return e.day === day; }).forEach(function (e) { block(e, 'me'); });
            meals.filter(function (e) { return e.day === day; }).forEach(function (e) { block(e, 'gs'); });
            body.appendChild(col);
        });
        box.appendChild(body);
        host.appendChild(box);

        var legend = document.createElement('div');
        legend.className = 'fr-tt-legend';
        legend.innerHTML = '<span><i class="me"></i></span><span><i class="fr"></i></span>' + (meals.length ? '<span><i class="gs"></i></span>' : '');
        legend.children[0].appendChild(document.createTextNode(window.t('fr_tt_me')));
        legend.children[1].appendChild(document.createTextNode(window.t('fr_tt_friend')));
        if (meals.length) legend.children[2].appendChild(document.createTextNode(window.t('fr_tt_meal_legend')));
        host.appendChild(legend);
    };
    function fmtH(v) {
        var h = Math.floor(v), m = Math.round((v - h) * 60);
        return h + ':' + (m < 10 ? '0' : '') + m;
    }
})();
