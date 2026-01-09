import csv
import json
import requests
import os
import math
import io

# ==========================================
# [설정] 사용자 정보 및 키 값
# ==========================================
# 1. 구글 시트 CSV 링크
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTvPWY_U5hM-YkZIHnfsO4WgqpCmmP0uSraojWi58SsqXCUEdzRF2R55DASVA5882JusD8BMa9gNaTe/pub?gid=97006888&single=true&output=csv"

# 2. 카카오 API 키
KAKAO_REST_KEY = "9d17b379d6a4de94c06563a990609336" 
KAKAO_JS_KEY = "69f821ba943db5e3532ac90ea5ca1080" 

# 3. 테스트 모드 (True면 test_new.html 생성)
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
            
            # J열(9), K열(10) 읽기
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

    # Jittering (좌표 겹침 방지)
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

    # [복구됨] 지도 중심 찾기 로직 (GVT 기준)
    center_lat, center_lng = 37.5665, 126.9780 
    for club in final_list:
        if "GVT" in club['name']:
            center_lat, center_lng = club['lat'], club['lng']
            break
    
    # HTML 생성
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
        :root {{ --white: #fff; --brand-color: #fac710; --urgent-color: #ff4757; }}
        
        .search-container {{ position: absolute; top: 15px; left: 15px; right: 15px; z-index: 20; display: flex; background: white; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); height: 48px; align-items: center; padding: 0 5px; }}
        .search-icon-box {{ width: 40px; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #888; }}
        .main-search-input {{ flex: 1; border: none; outline: none; font-size: 15px; height: 100%; background: transparent; }}
        .filter-btn-icon {{ width: 48px; height: 100%; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; }}
        .filter-badge {{ position: absolute; top: 12px; right: 10px; width: 8px; height: 8px; background: #fac710; border-radius: 50%; display: none; }}
        .filter-badge.active {{ display: block; }}
        
        .fab-group {{ position: absolute; bottom: 30px; right: 15px; z-index: 20; display: flex; flex-direction: column; gap: 12px; }}
        .fab-btn {{ width: 48px; height: 48px; background: white; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.1); display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 20px; text-decoration: none; color: #333; }}
        
        .label {{ padding: 6px 12px; background-color: #fff; border-radius: 20px; font-size: 12px; font-weight: 800; color: #333; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 1px solid rgba(0,0,0,0.1); white-space: nowrap; cursor: pointer; }}
        .label:hover {{ z-index: 10000 !important; transform: translateY(-42px) scale(1.05); }}
        
        .label.urgent {{ background-color: var(--urgent-color); color: #fff; border: 2px solid #fff; animation: pulse 1.5s infinite; }}
        @keyframes pulse {{ 0% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }} 70% {{ box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }} 100% {{ box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }} }}

        .bottom-sheet {{ position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; z-index: 200; border-top-left-radius: 24px; border-top-right-radius: 24px; box-shadow: 0 -5px 25px rgba(0,0,0,0.1); padding: 20px 24px 50px 24px; transform: translateY(120%); transition: transform 0.3s; }}
        .urgent-banner {{ margin-bottom: 15px; padding: 12px; background: #fff5f5; border: 1px solid #ff8787; border-radius: 12px; color: #c92a2a; font-size: 14px; font-weight: 700; display: none; }}
        
        .filter-sheet {{ position: fixed; top: 0; left: 0; width: 100%; background: #fff; z-index: 300; padding: 20px; transform: translateY(-100%); transition: transform 0.3s; }}
        .filter-sheet.active {{ transform: translateY(0); }}
        .btn {{ padding: 10px; background: #eee; cursor: pointer; border-radius: 8px; text-align: center; margin-top: 10px; }}
    </style>
</head>
<body>
    <div id="map"></div>
    
    <div class="search-container">
        <div class="search-icon-box">🔎</div>
        <input type="text" id="topSearchInput" class="main-search-input" placeholder="검색..." onkeyup="applyFilters()">
        <div class="filter-btn-icon" onclick="toggleFilterSheet()">⚙️<div id="filterBadge" class="filter-badge"></div></div>
    </div>

    <div class="fab-group">
        <div class="fab-btn" onclick="location.reload()">🔄</div>
        <div class="fab-btn" onclick="moveToMyLocation()">📍</div>
    </div>

    <div id="filterSheet" class="filter-sheet">
        <h3>필터 (구현 생략)</h3>
        <div class="btn" onclick="toggleFilterSheet()">닫기</div>
    </div>

    <div id="bottomSheet" class="bottom-sheet">
        <div id="urgentArea" class="urgent-banner"></div>
        <h2 id="sheetTitle">팀 이름</h2>
        <p id="sheetInfo">정보</p>
        <div class="btn" onclick="closeBottomSheet()">닫기</div>
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
            var content = '<div class="' + labelClass + '" onclick="openDetail(' + club.id + ')">' + club.name + '</div>';
            var customOverlay = new kakao.maps.CustomOverlay({{ position: latlng, content: content, yAnchor: 1 }});
            
            if (club.is_urgent) {{ customOverlay.setMap(map); }}

            kakao.maps.event.addListener(marker, 'click', function() {{ openDetail(club.id); }});
            
            if (!club.is_urgent) markers.push(marker); 
        }});

        clusterer.addMarkers(markers);

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
        }}

        function closeBottomSheet() {{
            document.getElementById('bottomSheet').style.transform = "translateY(120%)";
        }}
        
        function toggleFilterSheet() {{
            var sheet = document.getElementById('filterSheet');
            sheet.classList.toggle('active');
        }}
        
        function applyFilters() {{
            // 필터 로직
        }}

        function moveToMyLocation() {{
            // 내 위치 로직
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