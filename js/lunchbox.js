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

// 렌더 시점에 window.t로 현재 언어 적용 (모듈 로드 시점 고정 방지)
var slotPlaceholderKeys = ["lb_slot_rice", "lb_slot_soup", "lb_slot_side1", "lb_slot_side2", "lb_slot_side3"];

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
        btn.innerHTML = window.t('lb_done');
    } else {
        btn.classList.remove('editing');
        btn.innerHTML = window.t('lb_edit');
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
        btn.innerText = window.t('lb_diet_collapse');
    } else {
        container.style.height = '0';
        container.classList.remove('open');
        btn.innerText = window.t('lb_diet');
    }
};

window.addCustomTeam = async function () {
    var name = prompt(window.t('lb_add_prompt'), window.t('lb_add_default'));
    if (!name || name.trim() === "") return;

    var schedule = prompt(window.t('lb_time_prompt'), window.t('lb_time_default'));
    if (!schedule || schedule.trim() === "") return;

    var newId = "custom_" + Date.now();
    var newTeam = {
        id: newId,
        name: name,
        schedule: schedule,
        schedule_raw: schedule,
        isCustom: true,
        target: window.t('lb_custom_target'),
        address: window.t('lb_custom_addr'),
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

        // Firestore 비동기 저장 (private 서브컬렉션)
        if (window.currentUser && window.firebaseDB && window.userPrivateRef) {
            window.userPrivateRef(window.currentUser.uid).set({
                bookmarks: slots,
                customTeams: window.currentProfileData.customTeams || {}
            }, { merge: true }).catch(function (e) { console.error("Firebase save failed, but UI applied:", e); });
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

        if (slots.includes(teamId)) { alert(window.t('lb_already')); return; }

        var emptyIndex = slots.findIndex(function (item) { return item === null; });
        if (emptyIndex === -1) { alert(window.t('lb_full')); return; }

        slots[emptyIndex] = teamId;

        if (window.track) window.track('add_bookmark', { club_id: teamId });

        if (window.currentProfileData) {
            // [Optimistic UI] 즉시 로컬 메모리에 반영
            window.currentProfileData.bookmarks = slots;

            var team = window.findClub(teamId);
            var msg = team && team.isCustom ? window.t('lb_added_custom') : window.t('lb_added_team');
            alert(msg);

            if (typeof window.renderProfileCard === 'function') window.renderProfileCard();

            // Firestore 비동기 저장 (private 서브컬렉션)
            if (window.currentUser && window.firebaseDB && window.userPrivateRef) {
                window.userPrivateRef(window.currentUser.uid).set({
                    bookmarks: slots,
                    customTeams: window.currentProfileData.customTeams || {}
                }, { merge: true }).catch(function (e) { console.error("Firebase update failed, but optimistic UI applied:", e); });
            }
        } else {
            // localStorage fallback
            setLocalBookmarks(slots);
            var team2 = window.findClub(teamId);
            var msg2 = team2 && team2.isCustom ? window.t('lb_added_custom') : window.t('lb_added_team');
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

    } catch (e) { alert(window.t('lb_bookmark_fail') + e.message); }
};

window.openLunchbox = function () {
    var overlay = document.getElementById('lunchboxOverlay');
    isEditMode = false;
    document.getElementById('lbEditBtn').innerHTML = window.t('lb_edit');
    document.getElementById('lbEditBtn').classList.remove('editing');

    isDietPlanOpen = false;
    var dietContainer = document.getElementById('dietPlanContainer');
    dietContainer.style.height = '0';
    dietContainer.classList.remove('open');
    document.getElementById('dietToggleBtn').innerText = window.t('lb_diet');

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
                // XSS 방지: team.name을 textContent로
                var nameSpan = document.createElement('span');
                nameSpan.textContent = displayName;
                div.appendChild(nameSpan);
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
                div.innerHTML = '<span></span>';
                div.firstChild.textContent = window.t('lb_deleted_team');
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
            div.innerHTML = '<span class="lb-placeholder">' + window.t(slotPlaceholderKeys[i]) + '</span>';
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
        headerRow.innerHTML += '<div class="diet-day-col header">' + window.i18nDay(d) + '</div>';
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
            // XSS 방지: teamName을 textContent로
            var titleSpan = document.createElement('span');
            titleSpan.className = 'evt-title';
            titleSpan.textContent = nameDisplay;
            eventDiv.appendChild(titleSpan);

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
    if (confirm(window.t('lb_remove_confirm'))) {
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

// 언어 전환 시 도시락 오버레이가 열려 있으면 슬롯/식단표 재렌더링
document.addEventListener('nurungji:langchange', function () {
    var overlay = document.getElementById('lunchboxOverlay');
    if (!overlay || overlay.style.display !== 'flex') return;
    var editBtn = document.getElementById('lbEditBtn');
    if (editBtn) editBtn.innerHTML = isEditMode ? window.t('lb_done') : window.t('lb_edit');
    var dietBtn = document.getElementById('dietToggleBtn');
    if (dietBtn) dietBtn.innerText = isDietPlanOpen ? window.t('lb_diet_collapse') : window.t('lb_diet');
    renderLunchboxGrid();
    if (isDietPlanOpen) renderCombinedSchedule();
});
