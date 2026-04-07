// lunchbox.js
// 도시락(Lunchbox) UI: 북마크 슬롯, 편집, 식단표, 커스텀 팀
// Depends on: firebase-init.js (window.firebaseDB, window.firebaseDoc, etc.)
//             club-detail.js  (window.parseScheduleText, window.getHourLabel, window.findClub)
//             window.currentUser, window.currentProfileData, window.renderProfileCard

// ═══════════════════════════════════════════
//  localStorage abstraction layer
// ═══════════════════════════════════════════

var LS_BOOKMARKS_KEY = 'nulloong_bookmarks';
var LS_CUSTOM_TEAMS_KEY = 'nulloong_custom_teams';

function getLocalBookmarks() {
    try {
        var raw = localStorage.getItem(LS_BOOKMARKS_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            while (parsed.length < 5) parsed.push(null);
            return parsed.slice(0, 5);
        }
    } catch (e) {
        console.error('getLocalBookmarks error:', e);
    }
    return [null, null, null, null, null];
}

function setLocalBookmarks(slots) {
    try {
        var normalized = slots || [null, null, null, null, null];
        while (normalized.length < 5) normalized.push(null);
        if (normalized.length > 5) normalized = normalized.slice(0, 5);
        localStorage.setItem(LS_BOOKMARKS_KEY, JSON.stringify(normalized));
    } catch (e) {
        console.error('setLocalBookmarks error:', e);
    }
}

