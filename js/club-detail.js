// club-detail.js
// Bottom sheet club detail, timetable rendering, urgent ticker
// Depends on: map-core.js (window.map, window.markers, window.clusterer, window.instaCssIcon, window.initMarkers),
//             urgent.js (급구 칩·마감 표시·문구 검사)

// ── Schedule parsing ──

// 저장 포맷이 두 가지다. registration.js getScheduleData 는 ', ' 로 잇고
// (`수 19:00~21:30, 일 14:00~18:00`), 예전 데이터는 ' / ' 로 이어져 있다.
// 그런데 여기서 '/' 로만 나누다 보니 쉼표로 이어진 글이 한 덩어리가 됐고,
// **첫 시간 하나만 읽어 그 안의 모든 요일에 같은 시간을 붙였다** — 일요일
// 14:00~18:00 팀이 상세 시간표에 수요일과 같은 19:00~21:30 으로 떴다.
//
// 쉼표로도 자르면 될 것 같지만 안 된다. `월, 수, 금 19:00~22:00` 처럼 요일
// 자체를 쉼표로 나열한 예전 데이터가 세 조각으로 찢어져 앞의 두 요일이
// 시간을 잃는다.
//
// 그래서 구분자를 늘리는 대신 **시간을 기준으로 요일을 귀속**시킨다:
// 시간 표현이 2개 이상인 덩어리에서는 각 시간 바로 앞의 글자들이 그 시간의
// 요일이다. 시간이 하나뿐이면 덩어리 전체에서 요일을 찾는다(요일이 시간
// 뒤에 오는 `19:00~22:00 월수금` 같은 예전 표기를 그대로 살리기 위해서다).
window.parseScheduleText = function (text) {
    var scheduleMap = {};
    if (!text) return scheduleMap;

    var DAYS = ['월', '화', '수', '목', '금', '토', '일'];
    var TIME_G = /(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/g;

    function format12(h, m) {
        var p = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12;
        if (h12 === 0) h12 = 12;
        var mStr = m < 10 ? '0' + m : m;
        return p + ' ' + h12 + ':' + mStr;
    }

    function assign(daySource, m) {
        var startH = parseInt(m[1], 10), startM = parseInt(m[2], 10);
        var endH = parseInt(m[3], 10), endM = parseInt(m[4], 10);
        var displayTime = format12(startH, startM) + '~' + format12(endH, endM);
        DAYS.forEach(function (day) {
            if (daySource.indexOf(day) !== -1) {
                scheduleMap[day] = {
                    startH: startH, startM: startM,
                    endH: endH, endM: endM,
                    text: displayTime
                };
            }
        });
    }

    text.split(/\s*\/\s*/).forEach(function (segment) {
        TIME_G.lastIndex = 0;
        var matches = [], m;
        while ((m = TIME_G.exec(segment)) !== null) {
            matches.push({ m: m, start: m.index, end: m.index + m[0].length });
        }
        if (!matches.length) return;

        if (matches.length === 1) {
            assign(segment, matches[0].m);
            return;
        }
        // 시간이 여럿이면 '직전 구간'이 그 시간의 요일이다.
        var prevEnd = 0;
        matches.forEach(function (hit) {
            assign(segment.slice(prevEnd, hit.start), hit.m);
            prevEnd = hit.end;
        });
    });

    return scheduleMap;
};

window.getHourLabel = function (h) {
    var p = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return p + ' ' + h12;
};

window.renderTimetables = function (scheduleText) {
    var scheduleData = window.parseScheduleText(scheduleText);
    var days = ['월', '화', '수', '목', '금', '토', '일'];
    var dayIndices = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    var todayIndex = new Date().getDay();
    var todayChar = null;
    var keys = Object.keys(dayIndices);
    for (var k = 0; k < keys.length; k++) {
        if (dayIndices[keys[k]] === todayIndex) { todayChar = keys[k]; break; }
    }

    var minH = 24, maxH = 0;
    var hasData = false;

    var values = Object.keys(scheduleData);
    for (var v = 0; v < values.length; v++) {
        var data = scheduleData[values[v]];
        if (data.startH < minH) minH = data.startH;
        if (data.endH > maxH) maxH = data.endH;
        hasData = true;
    }

    if (!hasData) { minH = 18; maxH = 22; }

    var displayStart = Math.max(6, minH - 1);
    var displayEnd = Math.min(24, maxH + 1);
    var totalHours = displayEnd - displayStart;

    var availableHeight = window.innerHeight * 0.5;
    var calculatedRowHeight = availableHeight / totalHours;
    var ROW_HEIGHT = Math.max(25, Math.min(50, calculatedRowHeight));

    // Summary bubbles
    var summaryContainer = document.getElementById('summaryContent');
    summaryContainer.innerHTML = '';
    var hasActive = false;
    days.forEach(function (day) {
        var d = scheduleData[day];
        if (d) {
            hasActive = true;
            var item = document.createElement('div');
            item.className = 'st-bubble active';
            item.innerHTML = '<div class="st-day-text">' + window.i18nDay(day) + window.t('day_suffix') + '</div><div class="st-time-text">' + d.text + '</div>';
            summaryContainer.appendChild(item);
        }
    });
    if (!hasActive) {
        summaryContainer.innerHTML = '<div class="st-bubble"><div class="st-day-text">' + window.t('schedule') + '</div><div class="st-time-text">' + window.t('no_info') + '</div></div>';
    }

    // Full timetable
    var fullContainer = document.getElementById('fullContent');
    fullContainer.innerHTML = '';

    var ftContainer = document.createElement('div');
    ftContainer.className = 'ft-container';

    var headerRow = document.createElement('div');
    headerRow.className = 'ft-header-row-flex';
    var emptyCell = document.createElement('div');
    emptyCell.className = 'ft-header-cell time-col';
    headerRow.appendChild(emptyCell);

    days.forEach(function (d) {
        var cell = document.createElement('div');
        cell.className = 'ft-header-cell';
        if (d === todayChar) cell.className += ' today';
        cell.innerText = window.i18nDay(d);
        headerRow.appendChild(cell);
    });
    ftContainer.appendChild(headerRow);

    var bodyRow = document.createElement('div');
    bodyRow.className = 'ft-body';
    bodyRow.style.height = (totalHours * ROW_HEIGHT) + 'px';

    var timeCol = document.createElement('div');
    timeCol.className = 'ft-col-time';
    for (var h = displayStart; h < displayEnd; h++) {
        var label = document.createElement('div');
        label.className = 'ft-time-label';
        label.style.height = ROW_HEIGHT + 'px';
        label.innerHTML = window.getHourLabel(h);
        timeCol.appendChild(label);
    }
    bodyRow.appendChild(timeCol);

    days.forEach(function (d) {
        var dayCol = document.createElement('div');
        dayCol.className = 'ft-col-day';

        for (var h = displayStart; h < displayEnd; h++) {
            var gridLine = document.createElement('div');
            gridLine.style.height = ROW_HEIGHT + 'px';
            gridLine.style.borderBottom = '1px solid #f8f8f8';
            gridLine.style.boxSizing = 'border-box';
            dayCol.appendChild(gridLine);
        }

        var dd = scheduleData[d];
        if (dd) {
            var startTotalHours = dd.startH + (dd.startM / 60) - displayStart;
            var durationHours = (dd.endH + (dd.endM / 60)) - (dd.startH + (dd.startM / 60));

            var topPx = startTotalHours * ROW_HEIGHT;
            var heightPx = durationHours * ROW_HEIGHT;

            var duration = (dd.endH + (dd.endM / 60)) - (dd.startH + (dd.startM / 60));
            var durationStr = Number.isInteger(duration) ? duration : duration.toFixed(1);

            if (topPx >= 0) {
                var block = document.createElement('div');
                block.className = 'ft-event-block';
                block.style.top = topPx + 'px';
                block.style.height = (heightPx - 2) + 'px';
                block.innerHTML = dd.text.replace('~', '<br>~<br>') +
                    '<div style="font-size:10px; opacity:0.8; margin-top:2px;">(' + durationStr + 'h)</div>';
                dayCol.appendChild(block);
            }
        }
        bodyRow.appendChild(dayCol);
    });

    ftContainer.appendChild(bodyRow);
    fullContainer.appendChild(ftContainer);
};

// ── Bottom sheet state ──

var sheetState = 'PEEK';
var PEEK_HEIGHT = 390;
// 쓸어내려 닫는 기준: 접힌 높이의 60% 아래에서 놓으면 닫힌다. 앱 map_detail_panel.dart 와 같은 값(design-system §3-1)
var SHEET_CLOSE_RATIO = 0.6;
var EXPANDED_HEIGHT = window.innerHeight * 0.9;
var BUBBLE_HEIGHT = 60;

function updateSheetState(newState, animation) {
    if (animation === undefined) animation = true;
    var sheet = document.getElementById('bottomSheet');
    var hint = document.getElementById('expandHint');

    sheetState = newState;
    // 닫힌(높이 0) 시트의 버튼이 키보드·화면 낭독기에 잡히지 않게
    if (newState === 'CLOSED') { sheet.setAttribute('inert', ''); sheet.setAttribute('aria-hidden', 'true'); }
    else { sheet.removeAttribute('inert'); sheet.removeAttribute('aria-hidden'); }

    if (animation) sheet.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    else sheet.style.transition = 'none';

    if (newState === 'CLOSED') {
        sheet.style.height = '0';
    } else if (newState === 'PEEK') {
        sheet.style.height = PEEK_HEIGHT + 'px';
        hint.innerText = window.t('expand_hint');
        interpolateMorph(0);
    } else if (newState === 'EXPANDED') {
        sheet.style.height = EXPANDED_HEIGHT + 'px';
        hint.innerText = window.t('collapse_hint');
        interpolateMorph(1);
    }
}

function interpolateMorph(ratio) {
    var summary = document.getElementById('summaryContent');
    var full = document.getElementById('fullContent');
    var container = document.getElementById('timeMorphContainer');

    ratio = Math.min(Math.max(ratio, 0), 1);

    if (ratio > 0.8) {
        container.style.height = 'auto';
        full.style.position = 'relative';
    } else {
        var targetH = BUBBLE_HEIGHT + (350 * ratio);
        container.style.height = targetH + 'px';
        full.style.position = 'absolute';
    }

    if (ratio < 0.5) {
        summary.style.display = 'flex';
        full.style.display = 'none';
        summary.style.opacity = 1 - (ratio * 2);
    } else {
        summary.style.display = 'none';
        full.style.display = 'block';
        full.style.opacity = (ratio - 0.5) * 2;
    }
}

window.toggleTimeExpand = function () {
    if (sheetState === 'PEEK') updateSheetState('EXPANDED');
    else if (sheetState === 'EXPANDED') updateSheetState('PEEK');
};

// ── Open club detail ──

// 비동기 조회가 끝났을 때 시트가 아직 그 팀을 보이고 있는지. 시트는 요소 id 를
// 재사용해서(verifyStatusArea · clubAdminArea), 그새 다른 팀을 열었으면 늦게 온
// 응답이 새 팀 자리에 앞 팀의 상태·버튼을 그려 넣는다.
window.clubSheetShows = function (club, el) {
    if (!club || String(window.currentClubId) !== String(club.id)) return false;
    return !el || el.isConnected !== false;
};

// requested_by 로 받은 내 신청들 중 이 팀 것의 최신 하나(없으면 null).
// orderBy 를 걸면 복합 인덱스가 필요해 메모리에서 고른다.
window.latestRequestFor = function (snap, clubId) {
    var latest = null, latestMs = -1;
    snap.forEach(function (doc) {
        var d = doc.data() || {};
        if (String(d.club_id) !== String(clubId)) return;
        var ms = d.requested_at && d.requested_at.toMillis ? d.requested_at.toMillis() : 0;
        if (ms > latestMs) { latest = d; latestMs = ms; }
    });
    return latest;
};

// 관리자 신청 거절 사유 코드 → 문구. 서버가 쓰는 코드(full · already_admin ·
// not_found · duplicate)만 문구가 있고, 모르는 코드나 사유 없는 수동 거절은 ''
// — 사유 줄을 아예 안 보인다.
window.adminRejectReasonText = function (code) {
    var key = {
        full: 'ad_reason_full',
        already_admin: 'ad_reason_already_admin',
        not_found: 'ad_reason_not_found',
        duplicate: 'ad_reason_duplicate'
    }[String(code == null ? '' : code)];
    return key ? window.t(key) : '';
};

function adminApplyButton(club, area, label) {
    area.innerHTML =
        '<button id="btnRequestAdmin" class="btn" style="background:#fff;color:var(--nurungji-dark);border:1px solid var(--nurungji-yellow);width:100%;font-weight:600;"></button>';
    var b = area.querySelector('#btnRequestAdmin');
    b.textContent = label;
    b.onclick = function () { window.openAdminRequestModal(club); };
}

// 심사 중 안내. 신청을 막 보낸 직후에도 이걸로 바꾼다 — 버튼이 그대로 남으면
// 한 번 더 누르기 쉽다(서버가 duplicate 로 닫지만 사진은 한 장 더 올라간다).
window.showAdminRequestPending = function (area) {
    if (!area) return;
    area.innerHTML =
        '<div style="background:rgba(33,150,243,0.1);border-left:3px solid #2196f3;padding:10px 14px;border-radius:4px;font-size:13px;color:#1565c0;">' +
        window.escapeHtml(window.t('ad_pending')) + '</div>';
};

// 내 관리자 신청 상태를 보여준다(관리자가 아닐 때).
// requested_by 단일 조건으로만 거른다. club_id 를 함께 걸면 복합 인덱스가 필요해지고,
// 없으면 매번 실패한다. 한 사람이 내는 신청은 많아야 몇 건이라 나머지는 메모리에서
// 고른다. (규칙상 남의 신청은 애초에 안 읽힌다.)
window.renderAdminRequestStatus = function (club, adminArea) {
    var uid = window.currentUser && window.currentUser.uid;
    if (!uid) return;
    window.firebaseDB.collection('club_admin_requests')
        .where('requested_by', '==', uid)
        .limit(20)
        .get().then(function (snap) {
            if (!window.clubSheetShows(club, adminArea)) return;
            var latest = window.latestRequestFor(snap, club.id);
            if (latest && latest.status === 'pending') {
                window.showAdminRequestPending(adminArea);
                return;
            }
            if (latest && latest.status === 'approved') {
                // 승인됐는데 메모리의 팀 문서가 낡아 내가 명단에 없다(시트를 연 뒤 승인).
                // 한 번만 다시 읽어 실제로 관리자면 관리자 화면으로 다시 그린다.
                window.firebaseDB.collection('clubs').doc(String(club.id)).get().then(function (doc) {
                    if (!window.clubSheetShows(club, adminArea)) return;
                    var fresh = doc.exists ? (doc.data() || {}) : null;
                    if (fresh && window.clubAdminUids(fresh).indexOf(uid) !== -1) {
                        ['allClubs', 'clubs'].forEach(function (key) {
                            if (!Array.isArray(window[key])) return;
                            window[key].forEach(function (c) {
                                if (String(c.id) !== String(club.id)) return;
                                c.admins = fresh.admins;
                                c.registered_by = fresh.registered_by;
                            });
                        });
                        club.admins = fresh.admins;
                        club.registered_by = fresh.registered_by;
                        window.openClubDetail(club.id, { silent: true });
                        return;
                    }
                    adminApplyButton(club, adminArea, window.t('ad_apply_btn'));
                }).catch(function (err) {
                    console.warn('팀 문서 다시 읽기 실패:', err && err.message);
                    if (window.clubSheetShows(club, adminArea)) adminApplyButton(club, adminArea, window.t('ad_apply_btn'));
                });
                return;
            }
            if (latest && latest.status === 'rejected') {
                // 거절 안내 + (알아들을 수 있는 사유면) 사유 한 줄 + 다시 신청. XSS 방지: textContent.
                var reason = window.adminRejectReasonText(latest.reject_reason);
                adminArea.innerHTML =
                    '<div style="background:rgba(244,67,54,0.08);border-left:3px solid #f44336;padding:10px 14px;border-radius:4px;margin-bottom:8px;font-size:13px;line-height:1.5;">' +
                    '<div id="adRejectedTitle" style="color:#d32f2f;font-weight:600;"></div>' +
                    (reason ? '<div id="adRejectedReason" style="color:#555;margin-top:4px;"></div>' : '') +
                    '</div><div id="adReapplyBox"></div>';
                adminArea.querySelector('#adRejectedTitle').textContent = window.t('ad_rejected');
                if (reason) adminArea.querySelector('#adRejectedReason').textContent = reason;
                var box = adminArea.querySelector('#adReapplyBox');
                adminApplyButton(club, box, window.t('ad_reapply'));
                return;
            }
            adminApplyButton(club, adminArea, window.t('ad_apply_btn'));
        }).catch(function (err) {
            // 조회가 막혀도 신청 자체는 할 수 있어야 한다.
            console.warn('관리자 신청 상태 조회 실패:', err && err.message);
            if (!window.clubSheetShows(club, adminArea)) return;
            adminApplyButton(club, adminArea, window.t('ad_apply_btn'));
        });
};

window.openClubDetail = function (id, opts) {
    // silent: 언어 전환 시 재렌더링용 (analytics/지도이동/주소갱신 등 부작용 생략)
    var silent = !!(opts && opts.silent);
    document.getElementById('topSearchInput').blur();
    var club = window.clubs.find(function (c) { return c.id === id; });
    if (!club) return;

    // 현재 열린 클럽 추적 (언어 전환 시 바텀시트 재렌더링용)
    window.currentClubId = id;

    // 릴스 유무를 view/contact에 같이 찍는다 — 릴스가 물꼬(first-contact)에 도움이 되는지 비교하기 위해.
    // (2026-09-16 결정 로그: 팀 영상 도입은 이 전환율 데이터를 본 뒤.) 1/0 숫자 = 앱과 동일 스키마.
    var hasReel = ((club.insta_reels && club.insta_reels.length) || club.insta_reel) ? 1 : 0;
    if (!silent && window.track) window.track('view_club', { club_id: club.id, club_name: club.name, has_reel: hasReel });

    var verifiedBadge = '<svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align:text-bottom;margin-right:2px;" fill="#1DA1F2"><path d="M22.5 12.5c0-1.58-.87-2.92-2.14-3.58.14-.52.22-1.07.22-1.63 0-3.18-2.58-5.75-5.75-5.75-.56 0-1.11.08-1.63.22C12.54 1.49 11.2 0.62 9.62 0.62 6.44 0.62 3.87 3.2 3.87 6.38c0 .56.08 1.11.22 1.63C2.82 8.67 1.95 10 1.95 11.58c0 3.18 2.58 5.75 5.75 5.75.56 0 1.11-.08 1.63-.22.66 1.27 2 2.14 3.58 2.14 3.18 0 5.75-2.58 5.75-5.75 0-.56-.08-1.11-.22-1.63 1.27-.66 2.14-2 2.14-3.58zm-12.26 3.63L6 11.89l1.41-1.41 2.83 2.83 6.36-6.36 1.41 1.41-7.77 7.77z"/></svg>';
    // XSS 방지: 사용자 입력(club.name, club.insta)을 직접 innerHTML에 박지 않고 DOM 노드로 조립
    var sheetTitleEl = document.getElementById('sheetTitle');
    sheetTitleEl.innerHTML = club.is_verified ? verifiedBadge : '';
    var nameNode = document.createTextNode(club.name || '');
    sheetTitleEl.appendChild(nameNode);
    var safeInsta = window.sanitizeInstaHandle(club.insta);
    if (safeInsta) {
        var instaLink = document.createElement('a');
        instaLink.href = 'https://instagram.com/' + safeInsta;
        instaLink.target = '_blank';
        instaLink.rel = 'noopener noreferrer';
        instaLink.className = 'insta-link';
        instaLink.innerHTML = window.instaCssIcon; // 정적 마크업, 사용자 입력 없음
        instaLink.onclick = function () {
            if (window.track) {
                window.track('club_contact', { type: 'insta', club_id: club.id, has_reel: hasReel }); // 기존 대시보드 연속성 유지
                window.track('contact_click', { channel: 'instagram', club_id: club.id, source: 'club' }); // North Star Metric 보조 지표
            }
        };
        sheetTitleEl.appendChild(document.createTextNode(' '));
        sheetTitleEl.appendChild(instaLink);
    }
    document.getElementById('sheetPrice').innerText = club.price ? window.i18nPrice(club.price) : window.t('no_fee');
    document.getElementById('sheetAddressVal').value = club.address;

    // 대략 위치 팀이면 그렇다고 말해준다. 안 적으면 "성북구 일대"가 주소를
    // 대충 적은 것처럼 읽혀서, 찾는 사람이 헛걸음하거나 신고를 넣는다.
    var existingAreaNote = document.getElementById('sheetAreaNote');
    if (existingAreaNote) existingAreaNote.remove();
    if (window.isAreaOnly(club)) {
        var addrEl = document.getElementById('sheetAddressVal');
        var note = document.createElement('div');
        note.id = 'sheetAreaNote';
        note.style = 'font-size:12px;color:#8d6e63;line-height:1.5;margin-top:6px;display:flex;gap:6px;align-items:flex-start;';
        var badge = document.createElement('span');
        badge.style = 'flex:none;background:var(--nurungji-yellow);color:var(--nurungji-dark);border-radius:4px;padding:1px 6px;font-weight:600;';
        badge.textContent = window.t('cd_area_only');
        var text = document.createElement('span');
        text.textContent = window.t('cd_area_only_note');
        note.appendChild(badge);
        note.appendChild(text);
        (addrEl.parentElement.parentElement || addrEl.parentElement).appendChild(note);
    }

    window.renderTimetables(club.schedule);

    // XSS 방지: target/link를 escape/sanitize 후 DOM 조립
    var sheetTagsEl = document.getElementById('sheetTags');
    sheetTagsEl.innerHTML = '';
    var targetSpan = document.createElement('span');
    targetSpan.className = 'tag target';
    targetSpan.textContent = window.i18nTarget(club.target);
    sheetTagsEl.appendChild(targetSpan);
    var safeLink = window.sanitizeUrl(club.link);
    if (safeLink && safeLink !== '#') {
        var linkA = document.createElement('a');
        linkA.href = safeLink;
        linkA.target = '_blank';
        linkA.rel = 'noopener noreferrer';
        linkA.style.textDecoration = 'none';
        var linkSpan = document.createElement('span');
        linkSpan.className = 'tag';
        linkSpan.style.background = '#eee';
        linkSpan.textContent = window.t('home_tag');
        linkA.onclick = function () {
            if (window.track) {
                window.track('club_contact', { type: 'link', club_id: club.id, has_reel: hasReel });
                // NSM 전용 이벤트 — 홈페이지 링크도 연락 전환으로 집계
                window.track('contact_click', { channel: 'link', club_id: club.id, source: 'club' });
            }
        };
        linkA.appendChild(linkSpan);
        sheetTagsEl.appendChild(linkA);
    }
    var btnWayEl = document.getElementById('btnWay');
    btnWayEl.href = "https://map.kakao.com/link/to/" + club.name + "," + club.lat + "," + club.lng;
    btnWayEl.onclick = function () {
        if (window.track) {
            window.track('club_contact', { type: 'directions', club_id: club.id, has_reel: hasReel }); // 기존 대시보드 연속성 유지
            window.track('get_directions', { club_id: club.id, source: 'club' }); // North Star Metric: 주당 길찾기 클릭 수
        }
    };

    // 인스타 릴스/게시물 임베드 (호스트가 붙인 공개 콘텐츠가 있으면)
    if (window.renderInstaEmbeds) window.renderInstaEmbeds(document.getElementById('clubReelEmbed'),
        (club.insta_reels && club.insta_reels.length) ? club.insta_reels : (club.insta_reel ? [club.insta_reel] : []),
        club.insta_reel_covers, { source: 'club', id: club.id });

    // 급구 배너: 문구 + 마감(고른 운동이 끝나는 시각). XSS 방지: 사용자 입력은 textContent
    var urgentArea = document.getElementById('urgentArea');
    var urgentNow = window.isUrgentActive(club);
    if (urgentNow) {
        urgentArea.innerHTML = '';
        var urgentBanner = document.createElement('div');
        urgentBanner.className = 'urgent-banner';
        var urgentText = document.createElement('span');
        urgentText.className = 'urgent-banner-msg';
        urgentText.textContent = '🔥 ' + club.urgent_msg;
        urgentBanner.appendChild(urgentText);
        var untilLabel = window.urgentDeadlineLabel(club);
        if (untilLabel) {
            var untilSpan = document.createElement('span');
            untilSpan.className = 'urgent-banner-until';
            untilSpan.textContent = untilLabel;
            urgentBanner.appendChild(untilSpan);
        }
        urgentArea.appendChild(urgentBanner);
        urgentArea.style.display = 'block';
    } else {
        urgentArea.style.display = 'none';
    }

    // 회원 모집 표시 + (관리자에게만) 60일 자동 꺼짐 안내
    var canManage = !!(window.canModifyClub && window.canModifyClub(club));
    var recruitArea = document.getElementById('recruitArea');
    if (recruitArea) {
        recruitArea.innerHTML = '';
        if (window.isRecruitingActive(club)) {
            var rcBox = document.createElement('div');
            rcBox.className = 'recruit-banner';
            var rcBadge = document.createElement('b');
            rcBadge.textContent = window.t('rc_badge');
            rcBox.appendChild(rcBadge);
            if (typeof club.recruit_msg === 'string' && club.recruit_msg.trim()) {
                var rcMsg = document.createElement('span');
                rcMsg.textContent = club.recruit_msg.trim();
                rcBox.appendChild(rcMsg);
            }
            recruitArea.appendChild(rcBox);
            if (canManage) {
                var rcHint = document.createElement('div');
                rcHint.className = 'recruit-hint';
                rcHint.textContent = window.t('rc_auto_off');
                recruitArea.appendChild(rcHint);
            }
            recruitArea.style.display = 'block';
        } else {
            recruitArea.style.display = 'none';
        }
    }

    // 데이터 신선도 + 신고 통로 (guidelines.html 2-3 · 3-1)
    if (window.renderDataTrust) {
        window.renderDataTrust(document.getElementById('clubDataTrust'), club, 'club');
    }

    // 급구 · 회원 모집 버튼(팀 관리자·운영자만).
    //   급구 — 새로 올리기는 인증된 팀만(서버 postUrgent 도 unverified 로 거절한다).
    //          떠 있으면 '급구 수정'(같은 폼을 채워서) + '급구 내리기'. 내리기는 인증이
    //          풀린 팀도 할 수 있어야 해서 인증 여부와 상관없이 보인다.
    //   모집 — 인증 여부와 상관없이 켜고 끈다.
    var actionBtns = document.querySelector('.action-buttons');
    var existingFlags = document.getElementById('clubFlagActions');
    if (existingFlags) existingFlags.remove();
    if (canManage) {
        var flags = document.createElement('div');
        flags.id = 'clubFlagActions';
        flags.className = 'flag-actions';
        var addFlagBtn = function (cls, label, onClick) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ' + cls;
            b.textContent = label;
            b.onclick = onClick;
            flags.appendChild(b);
        };
        if (urgentNow) {
            addFlagBtn('flag-btn-urgent-ghost', window.t('ug_edit'), function () { window.openUrgentForm(club); });
            addFlagBtn('flag-btn-urgent', window.t('cd_urgent_off'), function () { window.closeClubUrgent(club); });
        } else if (club.is_verified) {
            addFlagBtn('flag-btn-urgent', window.t('cd_urgent_on'), function () { window.openUrgentForm(club); });
        }
        addFlagBtn('flag-btn-recruit', window.t(window.isRecruitingActive(club) ? 'rc_off' : 'rc_on'),
            function () { window.toggleClubRecruiting(club); });
        actionBtns.appendChild(flags);
    }

    // Verification status area (registered owner only, unverified clubs)
    var existingVerifyArea = document.getElementById('verifyStatusArea');
    if (existingVerifyArea) existingVerifyArea.remove();

    if (!club.is_verified
        && window.currentUser
        && club.registered_by === window.currentUser.uid) {
        var verifyArea = document.createElement('div');
        verifyArea.id = 'verifyStatusArea';
        verifyArea.style = 'margin-top:8px;';
        actionBtns.parentElement.insertBefore(verifyArea, actionBtns.nextSibling);

        // Firestore에서 최신 인증 요청 상태 조회.
        // 규칙은 신청자 본인 문서만 읽게 한다(requested_by == uid). club_id 로만 거르면
        // 남의 문서가 섞일 수 있는 질의라 통째로 거부된다 — 그래서 늘 '신청 버튼'만
        // 떴다. requested_by 하나로 조회하고 이 팀 것 중 최신은 메모리에서 고른다
        // (orderBy·복합 인덱스 없이, 관리자 신청 조회와 같은 모양).
        var verifyUid = window.currentUser.uid;
        window.firebaseDB.collection('verification_requests')
            .where('requested_by', '==', verifyUid)
            .limit(20)
            .get().then(function (snap) {
            // 조회하는 사이 시트가 다른 팀으로 바뀌었으면 손대지 않는다(요소 id 를 재사용한다).
            if (!window.clubSheetShows(club, verifyArea)) return;
            var reqData = window.latestRequestFor(snap, club.id);
            if (!reqData) {
                // 신청 이력 없음 → 인증 신청 버튼
                verifyArea.innerHTML =
                    '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                    window.t('vf_apply_btn') + '</button>';
                verifyArea.querySelector('#btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
            } else {
                if (reqData.status === 'pending') {
                    // 심사 중
                    verifyArea.innerHTML =
                        '<div style="background:rgba(33,150,243,0.1);border-left:3px solid #2196f3;padding:12px 15px;border-radius:4px;font-size:13px;color:#1565c0;line-height:1.5;">' +
                        window.t('vf_pending') + '</div>';
                } else if (reqData.status === 'rejected') {
                    // 거절됨 → 사유 표시 + 재신청 버튼. XSS 방지: reason은 textContent로
                    var reasonText = reqData.reject_reason || window.t('vf_no_reason');
                    verifyArea.innerHTML =
                        '<div style="background:rgba(244,67,54,0.08);border-left:3px solid #f44336;padding:12px 15px;border-radius:4px;margin-bottom:8px;font-size:13px;line-height:1.5;">' +
                        '<div style="color:#d32f2f;font-weight:600;margin-bottom:4px;">' + window.t('vf_rejected') + '</div>' +
                        '<div style="color:#555;">' + window.t('vf_reason') + '<span id="rejectReasonText"></span></div></div>' +
                        '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                        window.t('vf_reapply') + '</button>';
                    verifyArea.querySelector('#rejectReasonText').textContent = reasonText;
                    verifyArea.querySelector('#btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
                }
            }
        }).catch(function (err) {
            console.error('인증 상태 조회 오류:', err);
            if (!window.clubSheetShows(club, verifyArea)) return;
            // 조회 실패 시 기본 인증 신청 버튼 표시
            verifyArea.innerHTML =
                '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                window.t('vf_apply_btn') + '</button>';
            verifyArea.querySelector('#btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
        });
    }

    // ── 관리자 권한 안내 / 신청 ──
    // 구글시트로 접수한 팀들은 등록자가 없어 아무도 정보를 못 고친다. 그 팀을
    // 실제로 운영하는 사람이 여기서 손을 든다.
    //
    // 조용히 둔다 — 로그인 때 팝업을 띄우지 않고, 자기 팀 페이지를 연 순간에만
    // 한 줄로 보인다. 신청할 사람은 어차피 자기 팀을 보러 온다.
    var existingAdminArea = document.getElementById('clubAdminArea');
    if (existingAdminArea) existingAdminArea.remove();

    if (window.currentUser && !window.currentUser.isAnonymous && !window.isAdmin) {
        var adminUids = window.clubAdminUids(club);
        var iAmAdmin = adminUids.indexOf(window.currentUser.uid) !== -1;
        var full = adminUids.length >= window.MAX_CLUB_ADMINS;

        if (iAmAdmin || !full) {
            var adminArea = document.createElement('div');
            adminArea.id = 'clubAdminArea';
            adminArea.style = 'margin-top:8px;';
            var anchorEl = document.getElementById('verifyStatusArea') || actionBtns;
            anchorEl.parentElement.insertBefore(adminArea, anchorEl.nextSibling);

            if (iAmAdmin) {
                // 관리자 수를 보여준다 — 3명 제한이 있다는 걸 알아야 동료를 부를지 판단한다.
                adminArea.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:#666;padding:6px 2px;">' +
                    '<span id="clubAdminCount"></span>' +
                    '<button id="btnLeaveAdmin" style="background:none;border:none;color:#d32f2f;font-size:12px;text-decoration:underline;cursor:pointer;padding:0;"></button>' +
                    '</div>';
                adminArea.querySelector('#clubAdminCount').textContent =
                    window.tf('ad_count', { n: adminUids.length });
                var leaveBtn = adminArea.querySelector('#btnLeaveAdmin');
                leaveBtn.textContent = window.t('ad_leave');
                leaveBtn.onclick = function () { window.leaveClubAdmin(club); };
            } else {
                window.renderAdminRequestStatus(club, adminArea);
            }
        }
    }

    // Edit + Delete buttons (owner or admin only)
    var existingEditBtn = document.getElementById('btnEditClub');
    if (existingEditBtn) existingEditBtn.remove();
    var existingDeleteBtn = document.getElementById('btnDeleteClub');
    if (existingDeleteBtn) existingDeleteBtn.remove();

    if (window.canModifyClub && window.canModifyClub(club)) {
        var anchor = document.getElementById('verifyStatusArea') || actionBtns;

        // ✏ 수정 버튼
        var editBtn = document.createElement('button');
        editBtn.id = 'btnEditClub';
        editBtn.className = 'btn';
        editBtn.style = 'background:var(--nurungji-yellow); color:var(--nurungji-dark); margin-top:8px; width:100%; font-weight:600;';
        editBtn.innerText = window.t('cd_edit');
        editBtn.onclick = function () { window.openEditModal(club); };
        anchor.parentElement.insertBefore(editBtn, anchor.nextSibling);

        // 🗑 삭제 버튼 (수정 버튼 다음에 위치)
        var deleteBtn = document.createElement('button');
        deleteBtn.id = 'btnDeleteClub';
        deleteBtn.className = 'btn';
        deleteBtn.style = 'background:#fff; color:#d32f2f; border:1px solid #d32f2f; margin-top:8px; width:100%; font-weight:600;';
        deleteBtn.innerText = window.t('cd_delete');
        deleteBtn.onclick = function () { window.deleteClub(club); };
        editBtn.parentElement.insertBefore(deleteBtn, editBtn.nextSibling);
    }

    // Bookmark button
    var btnBookmark = document.getElementById('btnBookmark');
    if (btnBookmark) {
        btnBookmark.onclick = function () { if (window.bookmarkTeam) window.bookmarkTeam(club.id); };
    }

    // Share button → 통합 공유 메뉴 (인스타 스토리 / 카카오톡 / 링크)
    var btnShareClub = document.getElementById('btnShareClub');
    if (btnShareClub) {
        btnShareClub.onclick = function () { if (window.openShareMenu) window.openShareMenu('club', club); };
    }

    // 주소창을 공유 가능한 딥링크로 동기화 + 폰 뒤로가기로 시트가 닫히게(js/back-nav.js).
    // 닫혔을 때 돌아갈 칸의 주소는 ?club= 을 뺀 주소. 이미 열린 시트에서 다른 팀으로 바꾸면 주소만 바꾼다.
    if (!silent) {
        var clubUrl = '?club=' + encodeURIComponent(club.id);
        if (window.backNav) {
            window.backNav.open('club', hideBottomSheet, { url: clubUrl, baseUrl: location.pathname });
        } else if (window.history && window.history.replaceState) {
            window.history.replaceState(history.state, '', clubUrl);
        }
    }

    if (!silent) updateSheetState('PEEK');
    else updateSheetState(sheetState, false); // 현재 펼침 상태 유지 + 힌트 텍스트 갱신

    // 지도 이동은 상세 표시(이미 완료)와 분리: 맵 미준비/일시 오류 시에도 상세는 정상 노출
    if (silent) return;
    try {
        var targetLevel = 4;
        window.map.setLevel(targetLevel, { animate: true });
        var moveLatLon = new kakao.maps.LatLng(club.lat, club.lng);
        var projection = window.map.getProjection();
        var centerPoint = projection.pointFromCoords(moveLatLon);
        var offsetY = Math.min(window.innerHeight * 0.13, 150);
        var newCenterPoint = new kakao.maps.Point(centerPoint.x, centerPoint.y + offsetY);
        var newCenterLatLon = projection.coordsFromPoint(newCenterPoint);
        window.map.panTo(newCenterLatLon);
    } catch (e) {
        console.warn('지도 이동 실패(상세는 정상 표시):', e);
    }
};

// 뒤로가기로 닫힐 때(back-nav 가 칸을 이미 뺐다) — 화면만 닫는다
function hideBottomSheet() {
    updateSheetState('CLOSED');
}

// 그 밖의 방법(쓸어내리기·탭 전환·삭제 등)으로 닫을 때 — 넣어 둔 뒤로가기 칸도 뺀다
window.closeBottomSheet = function () {
    hideBottomSheet();
    if (window.backNav && window.backNav.closed('club')) return; // 칸을 빼면 ?club= 없는 주소로 돌아간다
    // 딥링크 파라미터 제거
    if (window.history && window.history.replaceState) {
        window.history.replaceState(history.state, '', location.pathname);
    }
};

// Copy address
document.getElementById('btnCopy').onclick = function () {
    window.copyAddress(document.getElementById('sheetAddressVal').value);
};

window.copyAddress = function (addr) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(function () { window.showToast(window.t('addr_copied')); });
    } else {
        var t = document.createElement("input");
        t.value = addr;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        document.body.removeChild(t);
        window.showToast(window.t('addr_copied'));
    }
};

// ── Urgent ticker ──

// 몇 번 불러도 같은 결과여야 한다 — 급구를 켜고 끈 뒤·팀을 지운 뒤 다시 부른다.
// 예전엔 목록을 비우지 않고 덧붙이고, 굴리는 타이머도 하나씩 더 늘렸다.
var urgentTickerTimer = null;

window.initUrgentTicker = function () {
    var tickerContainer = document.getElementById('urgentTicker');
    var tickerList = document.getElementById('tickerList');
    if (!tickerContainer || !tickerList) return;

    // 이전 벌 정리: 타이머 · 항목 · 굴린 위치
    if (urgentTickerTimer) { clearInterval(urgentTickerTimer); urgentTickerTimer = null; }
    tickerList.innerHTML = '';
    tickerList.style.transition = 'none';
    tickerList.style.top = '0px';

    // 곧 끝나는 급구가 먼저(기한 없는 예전 급구는 맨 뒤). filter 에 함수를 그대로 넘기면
    // 두 번째 인자(index)가 nowMs 로 들어간다 — 감싸서 부른다.
    var urgentClubs = window.urgentTickerOrder((window.clubs || []).filter(function (c) { return window.isUrgentActive(c); }));
    var uniqueTickerList = [];
    var processedTeams = {};

    urgentClubs.forEach(function (c) {
        if (!processedTeams[c.name]) {
            uniqueTickerList.push(c);
            processedTeams[c.name] = true;
        }
    });

    if (!uniqueTickerList.length) {
        tickerContainer.style.display = 'none';
        return;
    }
    // 픽업 탭에선 숨긴다(tabs.js 가 동호회로 돌아올 때 항목이 있으면 다시 보인다).
    var onClubsTab = !window.currentTab || window.currentTab === 'clubs';
    tickerContainer.style.display = onClubsTab ? 'flex' : 'none';
    setTimeout(function () { tickerList.style.transition = 'top 0.5s ease-in-out'; }, 50);

    uniqueTickerList.forEach(function (c) {
        var li = document.createElement('li');
        li.className = 'ticker-item';
        // XSS 방지: c.name / c.urgent_msg를 textContent로. 마감은 이름 바로 뒤 — 문구가 길어
        // 말줄임(…)으로 잘려도 '언제까지'는 보이게.
        var nameB = document.createElement('b');
        nameB.textContent = '[' + (c.name || '') + ']';
        li.appendChild(nameB);
        var until = window.urgentDeadlineLabel(c);
        if (until) {
            var untilSpan = document.createElement('span');
            untilSpan.className = 'ticker-until';
            untilSpan.textContent = until;
            li.appendChild(untilSpan);
        }
        li.appendChild(document.createTextNode(' ' + (c.urgent_msg || '')));
        li.onclick = function () { window.openClubDetail(c.id); };
        tickerList.appendChild(li);
    });

    if (uniqueTickerList.length > 1) {
        var tickerHeight = 44;
        var currentIndex = 0;
        urgentTickerTimer = setInterval(function () {
            currentIndex++;
            tickerList.style.top = '-' + (currentIndex * tickerHeight) + 'px';

            if (currentIndex === uniqueTickerList.length) {
                setTimeout(function () {
                    tickerList.style.transition = 'none';
                    tickerList.style.top = '0px';
                    currentIndex = 0;
                    setTimeout(function () { tickerList.style.transition = 'top 0.5s ease-in-out'; }, 50);
                }, 500);
            }
        }, 3000);

        var firstClone = tickerList.children[0].cloneNode(true);
        firstClone.onclick = function () { window.openClubDetail(uniqueTickerList[0].id); };
        tickerList.appendChild(firstClone);
    }
};

// Delete a club (owner or admin only; rules enforce this)
window.deleteClub = async function (club) {
    if (!club || !club.id) return;
    if (!window.canModifyClub(club)) {
        window.showToast(window.t('cd_no_delete_perm'));
        return;
    }

    var roleLabel = window.isAdmin ? window.t('role_admin') : window.t('role_owner');
    var ok = await window.nzConfirm({
        title: window.tf('cd_delete_confirm', { name: club.name }),
        message: window.tf('cd_delete_body', { role: roleLabel }),
        confirm: window.t('cd_delete_btn'),
        danger: true
    });
    if (!ok) return;

    try {
        await window.firebaseDB.collection('clubs').doc(club.id).delete();

        // Remove from in-memory data
        ['allClubs', 'clubs'].forEach(function (key) {
            if (Array.isArray(window[key])) {
                window[key] = window[key].filter(function (c) { return String(c.id) !== String(club.id); });
            }
        });

        // Close bottom sheet
        var sheet = document.getElementById('bottomSheet');
        if (sheet) sheet.classList.remove('open');

        // Re-render markers — initMarkers 가 이전 마커·라벨·원을 먼저 걷는다
        if (window.initMarkers) window.initMarkers();
        if (window.initUrgentTicker) window.initUrgentTicker();

        window.showToast(window.t('cd_deleted'));
    } catch (e) {
        console.error('팀 삭제 오류:', e);
        console.warn('팀 삭제 실패:', e); window.showToast(window.t('cd_delete_error'));
    }
};

// ── 급구 올리기 폼 ──
// 급구는 운동 **한 번**에 묶인다: 시간표에서 다가오는 운동(7일 안, 3개까지)을 칩으로
// 고르거나 '다른 날'(날짜 + 끝나는 시각)을 고른다. 고른 운동이 끝나면 저절로 내려간다.
// 켜기·고치기는 서버 postUrgent 만 받는다(firestore.rules 가 직접 쓰기를 막는다) — 문구
// 검사는 여기서 먼저 같은 규칙(js/urgent.js)으로 해서 칸 아래에 바로 알린다.

function urgentCallable() {
    if (window.firebaseCallable) return window.firebaseCallable('postUrgent');
    return firebase.functions().httpsCallable('postUrgent');
}

function urgentTimestamp(ms) {
    var fs = window.firebase && firebase.firestore;
    return (fs && fs.Timestamp) ? fs.Timestamp.fromMillis(ms) : ms;
}

// 메모리의 팀 객체(allClubs·clubs 가 같은 객체를 나눠 쓴다)를 고치고 지도·티커·시트를 다시 그린다.
function refreshAfterFlagChange(club) {
    window.initMarkers();
    if (window.initUrgentTicker) window.initUrgentTicker();
    if (window.clubSheetShows(club)) window.openClubDetail(club.id, { silent: true });
}

function hideUrgentForm() {
    var overlay = document.getElementById('urgentFormOverlay');
    if (overlay) overlay.style.display = 'none';
}

window.closeUrgentForm = function () {
    hideUrgentForm();
    if (window.backNav) window.backNav.closed('urgentForm');
};

window.openUrgentForm = function (club) {
    if (!window.canModifyClub || !window.canModifyClub(club)) {
        window.showToast(window.t('cd_no_urgent_perm'));
        return;
    }
    var editing = window.isUrgentActive(club);
    var overlay = document.getElementById('urgentFormOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'urgentFormOverlay';
        overlay.className = 'reg-modal-overlay';
        document.body.appendChild(overlay);
    }
    // 팀·언어마다 칩이 달라서 열 때마다 새로 짠다. 고정 문구만 innerHTML, 나머지는 textContent.
    overlay.innerHTML =
        '<div class="reg-modal-content urgent-form" role="dialog" aria-modal="true" aria-labelledby="ugTitle">' +
            '<div class="reg-modal-header">' +
                '<h3 id="ugTitle"></h3>' +
                '<span class="reg-modal-close" role="button" tabindex="0" aria-label="' + window.escapeHtml(window.t('dlg_close')) + '">&times;</span>' +
            '</div>' +
            '<div class="reg-modal-body">' +
                '<div class="reg-form-group">' +
                    '<label id="ugWhenLabel"></label>' +
                    '<div class="chip-group ug-sessions" id="ugSessions" role="radiogroup" aria-labelledby="ugWhenLabel" tabindex="-1"></div>' +
                    '<div class="ug-other" id="ugOtherBox" hidden>' +
                        '<input type="date" id="ugDate">' +
                        '<label for="ugEnd" id="ugEndLabel"></label>' +
                        '<input type="time" id="ugEnd" step="300">' +
                    '</div>' +
                '</div>' +
                '<div class="reg-form-group">' +
                    '<label for="ugMsg" id="ugMsgLabel"></label>' +
                    '<input type="text" id="ugMsg" maxlength="60" autocomplete="off">' +
                '</div>' +
                '<div class="ug-auto-off" id="ugAutoOff"></div>' +
                '<button type="button" id="ugSubmit" class="reg-submit-btn"></button>' +
            '</div>' +
        '</div>';
    var $ = function (id) { return document.getElementById(id); };
    $('ugTitle').textContent = editing ? window.t('ug_edit') : window.t('cd_urgent_title');
    $('ugWhenLabel').textContent = window.t('ug_when');
    $('ugEndLabel').textContent = window.t('ug_end_time');
    $('ugMsgLabel').textContent = window.t('ug_msg_label');
    $('ugAutoOff').textContent = window.t('ug_auto_off');
    $('ugSubmit').textContent = editing ? window.t('ug_edit') : window.t('ug_submit');
    var msgInput = $('ugMsg');
    msgInput.placeholder = window.t('ug_msg_hint');
    msgInput.value = editing ? club.urgent_msg.trim() : '';

    var now = Date.now();
    var dateInput = $('ugDate'), endInput = $('ugEnd');
    dateInput.min = window.urgentDateInputValue(now);
    dateInput.max = window.urgentDateInputValue(now + window.URGENT_PICK_AHEAD_MS);

    // 칩: 다가오는 운동 + '다른 날'. 고른 것 하나만 selected(radio).
    var sessions = window.urgentNextSessions(window.parseScheduleText(club.schedule), now, 3);
    var box = $('ugSessions');
    var pick = null; // { until } | 'other'
    var chips = [];
    function select(chip, value) {
        chips.forEach(function (c) { c.classList.remove('selected'); c.setAttribute('aria-checked', 'false'); });
        chip.classList.add('selected');
        chip.setAttribute('aria-checked', 'true');
        pick = value;
        $('ugOtherBox').hidden = value !== 'other';
        if (window.clearFieldError) window.clearFieldError(box);
    }
    function addChip(label, value) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip';
        c.setAttribute('role', 'radio');
        c.setAttribute('aria-checked', 'false');
        c.textContent = label;
        c.onclick = function () { select(c, value); };
        box.appendChild(c);
        chips.push(c);
        return c;
    }
    var dayName = function (k) { return window.i18nDay(k); };
    var currentUntil = editing ? window.tsMillis(club.urgent_until) : null;
    var preselect = null; // 새로 올릴 땐 가장 이른 운동, 고칠 땐 지금 기한과 같은 운동
    sessions.forEach(function (sess) {
        var c = addChip(window.urgentSessionLabel(sess, window.currentLang, dayName), { until: sess.endMs });
        if (!preselect && (currentUntil == null || currentUntil === sess.endMs)) preselect = { chip: c, value: { until: sess.endMs } };
    });
    var otherChip = addChip(window.t('ug_other_day'), 'other');

    // '다른 날' 기본값: 고치는 중이면 지금 기한, 아니면 오늘 22:00(이미 지났으면 내일)
    var otherDefault = currentUntil;
    if (otherDefault == null) {
        var d = new Date(now);
        otherDefault = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22, 0).getTime();
        if (otherDefault <= now + window.URGENT_MIN_LEAD_MS) otherDefault += 24 * 3600 * 1000;
    }
    var od = new Date(otherDefault);
    dateInput.value = window.urgentDateInputValue(otherDefault);
    endInput.value = (od.getHours() < 10 ? '0' : '') + od.getHours() + ':' + (od.getMinutes() < 10 ? '0' : '') + od.getMinutes();
    // 고치는 중인데 지금 기한이 칩에 없으면(다른 날로 올렸던 급구) '다른 날'에 그 기한이 채워진다
    if (preselect) select(preselect.chip, preselect.value); else select(otherChip, 'other');

    overlay.querySelector('.reg-modal-close').onclick = window.closeUrgentForm;
    overlay.querySelector('.reg-modal-close').onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.closeUrgentForm(); }
    };
    $('ugSubmit').onclick = function () { submitUrgentForm(club, function () { return pick; }); };
    overlay.style.display = 'flex';
    if (window.backNav) window.backNav.open('urgentForm', hideUrgentForm);
    setTimeout(function () { msgInput.focus(); }, 0);
};

