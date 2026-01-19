import csv
import json
import requests
import os
import math
import io

# ==========================================
# [설정] 사용자 정보 및 키 값
# ==========================================
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTvPWY_U5hM-YkZIHnfsO4WgqpCmmP0uSraojWi58SsqXCUEdzRF2R55DASVA5882JusD8BMa9gNaTe/pub?gid=97006888&single=true&output=csv"
KAKAO_REST_KEY = "9d17b379d6a4de94c06563a990609336" 
KAKAO_JS_KEY = "69f821ba943db5e3532ac90ea5ca1080" 

IS_TEST_MODE = True
# ==========================================

def get_location(address):
    url = 'https://dapi.kakao.com/v2/local/search/address.json'
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_KEY}"}
    params = {'query': address}
    try:
        response = requests.get(url, headers=headers, params=params, timeout=5)
        result = response.json()
        if result['documents']:
            x = result['documents'][0]['x']
            y = result['documents'][0]['y']
            return float(y), float(x)
        return None, None
    except:
        return None, None

def update_map():
    json_file = "volleyball_clubs_kakao.json"
    manifest_file = "manifest.json"
    
    if IS_TEST_MODE:
        html_file = "test_new.html"
        print("🔧 현재 모드: [테스트] -> test_new.html 생성")
    else:
        html_file = "index.html"
        print("🚀 현재 모드: [배포/실전] -> index.html 생성")

    cached_data = {} 
    if os.path.exists(json_file):
        with open(json_file, 'r', encoding='utf-8') as f:
            old_list = json.load(f)
            for club in old_list:
                key = (club['name'], club['address'])
                cached_data[key] = club

    new_club_map = {}

    print("☁️ 구글 스프레드시트 동기화 중...")
    try:
        response = requests.get(GOOGLE_SHEET_URL, timeout=10)
        response.raise_for_status()
        
        decoded_content = response.content.decode('utf-8')
        csv_reader = csv.reader(io.StringIO(decoded_content))
        next(csv_reader, None) 
        
        count = 0
        new_count = 0
        
        for row in csv_reader:
            if len(row) < 4: continue 
            
            name = row[1].strip() if len(row) > 1 else ""
            target = row[2].strip() if len(row) > 2 else ""
            address = row[3].strip() if len(row) > 3 else ""
            schedule = row[4].strip() if len(row) > 4 else ""
            price = row[5].strip() if len(row) > 5 else ""
            insta = row[6].strip() if len(row) > 6 else ""
            link = row[7].strip() if len(row) > 7 else ""
            
            is_urgent_val = row[9].strip().upper() if len(row) > 9 else ""
            is_urgent = True if is_urgent_val == 'O' else False
            urgent_msg = row[10].strip() if len(row) > 10 else ""

            if not name or not address: continue

            key = (name, address)
            
            if key in cached_data:
                club = cached_data[key]
                club['target'] = target
                club['schedule'] = schedule
                club['price'] = price
                club['insta'] = insta
                club['link'] = link
                club['is_urgent'] = is_urgent
                club['urgent_msg'] = urgent_msg
                new_club_map[key] = club
            else:
                print(f"✨ 업데이트 감지: {name} (좌표 갱신 중...)")
                lat, lng = get_location(address)
                if lat and lng:
                    new_club_map[key] = {
                        "name": name, "target": target, "address": address,
                        "schedule": schedule, "price": price, 
                        "insta": insta, "link": link,
                        "lat": lat, "lng": lng,
                        "is_urgent": is_urgent,
                        "urgent_msg": urgent_msg
                    }
                    new_count += 1
            count += 1
            
        print(f"✅ 총 {count}개 팀 처리 완료")

    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return

    final_list = list(new_club_map.values())

    adjusted_list = []
    clubs_by_coord = {}
    for club in final_list:
        coord = (club['lat'], club['lng'])
        if coord not in clubs_by_coord:
            clubs_by_coord[coord] = []
        clubs_by_coord[coord].append(club)
    for coord, clubs in clubs_by_coord.items():
        if len(clubs) == 1:
            adjusted_list.append(clubs[0])
        else:
            count = len(clubs)
            base_lat, base_lng = coord
            radius = 0.0001
            for i, club in enumerate(clubs):
                angle = (2 * math.pi / count) * i
                club['lat'] = base_lat + radius * math.sin(angle)
                club['lng'] = base_lng + radius * math.cos(angle)
                club['angle'] = angle 
                adjusted_list.append(club)
    final_list = adjusted_list

    for idx, club in enumerate(final_list):
        club['id'] = idx 

    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=4)

    # Manifest
    manifest_content = {
        "name": "누룽지도",
        "short_name": "누룽지도",
        "start_url": "./" + html_file,
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#ffffff",
        "icons": [
            {"src": "https://cdn-icons-png.flaticon.com/512/528/528098.png", "sizes": "192x192", "type": "image/png"},
            {"src": "https://cdn-icons-png.flaticon.com/512/528/528098.png", "sizes": "512x512", "type": "image/png"}
        ]
    }
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest_content, f, ensure_ascii=False, indent=4)

    print(f"🔄 지도({html_file}) 굽는 중...")

    center_lat, center_lng = 37.5665, 126.9780 
    for club in final_list:
        if "GVT" in club['name']:
            center_lat, center_lng = club['lat'], club['lng']
            break
    
    html_content = f"""
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>누룽지도</title>
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#ffffff">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/528/528098.png">

    <script type="module">
        import {{ initializeApp }} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
        import {{ getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword }} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
        import {{ getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, collection, addDoc, query, where, getDocs }} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

        const firebaseConfig = {{
            apiKey: "AIzaSyCnzjy0jzK6HD34Z-i7tapG3y-hkrA-XaM",
            authDomain: "nulloongzi-do.firebaseapp.com",
            projectId: "nulloongzi-do",
            storageBucket: "nulloongzi-do.firebasestorage.app",
            messagingSenderId: "1024551952678",
            appId: "1:1024551952678:web:91a0df59c12b68b968a1e7",
            measurementId: "G-L1KWREQEMW"
        }};

        let app, auth, db;
        try {{
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            console.log("🔥 Firebase 연결 성공!");
        }} catch (e) {{
            console.error("Firebase 초기화 실패:", e);
        }}

        // 🍚 밥 종류별 색상 정의 (요청 반영)
        // weight: 확률 가중치, color: 카드 배경색
        const riceData = [
            // [흔함 - 62%]
            {{name: "현미밥", weight: 50, color: "#d7ccc8"}}, // 베이지
            {{name: "백미밥", weight: 50, color: "#fafafa"}}, // 흰색 (크림)
            {{name: "흑미밥", weight: 50, color: "#b39ddb"}}, // 연보라
            {{name: "보리밥", weight: 50, color: "#cfd8dc"}}, // 회색빛
            {{name: "콩밥", weight: 50, color: "#a5d6a7"}},   // 연두색
            {{name: "오곡밥", weight: 50, color: "#ffe0b2"}}, // 연주황

            // [덜 흔함 - 37%]
            {{name: "차조밥", weight: 10, color: "#fff59d"}}, // 노랑
            {{name: "기장밥", weight: 10, color: "#fff9c4"}}, 
            {{name: "숭늉", weight: 10, color: "#efebe9"}},
            {{name: "볶음밥", weight: 10, color: "#ffcc80"}}, // 볶음색
            {{name: "비빔밥", weight: 10, color: "#ffab91"}}, // 고추장색
            {{name: "김밥", weight: 10, color: "#bdbdbd"}},   // 김 색
            {{name: "주먹밥", weight: 10, color: "#f5f5f5"}},
            {{name: "유부초밥", weight: 10, color: "#ffe082"}},
            {{name: "덮밥", weight: 10, color: "#dcedc8"}},
            {{name: "국밥", weight: 10, color: "#cfd8dc"}},
            {{name: "솥밥", weight: 10, color: "#bcaaa4"}},
            {{name: "약밥", weight: 10, color: "#8d6e63"}},
            {{name: "죽", weight: 10, color: "#e0f2f1"}},
            {{name: "곤드레밥", weight: 10, color: "#81c784"}}, // 나물색
            {{name: "영양밥", weight: 10, color: "#ffecb3"}},
            {{name: "치밥", weight: 10, color: "#ff8a65"}}, // 양념치킨색
            {{name: "햇반", weight: 10, color: "#ffffff"}},
            {{name: "고봉밥", weight: 10, color: "#fbe9e7"}},

            // [레어 - 0.2%]
            {{name: "밥아저씨", weight: 1, color: "#4fc3f7"}} // 하늘색 (참 쉽죠?)
        ];

        function generateRiceName() {{
            let totalWeight = 0;
            for (let item of riceData) totalWeight += item.weight;

            let randomNum = Math.random() * totalWeight;
            let selected = riceData[0];

            for (let item of riceData) {{
                if (randomNum < item.weight) {{
                    selected = item;
                    break;
                }}
                randomNum -= item.weight;
            }}
            
            const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            let suffix = "";
            for (let i = 0; i < 3; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
            
            return {{
                base: selected.name,
                code: suffix,
                full: selected.name + "-" + suffix,
                color: selected.color
            }};
        }}

        // 현재 클럽 데이터 전역 변수로 접근하기 위해
        const allClubs = {json.dumps(final_list, ensure_ascii=False)};

        async function checkDuplicateNickname(nickname) {{
            if (!db) return false;
            const q = query(collection(db, "users"), where("full_nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty; 
        }}

        let currentUser = null;
        let currentProfileData = null;

        if (auth) {{
            onAuthStateChanged(auth, async (user) => {{
                if (user) {{
                    currentUser = user;
                    await loadOrCreateUserProfile(user);
                    updateProfileUI(true);
                }} else {{
                    currentUser = null;
                    currentProfileData = null;
                    updateProfileUI(false);
                }}
            }});
        }}

        window.loginWithGoogle = async function() {{
            if (!auth) return;
            const provider = new GoogleAuthProvider();
            try {{
                await signInWithPopup(auth, provider);
            }} catch (error) {{
                alert("로그인 실패: " + error.message);
            }}
        }};

        window.registerWithEmail = async function() {{
            const email = document.getElementById('emailInput').value;
            const pw = document.getElementById('pwInput').value;
            if(!email || !pw) {{ alert('정보를 입력해주세요.'); return; }}
            try {{ await createUserWithEmailAndPassword(auth, email, pw); }} catch(e) {{ alert(e.message); }}
        }};

        window.loginWithEmail = async function() {{
            const email = document.getElementById('emailInput').value;
            const pw = document.getElementById('pwInput').value;
            if(!email || !pw) {{ alert('정보를 입력해주세요.'); return; }}
            try {{ await signInWithEmailAndPassword(auth, email, pw); }} catch(e) {{ alert(e.message); }}
        }};

        window.logout = function() {{
            if (!auth) return;
            if(confirm("로그아웃 하시겠습니까?")) {{
                signOut(auth).then(() => {{
                    document.getElementById('profileOverlay').style.display = 'none';
                    document.getElementById('lunchboxOverlay').style.display = 'none';
                }});
            }}
        }};

        async function loadOrCreateUserProfile(user) {{
            const userRef = doc(db, "users", user.uid);
            try {{
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {{
                    currentProfileData = userSnap.data();
                }} else {{
                    let newNameObj = null;
                    let isUnique = false;
                    let retryCount = 0;

                    while (!isUnique && retryCount < 10) {{
                        newNameObj = generateRiceName();
                        const isDup = await checkDuplicateNickname(newNameObj.full);
                        if (!isDup) isUnique = true;
                        else retryCount++;
                    }}
                    if (!isUnique) newNameObj.full += Date.now().toString().slice(-4);

                    const now = new Date();
                    const userData = {{
                        nickname: newNameObj.base,
                        suffix: newNameObj.code,
                        full_nickname: newNameObj.full,
                        color: newNameObj.color,
                        created_at: now,
                        email: user.email,
                        bookmarks: [] 
                    }};
                    
                    await setDoc(userRef, userData);
                    currentProfileData = userData;
                    alert("환영합니다! [" + newNameObj.full + "]님이 되셨습니다! 🍚");
                }}
                renderProfileCard();
            }} catch (error) {{
                console.error("DB Error:", error);
            }}
        }}

        function updateProfileUI(isLoggedIn) {{
            const loginSection = document.getElementById('loginSection');
            const profileContent = document.getElementById('profileContent');
            if (isLoggedIn) {{
                if(loginSection) loginSection.style.display = 'none';
                if(profileContent) profileContent.style.display = 'block';
            }} else {{
                if(loginSection) loginSection.style.display = 'flex';
                if(profileContent) profileContent.style.display = 'none';
            }}
        }}

        // [수정] 프로필 카드 렌더링 (대표팀 로직 및 색상 적용)
        function renderProfileCard() {{
            if (!currentProfileData) return;
            
            const card = document.getElementById('myProfileCard');
            const nicknameEl = document.getElementById('pcNickname');
            const dateEl = document.getElementById('pcDate');
            const mainTeamEl = document.getElementById('pcMainTeam');

            // 1. 카드 색상 적용 (밥 종류별)
            // 밥이름에 매칭되는 색 찾기 (기존 데이터엔 color가 없을수도 있으니 매칭)
            let bgColor = currentProfileData.color;
            if (!bgColor) {{
                const riceName = currentProfileData.nickname || currentProfileData.full_nickname.split('-')[0];
                const found = riceData.find(r => r.name === riceName);
                bgColor = found ? found.color : "#fbc02d";
            }}
            card.style.backgroundColor = bgColor;

            // 2. 닉네임
            nicknameEl.innerText = currentProfileData.full_nickname;

            // 3. 가입일
            if (currentProfileData.created_at) {{
                const d = new Date(currentProfileData.created_at.seconds * 1000);
                dateEl.innerText = "가입일: " + d.getFullYear() + "." + (d.getMonth()+1) + "." + d.getDate();
            }}

            // 4. 대표팀 (찜 목록의 첫 번째)
            const bookmarks = currentProfileData.bookmarks || [];
            if (bookmarks.length > 0) {{
                const mainId = bookmarks[0];
                const mainTeam = allClubs.find(c => c.id === mainId);
                mainTeamEl.innerHTML = mainTeam ? "🏆 " + mainTeam.name : "데이터 없음";
            }} else {{
                mainTeamEl.innerText = "찜한 팀이 없어요";
            }}
        }}

        // [NEW] 찜하기 기능 (Bookmark)
        window.bookmarkTeam = async function(teamId) {{
            if (!currentUser || !db) {{
                alert("로그인이 필요한 기능입니다! 🍚 버튼을 눌러 로그인해주세요.");
                return;
            }}
            try {{
                const userRef = doc(db, "users", currentUser.uid);
                
                // 현재 북마크 확인
                let bookmarks = currentProfileData.bookmarks || [];
                
                if (bookmarks.includes(teamId)) {{
                    alert("이미 도시락에 담긴 팀입니다! 🍱");
                    return;
                }}
                
                if (bookmarks.length >= 5) {{
                    alert("도시락이 꽉 찼습니다! (최대 5개) 🍱\\n기존 팀을 빼고 담아주세요.");
                    return;
                }}

                // 업데이트
                await updateDoc(userRef, {{
                    bookmarks: arrayUnion(teamId)
                }});
                
                // 로컬 데이터 갱신 및 UI 업데이트
                if (!currentProfileData.bookmarks) currentProfileData.bookmarks = [];
                currentProfileData.bookmarks.push(teamId);
                
                alert("도시락에 팀을 담았습니다! 🍱");
                renderProfileCard(); // 대표팀 갱신 될수도 있으니
            }} catch (e) {{
                console.error(e);
                alert("찜하기 실패: " + e.message);
            }}
        }};

        // [NEW] 도시락 열기 (렌더링)
        window.openLunchbox = function() {{
            if (!currentProfileData || !currentProfileData.bookmarks || currentProfileData.bookmarks.length === 0) {{
                alert("도시락이 비어있어요! 팀 상세화면에서 [🍱 담기]를 눌러보세요.");
                return;
            }}
            
            const overlay = document.getElementById('lunchboxOverlay');
            const grid = document.getElementById('lunchboxGrid');
            grid.innerHTML = ""; // 초기화

            const bookmarks = currentProfileData.bookmarks; // [id1, id2, id3, id4, id5]
            
            // 순서 매핑: 0(좌하), 1(우하), 2(좌상), 3(중상), 4(우상)
            // CSS Grid 배치를 위해 빈 슬롯 5개를 만들고 채워넣음
            // Grid Order: 
            // Row 1 (Top): Cell 2, Cell 3, Cell 4
            // Row 2 (Btm): Cell 0, Cell 1
            
            // 실제 데이터 매핑
            const slots = [null, null, null, null, null];
            bookmarks.forEach((bid, idx) => {{
                if (idx < 5) slots[idx] = bid;
            }});

            // 렌더링 순서는 HTML 구조상 위->아래 지만, CSS로 위치 잡음
            // 편의상 0~4번 슬롯을 생성하고 CSS 클래스로 위치 지정
            for (let i = 0; i < 5; i++) {{
                const teamId = slots[i];
                const div = document.createElement('div');
                div.className = 'lb-cell slot-' + i;
                
                if (teamId !== null) {{
                    const team = allClubs.find(c => c.id === teamId);
                    if (team) {{
                        div.innerText = team.name;
                        div.onclick = function() {{
                            overlay.style.display = 'none';
                            moveToTeamLocation(team.lat, team.lng);
                        }};
                        div.classList.add('filled');
                    }}
                }} else {{
                    div.innerText = "빈 칸";
                    div.classList.add('empty');
                }}
                grid.appendChild(div);
            }}
            
            overlay.style.display = 'flex';
        }};

        window.closeLunchbox = function() {{
            document.getElementById('lunchboxOverlay').style.display = 'none';
        }};

        // 팀 위치로 이동
        function moveToTeamLocation(lat, lng) {{
            // 카카오맵 이동 (Global map obj assumed)
            if (window.map && window.kakao) {{
                const moveLatLon = new kakao.maps.LatLng(lat, lng);
                map.setLevel(4);
                map.panTo(moveLatLon);
            }}
        }}

        // 닉네임 변경 (하이픈 금지)
        window.editNickname = async function() {{
            if (!currentUser || !db) return;
            const currentName = document.getElementById('pcNickname').innerText;
            const newName = prompt("변경할 닉네임을 입력해주세요 (하이픈 금지)", currentName);
            
            if (newName && newName.trim() !== "" && newName !== currentName) {{
                if (newName.includes("-")) {{
                    alert("⚠️ 닉네임에 하이픈(-)은 사용할 수 없습니다.\\n하이픈은 오직 '밥아저씨'가 랜덤으로 지어준 이름에만 허용됩니다!");
                    return;
                }}
                try {{
                    const isDup = await checkDuplicateNickname(newName);
                    if (isDup) {{ alert("이미 누군가 사용 중인 이름입니다."); return; }}
                    
                    const userRef = doc(db, "users", currentUser.uid);
                    await updateDoc(userRef, {{ full_nickname: newName }});
                    
                    // 로컬 업데이트
                    currentProfileData.full_nickname = newName;
                    renderProfileCard();
                    alert("닉네임 변경 완료! 🥄");
                }} catch (e) {{ alert("오류: " + e); }}
            }}
        }};

        window.toggleProfileCard = function() {{
            const overlay = document.getElementById('profileOverlay');
            overlay.style.display = (overlay.style.display === 'flex') ? 'none' : 'flex';
        }};
    </script>

    <style>
        * {{ box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif; }}
        html, body {{ width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #f8f9fa; }}
        #map {{ width: 100%; height: 100%; }}
        :root {{ 
            --white: #fff; 
            --brand-color: #fac710; 
            --urgent-color: #ff4757; 
            --shadow: 0 4px 10px rgba(0,0,0,0.1); 
            --today-color: #d35400; 
            --nurungji-dark: #6d4c41; 
            --nurungji-card: #fbc02d; 
        }}
        
        /* ... (기존 스타일 유지) ... */
        .search-container {{ position: absolute; top: 15px; left: 15px; right: 15px; z-index: 20; display: flex; background: white; border-radius: 12px; box-shadow: var(--shadow); height: 48px; align-items: center; padding: 0 5px; }}
        .search-icon-box {{ width: 40px; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #888; }}
        .main-search-input {{ flex: 1; border: none; outline: none; font-size: 15px; height: 100%; background: transparent; }}
        .separator {{ width: 1px; height: 20px; background: #eee; margin: 0 5px; }}
        .filter-btn-icon {{ width: 48px; height: 100%; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 18px; color: #333; position: relative; }}
        .filter-btn-icon:active {{ opacity: 0.5; }}
        .filter-badge {{ position: absolute; top: 12px; right: 10px; width: 8px; height: 8px; background: #fac710; border-radius: 50%; display: none; }}
        .filter-badge.active {{ display: block; }}
        
        .urgent-ticker-bar {{ position: absolute; top: 70px; left: 15px; right: 15px; z-index: 18; height: 40px; background: rgba(255, 245, 245, 0.95); border: 1px solid rgba(255, 71, 87, 0.3); border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); display: none; align-items: center; padding: 0 12px; overflow: hidden; will-change: top; }}
        .ticker-icon {{ font-size: 18px; margin-right: 10px; animation: pulse 1.5s infinite; }}
        .ticker-content {{ flex: 1; height: 100%; position: relative; overflow: hidden; }}
        .ticker-list {{ list-style: none; margin: 0; padding: 0; position: absolute; width: 100%; top: 0; left: 0; transition: top 0.5s ease-in-out; }}
        .ticker-item {{ height: 40px; line-height: 40px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 600; cursor: pointer; color: #333; }}
        .ticker-item b {{ color: #d63031; margin-right: 5px; }}

        .fab-group {{ position: absolute; bottom: 30px; right: 15px; z-index: 20; display: flex; flex-direction: column; gap: 12px; }}
        .fab-btn {{ width: 50px; height: 50px; background: white; border-radius: 50%; box-shadow: var(--shadow); display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 20px; text-decoration: none; color: #333; transition: transform 0.2s; }}
        .fab-btn:active {{ transform: scale(0.95); }}
        .fab-report {{ background: #fac710; color: #000; }}
        .fab-urgent {{ background: var(--urgent-color); color: #fff; border: 2px solid #fff; font-size: 24px; box-shadow: 0 4px 15px rgba(255, 71, 87, 0.4); }}
        
        .fab-profile {{ 
            position: absolute; bottom: 30px; left: 15px; 
            z-index: 20; 
            width: 55px; height: 55px; 
            background: #fff; /* 흰 쌀밥 배경 */
            border-radius: 50%; 
            box-shadow: var(--shadow);
            display: flex; justify-content: center; align-items: center;
            font-size: 30px; cursor: pointer;
            border: 2px solid #eee;
            transition: transform 0.2s;
        }}
        .fab-profile:active {{ transform: scale(0.95); }}

        /* 도시락 버튼 (플로팅 위) */
        .fab-lunchbox {{
            position: absolute; bottom: 100px; left: 15px;
            z-index: 20;
            width: 50px; height: 50px;
            background: #fff;
            border-radius: 50%;
            box-shadow: var(--shadow);
            display: flex; justify-content: center; align-items: center;
            font-size: 26px; cursor: pointer;
            border: 1px solid #eee;
            transition: transform 0.2s;
        }}
        .fab-lunchbox:active {{ transform: scale(0.95); }}

        .profile-overlay {{
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.4);
            z-index: 500;
            display: none; 
            justify-content: center; align-items: center;
            backdrop-filter: blur(3px);
        }}
        
        /* [수정] 밥알 구름 카드 디자인 (굵은 점선 + 짙은 노랑) */
        .profile-card {{
            width: 80%; max-width: 320px;
            background: var(--nurungji-card);
            padding: 30px 20px;
            text-align: center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            position: relative;
            border: 8px dashed rgba(255,255,255,0.9);
            border-radius: 40px; 
            background-clip: padding-box; 
        }}
        .pc-header {{
            display: flex; justify-content: center; align-items: center; gap: 8px;
            margin-bottom: 5px;
        }}
        .pc-nickname {{
            color: #fff; font-size: 24px; font-weight: 800;
            text-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }}
        .pc-edit-btn {{
            cursor: pointer; font-size: 18px; 
            background: rgba(255,255,255,0.4);
            width: 30px; height: 30px; border-radius: 50%;
            display: flex; justify-content: center; align-items: center;
        }}
        .pc-date {{
            color: rgba(255,255,255,0.95);
            font-size: 12px; font-weight: 600;
            margin-bottom: 10px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }}
        
        /* [NEW] 구분선 및 대표팀 */
        .pc-divider {{
            height: 2px; background: rgba(255,255,255,0.5);
            width: 50%; margin: 10px auto; border-radius: 1px;
        }}
        .pc-main-team {{
            color: #fff; font-size: 20px; font-weight: 700;
            text-shadow: 0 1px 3px rgba(0,0,0,0.2);
            margin-top: 5px;
        }}

        /* 로그인 섹션 */
        .login-section {{ display: flex; flex-direction: column; gap: 10px; width: 100%; }}
        .input-group {{ display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }}
        .auth-input {{ padding: 10px 15px; border-radius: 20px; border: none; outline: none; font-size: 14px; background: rgba(255,255,255,0.9); }}
        .btn-row {{ display: flex; gap: 8px; }}
        .btn-auth {{ flex: 1; padding: 10px; border-radius: 20px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; color: #555; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .btn-auth.primary {{ background: #fff; border: 2px solid white; }}
        .btn-auth.secondary {{ background: transparent; border: 1px solid white; color: white; }}
        .divider {{ color: rgba(255,255,255,0.8); font-size: 11px; margin: 10px 0; display: flex; align-items: center; gap: 10px; }}
        .divider::before, .divider::after {{ content: ""; flex: 1; height: 1px; background: rgba(255,255,255,0.5); }}

        /* 구글 로그인 버튼 */
        .btn-google-login {{
            background: white; color: #555; border: 1px solid #ddd; padding: 12px 20px; border-radius: 30px; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }}
        /* [수정] 구글 로고 공식 URL */
        .btn-google-login img {{ width: 18px; height: 18px; }}
        
        .btn-logout {{ margin-top: 20px; background: transparent; border: 1px solid rgba(255,255,255,0.5); color: white; padding: 5px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; }}

        /* [NEW] 도시락통 오버레이 */
        .lunchbox-overlay {{
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 550;
            display: none; justify-content: center; align-items: center;
            backdrop-filter: blur(2px);
        }}
        /* 도시락 그리드 (3열 2행) */
        .lunchbox-grid {{
            width: 320px; height: 180px;
            background: #fff8e1; /* 나무 도시락 느낌 연한색 */
            border: 4px solid #8d6e63;
            border-radius: 12px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr; /* 3열 */
            grid-template-rows: 1fr 1fr;       /* 2행 */
            gap: 2px;
            padding: 2px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }}
        .lb-cell {{
            background: #fff;
            border-radius: 4px;
            display: flex; justify-content: center; align-items: center;
            font-size: 12px; font-weight: 700; color: #555;
            text-align: center; padding: 4px;
            cursor: pointer;
            transition: background 0.1s;
            border: 1px solid #e0e0e0;
        }}
        .lb-cell:active {{ background: #eee; }}
        .lb-cell.empty {{ color: #ccc; font-weight: 400; }}
        .lb-cell.filled {{ background: #fffde7; border-color: var(--brand-color); }}

        /* [NEW] 도시락 칸 위치 매핑 (요청사항: 좌하, 우하, 좌상, 중상, 우상 순) */
        /* Row 1 (Top): Col 1, 2, 3 */
        /* Row 2 (Bottom): Col 1(span 1.5?), Col 2 */
        /* 요청: 아래쪽이 2칸, 위쪽이 3칸 */
        
        /* Grid Layout Override for irregular shape */
        /* Let's make Bottom Row cells span 1.5 columns? No, let's use 6 column grid */
        .lunchbox-grid {{
            grid-template-columns: repeat(6, 1fr);
            grid-template-rows: 1fr 1fr;
        }}
        
        /* Top Row (3 items) -> Each spans 2 cols */
        .slot-2 {{ grid-row: 1; grid-column: 1 / span 2; }} /* 좌상 */
        .slot-3 {{ grid-row: 1; grid-column: 3 / span 2; }} /* 중상 */
        .slot-4 {{ grid-row: 1; grid-column: 5 / span 2; }} /* 우상 */
        
        /* Bottom Row (2 items) -> Each spans 3 cols */
        .slot-0 {{ grid-row: 2; grid-column: 1 / span 3; }} /* 좌하 */
        .slot-1 {{ grid-row: 2; grid-column: 4 / span 3; }} /* 우하 */

        .label {{ padding: 6px 12px; background-color: #fff; border-radius: 20px; font-size: 12px; font-weight: 800; color: #333; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 1px solid rgba(0,0,0,0.1); white-space: nowrap; cursor: pointer; transform: translateY(-55px); }}
        .label:hover {{ z-index: 10000 !important; transform: translateY(-57px) scale(1.05); }}
        .label.urgent {{ background-color: var(--urgent-color); color: #fff; border: 2px solid #fff; animation: pulse 1.5s infinite; }}
        @keyframes pulse {{ 0% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }} 70% {{ box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }} 100% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }} }}

        .bottom-sheet {{ 
            position: fixed; bottom: 0; left: 0; width: 100%; 
            background: #fff; z-index: 200; 
            border-top-left-radius: 24px; border-top-right-radius: 24px; 
            box-shadow: 0 -5px 25px rgba(0,0,0,0.15); 
            display: flex; flex-direction: column;
            transition: height 0.1s linear; 
            height: 0; 
            overflow: hidden;
        }}
        /* ... 나머지 CSS 동일 ... */
        .sheet-handle-area {{ width: 100%; padding: 10px 0; display: flex; justify-content: center; cursor: grab; flex-shrink: 0; background: #fff; }}
        .sheet-handle {{ width: 36px; height: 4px; background: #e5e5e5; border-radius: 2px; }}
        .sheet-content-wrapper {{ flex: 1; overflow-y: auto; padding: 0 24px 20px 24px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }}
        .sheet-content-wrapper::-webkit-scrollbar {{ display: none; }}
    </style>
</head>
<body>
    <div id="map"></div>
    
    <div class="search-container">
        <div class="search-icon-box">🔎</div>
        <input type="text" id="topSearchInput" class="main-search-input" placeholder="팀명, 지역으로 검색..." onkeyup="applyFilters()">
        <div class="separator"></div>
        <div class="filter-btn-icon" onclick="openFilterSheet()">⚙️<div id="filterBadge" class="filter-badge"></div></div>
    </div>

    <div id="urgentTicker" class="urgent-ticker-bar">
        <div class="ticker-icon">🔥</div>
        <div class="ticker-content">
            <ul id="tickerList" class="ticker-list"></ul>
        </div>
    </div>

    <div class="fab-lunchbox" onclick="openLunchbox()">🍱</div>
    <div class="fab-profile" onclick="toggleProfileCard()">🍚</div>

    <div class="fab-group">
        <a href="https://forms.gle/FpHvQyGg3jBivjTU6" target="_blank" class="fab-btn fab-urgent" title="십시일반 긴급구인 신청">🥄</a>
        <a href="https://forms.gle/H6HoEUy5zM7FHuHL7" target="_blank" class="fab-btn fab-report" title="팀 제보하기">📢</a>
        <div class="fab-btn" onclick="moveToMyLocation()">📍</div>
    </div>

    <div id="lunchboxOverlay" class="lunchbox-overlay" onclick="closeLunchbox()">
        <div class="lunchbox-grid" id="lunchboxGrid" onclick="event.stopPropagation()">
            </div>
    </div>

    <div id="profileOverlay" class="profile-overlay" onclick="toggleProfileCard()">
        <div class="profile-card" id="myProfileCard" onclick="event.stopPropagation()">
            
            <div id="loginSection" class="login-section">
                <button class="btn-google-login" onclick="loginWithGoogle()">
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G">
                    구글로 간편 로그인
                </button>
                <div class="divider">또는</div>
                <div class="input-group">
                    <input type="email" id="emailInput" class="auth-input" placeholder="이메일 입력">
                    <input type="password" id="pwInput" class="auth-input" placeholder="비밀번호 (6자리 이상)">
                </div>
                <div class="btn-row">
                    <button class="btn-auth primary" onclick="loginWithEmail()">로그인</button>
                    <button class="btn-auth secondary" onclick="registerWithEmail()">회원가입</button>
                </div>
            </div>

            <div id="profileContent" style="display:none;">
                <div class="pc-header">
                    <span id="pcNickname" class="pc-nickname">...</span>
                    <div class="pc-edit-btn" onclick="editNickname()">🥢</div>
                </div>
                <div id="pcDate" class="pc-date">가입일: -</div>
                
                <div class="pc-divider"></div>
                <div id="pcMainTeam" class="pc-main-team">찜한 팀이 없어요</div>

                <button class="btn-logout" onclick="logout()">로그아웃</button>
            </div>
        </div>
    </div>

    <div id="bottomSheet" class="bottom-sheet">
        <div class="sheet-handle-area" id="sheetHandle"><div class="sheet-handle"></div></div>
        
        <div class="sheet-content-wrapper">
            <div id="urgentArea"></div>

            <div class="sheet-header">
                <div class="sheet-title" id="sheetTitle">팀 이름</div>
                <div id="btnBookmark" style="font-size:24px; cursor:pointer;" onclick="">🍱</div>
            </div>
            
            <div class="time-morph-container" id="timeMorphContainer" onclick="toggleTimeExpand()">
                <div class="summary-content" id="summaryContent"></div>
                <div class="full-content" id="fullContent">
                    <div class="ft-header-row"><div class="ft-title">📅 주간 스케줄</div></div>
                    <div class="ft-grid" id="fullTimetableGrid"></div>
                </div>
            </div>
            
            <div class="tag-box" id="sheetTags"></div>
            <div class="info-row"><span class="info-icon">💰</span> <span id="sheetPrice">-</span></div>
            
            <div class="action-buttons">
                <button class="btn btn-copy" id="btnCopy">📍 주소 복사</button>
                <a href="#" target="_blank" class="btn btn-way" id="btnWay">🚀 길찾기</a>
            </div>
            
            <div class="expand-hint" id="expandHint">▴ 위로 올려서 상세 정보 보기</div>
            <input type="hidden" id="sheetAddressVal">
            <input type="hidden" id="sheetTeamId">
        </div>
    </div>

    <script type="text/javascript" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}&libraries=clusterer"></script>
    <script>
        // ... (나머지 지도 로직은 기존과 동일하므로 생략하지 않고 위 코드 블록에 포함되어 있습니다) ...
        // openClubDetail 함수 내부에 찜하기 버튼 연결 로직 추가됨
        var mapContainer = document.getElementById('map'), 
            mapOption = {{ center: new kakao.maps.LatLng({center_lat}, {center_lng}), level: 8 }}; 
        var map = new kakao.maps.Map(mapContainer, mapOption); 
        
        var clusterer = new kakao.maps.MarkerClusterer({{
            map: map, averageCenter: true, minLevel: 6,
            styles: [{{
                width: '40px', height: '40px', background: '#fac710', borderRadius: '50%', color: '#000', textAlign: 'center', fontWeight: 'bold', lineHeight: '40px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', fontSize: '14px'
            }}]
        }});

        var clubs = {json.dumps(final_list, ensure_ascii=False)};
        var markers = []; 
        
        var defaultImageSrc = './marker_yellow.png'; 
        var urgentImageSrc = './marker_red.png'; 
        var imageSize = new kakao.maps.Size(40, 53); 
        var imageOption = {{offset: new kakao.maps.Point(20, 53)}}; 
        
        var defaultMarkerImage = new kakao.maps.MarkerImage(defaultImageSrc, imageSize, imageOption);
        var urgentMarkerImage = new kakao.maps.MarkerImage(urgentImageSrc, imageSize, imageOption);

        var gpsSvg = 'data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3ccircle cx="50" cy="50" r="45" fill="rgba(66, 133, 244, 0.3)"/%3e%3ccircle cx="50" cy="50" r="25" fill="white"/%3e%3ccircle cx="50" cy="50" r="20" fill="%234285F4"/%3e%3c/svg%3e';
        var gpsImage = new kakao.maps.MarkerImage(gpsSvg, new kakao.maps.Size(44,44), {{offset: new kakao.maps.Point(22,22)}});
        var myMarker = null;
        var instaCssIcon = '<div class="instagram" title="인스타그램 보러가기"></div>';

        clubs.forEach(function(club) {{
            if (!club.lat || !club.lng) return;
            var latlng = new kakao.maps.LatLng(club.lat, club.lng);
            var marker;
            if (club.is_urgent) {{
                marker = new kakao.maps.Marker({{ position: latlng, image: urgentMarkerImage, zIndex: 9999 }});
                marker.setMap(map); 
            }} else {{
                marker = new kakao.maps.Marker({{ position: latlng, image: defaultMarkerImage }});
            }}
            
            var labelClass = club.is_urgent ? 'label urgent' : 'label';
            var iconHtml = club.is_urgent ? '🔥 ' : '';
            var content = '<div class="' + labelClass + '" onclick="triggerMarkerClick(' + club.id + ')">' + iconHtml + club.name + '</div>';
            var xAnc = 0.5; var yAnc = 1;   
            if (club.angle !== undefined) {{ xAnc = 0.5 - (Math.cos(club.angle) * 0.5); }}
            var customOverlay = new kakao.maps.CustomOverlay({{ position: latlng, content: content, xAnchor: xAnc, yAnchor: yAnc, zIndex: 9999 }});
            
            if (club.is_urgent) {{ customOverlay.setMap(map); }}
            kakao.maps.event.addListener(marker, 'click', function() {{ openClubDetail(club.id); }});
            
            markers.push({{ marker: marker, overlay: customOverlay, club: club, isVisible: true }});
        }});

        var initialClusterMarkers = [];
        markers.forEach(function(item) {{
            if (!item.club.is_urgent) {{ initialClusterMarkers.push(item.marker); }}
        }});
        clusterer.addMarkers(initialClusterMarkers);

        function triggerMarkerClick(id) {{
            var target = markers.find(m => m.club.id === id);
            if (target && target.marker) kakao.maps.event.trigger(target.marker, 'click');
        }}

        function updateLabelVisibility() {{
            var level = map.getLevel(); 
            var showNormalLabels = (level <= 5); 
            var showUrgentLabels = (level <= 8); 
            markers.forEach(function(item) {{
                if (!item.isVisible) return; 
                if (item.club.is_urgent) {{ 
                    if (showUrgentLabels) item.overlay.setMap(map); else item.overlay.setMap(null);
                }} else {{ 
                    if (showNormalLabels) item.overlay.setMap(map); else item.overlay.setMap(null); 
                }}
            }});
        }}
        
        kakao.maps.event.addListener(map, 'zoom_changed', updateLabelVisibility);

        function parseScheduleText(text) {{
            var scheduleMap = {{}};
            if (!text) return scheduleMap;
            var segments = text.split(/\\s*\\/\\s*/); 
            segments.forEach(function(segment) {{
                var timeReg = /(\\d{{1,2}}):(\\d{{2}})\\s*[~-]\\s*(\\d{{1,2}}):(\\d{{2}})/;
                var match = segment.match(timeReg);
                if (match) {{
                    var startH = parseInt(match[1]);
                    var startM = parseInt(match[2]);
                    var endH = parseInt(match[3]);
                    var endM = parseInt(match[4]);
                    
                    function format12(h, m) {{
                        var p = h >= 12 ? 'PM' : 'AM';
                        var h12 = h % 12;
                        if (h12 === 0) h12 = 12;
                        var mStr = m < 10 ? '0'+m : m;
                        return p + ' ' + h12 + ':' + mStr;
                    }}
                    
                    var displayTime = format12(startH, startM) + '~' + format12(endH, endM);
                    
                    var days = ['월', '화', '수', '목', '금', '토', '일'];
                    days.forEach(function(day) {{
                        if (segment.includes(day)) {{
                            scheduleMap[day] = {{ 
                                startH: startH, startM: startM, 
                                endH: endH, endM: endM, 
                                text: displayTime 
                            }};
                        }}
                    }});
                }}
            }});
            return scheduleMap;
        }}

        function getHourLabel(h) {{
            var p = h >= 12 ? 'PM' : 'AM';
            var h12 = h % 12;
            if (h12 === 0) h12 = 12;
            return p + ' ' + h12;
        }}

        function renderTimetables(scheduleText) {{
            var scheduleData = parseScheduleText(scheduleText);
            var days = ['월', '화', '수', '목', '금', '토', '일'];
            var dayIndices = {{'일':0, '월':1, '화':2, '수':3, '목':4, '금':5, '토':6}};
            var todayIndex = new Date().getDay(); 
            var todayChar = Object.keys(dayIndices).find(key => dayIndices[key] === todayIndex);

            var minH = 24, maxH = 0;
            var hasData = false;
            
            Object.values(scheduleData).forEach(function(data) {{
                if (data.startH < minH) minH = data.startH;
                if (data.endH > maxH) maxH = data.endH;
                hasData = true;
            }});

            if (!hasData) {{ minH = 18; maxH = 22; }}
            
            var displayStart = Math.max(6, minH - 2); 
            var displayEnd = Math.min(24, maxH + 2);
            var totalHours = displayEnd - displayStart;

            var availableHeight = window.innerHeight * 0.55; 
            var calculatedRowHeight = availableHeight / totalHours;
            var ROW_HEIGHT = Math.max(32, Math.min(60, calculatedRowHeight));

            var summaryContainer = document.getElementById('summaryContent');
            summaryContainer.innerHTML = '';
            var hasActive = false;
            days.forEach(function(day) {{
                var data = scheduleData[day];
                if (data) {{
                    hasActive = true;
                    var item = document.createElement('div');
                    item.className = 'st-bubble active';
                    item.innerHTML = '<div class="st-day-text">' + day + '요일</div><div class="st-time-text">' + data.text + '</div>';
                    summaryContainer.appendChild(item);
                }}
            }});
            if (!hasActive) {{
                summaryContainer.innerHTML = '<div class="st-bubble"><div class="st-day-text">일정</div><div class="st-time-text">정보없음</div></div>';
            }}

            var fullContainer = document.getElementById('fullContent');
            fullContainer.innerHTML = '';
            
            var ftContainer = document.createElement('div');
            ftContainer.className = 'ft-container';
            
            var headerRow = document.createElement('div');
            headerRow.className = 'ft-header-row-flex';
            var emptyCell = document.createElement('div'); emptyCell.className = 'ft-header-cell time-col';
            headerRow.appendChild(emptyCell);
            
            days.forEach(function(d) {{
                var cell = document.createElement('div');
                cell.className = 'ft-header-cell';
                if (d === todayChar) cell.className += ' today';
                cell.innerText = d;
                headerRow.appendChild(cell);
            }});
            ftContainer.appendChild(headerRow);

            var bodyRow = document.createElement('div');
            bodyRow.className = 'ft-body';
            bodyRow.style.height = (totalHours * ROW_HEIGHT) + 'px';

            var timeCol = document.createElement('div');
            timeCol.className = 'ft-col-time';
            for(var h = displayStart; h < displayEnd; h++) {{
                var label = document.createElement('div');
                label.className = 'ft-time-label';
                label.style.height = ROW_HEIGHT + 'px'; 
                label.innerHTML = getHourLabel(h);
                timeCol.appendChild(label);
            }}
            bodyRow.appendChild(timeCol);

            days.forEach(function(d) {{
                var dayCol = document.createElement('div');
                dayCol.className = 'ft-col-day';
                
                for(var h = displayStart; h < displayEnd; h++) {{
                    var gridLine = document.createElement('div');
                    gridLine.style.height = ROW_HEIGHT + 'px'; 
                    gridLine.style.borderBottom = '1px solid #f8f8f8';
                    gridLine.style.boxSizing = 'border-box';
                    dayCol.appendChild(gridLine);
                }}

                var data = scheduleData[d];
                if (data) {{
                    var startTotalHours = data.startH + (data.startM / 60) - displayStart;
                    var durationHours = (data.endH + (data.endM / 60)) - (data.startH + (data.startM / 60));
                    
                    var topPx = startTotalHours * ROW_HEIGHT;
                    var heightPx = durationHours * ROW_HEIGHT;

                    var duration = (data.endH + (data.endM / 60)) - (data.startH + (data.startM / 60));
                    var durationStr = Number.isInteger(duration) ? duration : duration.toFixed(1);

                    if (topPx >= 0) {{
                        var block = document.createElement('div');
                        block.className = 'ft-event-block';
                        block.style.top = topPx + 'px';
                        block.style.height = (heightPx - 2) + 'px'; 
                        block.innerHTML = data.text.replace('~', '<br>~<br>') + 
                                          '<div style="font-size:9px; opacity:0.8; margin-top:2px;">(' + durationStr + 'h)</div>';
                        dayCol.appendChild(block);
                    }}
                }}
                bodyRow.appendChild(dayCol);
            }});
            
            ftContainer.appendChild(bodyRow);
            fullContainer.appendChild(ftContainer);
        }}

        // ... (이하 기존 로직 동일) ...
        var sheetState = 'PEEK'; 
        var PEEK_HEIGHT = 380; 
        var EXPANDED_HEIGHT = window.innerHeight * 0.9;
        var BUBBLE_HEIGHT = 60;

        function updateSheetState(newState, animation = true) {{
            var sheet = document.getElementById('bottomSheet');
            var hint = document.getElementById('expandHint');
            
            sheetState = newState;
            
            if (animation) sheet.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            else sheet.style.transition = 'none';

            if (newState === 'CLOSED') {{
                sheet.style.height = '0';
            }} 
            else if (newState === 'PEEK') {{
                sheet.style.height = PEEK_HEIGHT + 'px';
                hint.innerText = '▴ 위로 올려서 상세 정보 보기';
                interpolateMorph(0); 
            }} 
            else if (newState === 'EXPANDED') {{
                sheet.style.height = EXPANDED_HEIGHT + 'px';
                hint.innerText = '▾ 아래로 내려서 요약 보기';
                interpolateMorph(1); 
            }}
        }}

        function interpolateMorph(ratio) {{
            var summary = document.getElementById('summaryContent');
            var full = document.getElementById('fullContent');
            var container = document.getElementById('timeMorphContainer');
            
            ratio = Math.min(Math.max(ratio, 0), 1);

            if (ratio > 0.8) {{
                container.style.height = 'auto'; 
                full.style.position = 'relative'; 
            }} else {{
                 var targetH = BUBBLE_HEIGHT + (350 * ratio); 
                 container.style.height = targetH + 'px';
                 full.style.position = 'absolute'; 
            }}

            if (ratio < 0.5) {{
                summary.style.display = 'flex';
                full.style.display = 'none';
                summary.style.opacity = 1 - (ratio * 2);
            }} else {{
                summary.style.display = 'none';
                full.style.display = 'block';
                full.style.opacity = (ratio - 0.5) * 2;
            }}
        }}

        function toggleTimeExpand() {{
            if (sheetState === 'PEEK') updateSheetState('EXPANDED');
            else if (sheetState === 'EXPANDED') updateSheetState('PEEK');
        }}

        function openClubDetail(id) {{
            document.getElementById('topSearchInput').blur();
            var club = clubs.find(c => c.id === id);
            
            var titleHtml = club.name;
            if (club.insta) titleHtml += ' <a href="https://instagram.com/' + club.insta + '" target="_blank" class="insta-link">' + instaCssIcon + '</a>';
            document.getElementById('sheetTitle').innerHTML = titleHtml;
            document.getElementById('sheetPrice').innerText = club.price || "회비 정보 없음";
            document.getElementById('sheetAddressVal').value = club.address;
            
            renderTimetables(club.schedule);

            var tagHtml = '<span class="tag target">' + club.target + '</span>';
            if(club.link) tagHtml += '<a href="' + club.link + '" target="_blank" style="text-decoration:none"><span class="tag" style="background:#eee">🏠 홈페이지</span></a>';
            document.getElementById('sheetTags').innerHTML = tagHtml;
            document.getElementById('btnWay').href = "https://map.kakao.com/link/to/" + club.name + "," + club.lat + "," + club.lng;
            
            var urgentArea = document.getElementById('urgentArea');
            if (club.is_urgent && club.urgent_msg) {{
                urgentArea.innerHTML = '<div class="urgent-banner">🔥 ' + club.urgent_msg + '</div>';
                urgentArea.style.display = 'block';
            }} else {{ urgentArea.style.display = 'none'; }}
            
            // [NEW] 찜하기 버튼에 onclick 이벤트 연결
            var btnBookmark = document.getElementById('btnBookmark');
            btnBookmark.onclick = function() {{ bookmarkTeam(club.id); }};
            
            updateSheetState('PEEK');
            
            var targetLevel = 4;
            map.setLevel(targetLevel, {{animate: true}});
            var moveLatLon = new kakao.maps.LatLng(club.lat, club.lng);
            var projection = map.getProjection();
            var centerPoint = projection.pointFromCoords(moveLatLon);
            var offsetY = Math.min(window.innerHeight * 0.13, 150); 
            var newCenterPoint = new kakao.maps.Point(centerPoint.x, centerPoint.y + offsetY);
            var newCenterLatLon = projection.coordsFromPoint(newCenterPoint);
            map.panTo(newCenterLatLon);
        }}

        function closeBottomSheet() {{ updateSheetState('CLOSED'); }}
        document.getElementById('btnCopy').onclick = function() {{ copyAddress(document.getElementById('sheetAddressVal').value); }};
        function copyAddress(addr) {{
            if (navigator.clipboard && navigator.clipboard.writeText) {{ navigator.clipboard.writeText(addr).then(() => {{ alert('주소가 복사되었습니다! 📋'); }}); }} 
            else {{ var t = document.createElement("input"); t.value = addr; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t); alert('주소가 복사되었습니다! 📋'); }}
        }}

        // ... (나머지 로직 동일)
        var urgentClubs = clubs.filter(c => c.is_urgent && c.urgent_msg);
        var uniqueTickerList = [];
        var processedTeams = {{}};
        
        urgentClubs.forEach(function(c) {{
            if (!processedTeams[c.name]) {{
                uniqueTickerList.push(c);
                processedTeams[c.name] = true;
            }}
        }});

        if (uniqueTickerList.length > 0) {{
            var tickerContainer = document.getElementById('urgentTicker');
            var tickerList = document.getElementById('tickerList');
            tickerContainer.style.display = 'flex';
            
            uniqueTickerList.forEach(function(c) {{
                var li = document.createElement('li');
                li.className = 'ticker-item';
                li.innerHTML = '<b>[' + c.name + ']</b> ' + c.urgent_msg;
                li.onclick = function() {{ openClubDetail(c.id); }};
                tickerList.appendChild(li);
            }});

            if (uniqueTickerList.length > 1) {{
                var tickerHeight = 40;
                var currentIndex = 0;
                setInterval(function() {{
                    currentIndex++;
                    tickerList.style.top = '-' + (currentIndex * tickerHeight) + 'px';
                    
                    if (currentIndex === uniqueTickerList.length) {{
                        setTimeout(function() {{
                            tickerList.style.transition = 'none';
                            tickerList.style.top = '0px';
                            currentIndex = 0;
                            setTimeout(function() {{ tickerList.style.transition = 'top 0.5s ease-in-out'; }}, 50);
                        }}, 500); 
                    }} else {{
                        if (currentIndex === uniqueTickerList.length) currentIndex = 0;
                    }}
                }}, 3000);
                
                var firstClone = tickerList.children[0].cloneNode(true);
                firstClone.onclick = function() {{ openClubDetail(uniqueTickerList[0].id); }};
                tickerList.appendChild(firstClone);
            }}
        }}

        const sheet = document.getElementById('bottomSheet');
        const handleArea = document.getElementById('sheetHandle');
        let startY = 0; let currentY = 0; let isDragging = false;
        let startHeight = 0;

        function bHandleStart(e) {{ 
            startY = e.touches ? e.touches[0].clientY : e.clientY; 
            isDragging = true; 
            sheet.style.transition = 'none'; 
            document.getElementById('timeMorphContainer').style.transition = 'none';
            startHeight = sheet.offsetHeight;
        }}
        
        function bHandleMove(e) {{ 
            if (!isDragging) return; 
            if(e.cancelable && e.type.startsWith('touch')) e.preventDefault(); 
            currentY = e.touches ? e.touches[0].clientY : e.clientY; 
            const deltaY = currentY - startY; 
            
            let newHeight = startHeight - deltaY;
            
            if (newHeight > EXPANDED_HEIGHT) newHeight = EXPANDED_HEIGHT;
            
            sheet.style.height = newHeight + 'px';

            let ratio = (newHeight - PEEK_HEIGHT) / (EXPANDED_HEIGHT - PEEK_HEIGHT);
            interpolateMorph(ratio);
        }}
        
        function bHandleEnd(e) {{ 
            if (!isDragging) return; isDragging = false; 
            
            sheet.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            document.getElementById('timeMorphContainer').style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            
            let currentH = sheet.offsetHeight;
            
            if (currentH > (PEEK_HEIGHT + EXPANDED_HEIGHT) / 2) {{
                updateSheetState('EXPANDED');
            }} else {{
                if (currentH < PEEK_HEIGHT * 0.8) updateSheetState('CLOSED');
                else updateSheetState('PEEK');
            }}
            currentY = 0; startY = 0; 
        }}
        
        handleArea.addEventListener('touchstart', bHandleStart, {{passive: true}}); handleArea.addEventListener('touchmove', bHandleMove, {{passive: false}}); handleArea.addEventListener('touchend', bHandleEnd); handleArea.addEventListener('mousedown', bHandleStart); window.addEventListener('mousemove', bHandleMove); window.addEventListener('mouseup', bHandleEnd);

        const filterSheet = document.getElementById('filterSheet');
        const filterHandle = document.getElementById('filterHandle');
        let fStartY = 0; let fCurrentY = 0; let fIsDragging = false;
        function fHandleStart(e) {{ fStartY = e.touches ? e.touches[0].clientY : e.clientY; fIsDragging = true; filterSheet.style.transition = 'none'; }}
        function fHandleMove(e) {{ if (!fIsDragging) return; if(e.cancelable && e.type.startsWith('touch')) e.preventDefault(); fCurrentY = e.touches ? e.touches[0].clientY : e.clientY; const deltaY = fCurrentY - fStartY; if (deltaY < 0) {{ filterSheet.style.transform = `translateY(${{deltaY}}px)`; }} }}
        function fHandleEnd(e) {{ if (!fIsDragging) return; fIsDragging = false; let endY = e.changedTouches ? e.changedTouches[0].clientY : fCurrentY; if (!e.touches && fCurrentY === 0) endY = fStartY; const deltaY = endY - fStartY; filterSheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'; if (deltaY < -50) {{ closeFilterSheet(); }} else {{ filterSheet.style.transform = "translateY(0)"; }} fCurrentY = 0; fStartY = 0; }}
        filterHandle.addEventListener('touchstart', fHandleStart, {{passive: true}}); filterHandle.addEventListener('touchmove', fHandleMove, {{passive: false}}); filterHandle.addEventListener('touchend', fHandleEnd); filterHandle.addEventListener('mousedown', fHandleStart); window.addEventListener('mousemove', fHandleMove); window.addEventListener('mouseup', fHandleEnd);

        function toggleFilterSheet() {{
            var sheet = document.getElementById('filterSheet');
            if (sheet.style.transform === "translateY(0px)" || sheet.style.transform === "") {{ closeFilterSheet(); }} else {{ openFilterSheet(); }}
        }}

        function moveToMyLocation() {{
            if (navigator.geolocation) {{
                navigator.geolocation.getCurrentPosition(function(position) {{
                    var lat = position.coords.latitude, lon = position.coords.longitude;
                    var locPosition = new kakao.maps.LatLng(lat, lon);
                    if (myMarker) myMarker.setMap(null);
                    myMarker = new kakao.maps.Marker({{ map: map, position: locPosition, image: gpsImage }});
                    map.panTo(locPosition);
                }});
            }} else {{ alert('위치 정보를 사용할 수 없습니다.'); }}
        }}

        var selectedFilters = {{ 'region': [], 'day': [], 'target': [] }};
        function openFilterSheet() {{ document.getElementById('filterSheet').style.transform = "translateY(0)"; }}
        function closeFilterSheet() {{ document.getElementById('filterSheet').style.transform = "translateY(-100%)"; }}
        function toggleFilter(category, value, element) {{
            var index = selectedFilters[category].indexOf(value);
            if (index === -1) {{ selectedFilters[category].push(value); element.classList.add('selected'); }} 
            else {{ selectedFilters[category].splice(index, 1); element.classList.remove('selected'); }}
        }}
        function resetFilters() {{
            selectedFilters = {{ 'region': [], 'day': [], 'target': [] }};
            document.querySelectorAll('.chip').forEach(el => el.classList.remove('selected'));
            document.getElementById('topSearchInput').value = ""; 
            applyFilters();
        }}

        function applyFilters() {{
            if (window.event && window.event.type === 'click') closeFilterSheet();
            var keyword = document.getElementById('topSearchInput').value.trim();
            var filterCount = selectedFilters.region.length + selectedFilters.day.length + selectedFilters.target.length;
            if (filterCount > 0) {{ document.getElementById('filterBadge').classList.add('active'); }} 
            else {{ document.getElementById('filterBadge').classList.remove('active'); }}

            clusterer.clear(); 
            var visibleNormalMarkers = []; 
            var bounds = new kakao.maps.LatLngBounds();

            markers.forEach(function(item) {{
                var club = item.club;
                var regionMatch = true;
                if (selectedFilters.region.length > 0) {{
                    regionMatch = false;
                    for (var i = 0; i < selectedFilters.region.length; i++) {{
                        var r = selectedFilters.region[i];
                        if (r === "충청" && (club.address.startsWith("충남") || club.address.startsWith("충북") || club.address.startsWith("대전") || club.address.startsWith("세종"))) regionMatch = true;
                        else if (r === "전라" && (club.address.startsWith("전남") || club.address.startsWith("전북") || club.address.startsWith("광주"))) regionMatch = true;
                        else if (r === "경상" && (club.address.startsWith("경남") || club.address.startsWith("경북") || club.address.startsWith("대구") || club.address.startsWith("부산") || club.address.startsWith("울산"))) regionMatch = true;
                        else if (club.address.startsWith(r)) regionMatch = true;
                    }}
                }}
                var dayMatch = true;
                if (selectedFilters.day.length > 0) {{
                    dayMatch = false;
                    var cleanSchedule = club.schedule.replace(/요일/g, "");
                    if (cleanSchedule.includes("매일")) dayMatch = true;
                    else {{ for (var i = 0; i < selectedFilters.day.length; i++) {{ if (cleanSchedule.includes(selectedFilters.day[i])) dayMatch = true; }} }}
                }}
                var targetMatch = true;
                if (selectedFilters.target.length > 0) {{
                    targetMatch = false;
                    var hasSpecialFilter = selectedFilters.target.some(t => ["여성전용", "남성전용", "선출가능", "6인제"].includes(t));
                    for (var i = 0; i < selectedFilters.target.length; i++) {{ if (club.target.includes(selectedFilters.target[i])) targetMatch = true; }}
                    if (!hasSpecialFilter && club.target.includes("무관")) targetMatch = true;
                }}
                var keywordMatch = true;
                if (keyword.length > 0) {{ if (!club.name.includes(keyword) && !club.address.includes(keyword)) {{ keywordMatch = false; }} }}

                if (regionMatch && dayMatch && targetMatch && keywordMatch) {{ 
                    item.isVisible = true; 
                    if (club.is_urgent) {{ item.marker.setMap(map); }} 
                    else {{ visibleNormalMarkers.push(item.marker); }}
                    bounds.extend(item.marker.getPosition());
                }} else {{ 
                    item.isVisible = false; 
                    item.marker.setMap(null); 
                    item.overlay.setMap(null); 
                }}
            }});
            
            clusterer.addMarkers(visibleNormalMarkers);
            updateLabelVisibility();

            if (!bounds.isEmpty() && (keyword.length > 0 || filterCount > 0)) {{ map.setBounds(bounds); }}
        }}

        applyFilters();

    </script>
</body>
</html>
"""
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"🎉 지도({html_file}) 생성 완료!")

if __name__ == "__main__":
    update_map()