function getLocalCustomTeams() {
    try {
        var raw = localStorage.getItem(LS_CUSTOM_TEAMS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error('getLocalCustomTeams error:', e);
    }
    return {};
}

function setLocalCustomTeams(teams) {
    try {
        localStorage.setItem(LS_CUSTOM_TEAMS_KEY, JSON.stringify(teams || {}));
    } catch (e) {
        console.error('setLocalCustomTeams error:', e);
    }
}

function getEffectiveBookmarks() {
    if (window.currentProfileData) {
        return window.currentProfileData.bookmarks || [null, null, null, null, null];
    }
    return getLocalBookmarks();
}

function getEffectiveCustomTeams() {
    if (window.currentProfileData) {
        return window.currentProfileData.customTeams || {};
    }
    return getLocalCustomTeams();
}

// ═══════════════════════════════════════════
//  Temp slots abstraction (edit mode)
// ═══════════════════════════════════════════

var localTempSlots = [null, null, null, null, null];
var localCustomTeams = {};

function getTempSlots() {
    if (window.currentProfileData) {
        return window.currentProfileData.tempSlots || [null, null, null, null, null];
    }
    return localTempSlots;
}

function setTempSlots(slots) {
    if (window.currentProfileData) {
        window.currentProfileData.tempSlots = slots;
    } else {
        localTempSlots = slots;
    }
}

// ═══════════════════════════════════════════
//  State variables
// ═══════════════════════════════════════════

var isEditMode = false;
var selectedSlotIndex = null;
var isDietPlanOpen = false;

// ═══════════════════════════════════════════
//  Slot placeholders & colors
// ═══════════════════════════════════════════

var slotPlaceholders = [
    "밥을<br>담아주세요🍚",
    "국을<br>담아주세요🥘",
    "반찬1🍳",
    "반찬2🥗",
    "반찬3🥢"
];

var slotColors = ["#fffde7", "#fff3e0", "#f1f8e9", "#fbe9e7", "#f3e5f5"];
var borderColors = ["#fbc02d", "#f57c00", "#689f38", "#d84315", "#8e24aa"];

// ═══════════════════════════════════════════
//  Functions
// ═══════════════════════════════════════════

window.toggleEditMode = function () {
    isEditMode = !isEditMode;
    selectedSlotIndex = null;
    renderLunchboxGrid();
    var btn = document.getElementById('lbEditBtn');
    if (isEditMode) {
        btn.classList.add('editing');
        btn.innerHTML = '✅ 완료';
    } else {
        btn.classList.remove('editing');
        btn.innerHTML = '🍽 편집';
        saveLunchboxToDB();
    }
};

window.toggleDietPlan = function () {
    isDietPlanOpen = !isDietPlanOpen;
    var container = document.getElementById('dietPlanContainer');
    var btn = document.getElementById('dietToggleBtn');
    if (isDietPlanOpen) {
        renderCombinedSchedule();
        container.style.height = '420px';
        container.classList.add('open');
        btn.innerText = '📅 식단표 접기';
    } else {
        container.style.height = '0';
        container.classList.remove('open');
        btn.innerText = '📅 식단표 (스케줄 확인)';
    }
};

window.addCustomTeam = async function () {
    var name = prompt("🍙 추가할 팀/일정 이름을 입력하세요", "개인운동");
    if (!name || name.trim() === "") return;

    var schedule = prompt("시간을 입력하세요 (예: 월 19:00~21:00)", "월 19:00~21:00");
    if (!schedule || schedule.trim() === "") return;

    var newId = "custom_" + Date.now();
    var newTeam = {
        id: newId,
        name: name,
        schedule: schedule,
        schedule_raw: schedule,
        isCustom: true,
        target: "나만의 메뉴",
        address: "사용자 추가",
        lat: null,
        lng: null
    };

    if (window.currentProfileData) {
        if (!window.currentProfileData.customTeams) window.currentProfileData.customTeams = {};
        window.currentProfileData.customTeams[newId] = newTeam;
    } else {
        var teams = getLocalCustomTeams();
        teams[newId] = newTeam;
        setLocalCustomTeams(teams);
        localCustomTeams = teams;
    }

    await window.bookmarkTeam(newId);
};

function saveLunchboxToDB() {
    var slots = getTempSlots();
    var bookmarks = getEffectiveBookmarks();
    slots = slots || bookmarks || [null, null, null, null, null];
    while (slots.length < 5) slots.push(null);
    if (slots.length > 5) slots = slots.slice(0, 5);

    if (window.currentProfileData) {
        // [Optimistic UI] 즉시 로컬 메모리에 반영
        window.currentProfileData.bookmarks = slots;
        if (typeof window.renderProfileCard === 'function') window.renderProfileCard();
        if (isDietPlanOpen) renderCombinedSchedule();

        // Firestore 비동기 저장
        if (window.currentUser && window.firebaseDB) {
            var userRef = window.firebaseDoc(window.firebaseDB, 'users', window.currentUser.uid);
            window.firebaseUpdateDoc(userRef, {
                bookmarks: slots,
                customTeams: window.currentProfileData.customTeams || {}
            }).catch(function (e) { console.error("Firebase save failed, but UI applied:", e); });
        }
    } else {
        // localStorage fallback
        setLocalBookmarks(slots);
        if (isDietPlanOpen) renderCombinedSchedule();
    }
}

window.bookmarkTeam = async function (teamId) {
    try {
        var slots = getEffectiveBookmarks();
        while (slots.length < 5) slots.push(null);

        if (slots.includes(teamId)) { alert("이미 도시락에 담긴 팀입니다! 🍱"); return; }

        var emptyIndex = slots.findIndex(function (item) { return item === null; });
        if (emptyIndex === -1) { alert("도시락이 꽉 찼습니다! (최대 5개) 🍱\n기존 팀을 빼고 담아주세요."); return; }

        slots[emptyIndex] = teamId;

        if (window.currentProfileData) {
            // [Optimistic UI] 즉시 로컬 메모리에 반영
            window.currentProfileData.bookmarks = slots;

            var team = window.findClub(teamId);
            var msg = team && team.isCustom ? "나만의 메뉴가 추가되었습니다! 🍙" : "도시락에 팀을 담았습니다! 🍱";
            alert(msg);

            if (typeof window.renderProfileCard === 'function') window.renderProfileCard();

            // Firestore 비동기 저장
            if (window.currentUser && window.firebaseDB) {
                var userRef = window.firebaseDoc(window.firebaseDB, 'users', window.currentUser.uid);
                window.firebaseUpdateDoc(userRef, {
                    bookmarks: slots,
                    customTeams: window.currentProfileData.customTeams || {}
                }).catch(function (e) { console.error("Firebase update failed, but optimistic UI applied:", e); });
            }
        } else {
            // localStorage fallback
            setLocalBookmarks(slots);
            var team2 = window.findClub(teamId);
            var msg2 = team2 && team2.isCustom ? "나만의 메뉴가 추가되었습니다! 🍙" : "도시락에 팀을 담았습니다! 🍱";
            alert(msg2);
        }

        // 도시락 오버레이가 열려 있으면 tempSlots에도 반영
        var overlay = document.getElementById('lunchboxOverlay');
        if (overlay && overlay.style.display === 'flex') {
            var tempSlots = getTempSlots();
            if (!tempSlots || tempSlots.every(function (s) { return s === null; })) {
                tempSlots = [null, null, null, null, null];
            }
            tempSlots[emptyIndex] = teamId;
            setTempSlots(tempSlots);
            renderLunchboxGrid();
            if (isDietPlanOpen) renderCombinedSchedule();
        }

    } catch (e) { alert("찜하기 실패: " + e.message); }
};

window.openLunchbox = function () {
    var overlay = document.getElementById('lunchboxOverlay');
    isEditMode = false;
    document.getElementById('lbEditBtn').innerHTML = '🍽 편집';
    document.getElementById('lbEditBtn').classList.remove('editing');

    isDietPlanOpen = false;
    var dietContainer = document.getElementById('dietPlanContainer');
    dietContainer.style.height = '0';
    dietContainer.classList.remove('open');
    document.getElementById('dietToggleBtn').innerText = '📅 식단표 (스케줄 확인)';

    var saved = getEffectiveBookmarks();
    var normalized = [null, null, null, null, null];
    for (var i = 0; i < 5; i++) {
        if (i < saved.length) normalized[i] = saved[i];
    }

    setTempSlots(normalized);
    renderLunchboxGrid();
    overlay.style.display = 'flex';
};

function renderLunchboxGrid() {
    var grid = document.getElementById('lunchboxGrid');
    grid.innerHTML = "";
    var slots = getTempSlots();

    for (var i = 0; i < 5; i++) {
        var teamId = slots[i];
        var div = document.createElement('div');
        div.className = 'lb-cell slot-' + i;

        if (selectedSlotIndex === i) div.classList.add('selected');

        if (teamId !== null) {
            var team = window.findClub(teamId);
            if (team) {
                var displayName = team.isCustom ? "🍙 " + team.name : team.name;
                div.innerHTML = '<span>' + displayName + '</span>';
                div.classList.add('filled');

                if (isEditMode) {
                    var delBtn = document.createElement('div');
                    delBtn.className = 'lb-del-btn';
                    delBtn.innerText = '✕';
                    (function (idx) {
                        delBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            deleteSlot(idx);
                        });
                        div.onclick = function () { handleSlotClick(idx); };
                    })(i);
                    div.appendChild(delBtn);
                } else {
                    (function (t) {
                        div.onclick = function () {
                            document.getElementById('lunchboxOverlay').style.display = 'none';
                            window.openClubDetail(t.id);
                        };
                    })(team);
                }
            } else {
                // 삭제된 팀 처리
                div.innerHTML = '<span>삭제된 팀</span>';
                div.classList.add('filled');
                if (isEditMode) {
                    var delBtn2 = document.createElement('div');
                    delBtn2.className = 'lb-del-btn';
                    delBtn2.innerText = '✕';
                    (function (idx) {
                        delBtn2.addEventListener('click', function (e) {
                            e.stopPropagation();
                            deleteSlot(idx);
                        });
                    })(i);
                    div.appendChild(delBtn2);
                }
            }
        } else {
            div.innerHTML = '<span class="lb-placeholder">' + slotPlaceholders[i] + '</span>';
            div.classList.add('empty');
            if (isEditMode) {
                (function (idx) {
                    div.onclick = function () { handleSlotClick(idx); };
                })(i);
            }
        }
        grid.appendChild(div);
    }
}
window.renderLunchboxGrid = renderLunchboxGrid;

