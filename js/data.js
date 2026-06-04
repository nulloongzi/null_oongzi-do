// data.js
// Club data management: allClubs, clubs, findClub, loadAllClubs
// Depends on: firebase-init.js (window.firebaseDB)

(function () {
    var LS_CUSTOM_TEAMS_KEY = 'nulloong_custom_teams';

    window.allClubs = [];
    window.clubs = [];

    function getLocalCustomTeams() {
        var raw = localStorage.getItem(LS_CUSTOM_TEAMS_KEY);
        if (!raw) return {};
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }

    window.findClub = function (id) {
        if (!id) return null;
        var strId = String(id).trim();

        // 1) allClubs 배열에서 검색 (타입/공백 차이 방지를 위해 강제 형변환)
        var club = window.allClubs.find(function (c) {
            return String(c.id).trim() === strId && strId !== "undefined";
        });
        if (club) return club;

        // 2) 현재 프로필의 customTeams에서 검색
        if (window.currentProfileData && window.currentProfileData.customTeams && window.currentProfileData.customTeams[id]) {
            return window.currentProfileData.customTeams[id];
        }

        // 3) localStorage 커스텀 팀에서 검색
        var localTeams = getLocalCustomTeams();
        if (localTeams[id]) return localTeams[id];

        return null;
    };

    // Firestore가 단일 소스 (정적 JSON·파이프라인 폐기). 모든 클럽은 clubs 컬렉션에서 로드.
    window.loadAllClubs = function () {
        if (!window.firebaseDB) {
            console.error("Firestore 미초기화 - 클럽 데이터를 불러올 수 없습니다.");
            window.allClubs = [];
            window.clubs = [];
            return Promise.resolve([]);
        }

        return window.firebaseDB.collection('clubs').get()
            .then(function (snapshot) {
                var clubs = snapshot.docs.map(function (doc) {
                    var d = doc.data();
                    d.id = doc.id; // Firebase 문서 ID를 객체에 주입
                    // coordinates 필드 → lat/lng 평탄화
                    if (d.coordinates) {
                        d.lat = d.coordinates.lat;
                        d.lng = d.coordinates.lng;
                    }
                    // contact 필드 → insta/link 평탄화
                    if (d.contact) {
                        if (d.contact.insta) d.insta = d.contact.insta;
                        if (d.contact.link) d.link = d.contact.link;
                    }
                    return d;
                });

                window.allClubs = clubs;
                window.clubs = clubs;

                // Notify map if ready
                if (typeof window.refreshMarkers === 'function') {
                    window.refreshMarkers();
                }

                return clubs;
            })
            .catch(function (e) {
                console.error("Firestore clubs fetch error:", e);
                window.allClubs = [];
                window.clubs = [];
                return [];
            });
    };
})();
