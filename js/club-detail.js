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
            item.innerHTML = '<div class="st-day-text">' + day + '요일</div><div class="st-time-text">' + d.text + '</div>';
            summaryContainer.appendChild(item);
        }
    });
    if (!hasActive) {
        summaryContainer.innerHTML = '<div class="st-bubble"><div class="st-day-text">일정</div><div class="st-time-text">정보없음</div></div>';
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
        cell.innerText = d;
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
        hint.innerText = '▴ 위로 올려서 상세 정보 보기';
        interpolateMorph(0);
    } else if (newState === 'EXPANDED') {
        sheet.style.height = EXPANDED_HEIGHT + 'px';
        hint.innerText = '▾ 아래로 내려서 요약 보기';
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

    var verifiedBadge = '<svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align:text-bottom;margin-right:2px;" fill="#1DA1F2"><path d="M22.5 12.5c0-1.58-.87-2.92-2.14-3.58.14-.52.22-1.07.22-1.63 0-3.18-2.58-5.75-5.75-5.75-.56 0-1.11.08-1.63.22C12.54 1.49 11.2 0.62 9.62 0.62 6.44 0.62 3.87 3.2 3.87 6.38c0 .56.08 1.11.22 1.63C2.82 8.67 1.95 10 1.95 11.58c0 3.18 2.58 5.75 5.75 5.75.56 0 1.11-.08 1.63-.22.66 1.27 2 2.14 3.58 2.14 3.18 0 5.75-2.58 5.75-5.75 0-.56-.08-1.11-.22-1.63 1.27-.66 2.14-2 2.14-3.58zm-12.26 3.63L6 11.89l1.41-1.41 2.83 2.83 6.36-6.36 1.41 1.41-7.77 7.77z"/></svg>';
    var titleHtml = club.is_verified ? verifiedBadge + club.name : club.name;
    if (club.insta) titleHtml += ' <a href="https://instagram.com/' + club.insta + '" target="_blank" class="insta-link">' + window.instaCssIcon + '</a>';
    document.getElementById('sheetTitle').innerHTML = titleHtml;
    document.getElementById('sheetPrice').innerText = club.price || "회비 정보 없음";
    document.getElementById('sheetAddressVal').value = club.address;

    window.renderTimetables(club.schedule);

    var tagHtml = '<span class="tag target">' + club.target + '</span>';
    if (club.link) tagHtml += '<a href="' + club.link + '" target="_blank" style="text-decoration:none"><span class="tag" style="background:#eee">🏠 홈페이지</span></a>';
    document.getElementById('sheetTags').innerHTML = tagHtml;
    document.getElementById('btnWay').href = "https://map.kakao.com/link/to/" + club.name + "," + club.lat + "," + club.lng;

    var urgentArea = document.getElementById('urgentArea');
    if (club.is_urgent && club.urgent_msg) {
        urgentArea.innerHTML = '<div class="urgent-banner">🔥 ' + club.urgent_msg + '</div>';
        urgentArea.style.display = 'block';
    } else {
        urgentArea.style.display = 'none';
    }

    // Urgent management button (verified clubs only)
    var actionBtns = document.querySelector('.action-buttons');
    var existingManageBtn = document.getElementById('btnManageUrgent');
    if (existingManageBtn) existingManageBtn.remove();

    if (club.is_verified) {
        var manageBtn = document.createElement('button');
        manageBtn.id = 'btnManageUrgent';
        manageBtn.className = 'btn';
        manageBtn.style = 'background: #ff5252; color: #fff; margin-left: 10px;';
        manageBtn.innerText = club.is_urgent ? '🔥 급구 내리기' : '🔥 급구 올리기';
        manageBtn.onclick = function () { window.toggleClubUrgentState(club); };
        actionBtns.appendChild(manageBtn);
    }

    // Bookmark button
    var btnBookmark = document.getElementById('btnBookmark');
    if (btnBookmark) {
        btnBookmark.onclick = function () { if (window.bookmarkTeam) window.bookmarkTeam(club.id); };
    }

    updateSheetState('PEEK');

    var targetLevel = 4;
    window.map.setLevel(targetLevel, { animate: true });
    var moveLatLon = new kakao.maps.LatLng(club.lat, club.lng);
    var projection = window.map.getProjection();
    var centerPoint = projection.pointFromCoords(moveLatLon);
    var offsetY = Math.min(window.innerHeight * 0.13, 150);
    var newCenterPoint = new kakao.maps.Point(centerPoint.x, centerPoint.y + offsetY);
    var newCenterLatLon = projection.coordsFromPoint(newCenterPoint);
    window.map.panTo(newCenterLatLon);
};

window.closeBottomSheet = function () { updateSheetState('CLOSED'); };

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
            li.innerHTML = '<b>[' + c.name + ']</b> ' + c.urgent_msg;
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

window.toggleClubUrgentState = function (club) {
    var pin = prompt("팀 관리자 PIN 번호 4자리를 입력해주세요.\n(기본 핀번호: 1234)");
    if (pin !== "1234") {
        alert("PIN 번호가 일치하지 않습니다.");
        return;
    }

    var newStatus = !club.is_urgent;
    var newMsg = "";
    if (newStatus) {
        newMsg = prompt("급구 메시지를 입력해주세요! (예: 라이트 1명 급구)", "센터 1명 급구합니다!");
        if (!newMsg) return;
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