function renderCombinedSchedule() {
    var container = document.getElementById('dietPlanBody');
    container.innerHTML = '';

    var slots = getTempSlots();
    var allEvents = [];
    var minH = 24, maxH = 0;
    var hasData = false;

    slots.forEach(function (teamId, idx) {
        if (teamId !== null) {
            var team = window.findClub(teamId);
            if (team) {
                var scheduleMap = window.parseScheduleText(team.schedule);
                for (var day in scheduleMap) {
                    if (!scheduleMap.hasOwnProperty(day)) continue;
                    var data = scheduleMap[day];
                    if (data.startH < minH) minH = data.startH;
                    if (data.endH > maxH) maxH = data.endH;
                    hasData = true;

                    allEvents.push({
                        teamName: team.name,
                        day: day,
                        start: data.startH + (data.startM / 60),
                        end: data.endH + (data.endM / 60),
                        text: data.text,
                        slotIdx: idx,
                        isCustom: team.isCustom
                    });
                }
            }
        }
    });

    if (!hasData) { minH = 18; maxH = 22; }
    var displayStart = Math.max(6, Math.floor(minH) - 1);
    var displayEnd = Math.min(24, Math.ceil(maxH) + 1);
    var totalHours = displayEnd - displayStart;

    var availableHeight = 300;
    var calculatedHeight = availableHeight / totalHours;
    var ROW_HEIGHT = Math.max(30, calculatedHeight);

    var days = ['월', '화', '수', '목', '금', '토', '일'];
    var headerRow = document.createElement('div');
    headerRow.className = 'diet-header-row';
    headerRow.innerHTML = '<div class="diet-time-col header-corner"></div>';
    days.forEach(function (d) {
        headerRow.innerHTML += '<div class="diet-day-col header">' + d + '</div>';
    });
    container.appendChild(headerRow);

    var bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'diet-body-wrapper';

    var totalContentHeight = totalHours * ROW_HEIGHT;

    var timeCol = document.createElement('div');
    timeCol.className = 'diet-time-col';
    timeCol.style.height = totalContentHeight + 'px';

    for (var h = displayStart; h < displayEnd; h++) {
        var label = document.createElement('div');
        label.className = 'diet-time-label';
        label.style.height = ROW_HEIGHT + 'px';
        label.innerText = window.getHourLabel(h);
        timeCol.appendChild(label);
    }
    bodyWrapper.appendChild(timeCol);

    days.forEach(function (day) {
        var dayCol = document.createElement('div');
        dayCol.className = 'diet-day-col';
        dayCol.style.height = totalContentHeight + 'px';

        for (var h2 = displayStart; h2 < displayEnd; h2++) {
            var line = document.createElement('div');
            line.className = 'diet-grid-line';
            line.style.height = ROW_HEIGHT + 'px';
            dayCol.appendChild(line);
        }

        var dayEvents = allEvents.filter(function (e) { return e.day === day; }).sort(function (a, b) { return a.start - b.start; });

        dayEvents.forEach(function (evt, i) {
            var indent = 0;
            for (var j = 0; j < i; j++) {
                var prev = dayEvents[j];
                if (evt.start < prev.end && evt.end > prev.start) {
                    indent++;
                }
            }
            if (indent > 2) indent = 0;

            var topPx = (evt.start - displayStart) * ROW_HEIGHT;
            var heightPx = (evt.end - evt.start) * ROW_HEIGHT;

            var eventDiv = document.createElement('div');
            eventDiv.className = 'diet-event';
            eventDiv.style.top = topPx + 'px';
            eventDiv.style.height = Math.max(heightPx - 2, 20) + 'px';
            eventDiv.style.left = (indent * 10) + '%';
            eventDiv.style.width = (95 - (indent * 5)) + '%';
            eventDiv.style.zIndex = indent + 1;

            eventDiv.style.backgroundColor = slotColors[evt.slotIdx];
            eventDiv.style.borderLeft = '4px solid ' + borderColors[evt.slotIdx];

            var nameDisplay = evt.isCustom ? "🍙" + evt.teamName : evt.teamName;
            eventDiv.innerHTML = '<span class="evt-title">' + nameDisplay + '</span>';

            dayCol.appendChild(eventDiv);
        });

        bodyWrapper.appendChild(dayCol);
    });

    container.appendChild(bodyWrapper);
}
window.renderCombinedSchedule = renderCombinedSchedule;

function handleSlotClick(index) {
    var tempSlots = getTempSlots();
    if (selectedSlotIndex === null) {
        selectedSlotIndex = index;
    } else {
        if (selectedSlotIndex !== index) {
            var temp = tempSlots[selectedSlotIndex];
            tempSlots[selectedSlotIndex] = tempSlots[index];
            tempSlots[index] = temp;
            setTempSlots(tempSlots);
        }
        selectedSlotIndex = null;
    }
    renderLunchboxGrid();
    if (isDietPlanOpen) renderCombinedSchedule();
}

function deleteSlot(index) {
    if (confirm("이 반찬을 도시락에서 뺄까요?")) {
        var tempSlots = getTempSlots();
        tempSlots[index] = null;
        setTempSlots(tempSlots);
        renderLunchboxGrid();
        if (isDietPlanOpen) renderCombinedSchedule();
    }
}

window.closeLunchbox = function () {
    if (isEditMode) saveLunchboxToDB();
    document.getElementById('lunchboxOverlay').style.display = 'none';
};
