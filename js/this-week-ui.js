// this-week-ui.js
// 🍚 여기 자리 있어요?(키 tw_*) — 지도 위 띠(예전 급구 티커 자리) + 누르면 올라오는 시트.
// 띠: "🍚 여기 자리 있어요? · {n}곳 ›" + 다가오는 3개를 4초마다 한 줄씩. 동호회·픽업 탭 모두, n=0 이면 숨김.
// 시트: 종류 칩(🔥 게스트 급구 · 🥄 맛보기 · 픽업, 여럿 고름) + 날짜 칩(7일 전체 또는 하루) + 날짜별 줄.
//   줄을 누르면 그 팀/크루 상세, '연락하기'는 상세의 첫 연락(인스타 → 링크)과 같은 곳으로 —
//   contact_click 에 via:'this_week' 와 그때 팀 상태(flag)를 붙인다.
// 항목 계산은 this-week.js(순수). 여기는 그리기만.
// Depends on: this-week.js, i18n.js, dom-utils.js (sanitizeUrl · sanitizeInstaHandle), back-nav.js,
//             club-detail.js (parseScheduleText · openClubDetail), pickup-data.js, pickup-detail.js, tabs.js

(function () {
    var ROLL_MS = 4000;
    var KINDS = ['guest', 'drop_in', 'pickup'];
    var KIND_KEY = { guest: 'tw_kind_guest', drop_in: 'tw_kind_drop_in', pickup: 'tw_kind_pickup' };
    var KIND_EMOJI = { guest: '🔥 ', drop_in: '🥄 ', pickup: '' };

    var items = [];
    var rollTimer = null;
    var rollIndex = 0;
    var sheetKinds = { guest: true, drop_in: true, pickup: true };
    var sheetDay = null; // 자정 ms, null = 7일 전체

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function computeItems() {
        return window.thisWeekItems({
            clubs: window.clubs || [],
            pickups: window.pickupGames || [],
            parseText: window.parseScheduleText
        });
    }

    // "수 10/8" — 급구 운동 칩과 같은 요일·날짜 표기
    function dayLabel(dayMs) {
        var d = new Date(dayMs);
        return window.i18nDay(window.twWeekdayKo(dayMs)) + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
    }
    // "19:00~21:00" · 시작을 모르면 "~21:00"(EN "until 21:00")
    function timeLabel(it) {
        var end = window.twHhmm(it.end);
        if (it.start == null) return window.tf('tw_until', { time: end });
        return window.twHhmm(it.start) + (window.currentLang === 'en' ? '–' : '~') + end;
    }
    // 띠의 한 줄: "수 19:00 · 이름 · 🔥 문구"
    function rollLine(it) {
        var when = window.i18nDay(window.twWeekdayKo(window.twItemTime(it))) + ' ' +
            (it.start != null ? window.twHhmm(it.start) : window.tf('tw_until', { time: window.twHhmm(it.end) }));
        var line = when + ' · ' + it.title;
        if (it.msg) line += ' · ' + KIND_EMOJI[it.kind] + it.msg;
        else if (it.kind !== 'pickup') line += ' · ' + window.t(KIND_KEY[it.kind]);
        return line;
    }

    // ── 띠 ──
    function renderStrip() {
        var strip = $('thisWeekStrip');
        if (!strip) return;
        if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
        var n = window.twPlaceCount(items);
        if (!n) { strip.hidden = true; return; }
        strip.hidden = false;
        $('twStripTitle').textContent = window.tf('tw_entry', { n: n });
        var roll = $('twStripRoll');
        var next = items.slice(0, 3);
        rollIndex = 0;
        roll.textContent = rollLine(next[0]);
        if (next.length > 1) {
            rollTimer = setInterval(function () {
                rollIndex = (rollIndex + 1) % next.length;
                roll.classList.remove('tw-roll-in');
                void roll.offsetWidth; // 애니메이션 다시 걸기
                roll.textContent = rollLine(next[rollIndex]);
                roll.classList.add('tw-roll-in');
            }, ROLL_MS);
        }
    }

    // 몇 번 불러도 같은 결과 — 데이터가 오거나(동호회·픽업), 급구·식구 모집을 켜고 끄거나,
    // 팀·픽업을 지우거나, 언어를 바꿀 때마다 부른다. 타이머는 하나만 돈다.
    window.refreshThisWeek = function () {
        try {
            items = computeItems();
        } catch (e) {
            console.warn('여기 자리 있어요? 계산 실패:', e);
            items = [];
        }
        renderStrip();
        if (isSheetOpen()) renderSheet();
        startMinuteTick();
    };

    // 항목은 시각에 따라 바뀐다(마감이 지난 급구·끝난 운동이 빠진다). 이벤트가 있을 때만 다시
    // 계산하면 페이지를 켜 둔 채로는 낡은 항목이 남으므로 1분마다 다시 보고, 바뀌었을 때만 그린다.
    var minuteTimer = null;
    function startMinuteTick() {
        if (minuteTimer) return;
        minuteTimer = setInterval(function () {
            var next;
            try { next = computeItems(); } catch (e) { return; }
            if (window.twSameItems(next, items)) return;
            items = next;
            renderStrip();
            if (isSheetOpen()) renderSheet();
        }, 60 * 1000);
    }

    // ── 연락(상세의 첫 연락과 같은 곳) ──
    // 동호회: 인스타 → 홈 링크. 픽업: 단톡·신청 링크(주 CTA) → 인스타. 없으면 null(버튼 안 그림)
    window.thisWeekContact = function (it) {
        if (it.refType === 'club') {
            var c = window.findClub ? window.findClub(it.refId) : null;
            if (!c) return null;
            var handle = window.sanitizeInstaHandle(c.insta);
            if (handle) return { url: 'https://instagram.com/' + handle, channel: 'instagram', ref: c };
            var link = window.sanitizeUrl(c.link);
            if (link && link !== '#') return { url: link, channel: 'link', ref: c };
            return null;
        }
        var g = window.findPickupGame ? window.findPickupGame(it.refId) : null;
        if (!g) return null;
        var cl = g.contact_link ? window.sanitizeUrl(g.contact_link) : '';
        if (cl && cl !== '#') return { url: cl, channel: 'link', ref: g };
        if (g.insta) return { url: 'https://instagram.com/' + encodeURIComponent(g.insta), channel: 'instagram', ref: g };
        return null;
    };

    // 상세의 연락 버튼과 같은 이벤트를 남긴다 — 예전 대시보드용 club_contact/pickup_contact 도 함께
    // (앱 room_sheet 와 같은 묶음. 웹·앱이 같은 이름·같은 파라미터로 보내야 비교가 된다).
    function hasReelOf(r) { return ((r.insta_reels && r.insta_reels.length) || r.insta_reel) ? 1 : 0; }

    function trackContact(it, contact) {
        if (!window.track) return;
        var type = contact.channel === 'instagram' ? 'insta' : 'link';
        if (it.refType === 'club') {
            window.track('club_contact', { type: type, club_id: it.refId, has_reel: hasReelOf(contact.ref) });
            window.track('contact_click', {
                channel: contact.channel, club_id: it.refId, source: 'club',
                via: 'this_week', flag: window.contactFlag(contact.ref)
            });
        } else {
            window.track('pickup_contact', { id: it.refId, type: type, sport: contact.ref.sport, has_reel: hasReelOf(contact.ref) });
            window.track('contact_click', {
                channel: contact.channel, id: it.refId, source: 'pickup', via: 'this_week', flag: 'pickup'
            });
        }
    }

    // ── 시트 ──
    function isSheetOpen() { var o = $('thisWeekOverlay'); return !!(o && !o.hidden); }

    function hideSheet() {
        var o = $('thisWeekOverlay');
        if (o) o.hidden = true;
    }
    window.closeThisWeek = function () {
        hideSheet();
        if (window.backNav) window.backNav.closed('thisWeek');
    };

    window.openThisWeek = function () {
        var o = $('thisWeekOverlay');
        if (!o) return;
        sheetKinds = { guest: true, drop_in: true, pickup: true };
        sheetDay = null;
        items = computeItems(); // 띠를 그린 뒤 시간이 흘렀을 수 있다
        renderStrip();
        o.hidden = false;
        renderSheet();
        var body = $('twBody');
        if (body) body.scrollTop = 0;
        if (window.backNav) window.backNav.open('thisWeek', hideSheet);
        var close = o.querySelector('.tw-close');
        if (close) setTimeout(function () { close.focus(); }, 0);
    };

    function chipBtn(label, on, onClick) {
        var b = el('button', 'chip tw-chip' + (on ? ' selected' : ''), label);
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.onclick = onClick;
        return b;
    }

    function renderChips() {
        var kindBox = $('twKindChips');
        kindBox.innerHTML = '';
        KINDS.forEach(function (k) {
            kindBox.appendChild(chipBtn(window.t(KIND_KEY[k]), sheetKinds[k], function () {
                sheetKinds[k] = !sheetKinds[k];
                renderSheet();
            }));
        });
        var dayBox = $('twDayChips');
        var keepScroll = dayBox.scrollLeft;
        dayBox.innerHTML = '';
        dayBox.appendChild(chipBtn(window.t('tw_all_days'), sheetDay == null, function () { sheetDay = null; renderSheet(); }));
        window.twDayChips(items).forEach(function (d) {
            dayBox.appendChild(chipBtn(dayLabel(d), sheetDay === d, function () { sheetDay = d; renderSheet(); }));
        });
        dayBox.scrollLeft = keepScroll;
    }

    function openRef(it) {
        window.closeThisWeek();
        if (it.refType === 'club') {
            if (window.currentTab !== 'clubs' && window.switchTab) window.switchTab('clubs');
            if (window.openClubDetail) window.openClubDetail(it.refId);
        } else {
            if (window.currentTab !== 'pickup' && window.switchTab) window.switchTab('pickup');
            if (window.openPickupDetail) window.openPickupDetail(it.refId);
        }
    }

    function buildRow(it) {
        var row = el('div', 'tw-row tw-kind-' + it.kind);
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        // 폰 폭에서 이름이 잘려 사라지지 않게 위아래로 쌓는다: 시간 + 종류 / 이름 / 곳 / 문구
        var main = el('div', 'tw-row-main');
        var top = el('div', 'tw-row-top');
        top.appendChild(el('span', 'tw-row-time', timeLabel(it)));
        top.appendChild(el('span', 'tw-badge tw-badge-' + it.kind, window.t(KIND_KEY[it.kind])));
        main.appendChild(top);
        main.appendChild(el('div', 'tw-row-title', it.title)); // XSS: 모두 textContent
        if (it.place) main.appendChild(el('div', 'tw-row-place', it.place));
        if (it.msg) main.appendChild(el('div', 'tw-row-msg', it.msg));
        row.appendChild(main);
        var contact = window.thisWeekContact(it);
        if (contact) {
            var a = el('a', 'tw-contact', window.t('tw_contact'));
            a.href = contact.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.addEventListener('click', function (ev) {
                ev.stopPropagation(); // 줄 누르기(상세 열기)와 분리
                trackContact(it, contact);
            });
            a.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
            row.appendChild(a);
        }
        row.addEventListener('click', function () { openRef(it); });
        row.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRef(it); }
        });
        return row;
    }

    function renderSheet() {
        renderChips();
        var body = $('twBody');
        body.innerHTML = '';
        var shown = window.twFilterItems(items, sheetKinds, sheetDay);
        if (!shown.length) {
            body.appendChild(el('div', 'tw-empty', window.t('tw_empty')));
            return;
        }
        window.twGroupByDay(shown).forEach(function (g) {
            var sec = el('section', 'tw-day');
            sec.appendChild(el('h4', 'tw-day-head', dayLabel(g.day)));
            g.items.forEach(function (it) { sec.appendChild(buildRow(it)); });
            body.appendChild(sec);
        });
    }

    // 바깥(딤) 누르기 · Esc 로 닫기
    var overlay = $('thisWeekOverlay');
    if (overlay) {
        overlay.addEventListener('click', function (e) { if (e.target === overlay) window.closeThisWeek(); });
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeThisWeek(); });
    }

    document.addEventListener('nurungji:langchange', function () {
        renderStrip();
        if (isSheetOpen()) renderSheet();
    });
})();
