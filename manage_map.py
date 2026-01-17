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

# 테스트 모드 설정
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
    
    # 겹침 방지 로직
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

    # 지도 중심 좌표 설정 (GVT 팀 기준 or 기본값)
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
    <meta name="apple-mobile-web-app-capable" content="yes">
    <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/528/528098.png">

    <style>
        * {{ box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif; }}
        html, body {{ width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #f8f9fa; }}
        #map {{ width: 100%; height: 100%; }}
        :root {{ --white: #fff; --brand-color: #fac710; --urgent-color: #ff4757; --shadow: 0 4px 10px rgba(0,0,0,0.1); }}
        
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
        
        .label {{ padding: 6px 12px; background-color: #fff; border-radius: 20px; font-size: 12px; font-weight: 800; color: #333; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 1px solid rgba(0,0,0,0.1); white-space: nowrap; cursor: pointer; transform: translateY(-55px); }}
        .label:hover {{ z-index: 10000 !important; transform: translateY(-57px) scale(1.05); }}
        .label.urgent {{ background-color: var(--urgent-color); color: #fff; border: 2px solid #fff; animation: pulse 1.5s infinite; }}
        @keyframes pulse {{ 0% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }} 70% {{ box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }} 100% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }} }}

        /* 바텀시트 기본 스타일 */
        .bottom-sheet {{ 
            position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; z-index: 200; 
            border-top-left-radius: 24px; border-top-right-radius: 24px; 
            box-shadow: 0 -5px 25px rgba(0,0,0,0.1); 
            padding: 20px 24px 0 24px; 
            transform: translateY(120%); 
            transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); 
            display: flex; flex-direction: column;
            height: auto; /* 내용물에 따라 자동 */
            max-height: 85vh; /* 최대 높이 */
            will-change: transform;
        }}
        .sheet-handle-area {{ width: 100%; padding: 0 0 20px 0; display: flex; justify-content: center; cursor: grab; flex-shrink: 0; }}
        .sheet-handle {{ width: 36px; height: 4px; background: #e5e5e5; border-radius: 2px; margin-top: 5px; }}
        
        .sheet-content-wrapper {{ flex: 1; overflow-y: auto; padding-bottom: 30px; -webkit-overflow-scrolling: touch; }}

        .urgent-banner {{ margin-bottom: 15px; padding: 12px; background: #fff5f5; border: 1px solid #ff8787; border-radius: 12px; color: #c92a2a; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; line-height: 1.4; }}
        
        .sheet-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }}
        .sheet-title {{ font-size: 22px; font-weight: 800; color: #111; margin: 0; display: flex; align-items: center; gap: 8px; flex: 1; }}
        .instagram {{ font-size: 26px; width: 1em; height: 1em; display: inline-grid; place-items: center; vertical-align: middle; background: radial-gradient(circle farthest-corner at 28% 100%, #fcdf8f 0%, #fbd377 10%, #fa8e37 22%, #f73344 35%, transparent 65%), linear-gradient(145deg, #3051f1 10%, #c92bb7 70%); border-radius: 0.25em; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }}
        .instagram:before {{ content: ""; position: absolute; border-radius: inherit; aspect-ratio: 1; border: 0.08em solid var(--white); width: 65%; height: 65%; border-radius: 25%; }}
        .instagram:after {{ content: ""; position: absolute; border-radius: 50%; aspect-ratio: 1; border: 0.08em solid var(--white); width: 35%; height: 35%; box-shadow: 0.22em -0.22em 0 -0.18em var(--white); }}

        /* 1. 요약 시간표 (Text Bubble Style) - 가로 스크롤 가능 */
        .summary-timetable {{ 
            margin-bottom: 20px; 
            display: flex; gap: 8px; overflow-x: auto; 
            padding-bottom: 5px; /* 스크롤바 공간 */
            scrollbar-width: none; /* 파이어폭스 스크롤바 숨김 */
        }}
        .summary-timetable::-webkit-scrollbar {{ display: none; }} /* 크롬 스크롤바 숨김 */
        
        .st-bubble {{ 
            background: #f1f3f5; border-radius: 16px; padding: 8px 14px; 
            font-size: 13px; color: #555; white-space: nowrap; font-weight: 600;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border: 1px solid transparent; transition: all 0.2s;
        }}
        .st-bubble.active {{ 
            background: #fff; border-color: var(--brand-color); color: #333; 
            box-shadow: 0 2px 6px rgba(250, 199, 16, 0.3); 
        }}
        .st-day-text {{ font-size: 12px; color: #888; margin-bottom: 2px; }}
        .st-bubble.active .st-day-text {{ color: var(--brand-color); font-weight: 800; }}
        .st-time-text {{ font-size: 14px; font-weight: 700; }}

        /* 2. 상세 시간표 (Expanded Grid) - 초기엔 숨김 */
        .full-timetable-area {{ margin-top: 10px; display: none; padding-top: 10px; border-top: 1px solid #eee; }}
        .ft-header-row {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }}
        .ft-title {{ font-size: 16px; font-weight: 700; color: #333; }}
        .ft-grid {{ 
            display: grid; 
            grid-template-columns: 40px repeat(7, 1fr); 
            grid-auto-rows: 25px; 
            gap: 1px; background: #eee; border: 1px solid #eee; border-radius: 8px; overflow: hidden;
        }}
        .ft-cell {{ background: white; font-size: 10px; display: flex; align-items: center; justify-content: center; }}
        .ft-header {{ background: #f8f9fa; font-weight: 700; color: #555; }}
        .ft-time-col {{ background: #f8f9fa; color: #888; font-size: 10px; border-right: 1px solid #eee; }}
        .ft-block {{ background: var(--brand-color); opacity: 0.8; }}

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
        
        .expand-hint {{ text-align: center; color: #ccc; font-size: 11px; margin-top: 5px; margin-bottom: 5px; }}
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

    <div class="fab-group">
        <a href="INSERT_GOOGLE_FORM_URL_HERE" target="_blank" class="fab-btn fab-urgent" title="십시일반 긴급구인 신청">🥄</a>
        <a href="https://forms.gle/H6HoEUy5zM7FHuHL7" target="_blank" class="fab-btn fab-report" title="팀 제보하기">📢</a>
        <div class="fab-btn" onclick="moveToMyLocation()">📍</div>
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
            
            <div class="summary-timetable" id="summaryTimetable"></div>

            <div class="full-timetable-area" id="fullTimetableArea">
                <div class="ft-header-row">
                    <div class="ft-title">📅 상세 주간 스케줄</div>
                </div>
                <div class="ft-grid" id="fullTimetableGrid"></div>
            </div>
            
            <div class="expand-hint" id="expandHint">▴ 위로 올려서 전체 시간표 확인</div>

            <div class="tag-box" id="sheetTags"></div>
            <div class="info-row"><span class="info-icon">💰</span> <span id="sheetPrice">-</span></div>
            <div class="info-row"><span class="info-icon">⏰</span> <span id="sheetSchedule">-</span></div>
            
            <div class="action-buttons">
                <button class="btn btn-copy" id="btnCopy">📍 주소 복사</button>
                <a href="#" target="_blank" class="btn btn-way" id="btnWay">🚀 길찾기</a>
            </div>
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

        // 시간표 렌더링 (요약형 Bubble + 상세형 Grid)
        function renderTimetables(scheduleText) {{
            // 1. 요약형 (버블)
            var days = ['월', '화', '수', '목', '금', '토', '일'];
            var summaryContainer = document.getElementById('summaryTimetable');
            summaryContainer.innerHTML = '';
            
            var hasActive = false;
            days.forEach(function(day) {{
                var isActive = scheduleText.includes(day);
                var timeText = "-";
                if (isActive) {{
                    hasActive = true;
                    var regex = new RegExp(day + "\\\\(([^)]+)\\\\)");
                    var match = scheduleText.match(regex);
                    if (match) timeText = match[1];
                    
                    // 버블 생성 (활성화된 요일만 표시하거나, 모두 표시하되 스타일 다르게)
                    var bubble = document.createElement('div');
                    bubble.className = 'st-bubble active';
                    bubble.innerHTML = '<div class="st-day-text">' + day + '요일</div><div class="st-time-text">' + timeText + '</div>';
                    summaryContainer.appendChild(bubble);
                }}
            }});
            
            if (!hasActive) {{
                summaryContainer.innerHTML = '<div class="st-bubble"><div class="st-day-text">일정</div><div class="st-time-text">정보없음</div></div>';
            }}

            // 2. 상세형 (그리드)
            var fullContainer = document.getElementById('fullTimetableGrid');
            fullContainer.innerHTML = '';
            
            // 헤더 (요일)
            var headerCell = document.createElement('div'); headerCell.className = 'ft-cell ft-header'; fullContainer.appendChild(headerCell);
            days.forEach(d => {{ var c = document.createElement('div'); c.className = 'ft-cell ft-header'; c.innerText = d; fullContainer.appendChild(c); }});

            // 시간 (6시~24시)
            for (var h = 6; h <= 24; h++) {{
                var timeCol = document.createElement('div');
                timeCol.className = 'ft-cell ft-time-col';
                timeCol.innerText = h + '시';
                fullContainer.appendChild(timeCol);

                days.forEach(day => {{
                    var cell = document.createElement('div');
                    cell.className = 'ft-cell';
                    if (scheduleText.includes(day)) {{
                        var regex = new RegExp(day + "\\\\((\\\\d+)-(\\\\d+)\\\\)"); 
                        var match = scheduleText.match(regex);
                        if (match) {{
                            var start = parseInt(match[1]);
                            var end = parseInt(match[2]);
                            if (h >= start && h < end) {{
                                cell.className = 'ft-cell ft-block'; 
                            }}
                        }}
                    }}
                    fullContainer.appendChild(cell);
                }});
            }}
        }}

        // 시트 상태 관리
        // State: 'CLOSED', 'PEEK', 'EXPANDED'
        var sheetState = 'CLOSED';

        function updateSheetState(newState) {{
            var sheet = document.getElementById('bottomSheet');
            var summary = document.getElementById('summaryTimetable');
            var full = document.getElementById('fullTimetableArea');
            var hint = document.getElementById('expandHint');
            var tags = document.getElementById('sheetTags');
            var infoRow1 = document.getElementById('sheetPrice').parentNode;
            var infoRow2 = document.getElementById('sheetSchedule').parentNode;

            sheetState = newState;

            if (newState === 'CLOSED') {{
                sheet.style.transform = "translateY(120%)";
            }} 
            else if (newState === 'PEEK') {{
                // 기본 상태: 버블 보임, 표 숨김
                sheet.style.transform = "translateY(0)";
                summary.style.display = 'flex';
                full.style.display = 'none';
                hint.innerText = '▴ 위로 올려서 전체 시간표 확인';
                hint.style.display = 'block';
                // 태그와 정보 표시
                tags.style.display = 'flex';
                infoRow1.style.display = 'flex';
                infoRow2.style.display = 'flex';
            }} 
            else if (newState === 'EXPANDED') {{
                // 확장 상태: 버블 숨김, 표 보임, 시트 최대로 올림
                // 모바일 전체화면 느낌을 위해 상단 여백 조금 남기고 올림
                sheet.style.transform = "translateY(-40%)"; // 화면 위로 더 올림 (값 조절 가능)
                
                summary.style.display = 'none'; // 버블 숨김
                full.style.display = 'block';   // 표 보임
                hint.innerText = '▾ 아래로 내려서 요약 보기';
                
                // 공간 확보를 위해 기타 정보 숨기기 (선택사항)
                tags.style.display = 'none';
                infoRow1.style.display = 'none';
                infoRow2.style.display = 'none';
            }}
        }}

        function openClubDetail(id) {{
            document.getElementById('topSearchInput').blur();
            var club = clubs.find(c => c.id === id);
            
            var titleHtml = club.name;
            if (club.insta) titleHtml += ' <a href="https://instagram.com/' + club.insta + '" target="_blank" class="insta-link">' + instaCssIcon + '</a>';
            document.getElementById('sheetTitle').innerHTML = titleHtml;
            document.getElementById('sheetPrice').innerText = club.price || "회비 정보 없음";
            document.getElementById('sheetSchedule').innerText = club.schedule || "일정 정보 없음";
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
            
            // 처음 열릴 때는 PEEK 상태
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
        
        function bHandleStart(e) {{ startY = e.touches ? e.touches[0].clientY : e.clientY; isDragging = true; sheet.style.transition = 'none'; }}
        function bHandleMove(e) {{ 
            if (!isDragging) return; 
            if(e.cancelable && e.type.startsWith('touch')) e.preventDefault(); 
            currentY = e.touches ? e.touches[0].clientY : e.clientY; 
            const deltaY = currentY - startY; 
            
            // 드래그 중에는 transform으로 따라다니게 함
            // 현재 상태에 따라 기준점(offset)이 다름을 고려해야 하지만, 
            // 여기선 간단하게 상대적 이동만 구현
            // 실제 구현시엔 복잡해지므로, 드래그 중엔 시각적 피드백만 주고 
            // End에서 결정하는 게 깔끔함.
        }}
        
        function bHandleEnd(e) {{ 
            if (!isDragging) return; isDragging = false; 
            let endY = e.changedTouches ? e.changedTouches[0].clientY : currentY; 
            if (!e.touches && currentY === 0) endY = startY; 
            const deltaY = endY - startY; 
            
            sheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'; 
            
            // 로직: 드래그 방향과 거리에 따라 다음 상태 결정
            if (deltaY < -50) {{ // 위로 당김
                if (sheetState === 'PEEK') updateSheetState('EXPANDED');
            }} 
            else if (deltaY > 50) {{ // 아래로 내림
                if (sheetState === 'EXPANDED') updateSheetState('PEEK');
                else if (sheetState === 'PEEK') updateSheetState('CLOSED');
            }}
            else {{
                // 제자리 (원복)
                updateSheetState(sheetState);
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