// 서버가 준 이유 → 문구 키. 모르는 이유는 ug_err_generic.
function urgentErrorKey(reason) {
    if (reason === 'login') return 'sh_login_required';
    var key = 'ug_err_' + String(reason || '');
    return window.t(key) !== key ? key : 'ug_err_generic';
}

async function submitUrgentForm(club, getPick) {
    var msgInput = document.getElementById('ugMsg');
    var pick = getPick();
    var timeTarget = pick === 'other' ? 'ugEnd' : 'ugSessions';
    var until = pick === 'other'
        ? window.urgentOtherDayUntil(document.getElementById('ugDate').value, document.getElementById('ugEnd').value)
        : (pick && pick.until);
    var now = Date.now();
    if (until == null || until <= now + window.URGENT_MIN_LEAD_MS) {
        window.fieldError(timeTarget, window.t('ug_err_past'));
        return;
    }
    if (until > now + window.URGENT_MAX_AHEAD_MS) {
        window.fieldError(timeTarget, window.t('ug_err_too_far'));
        return;
    }
    var problem = window.urgentMsgProblem(msgInput.value);
    if (problem) {
        window.fieldError(msgInput, window.t('ug_err_' + problem));
        return;
    }
    var msg = msgInput.value.trim();
    var btn = document.getElementById('ugSubmit');
    var label = btn.textContent;
    btn.textContent = window.t('processing');
    btn.disabled = true;
    try {
        var call = urgentCallable();
        if (!call) throw new Error('functions 미초기화');
        var res = await call({ clubId: String(club.id), until: until, msg: msg });
        var savedUntil = (res && res.data && typeof res.data.until === 'number') ? res.data.until : until;
        club.is_urgent = true;
        club.urgent_msg = msg;
        club.urgent_until = urgentTimestamp(savedUntil);
        club.urgent_at = urgentTimestamp(Date.now());
        window.closeUrgentForm();
        window.showToast(window.t('cd_urgent_posted'));
        if (window.track) window.track('urgent_post', { club_id: club.id });
        refreshAfterFlagChange(club);
    } catch (e) {
        var reason = e && e.details && e.details.reason;
        console.warn('급구 올리기 실패:', reason || (e && e.message));
        var key = urgentErrorKey(reason);
        if (/^msg_/.test(reason || '')) window.fieldError(msgInput, window.t(key));
        else if (reason === 'past' || reason === 'too_far') window.fieldError(timeTarget, window.t(key));
        else window.showToast(window.t(key));
    } finally {
        btn.textContent = label;
        btn.disabled = false;
    }
}

