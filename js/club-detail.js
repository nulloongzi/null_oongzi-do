// club-detail.js
// Bottom sheet club detail, timetable rendering, urgent ticker
// Depends on: map-core.js (window.map, window.markers, window.clusterer, window.instaCssIcon, window.initMarkers)

// ── Schedule parsing ──

window.parseScheduleText = function (text) {
    var scheduleMap = {};
    if (!text) return scheduleMap;
    var segments = text.split(/\s*\/\s*/);
    segments.forEach(function (segment) {
        var timeReg = /(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/;
        var match = segment.match(timeReg);
        if (match) {
            var startH = parseInt(match[1]);
            var startM = parseInt(match[2]);
            var endH = parseInt(match[3]);
            var endM = parseInt(match[4]);

            function format12(h, m) {
                var p = h >= 12 ? 'PM' : 'AM';
                var h12 = h % 12;
                if (h12 === 0) h12 = 12;
                var mStr = m < 10 ? '0' + m : m;
                return p + ' ' + h12 + ':' + mStr;
            }

            var displayTime = format12(startH, startM) + '~' + format12(endH, endM);

            var days = ['월', '화', '수', '목', '금', '토', '일'];
            days.forEach(function (day) {
                if (segment.includes(day)) {
                    scheduleMap[day] = {
                        startH: startH, startM: startM,
                        endH: endH, endM: endM,
                        text: displayTime
                    };
                }
            });
        }
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
                    '<div style="font-size:9px; opacity:0.8; margin-top:2px;">(' + durationStr + 'h)</div>';
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
var EXPANDED_HEIGHT = window.innerHeight * 0.9;
var BUBBLE_HEIGHT = 60;

function updateSheetState(newState, animation) {
    if (animation === undefined) animation = true;
    var sheet = document.getElementById('bottomSheet');
    var hint = document.getElementById('expandHint');

    sheetState = newState;

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

window.openClubDetail = function (id) {
    document.getElementById('topSearchInput').blur();
    var club = window.clubs.find(function (c) { return c.id === id; });
    if (!club) return;

    // 현재 열린 클럽 추적 (언어 전환 시 바텀시트 재렌더링용)
    window.currentClubId = id;

    if (window.track) window.track('view_club', { club_id: club.id, club_name: club.name });

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
        sheetTitleEl.appendChild(document.createTextNode(' '));
        sheetTitleEl.appendChild(instaLink);
    }
    document.getElementById('sheetPrice').innerText = club.price || window.t('no_fee');
    document.getElementById('sheetAddressVal').value = club.address;

    window.renderTimetables(club.schedule);

    // XSS 방지: target/link를 escape/sanitize 후 DOM 조립
    var sheetTagsEl = document.getElementById('sheetTags');
    sheetTagsEl.innerHTML = '';
    var targetSpan = document.createElement('span');
    targetSpan.className = 'tag target';
    targetSpan.textContent = club.target || '';
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
        linkA.appendChild(linkSpan);
        sheetTagsEl.appendChild(linkA);
    }
    document.getElementById('btnWay').href = "https://map.kakao.com/link/to/" + club.name + "," + club.lat + "," + club.lng;

    var urgentArea = document.getElementById('urgentArea');
    if (club.is_urgent && club.urgent_msg) {
        // XSS 방지: urgent_msg는 textContent로 삽입
        urgentArea.innerHTML = '';
        var urgentBanner = document.createElement('div');
        urgentBanner.className = 'urgent-banner';
        urgentBanner.textContent = '🔥 ' + club.urgent_msg;
        urgentArea.appendChild(urgentBanner);
        urgentArea.style.display = 'block';
    } else {
        urgentArea.style.display = 'none';
    }

    // Urgent management button (verified clubs only)
    var actionBtns = document.querySelector('.action-buttons');
    var existingManageBtn = document.getElementById('btnManageUrgent');
    if (existingManageBtn) existingManageBtn.remove();

    // 인증된 팀의 owner/admin만 급구 토글 노출 (Firestore rule이 동일 조건으로 write 차단)
    if (club.is_verified && window.canModifyClub && window.canModifyClub(club)) {
        var manageBtn = document.createElement('button');
        manageBtn.id = 'btnManageUrgent';
        manageBtn.className = 'btn';
        manageBtn.style = 'background: #ff5252; color: #fff;';
        manageBtn.innerText = club.is_urgent ? '🔥 급구 내리기' : '🔥 급구 올리기';
        manageBtn.onclick = function () { window.toggleClubUrgentState(club); };
        actionBtns.appendChild(manageBtn);
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

        // Firestore에서 최신 인증 요청 상태 조회
        window.firebaseDB.collection('verification_requests')
            .where('club_id', '==', club.id)
            .orderBy('requested_at', 'desc')
            .limit(1)
            .get().then(function (snap) {
            if (snap.empty) {
                // 신청 이력 없음 → 인증 신청 버튼
                verifyArea.innerHTML =
                    '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                    '✅ 인증 신청</button>';
                document.getElementById('btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
            } else {
                var reqData = snap.docs[0].data();
                if (reqData.status === 'pending') {
                    // 심사 중
                    verifyArea.innerHTML =
                        '<div style="background:rgba(33,150,243,0.1);border-left:3px solid #2196f3;padding:12px 15px;border-radius:4px;font-size:13px;color:#1565c0;line-height:1.5;">' +
                        '⏳ 인증 심사 중입니다.<br><span style="font-size:12px;color:#666;">관리자 확인 후 인증 배지가 부여됩니다.</span></div>';
                } else if (reqData.status === 'rejected') {
                    // 거절됨 → 사유 표시 + 재신청 버튼. XSS 방지: reason은 textContent로
                    var reasonText = reqData.reject_reason || '사유가 기재되지 않았습니다.';
                    verifyArea.innerHTML =
                        '<div style="background:rgba(244,67,54,0.08);border-left:3px solid #f44336;padding:12px 15px;border-radius:4px;margin-bottom:8px;font-size:13px;line-height:1.5;">' +
                        '<div style="color:#d32f2f;font-weight:600;margin-bottom:4px;">❌ 인증이 거절되었습니다</div>' +
                        '<div style="color:#555;">사유: <span id="rejectReasonText"></span></div></div>' +
                        '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                        '🔄 인증 재신청</button>';
                    document.getElementById('rejectReasonText').textContent = reasonText;
                    document.getElementById('btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
                }
            }
        }).catch(function (err) {
            console.error('인증 상태 조회 오류:', err);
            // 조회 실패 시 기본 인증 신청 버튼 표시
            verifyArea.innerHTML =
                '<button id="btnRequestVerify" class="btn" style="background:var(--nurungji-yellow);color:var(--nurungji-dark);width:100%;font-weight:600;">' +
                '✅ 인증 신청</button>';
            document.getElementById('btnRequestVerify').onclick = function () { window.openVerificationModal(club); };
        });
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
        editBtn.innerText = '✏ 팀 정보 수정';
        editBtn.onclick = function () { window.openEditModal(club); };
        anchor.parentElement.insertBefore(editBtn, anchor.nextSibling);

        // 🗑 삭제 버튼 (수정 버튼 다음에 위치)
        var deleteBtn = document.createElement('button');
        deleteBtn.id = 'btnDeleteClub';
        deleteBtn.className = 'btn';
        deleteBtn.style = 'background:#fff; color:#d32f2f; border:1px solid #d32f2f; margin-top:8px; width:100%; font-weight:600;';
        deleteBtn.innerText = '🗑 팀 삭제';
        deleteBtn.onclick = function () { window.deleteClub(club); };
        editBtn.parentElement.insertBefore(deleteBtn, editBtn.nextSibling);
    }

    // Bookmark button
    var btnBookmark = document.getElementById('btnBookmark');
    if (btnBookmark) {
        btnBookmark.onclick = function () { if (window.bookmarkTeam) window.bookmarkTeam(club.id); };
    }

    // Share button
    var btnShareClub = document.getElementById('btnShareClub');
    if (btnShareClub) {
        btnShareClub.onclick = function () { if (window.shareClub) window.shareClub(club); };
    }

    // 주소창을 공유 가능한 딥링크로 동기화
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '?club=' + encodeURIComponent(club.id));
    }

    updateSheetState('PEEK');

    // 지도 이동은 상세 표시(이미 완료)와 분리: 맵 미준비/일시 오류 시에도 상세는 정상 노출
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

window.closeBottomSheet = function () {
    updateSheetState('CLOSED');
    // 딥링크 파라미터 제거
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', location.pathname);
    }
};

// Copy address
document.getElementById('btnCopy').onclick = function () {
    window.copyAddress(document.getElementById('sheetAddressVal').value);
};

window.copyAddress = function (addr) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(function () { alert('주소가 복사되었습니다! 📋'); });
    } else {
        var t = document.createElement("input");
        t.value = addr;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        document.body.removeChild(t);
        alert('주소가 복사되었습니다! 📋');
    }
};

// ── Urgent ticker ──

window.initUrgentTicker = function () {
    var urgentClubs = window.clubs.filter(function (c) { return c.is_urgent && c.urgent_msg; });
    var uniqueTickerList = [];
    var processedTeams = {};

    urgentClubs.forEach(function (c) {
        if (!processedTeams[c.name]) {
            uniqueTickerList.push(c);
            processedTeams[c.name] = true;
        }
    });

    if (uniqueTickerList.length > 0) {
        var tickerContainer = document.getElementById('urgentTicker');
        var tickerList = document.getElementById('tickerList');
        tickerContainer.style.display = 'flex';

        uniqueTickerList.forEach(function (c) {
            var li = document.createElement('li');
            li.className = 'ticker-item';
            // XSS 방지: c.name / c.urgent_msg를 textContent로
            var nameB = document.createElement('b');
            nameB.textContent = '[' + (c.name || '') + ']';
            li.appendChild(nameB);
            li.appendChild(document.createTextNode(' ' + (c.urgent_msg || '')));
            li.onclick = function () { window.openClubDetail(c.id); };
            tickerList.appendChild(li);
        });

        if (uniqueTickerList.length > 1) {
            var tickerHeight = 44;
            var currentIndex = 0;
            setInterval(function () {
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
    }
};

// ── Toggle urgent state ──

// Delete a club (owner or admin only; rules enforce this)
window.deleteClub = async function (club) {
    if (!club || !club.id) return;
    if (!window.canModifyClub(club)) {
        alert('삭제 권한이 없습니다.');
        return;
    }

    var roleLabel = window.isAdmin ? '관리자' : '소유자';
    var msg = '[' + club.name + ']\n정말 이 팀을 삭제하시겠습니까?\n\n(삭제 후 복구 불가 · ' + roleLabel + ' 권한)';
    if (!confirm(msg)) return;

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

        // Re-render markers
        if (window.markers) {
            window.markers.forEach(function (m) { if (m.marker) m.marker.setMap(null); });
            window.markers.forEach(function (m) { if (m.overlay) m.overlay.setMap(null); });
            window.markers = [];
        }
        if (window.clusterer) window.clusterer.clear();
        if (window.initMarkers) window.initMarkers();
        if (window.initUrgentTicker) window.initUrgentTicker();

        alert('팀이 삭제되었습니다.');
    } catch (e) {
        console.error('팀 삭제 오류:', e);
        alert('삭제 중 오류가 발생했습니다: ' + (e.message || e.code || '알 수 없음'));
    }
};

window.toggleClubUrgentState = function (club) {
    // PIN 1234(클라이언트 평문 가짜 보안) 제거. owner/admin만 토글 가능.
    if (!window.canModifyClub || !window.canModifyClub(club)) {
        alert("급구 토글 권한이 없습니다.\n팀 등록자(소유자) 또는 관리자만 변경할 수 있습니다.");
        return;
    }

    var newStatus = !club.is_urgent;
    var newMsg = "";
    if (newStatus) {
        newMsg = prompt("급구 메시지를 입력해주세요! (예: 라이트 1명 급구)", "센터 1명 급구합니다!");
        if (!newMsg) return;
        newMsg = newMsg.trim();
        if (newMsg.length > 200) {
            alert("급구 메시지는 200자 이하로 입력해주세요.");
            return;
        }
    }

    var clubRef = window.firebaseDoc(window.firebaseDB, 'clubs', club.id);
    window.firebaseSetDoc(clubRef, {
        is_urgent: newStatus,
        urgent_msg: newMsg
    }, { merge: true }).then(function () {
        alert(newStatus ? "🔥 급구가 등록되었습니다!" : "급구가 마감되었습니다.");
        club.is_urgent = newStatus;
        club.urgent_msg = newMsg;

        // Re-render markers
        window.markers.forEach(function (m) { m.marker.setMap(null); });
        window.markers.forEach(function (m) { m.overlay.setMap(null); });
        window.clusterer.clear();
        window.markers = [];
        window.initMarkers();
        window.openClubDetail(club.id);
    }).catch(function (e) {
        console.error(e);
        alert("업데이트 중 오류가 발생했습니다.");
    });
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
            if (currentH < PEEK_HEIGHT * 0.8) updateSheetState('CLOSED');
            else updateSheetState('PEEK');
        }
        currentY = 0;
        startY = 0;
    }

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
        alert("저장할 이미지가 없습니다.");
    }
};

// 언어 전환 시 열려있는 바텀시트의 동적 콘텐츠(요일/일정/가격/힌트) 재렌더링.
// 정적 [data-i18n] 요소는 i18n.js의 applyI18n()이 이미 갱신한다.
document.addEventListener('nurungji:langchange', function () {
    if (sheetState === 'CLOSED' || !window.currentClubId) return;
    var club = window.clubs.find(function (c) { return c.id === window.currentClubId; });
    if (!club) return;
    window.renderTimetables(club.schedule);
    document.getElementById('sheetPrice').innerText = club.price || window.t('no_fee');
    var homeTag = document.querySelector('#sheetTags a .tag');
    if (homeTag) homeTag.textContent = window.t('home_tag');
    updateSheetState(sheetState, false);
});
