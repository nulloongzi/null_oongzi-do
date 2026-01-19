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
        // [수정] 이메일/비번 인증 모듈 추가
        import {{ getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword }} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
        import {{ getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs }} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

        // Firebase Config
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

        // 🍚 확률형 밥 닉네임 생성기
        function generateRiceName() {{
            const riceData = [
                {{name: "현미밥", weight: 50}}, {{name: "백미밥", weight: 50}}, {{name: "흑미밥", weight: 50}},
                {{name: "보리밥", weight: 50}}, {{name: "콩밥", weight: 50}}, {{name: "오곡밥", weight: 50}},
                {{name: "차조밥", weight: 10}}, {{name: "기장밥", weight: 10}}, {{name: "숭늉", weight: 10}},
                {{name: "볶음밥", weight: 10}}, {{name: "비빔밥", weight: 10}}, {{name: "김밥", weight: 10}},
                {{name: "주먹밥", weight: 10}}, {{name: "유부초밥", weight: 10}}, {{name: "덮밥", weight: 10}},
                {{name: "국밥", weight: 10}}, {{name: "솥밥", weight: 10}}, {{name: "약밥", weight: 10}},
                {{name: "죽", weight: 10}}, {{name: "곤드레밥", weight: 10}}, {{name: "영양밥", weight: 10}},
                {{name: "치밥", weight: 10}}, {{name: "햇반", weight: 10}}, {{name: "고봉밥", weight: 10}},
                {{name: "밥아저씨", weight: 1}}
            ];

            let totalWeight = 0;
            for (let item of riceData) {{
                totalWeight += item.weight;
            }}

            let randomNum = Math.random() * totalWeight;
            let selectedRice = "백미밥"; 

            for (let item of riceData) {{
                if (randomNum < item.weight) {{
                    selectedRice = item.name;
                    break;
                }}
                randomNum -= item.weight;
            }}
            
            const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            let suffix = "";
            for (let i = 0; i < 3; i++) {{
                suffix += chars.charAt(Math.floor(Math.random() * chars.length));
            }}
            
            return {{
                base: selectedRice,
                code: suffix,
                full: selectedRice + "-" + suffix
            }};
        }}

        async function checkDuplicateNickname(nickname) {{
            if (!db) return false;
            const q = query(collection(db, "users"), where("full_nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty; 
        }}

        let currentUser = null;

        if (auth) {{
            onAuthStateChanged(auth, async (user) => {{
                if (user) {{
                    currentUser = user;
                    console.log("✅ 로그인 됨 (UID):", user.uid);
                    await loadOrCreateUserProfile(user);
                    updateProfileUI(true);
                }} else {{
                    currentUser = null;
                    console.log("👋 로그아웃 상태");
                    updateProfileUI(false);
                }}
            }});
        }}

        // [NEW] 구글 로그인
        window.loginWithGoogle = async function() {{
            if (!auth) return;
            const provider = new GoogleAuthProvider();
            try {{
                await signInWithPopup(auth, provider);
            }} catch (error) {{
                console.error("구글 로그인 실패:", error);
                alert("구글 로그인 실패 ㅠ_ㅠ\\n" + error.message);
            }}
        }};

        // [NEW] 이메일 회원가입
        window.registerWithEmail = async function() {{
            const email = document.getElementById('emailInput').value;
            const pw = document.getElementById('pwInput').value;
            if(!email || !pw) {{ alert('이메일과 비밀번호를 입력해주세요.'); return; }}
            if(pw.length < 6) {{ alert('비밀번호는 6자리 이상이어야 합니다.'); return; }}

            try {{
                await createUserWithEmailAndPassword(auth, email, pw);
                // 회원가입 성공 시 onAuthStateChanged가 자동 호출됨 -> 닉네임 생성 로직 탐
            }} catch(error) {{
                alert("회원가입 실패: " + error.message);
            }}
        }};

        // [NEW] 이메일 로그인
        window.loginWithEmail = async function() {{
            const email = document.getElementById('emailInput').value;
            const pw = document.getElementById('pwInput').value;
            if(!email || !pw) {{ alert('이메일과 비밀번호를 입력해주세요.'); return; }}

            try {{
                await signInWithEmailAndPassword(auth, email, pw);
            }} catch(error) {{
                alert("로그인 실패: 이메일이나 비밀번호를 확인해주세요.\\n" + error.message);
            }}
        }};

        window.logout = function() {{
            if (!auth) return;
            if(confirm("정말 로그아웃 하시겠습니까?")) {{
                signOut(auth).then(() => {{
                    alert("로그아웃 되었습니다.");
                    document.getElementById('emailInput').value = "";
                    document.getElementById('pwInput').value = "";
                    document.getElementById('profileOverlay').style.display = 'none';
                }});
            }}
        }};

        async function loadOrCreateUserProfile(user) {{
            const userRef = doc(db, "users", user.uid);
            try {{
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {{
                    const data = userSnap.data();
                    renderProfileCard(data.full_nickname, data.created_at);
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
                    await setDoc(userRef, {{
                        nickname: newNameObj.base,
                        suffix: newNameObj.code,
                        full_nickname: newNameObj.full,
                        created_at: now,
                        email: user.email 
                    }});
                    
                    renderProfileCard(newNameObj.full, {{"seconds": now.getTime()/1000}});
                    
                    if (newNameObj.base === "밥아저씨") {{
                        alert("🎉 축하합니다!! [전설의 밥아저씨]가 되셨습니다!! 🎉\\n🍚 [" + newNameObj.full + "]");
                    }} else {{
                        alert("환영합니다! 따끈따끈한 새 닉네임이 발급되었습니다.\\n🍚 [" + newNameObj.full + "]");
                    }}
                }}
            }} catch (error) {{
                console.error("DB 접근 에러:", error);
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

        function renderProfileCard(name, createdAt) {{
            const nicknameEl = document.getElementById('pcNickname');
            const dateEl = document.getElementById('pcDate');
            
            if (nicknameEl) nicknameEl.innerText = name;
            if (dateEl && createdAt) {{
                const dateObj = new Date(createdAt.seconds * 1000);
                const dateStr = dateObj.getFullYear() + "." + (dateObj.getMonth()+1) + "." + dateObj.getDate();
                dateEl.innerText = "가입일: " + dateStr;
            }}
        }}

        window.editNickname = async function() {{
            if (!currentUser || !db) return;
            const currentName = document.getElementById('pcNickname').innerText;
            const newName = prompt("변경할 닉네임을 입력해주세요 (예: 맛있는누룽지)", currentName);
            
            if (newName && newName.trim() !== "" && newName !== currentName) {{
                if (newName.includes("-")) {{
                    alert("⚠️ 닉네임에 하이픈(-)은 사용할 수 없습니다.\\n하이픈은 오직 '밥아저씨'가 랜덤으로 지어준 이름에만 허용됩니다!");
                    return;
                }}

                try {{
                    const isDup = await checkDuplicateNickname(newName);
                    if (isDup) {{
                        alert("이미 누군가 사용 중인 밥이름입니다! 😢\\n다른 이름을 지어주세요.");
                        return;
                    }}
                    const userRef = doc(db, "users", currentUser.uid);
                    await updateDoc(userRef, {{ full_nickname: newName }});
                    document.getElementById('pcNickname').innerText = newName;
                    alert("닉네임이 [" + newName + "]으로 변경되었습니다! 🥄");
                }} catch (e) {{
                    alert("변경 실패: " + e);
                }}
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
            background: var(--nurungji-dark); 
            border-radius: 50%; 
            box-shadow: var(--shadow);
            display: flex; justify-content: center; align-items: center;
            font-size: 28px; cursor: pointer;
            border: 2px solid #fff;
            transition: transform 0.2s;
        }}
        .fab-profile:active {{ transform: scale(0.95); }}

        .profile-overlay {{
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.4);
            z-index: 500;
            display: none; 
            justify-content: center; align-items: center;
            backdrop-filter: blur(3px);
        }}
        
        .profile-card {{
            width: 85%; max-width: 340px;
            background: var(--nurungji-card);
            padding: 30px 20px;
            text-align: center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            position: relative;
            border: 8px dashed rgba(255,255,255,0.8);
            border-radius: 30px; 
            background-clip: padding-box; 
        }}
        .pc-header {{
            display: flex; justify-content: center; align-items: center; gap: 8px;
            margin-bottom: 10px;
        }}
        .pc-nickname {{
            color: #fff; font-size: 24px; font-weight: 800;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .pc-edit-btn {{
            cursor: pointer; font-size: 18px; 
            background: rgba(255,255,255,0.3);
            width: 30px; height: 30px; border-radius: 50%;
            display: flex; justify-content: center; align-items: center;
        }}
        .pc-date {{
            color: rgba(255,255,255,0.9);
            font-size: 13px; font-weight: 500;
        }}
        
        /* 로그인 섹션 스타일 */
        .login-section {{
            display: flex; flex-direction: column; gap: 10px;
            width: 100%;
        }}
        .input-group {{
            display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;
        }}
        .auth-input {{
            padding: 10px 15px; border-radius: 20px;
            border: none; outline: none;
            font-size: 14px;
            background: rgba(255,255,255,0.9);
        }}
        .btn-row {{
            display: flex; gap: 8px;
        }}
        .btn-auth {{
            flex: 1;
            padding: 10px; border-radius: 20px;
            border: none; cursor: pointer;
            font-weight: 700; font-size: 13px;
            color: #555; background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .btn-auth.primary {{ background: #fff; border: 2px solid white; }}
        .btn-auth.secondary {{ background: transparent; border: 1px solid white; color: white; }}
        
        .divider {{ 
            color: rgba(255,255,255,0.7); font-size: 11px; margin: 10px 0; 
            display: flex; align-items: center; gap: 10px;
        }}
        .divider::before, .divider::after {{ content: ""; flex: 1; height: 1px; background: rgba(255,255,255,0.4); }}

        .btn-google-login {{
            background: white; color: #555;
            border: 1px solid #ddd;
            padding: 12px 20px;
            border-radius: 30px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 10px;
            width: 100%;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }}
        .btn-google-login img {{ width: 18px; height: 18px; }}
        
        .btn-logout {{
            margin-top: 20px;
            background: transparent;
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            padding: 5px 10px;
            border-radius: 12px;
            font-size: 12px;
            cursor: pointer;
        }}

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
        
        .sheet-handle-area {{ width: 100%; padding: 10px 0; display: flex; justify-content: center; cursor: grab; flex-shrink: 0; background: #fff; }}
        .sheet-handle {{ width: 36px; height: 4px; background: #e5e5e5; border-radius: 2px; }}
        
        .sheet-content-wrapper {{ 
            flex: 1; overflow-y: auto; padding: 0 24px 20px 24px; 
            -webkit-overflow-scrolling: touch; 
            scrollbar-width: none; 
        }}
        .sheet-content-wrapper::-webkit-scrollbar {{ display: none; }}

        .urgent-banner {{ margin-bottom: 15px; padding: 12px; background: #fff5f5; border: 1px solid #ff8787; border-radius: 12px; color: #c92a2a; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; line-height: 1.4; }}
        .sheet-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; margin-top: 10px; }}
        .sheet-title {{ font-size: 22px; font-weight: 800; color: #111; margin: 0; display: flex; align-items: center; gap: 8px; flex: 1; }}
        .instagram {{ font-size: 26px; width: 1em; height: 1em; display: inline-grid; place-items: center; vertical-align: middle; background: radial-gradient(circle farthest-corner at 28% 100%, #fcdf8f 0%, #fbd377 10%, #fa8e37 22%, #f73344 35%, transparent 65%), linear-gradient(145deg, #3051f1 10%, #c92bb7 70%); border-radius: 0.25em; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }}
        .instagram:before {{ content: ""; position: absolute; border-radius: inherit; aspect-ratio: 1; border: 0.08em solid var(--white); width: 65%; height: 65%; border-radius: 25%; }}
        .instagram:after {{ content: ""; position: absolute; border-radius: 50%; aspect-ratio: 1; border: 0.08em solid var(--white); width: 35%; height: 35%; box-shadow: 0.22em -0.22em 0 -0.18em var(--white); }}

        .time-morph-container {{
            position: relative;
            background: transparent;
            margin-bottom: 20px;
            transition: height 0.1s linear;
            overflow: hidden;
            min-height: 60px; 
            border: none;
        }}

        .st-bubble {{ 
            background: #fff; 
            border-radius: 8px; 
            padding: 8px 14px; 
            font-size: 13px; color: #333; white-space: nowrap; font-weight: 600;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border: 1px solid var(--brand-color); 
            box-shadow: 0 0 8px rgba(250, 199, 16, 0.4); 
            flex-shrink: 0;
        }}
        .st-day-text {{ font-size: 12px; color: var(--brand-color); font-weight: 800; margin-bottom: 2px; }}
        .st-time-text {{ font-size: 14px; font-weight: 700; color: #333; }}

        .summary-content {{ 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; gap: 8px; overflow-x: auto; align-items: center;
            padding: 5px; scrollbar-width: none;
            opacity: 1; transition: opacity 0.1s;
            z-index: 10;
        }}
        .summary-content::-webkit-scrollbar {{ display: none; }}

        .full-content {{ 
            position: absolute; top: 0; left: 0; width: 100%;
            opacity: 0; transition: opacity 0.1s;
            z-index: 5;
        }}

        .ft-container {{
            display: flex;
            flex-direction: column;
            background: #fff;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #f0f0f0;
        }}
        .ft-header-row-flex {{
            display: flex;
            height: 35px;
            border-bottom: 1px solid #eee;
        }}
        .ft-header-cell {{
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #888;
            font-weight: 600;
            background: #fafafa;
        }}
        .ft-header-cell.time-col {{ width: 50px; flex: none; border-right: 1px solid #eee; }}
        
        .ft-header-cell.today {{ 
            background: var(--today-color); 
            color: #fff; 
            font-weight: 800;
        }}

        .ft-body {{
            display: flex;
            position: relative;
        }}
        .ft-col-time {{
            width: 50px;
            flex: none;
            display: flex;
            flex-direction: column;
            border-right: 1px solid #eee;
            background: #fafafa;
        }}
        
        .ft-time-label {{
            display: flex;
            flex-direction: row; 
            gap: 2px;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #999;
            font-weight: 500;
            border-bottom: 1px solid #f5f5f5;
            white-space: nowrap; 
        }}
        
        .ft-col-day {{
            flex: 1;
            position: relative;
            border-right: 1px solid #f8f8f8;
        }}
        .ft-col-day:last-child {{ border-right: none; }}
        
        .ft-event-block {{
            position: absolute;
            width: 94%;
            left: 3%;
            background: rgba(250, 199, 16, 0.25);
            border-left: 3px solid var(--brand-color);
            border-radius: 4px;
            font-size: 10px;
            color: #555;
            display: flex;
            flex-direction: column; 
            align-items: center;
            justify-content: center;
            text-align: center;
            font-weight: 700;
            line-height: 1.2;
            z-index: 5;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            padding: 2px;
            overflow: hidden;
        }}

        .tag-box {{ display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }}
        .tag {{ font-size: 12px; padding: 6px 10px; border-radius: 8px; font-weight: 600; color: #555; background: #f1f3f5; }}
        .tag.target {{ color: #0056b3; background: #e7f5ff; }}

        .info-row {{ display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 15px; color: #333; }}
        .info-icon {{ width: 20px; text-align: center; font-size: 16px; }}
        
        .action-buttons {{ display: flex; gap: 12px; margin-top: 20px; }}
        .btn {{ flex: 1; padding: 14px; border-radius: 14px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; text-decoration: none; transition: transform 0.1s; }}
        .btn:active {{ transform: scale(0.98); }}
        .btn-copy {{ background: #f1f3f5; color: #333; }}
        .btn-way {{ background: var(--brand-color); color: #000; box-shadow: 0 4px 10px rgba(250, 199, 16, 0.3); }}
        a.insta-link {{ text-decoration: none; display: flex; align-items: center; }}

        .filter-sheet {{ position: fixed; top: 0; left: 0; width: 100%; max-height: 85%; background: #fff; z-index: 300; border-radius: 0 0 24px 24px; box-shadow: 0 5px 30px rgba(0,0,0,0.2); padding: 0; transform: translateY(-100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; flex-direction: column; will-change: transform; }}
        .filter-sheet.active {{ transform: translateY(0); }}
        .fs-header {{ padding: 20px 24px 15px; display: flex; justify-content: space-between; align-items: center; }}
        .fs-title {{ font-size: 20px; font-weight: 800; }}
        .fs-body {{ flex: 1; overflow-y: auto; padding: 0 24px 10px; }}
        .fs-section {{ margin-bottom: 25px; }}
        .fs-label {{ font-size: 14px; font-weight: 700; color: #888; margin-bottom: 10px; display: block; }}
        .chip-group {{ display: flex; flex-wrap: wrap; gap: 8px; }}
        .chip {{ padding: 8px 16px; border-radius: 20px; border: 1px solid #e0e0e0; background: #fff; font-size: 14px; color: #555; font-weight: 600; cursor: pointer; transition: all 0.2s; user-select: none; }}
        .chip:hover {{ background: #f8f9fa; }}
        .chip.selected {{ background: var(--brand-color); color: #000; border-color: var(--brand-color); box-shadow: 0 2px 6px rgba(250, 199, 16, 0.3); font-weight: 700; }}
        .fs-footer {{ padding: 10px 24px 10px; border-top: 1px solid #eee; display: flex; gap: 10px; background: white; }}
        .btn-reset {{ flex: 0.3; background: #f1f3f5; color: #555; }}
        .btn-apply {{ flex: 1; background: #333; color: white; }}
        .fs-handle-area {{ width: 100%; padding: 10px 0 20px 0; display: flex; justify-content: center; cursor: grab; background: white; border-radius: 0 0 24px 24px; }}
        .fs-handle {{ width: 40px; height: 5px; background: #e5e5e5; border-radius: 3px; }}
        
        .expand-hint {{ text-align: center; color: #ccc; font-size: 11px; margin-top: 5px; margin-bottom: 0px; }}
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

    <div class="fab-profile" onclick="toggleProfileCard()">🍚</div>

    <div class="fab-group">
        <a href="https://forms.gle/FpHvQyGg3jBivjTU6" target="_blank" class="fab-btn fab-urgent" title="십시일반 긴급구인 신청">🥄</a>
        <a href="https://forms.gle/H6HoEUy5zM7FHuHL7" target="_blank" class="fab-btn fab-report" title="팀 제보하기">📢</a>
        <div class="fab-btn" onclick="moveToMyLocation()">📍</div>
    </div>

    <div id="profileOverlay" class="profile-overlay" onclick="toggleProfileCard()">
        <div class="profile-card" onclick="event.stopPropagation()">
            
            <div id="loginSection" class="login-section">
                <button class="btn-google-login" onclick="loginWithGoogle()">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G">
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
                <button class="btn-logout" onclick="logout()">로그아웃</button>
            </div>
        </div>
    </div>

    <div id="filterSheet" class="filter-sheet">
        <div class="fs-header"><div class="fs-title">검색 조건 설정</div></div>
        <div class="fs-body">
            <div class="fs-section"><span class="fs-label">📍 지역 (중복 선택 가능)</span>
                <div class="chip-group" id="regionChips">
                    <div class="chip" onclick="toggleFilter('region', '서울', this)">서울</div>
                    <div class="chip" onclick="toggleFilter('region', '경기', this)">경기</div>
                    <div class="chip" onclick="toggleFilter('region', '인천', this)">인천</div>
                    <div class="chip" onclick="toggleFilter('region', '강원', this)">강원</div>
                    <div class="chip" onclick="toggleFilter('region', '충청', this)">충청</div>
                    <div class="chip" onclick="toggleFilter('region', '전라', this)">전라</div>
                    <div class="chip" onclick="toggleFilter('region', '경상', this)">경상</div>
                    <div class="chip" onclick="toggleFilter('region', '제주', this)">제주</div>
                </div>
            </div>
            <div class="fs-section"><span class="fs-label">📅 요일</span>
                <div class="chip-group" id="dayChips">
                    <div class="chip" onclick="toggleFilter('day', '월', this)">월</div>
                    <div class="chip" onclick="toggleFilter('day', '화', this)">화</div>
                    <div class="chip" onclick="toggleFilter('day', '수', this)">수</div>
                    <div class="chip" onclick="toggleFilter('day', '목', this)">목</div>
                    <div class="chip" onclick="toggleFilter('day', '금', this)">금</div>
                    <div class="chip" onclick="toggleFilter('day', '토', this)">토</div>
                    <div class="chip" onclick="toggleFilter('day', '일', this)">일</div>
                </div>
            </div>
            <div class="fs-section"><span class="fs-label">🏐 대상 및 특징</span>
                <div class="chip-group" id="targetChips">
                    <div class="chip" onclick="toggleFilter('target', '성인', this)">성인</div>
                    <div class="chip" onclick="toggleFilter('target', '대학생', this)">대학생</div>
                    <div class="chip" onclick="toggleFilter('target', '청소년', this)">청소년</div>
                    <div class="chip" onclick="toggleFilter('target', '여성전용', this)">여성전용</div>
                    <div class="chip" onclick="toggleFilter('target', '남성전용', this)">남성전용</div>
                    <div class="chip" onclick="toggleFilter('target', '선출가능', this)">선출가능</div>
                    <div class="chip" onclick="toggleFilter('target', '6인제', this)">6인제</div>
                </div>
            </div>
        </div>
        <div class="fs-footer">
            <div class="btn btn-reset" onclick="resetFilters()">초기화</div>
            <div class="btn btn-apply" onclick="applyFilters()">적용하기</div>
        </div>
        <div class="fs-handle-area" id="filterHandle"><div class="fs-handle"></div></div>
    </div>

    <div id="bottomSheet" class="bottom-sheet">
        <div class="sheet-handle-area" id="sheetHandle"><div class="sheet-handle"></div></div>
        
        <div class="sheet-content-wrapper">
            <div id="urgentArea"></div>

            <div class="sheet-header"><div class="sheet-title" id="sheetTitle">팀 이름</div></div>
            
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
        </div>
    </div>

    <script type="text/javascript" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}&libraries=clusterer"></script>
    <script>
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