// 급구 내리기 — 클라이언트가 직접 쓴다(규칙이 끄기는 허용). 기한·올린 시각도 지운다.
window.closeClubUrgent = async function (club) {
    if (!window.canModifyClub || !window.canModifyClub(club)) {
        window.showToast(window.t('cd_no_urgent_perm'));
        return;
    }
    var del = firebase.firestore.FieldValue.delete();
    try {
        await window.firebaseDB.collection('clubs').doc(String(club.id)).update({
            is_urgent: false, urgent_msg: '', urgent_until: del, urgent_at: del
        });
        club.is_urgent = false;
        club.urgent_msg = '';
        delete club.urgent_until;
        delete club.urgent_at;
        window.showToast(window.t('cd_urgent_closed'));
        refreshAfterFlagChange(club);
    } catch (e) {
        console.error(e);
        window.showToast(window.t('cd_update_error'));
    }
};

// ── 회원 모집 켜기/끄기 ──
// 팀 관리자가 직접 쓴다(인증 여부 상관없음). 켤 때는 문구(선택)를 받고 recruit_at 을
// 서버 시각으로 — 규칙이 그걸 요구하고, 정리(sweepClubFlags)가 거기서 60일을 센다.
window.toggleClubRecruiting = async function (club) {
    if (!window.canModifyClub || !window.canModifyClub(club)) return;
    var ref = window.firebaseDB.collection('clubs').doc(String(club.id));
    try {
        if (window.isRecruitingActive(club)) {
            await ref.update({ is_recruiting: false });
            club.is_recruiting = false;
        } else {
            var v = await window.nzPrompt({
                title: window.t('rc_on'),
                message: window.t('rc_auto_off'),
                fields: [{ name: 'msg', value: club.recruit_msg || '', placeholder: window.t('rc_msg_hint'), maxLength: window.URGENT_MSG_MAX }],
                confirm: window.t('rc_on'),
                validate: function (x) {
                    var p = window.recruitMsgProblem(x.msg);
                    return p ? { msg: window.t('ug_err_' + p) } : null;
                }
            });
            if (!v) return;
            await ref.update({ is_recruiting: true, recruit_msg: v.msg, recruit_at: window.firebaseServerTimestamp() });
            club.is_recruiting = true;
            club.recruit_msg = v.msg;
            club.recruit_at = urgentTimestamp(Date.now());
            if (window.track) window.track('recruit_on', { club_id: club.id });
        }
        refreshAfterFlagChange(club);
    } catch (e) {
        console.error(e);
        window.showToast(window.t('cd_update_error'));
    }
};

