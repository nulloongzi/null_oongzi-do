# geocoder.py
import requests
from config import KAKAO_REST_KEY


def get_location(address: str) -> tuple[float | None, float | None]:
    """주소를 카카오 API로 위도/경도로 변환한다."""
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
    except Exception as e:
        print(f"⚠️ 좌표 변환 실패 ({address}): {e}")
        return None, None
