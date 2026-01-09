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
    
    if IS_TEST_MODE:
        html_file = "test_new.html" 
    else:
        html_file = "index.html"

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
                new_lat = base_lat + radius * math.sin(angle)
                new_lng = base_lng + radius * math.cos(angle)
                club['lat'] = new_lat
                club['lng'] = new_lng
                club['angle'] = angle 
                adjusted_list.append(club)
                
    final_list = adjusted_list

    for idx, club in enumerate(final_list):
        club['id'] = idx 

    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=4)

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
        .filter-badge {{ position: absolute; top: 12px; right: 10px; width: 8px; height: 8px; background: #fac710; border-radius: 50%; display: none; }}
        .filter-badge.active {{ display: block; }}
        
        .fab-group {{ position: absolute; bottom: 30px; right: 15px; z-index: 20; display: flex; flex-direction: column; gap: 12px; }}
        .fab-btn {{ width: 48px; height: 48px; background: white; border-radius: 50%; box-shadow: var(--shadow); display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 20px; text-decoration: none; color: #333; transition: transform 0.2s; }}
        .fab-btn:active {{ transform: scale(0.95); }}
        .fab-report {{ background: #fac710; color: #000; }}
        
        .label {{ padding: 6px 12px; background-color: #fff; border-radius: 20px; font-size: 12px; font-weight: 800; color: #333; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 1px solid rgba(0,0,0,0.1); white-space: nowrap; cursor: pointer; transform: translateY(-55px); }}
        .label:hover {{ z-index: 10000 !important; transform: translateY(-57px) scale(1.05); }}
        
        .label.urgent {{ background-color: var(--urgent-color); color: #fff; border: 2px solid #fff; animation: pulse 1.5s infinite; }}
        @keyframes pulse {{ 0% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }} 70% {{ box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }} 100% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }} }}

        .bottom-sheet {{ position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; z-index: 200; border-top-left-radius: 24px; border-top-right-radius: 24px; box-shadow: 0 -5px 25px rgba(0,0,0,0.1); padding: 20px 24px 50px 24px; transform: translateY(120%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }}
        .urgent-banner {{ margin-bottom: 15px; padding: 12px; background: #fff5f5; border: 1px solid #ff8787; border-radius: 12px; color: #c92a2a; font-size: 14px; font-weight: 700; display: none; }}
        
        /* 필터 시트 관련 CSS 복구 */
        .filter-sheet {{ position: fixed; top: 0; left: 0; width: 100%; max-height: 85%; background: #fff; z-index: 300; border-radius: 0 0 24px 24px; box-shadow: 0 5px 30px rgba(0,0,0,0.2); padding: 0; transform: translateY(-100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; flex-direction: column; }}
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
        
        .btn {{ padding: 14px; border-radius: 14px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; }}
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

    <div class="fab-group">
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
    </div>

    <div id="bottomSheet" class="bottom-sheet">
        <div id="urgentArea" class="urgent-banner"></div>
        <h2 id="sheetTitle">팀 이름</h2>
        <p id="sheetInfo">정보</p>
        <div class="btn btn-apply" onclick="closeBottomSheet()">닫기</div>
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
        var markersData = []; // 필터링을 위해 전체 데이터를 담을 배열
        var labelOverlays = []; 

        var defaultImageSrc = './marker_yellow.png'; 
        var urgentImageSrc = './marker_red.png'; 
        
        var imageSize = new kakao.maps.Size(40, 53); 
        var imageOption = {{offset: new kakao.maps.Point(20, 53)}}; 
        
        var defaultMarkerImage = new kakao.maps.MarkerImage(defaultImageSrc, imageSize, imageOption);
        var urgentMarkerImage = new kakao.maps.MarkerImage(urgentImageSrc, imageSize, imageOption);

        // 내 위치 마커용 이미지
        var gpsSvg = 'data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3ccircle cx="50" cy="50" r="45" fill="rgba(66, 133, 244, 0.3)"/%3e%3ccircle cx="50" cy="50" r="25" fill="white"/%3e%3ccircle cx="50" cy="50" r="20" fill="%234285F4"/%3e%3c/svg%3e';
        var gpsImage = new kakao.maps.MarkerImage(gpsSvg, new kakao.maps.Size(44,44), {{offset: new kakao.maps.Point(22,22)}});
        var myMarker = null;

        clubs.forEach(function(club) {{
            if (!club.lat || !club.lng) return;
            var latlng = new kakao.maps.LatLng(club.lat, club.lng);
            
            var marker;
            if (club.is_urgent) {{
                marker = new kakao.maps.Marker({{ position: latlng, image: urgentMarkerImage, zIndex: 9999 }});
                // 긴급은 초기 setMap(map) 안함 (applyFilters에서 일괄 처리)
            }} else {{
                marker = new kakao.maps.Marker({{ position: latlng, image: defaultMarkerImage }});
            }}
            
            var labelClass = club.is_urgent ? 'label urgent' : 'label';
            var content = '<div class="' + labelClass + '" onclick="openDetail(' + club.id + ')">' + club.name + '</div>';
            var customOverlay = new kakao.maps.CustomOverlay({{ position: latlng, content: content, yAnchor: 1 }});
            
            kakao.maps.event.addListener(marker, 'click', function() {{ openDetail(club.id); }});
            
            // 모든 데이터를 배열에 저장 (isVisible 기본값 true)
            markersData.push({{ marker: marker, overlay: customOverlay, club: club, isVisible: true }});
            labelOverlays.push({{ overlay: customOverlay, club: club }});
        }});

        // 초기 필터 적용 (이 함수 안에서 마커 표시 및 클러스터링 수행)
        applyFilters();

        function updateLabelVisibility() {{
            var level = map.getLevel(); 
            var showLabels = (level <= 5); 
            
            markersData.forEach(function(item) {{
                if (!item.isVisible) return; // 필터로 숨겨진 건 패스

                // 긴급은 항상 보임, 일반은 줌 레벨에 따라
                if (item.club.is_urgent) {{
                    item.overlay.setMap(map);
                }} else {{
                    if (showLabels) item.overlay.setMap(map);
                    else item.overlay.setMap(null);
                }}
            }});
        }}
        
        kakao.maps.event.addListener(map, 'zoom_changed', updateLabelVisibility);

        function openDetail(id) {{
            var club = clubs.find(c => c.id === id);
            document.getElementById('sheetTitle').innerText = club.name;
            document.getElementById('sheetInfo').innerText = club.schedule + " / " + club.price;
            
            var banner = document.getElementById('urgentArea');
            if (club.is_urgent && club.urgent_msg) {{
                banner.innerText = "🔥 " + club.urgent_msg;
                banner.style.display = 'block';
            }} else {{
                banner.style.display = 'none';
            }}
            
            document.getElementById('bottomSheet').style.transform = "translateY(0)";
            
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

        function closeBottomSheet() {{
            document.getElementById('bottomSheet').style.transform = "translateY(120%)";
        }}
        
        // ==========================================
        // [복구됨] 필터 및 검색 로직
        // ==========================================
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
            closeFilterSheet();
            var keyword = document.getElementById('topSearchInput').value.trim();
            var filterCount = selectedFilters.region.length + selectedFilters.day.length + selectedFilters.target.length;
            
            if (filterCount > 0) {{ document.getElementById('filterBadge').classList.add('active'); }} 
            else {{ document.getElementById('filterBadge').classList.remove('active'); }}

            clusterer.clear(); // 기존 클러스터 비우기
            var visibleNormalMarkers = []; // 클러스터러에 넣을 일반 마커들

            markersData.forEach(function(item) {{
                var club = item.club;
                
                // 1. 지역 필터
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
                
                // 2. 요일 필터
                var dayMatch = true;
                if (selectedFilters.day.length > 0) {{
                    dayMatch = false;
                    var cleanSchedule = club.schedule.replace(/요일/g, "");
                    if (cleanSchedule.includes("매일")) dayMatch = true;
                    else {{ for (var i = 0; i < selectedFilters.day.length; i++) {{ if (cleanSchedule.includes(selectedFilters.day[i])) dayMatch = true; }} }}
                }}
                
                // 3. 타겟 필터
                var targetMatch = true;
                if (selectedFilters.target.length > 0) {{
                    targetMatch = false;
                    var hasSpecialFilter = selectedFilters.target.some(t => ["여성전용", "남성전용", "선출가능", "6인제"].includes(t));
                    for (var i = 0; i < selectedFilters.target.length; i++) {{ if (club.target.includes(selectedFilters.target[i])) targetMatch = true; }}
                    if (!hasSpecialFilter && club.target.includes("무관")) targetMatch = true;
                }}
                
                // 4. 검색어 필터
                var keywordMatch = true;
                if (keyword.length > 0) {{ if (!club.name.includes(keyword) && !club.address.includes(keyword)) {{ keywordMatch = false; }} }}

                // [최종 판단]
                if (regionMatch && dayMatch && targetMatch && keywordMatch) {{ 
                    item.isVisible = true; 
                    if (club.is_urgent) {{
                        item.marker.setMap(map); // 긴급은 바로 지도에
                    }} else {{
                        visibleNormalMarkers.push(item.marker); // 일반은 모아서 클러스터러에
                    }}
                }} else {{ 
                    item.isVisible = false; 
                    item.marker.setMap(null); // 지도에서 제거
                    item.overlay.setMap(null); // 라벨도 제거
                }}
            }});
            
            // 일반 마커 일괄 등록
            clusterer.addMarkers(visibleNormalMarkers);
            // 라벨 표시 상태 갱신
            updateLabelVisibility();
        }}

        function toggleFilterSheet() {{
            var sheet = document.getElementById('filterSheet');
            if (sheet.style.transform === "translateY(0px)" || sheet.style.transform === "") {{
                closeFilterSheet();
            }} else {{
                openFilterSheet();
            }}
        }}

        // [복구됨] 내 위치 이동 로직
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
    </script>
</body>
</html>
"""
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"🎉 지도({html_file}) 생성 완료!")

if __name__ == "__main__":
    update_map()