// ── Bottom sheet touch/mouse drag handlers ──

(function () {
    var sheet = document.getElementById('bottomSheet');
    var handleArea = document.getElementById('sheetHandle');
    var startY = 0, currentY = 0, isDragging = false, startHeight = 0;

    function bHandleStart(e) {
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        isDragging = true;
        sheet.style.transition = 'none';
        document.getElementById('timeMorphContainer').style.transition = 'none';
        startHeight = sheet.offsetHeight;
    }

    function bHandleMove(e) {
        if (!isDragging) return;
        if (e.cancelable && e.type.indexOf('touch') === 0) e.preventDefault();
        currentY = e.touches ? e.touches[0].clientY : e.clientY;
        var deltaY = currentY - startY;
        var newHeight = startHeight - deltaY;
        if (newHeight > EXPANDED_HEIGHT) newHeight = EXPANDED_HEIGHT;
        sheet.style.height = newHeight + 'px';
        var ratio = (newHeight - PEEK_HEIGHT) / (EXPANDED_HEIGHT - PEEK_HEIGHT);
        interpolateMorph(ratio);
    }

    function bHandleEnd() {
        if (!isDragging) return;
        isDragging = false;
        sheet.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        document.getElementById('timeMorphContainer').style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        var currentH = sheet.offsetHeight;
        if (currentH > (PEEK_HEIGHT + EXPANDED_HEIGHT) / 2) {
            updateSheetState('EXPANDED');
        } else {
            if (currentH < PEEK_HEIGHT * SHEET_CLOSE_RATIO) window.closeBottomSheet(); // 아래로 쓸어내려 닫기
            else updateSheetState('PEEK');
        }
        currentY = 0;
        startY = 0;
    }

    // 키보드(Enter·Space)·화면 낭독기로 누르면 닫기. 이런 클릭은 detail 이 0 이다 —
    // 손가락·마우스 탭(detail ≥ 1)은 무시해서 '쓸어내려 닫기' 설계를 바꾸지 않는다
    handleArea.addEventListener('click', function (e) {
        if (e.detail === 0) window.closeBottomSheet();
    });
    handleArea.addEventListener('touchstart', bHandleStart, { passive: true });
    handleArea.addEventListener('touchmove', bHandleMove, { passive: false });
    handleArea.addEventListener('touchend', bHandleEnd);
    handleArea.addEventListener('mousedown', bHandleStart);
    window.addEventListener('mousemove', bHandleMove);
    window.addEventListener('mouseup', bHandleEnd);
})();

// ── Preview / Download ──

window.closePreview = function () {
    var overlay = document.getElementById('previewOverlay');
    overlay.style.display = 'none';
    document.getElementById('previewImgBox').innerHTML = "";
};

window.downloadImage = function () {
    var imgBox = document.getElementById('previewImgBox');
    var img = imgBox.querySelector('img');

    if (img) {
        var link = document.createElement('a');
        link.href = img.src;
        var now = new Date();
        var fileName = 'nulloong_' + now.getFullYear() + (now.getMonth() + 1) + now.getDate() + '_' + now.getHours() + now.getMinutes() + '.png';
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        window.showToast(window.t('no_image'));
    }
};

// 언어 전환 시 열려있는 바텀시트 전체를 부작용 없이(silent) 재렌더링.
// 요일/일정/가격/힌트뿐 아니라 인증/관리 버튼 등 동적 콘텐츠까지 갱신된다.
// 정적 [data-i18n] 요소는 i18n.js의 applyI18n()이 이미 갱신한다.
document.addEventListener('nurungji:langchange', function () {
    if (sheetState === 'CLOSED' || !window.currentClubId) return;
    window.openClubDetail(window.currentClubId, { silent: true });
});
