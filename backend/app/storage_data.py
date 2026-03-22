"""로컬 보관기한 참조 데이터 (USDA FoodKeeper 기반 + 한국 식재료).

인터넷 없이 동작하도록 앱 내부에 보관.
refrigerated_days / frozen_days / room_temp_days (None = 보관 비권장)

USDA FoodKeeper 650+ 항목 + 한국 식재료 확장.
keywords: 검색 시 매칭에 사용되는 키워드 목록 (한국어 + 영어).
"""

STORAGE_GUIDES: list[dict] = [
    # ═══════════════════════════════════════
    # 유제품 (Dairy & Eggs)
    # ═══════════════════════════════════════
    {"keyword": "우유", "keywords": ["우유", "milk", "흰우유", "저지방우유"], "refrigerated_days": 7, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "두유", "keywords": ["두유", "soy milk", "소이밀크"], "refrigerated_days": 10, "frozen_days": None, "room_temp_days": None},
    {"keyword": "아몬드밀크", "keywords": ["아몬드밀크", "아몬드 우유", "almond milk"], "refrigerated_days": 10, "frozen_days": None, "room_temp_days": None},
    {"keyword": "코코넛밀크", "keywords": ["코코넛밀크", "코코넛 우유", "coconut milk"], "refrigerated_days": 10, "frozen_days": None, "room_temp_days": None},
    {"keyword": "귀리우유", "keywords": ["귀리우유", "오트밀크", "rice milk", "귀리 우유"], "refrigerated_days": 10, "frozen_days": None, "room_temp_days": None},
    {"keyword": "분유", "keywords": ["분유", "powdered milk"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 1825},
    {"keyword": "버터", "keywords": ["버터", "butter"], "refrigerated_days": 60, "frozen_days": 270, "room_temp_days": 2},
    {"keyword": "기버터", "keywords": ["기버터", "기", "ghee", "정제버터", "클래리파이드 버터"], "refrigerated_days": 730, "frozen_days": None, "room_temp_days": 240},
    {"keyword": "마가린", "keywords": ["마가린", "margarine"], "refrigerated_days": 180, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "버터밀크", "keywords": ["버터밀크", "buttermilk"], "refrigerated_days": 14, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "체다치즈", "keywords": ["체다치즈", "체다", "cheddar", "하드치즈", "스위스치즈"], "refrigerated_days": 180, "frozen_days": 180, "room_temp_days": None},
    {"keyword": "모짜렐라", "keywords": ["모짜렐라", "mozzarella", "슈레드치즈", "피자치즈"], "refrigerated_days": 30, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "파마산", "keywords": ["파마산", "파르메산", "parmesan"], "refrigerated_days": 365, "frozen_days": None, "room_temp_days": None},
    {"keyword": "브리치즈", "keywords": ["브리", "brie", "소프트치즈", "고트치즈", "염소치즈"], "refrigerated_days": 14, "frozen_days": 180, "room_temp_days": None},
    {"keyword": "크림치즈", "keywords": ["크림치즈", "cream cheese", "필라델피아"], "refrigerated_days": 14, "frozen_days": None, "room_temp_days": None},
    {"keyword": "치즈", "keywords": ["치즈", "cheese"], "refrigerated_days": 30, "frozen_days": 180, "room_temp_days": None},
    {"keyword": "코티지치즈", "keywords": ["코티지치즈", "cottage cheese"], "refrigerated_days": 14, "frozen_days": None, "room_temp_days": None},
    {"keyword": "리코타", "keywords": ["리코타", "ricotta"], "refrigerated_days": 14, "frozen_days": None, "room_temp_days": None},
    {"keyword": "스트링치즈", "keywords": ["스트링치즈", "string cheese"], "refrigerated_days": 150, "frozen_days": None, "room_temp_days": None},
    {"keyword": "나초치즈", "keywords": ["나초치즈", "nacho cheese"], "refrigerated_days": 14, "frozen_days": 90, "room_temp_days": 730},
    {"keyword": "생크림", "keywords": ["생크림", "heavy cream", "크림", "휘핑크림"], "refrigerated_days": 10, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "하프앤하프", "keywords": ["하프앤하프", "half and half", "라이트크림"], "refrigerated_days": 4, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "사워크림", "keywords": ["사워크림", "sour cream"], "refrigerated_days": 14, "frozen_days": None, "room_temp_days": None},
    {"keyword": "커피크림", "keywords": ["커피크림", "coffee creamer", "프림"], "refrigerated_days": 21, "frozen_days": None, "room_temp_days": None},
    {"keyword": "달걀", "keywords": ["달걀", "계란", "egg", "eggs"], "refrigerated_days": 35, "frozen_days": None, "room_temp_days": None},
    {"keyword": "삶은달걀", "keywords": ["삶은달걀", "삶은계란", "완숙", "반숙", "hard boiled egg"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": None},
    {"keyword": "달걀흰자", "keywords": ["달걀흰자", "계란흰자", "흰자", "egg whites"], "refrigerated_days": 4, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "에그노그", "keywords": ["에그노그", "eggnog"], "refrigerated_days": 5, "frozen_days": 180, "room_temp_days": None},
    {"keyword": "요거트", "keywords": ["요거트", "요구르트", "yogurt", "그릭요거트"], "refrigerated_days": 14, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "케피어", "keywords": ["케피어", "kefir"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": None},
    {"keyword": "푸딩", "keywords": ["푸딩", "pudding", "커스터드"], "refrigerated_days": 2, "frozen_days": None, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 육류 (Meat)
    # ═══════════════════════════════════════
    # 소고기
    {"keyword": "소고기", "keywords": ["소고기", "beef", "한우", "쇠고기"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "소등심", "keywords": ["소등심", "등심", "beef tenderloin", "안심", "소안심"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "소갈비", "keywords": ["소갈비", "갈비", "beef ribs", "LA갈비", "꽃갈비"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "스테이크", "keywords": ["스테이크", "steak", "beef steak", "채끝", "립아이", "티본"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "소불고기", "keywords": ["불고기", "소불고기", "bulgogi"], "refrigerated_days": 3, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "소다짐육", "keywords": ["소다짐육", "다짐육", "간 소고기", "ground beef", "다진고기", "민스"], "refrigerated_days": 2, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "사태", "keywords": ["사태", "양지", "차돌박이", "차돌", "우삼겹"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    # 돼지고기
    {"keyword": "돼지고기", "keywords": ["돼지고기", "pork", "돈육"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "삼겹살", "keywords": ["삼겹살", "pork belly", "오겹살"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "돼지등심", "keywords": ["돼지등심", "돈까스용", "돈가스", "pork loin"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "돼지갈비", "keywords": ["돼지갈비", "돼지 갈비", "pork ribs"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "돼지목살", "keywords": ["목살", "돼지목살", "제주 흑돼지"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "돼지앞다리", "keywords": ["앞다리", "돼지앞다리", "뒷다리", "pork shoulder"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "돼지다짐육", "keywords": ["돼지다짐육", "돼지 다짐", "ground pork"], "refrigerated_days": 2, "frozen_days": 120, "room_temp_days": None},
    # 양고기
    {"keyword": "양고기", "keywords": ["양고기", "lamb", "양갈비", "램"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "양다짐육", "keywords": ["양다짐육", "ground lamb"], "refrigerated_days": 2, "frozen_days": 120, "room_temp_days": None},
    # 송아지
    {"keyword": "송아지고기", "keywords": ["송아지고기", "veal"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    # 염소
    {"keyword": "염소고기", "keywords": ["염소고기", "goat"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    # 사슴
    {"keyword": "사슴고기", "keywords": ["사슴고기", "venison"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": None},
    # 토끼
    {"keyword": "토끼고기", "keywords": ["토끼고기", "rabbit"], "refrigerated_days": 2, "frozen_days": 270, "room_temp_days": None},
    # 들소
    {"keyword": "들소고기", "keywords": ["들소고기", "bison", "바이슨"], "refrigerated_days": 5, "frozen_days": 270, "room_temp_days": None},
    # 내장
    {"keyword": "내장", "keywords": ["내장", "간", "곱창", "대창", "소간", "liver", "tongue", "혀"], "refrigerated_days": 2, "frozen_days": 120, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 가금류 (Poultry)
    # ═══════════════════════════════════════
    {"keyword": "닭고기", "keywords": ["닭고기", "chicken", "닭", "치킨", "닭가슴살", "닭다리", "닭봉", "닭날개"], "refrigerated_days": 2, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "닭다짐육", "keywords": ["닭다짐육", "닭 다짐", "ground chicken", "다진 닭고기"], "refrigerated_days": 2, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "오리고기", "keywords": ["오리고기", "duck", "오리", "훈제오리"], "refrigerated_days": 2, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "칠면조", "keywords": ["칠면조", "turkey", "터키"], "refrigerated_days": 2, "frozen_days": 365, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 가공육 (Processed Meat)
    # ═══════════════════════════════════════
    {"keyword": "베이컨", "keywords": ["베이컨", "bacon"], "refrigerated_days": 7, "frozen_days": 30, "room_temp_days": None},
    {"keyword": "햄", "keywords": ["햄", "ham"], "refrigerated_days": 7, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "핫도그", "keywords": ["핫도그", "hot dog", "소세지", "프랑크"], "refrigerated_days": 14, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "소시지", "keywords": ["소시지", "sausage", "비엔나소시지"], "refrigerated_days": 7, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "살라미", "keywords": ["살라미", "salami", "페퍼로니", "pepperoni"], "refrigerated_days": 21, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "육포", "keywords": ["육포", "jerky", "쇠고기 육포"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "프로슈토", "keywords": ["프로슈토", "prosciutto", "하몽"], "refrigerated_days": 90, "frozen_days": 30, "room_temp_days": None},
    {"keyword": "파스트라미", "keywords": ["파스트라미", "pastrami"], "refrigerated_days": 40, "frozen_days": None, "room_temp_days": None},
    {"keyword": "초리조", "keywords": ["초리조", "chorizo"], "refrigerated_days": 7, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "브라트부어스트", "keywords": ["브라트부어스트", "bratwurst"], "refrigerated_days": 3, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "런천미트", "keywords": ["런천미트", "런치미트", "luncheon meat", "델리미트", "스팸"], "refrigerated_days": 14, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "통조림햄", "keywords": ["통조림햄", "canned ham", "스팸"], "refrigerated_days": 270, "frozen_days": None, "room_temp_days": None},
    {"keyword": "파테", "keywords": ["파테", "pate", "간파테"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 수산물 - 생선 (Fresh Fish)
    # ═══════════════════════════════════════
    {"keyword": "흰살생선", "keywords": ["흰살생선", "대구", "광어", "넙치", "가자미", "cod", "flounder", "halibut", "sole", "haddock"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "대구", "keywords": ["대구", "cod", "동태"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "광어", "keywords": ["광어", "넙치", "flatfish", "flounder", "halibut"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "가자미", "keywords": ["가자미", "sole", "서대"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "도미", "keywords": ["도미", "참돔", "sea bream", "snapper"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "농어", "keywords": ["농어", "sea bass", "배스"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "등푸른생선", "keywords": ["등푸른생선", "fatty fish", "고등어", "참치", "연어", "mackerel", "tuna", "salmon"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "고등어", "keywords": ["고등어", "mackerel", "간고등어", "자반고등어"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "참치", "keywords": ["참치", "tuna", "다랑어", "참다랑어"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "연어", "keywords": ["연어", "salmon", "훈제연어"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "삼치", "keywords": ["삼치", "spanish mackerel"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "꽁치", "keywords": ["꽁치", "saury", "pacific saury"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "갈치", "keywords": ["갈치", "cutlassfish", "hairtail", "은갈치"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "청어", "keywords": ["청어", "herring", "과메기"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "정어리", "keywords": ["정어리", "sardine"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "멸치", "keywords": ["멸치", "anchovy", "마른멸치", "생멸치"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": 180},
    {"keyword": "방어", "keywords": ["방어", "yellowtail", "부시리"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "장어", "keywords": ["장어", "eel", "민물장어", "바다장어", "붕장어"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "메기", "keywords": ["메기", "catfish"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "송어", "keywords": ["송어", "trout", "무지개송어"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "조기", "keywords": ["조기", "croaker", "굴비", "참조기"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "우럭", "keywords": ["우럭", "rockfish", "볼락"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "아귀", "keywords": ["아귀", "monkfish", "anglerfish"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "명태", "keywords": ["명태", "pollock", "동태", "황태", "생태", "북어"], "refrigerated_days": 2, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "캐비어", "keywords": ["캐비어", "caviar", "날치알", "어란", "연어알"], "refrigerated_days": 28, "frozen_days": None, "room_temp_days": None},
    {"keyword": "익힌생선", "keywords": ["익힌생선", "조리된 생선", "cooked fish", "구운생선", "생선구이"], "refrigerated_days": 4, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "생선", "keywords": ["생선", "fish", "물고기"], "refrigerated_days": 2, "frozen_days": 180, "room_temp_days": None},
    # 훈제 생선
    {"keyword": "훈제생선", "keywords": ["훈제생선", "smoked fish", "훈제연어", "훈제고등어"], "refrigerated_days": 30, "frozen_days": 365, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 수산물 - 갑각류/조개 (Shellfish)
    # ═══════════════════════════════════════
    {"keyword": "새우", "keywords": ["새우", "shrimp", "대하", "왕새우", "꽃새우", "건새우"], "refrigerated_days": 3, "frozen_days": 540, "room_temp_days": None},
    {"keyword": "가재", "keywords": ["가재", "crayfish", "랍스터", "lobster", "바닷가재"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "게", "keywords": ["게", "crab", "킹크랩", "대게", "꽃게", "홍게", "snow crab", "dungeness"], "refrigerated_days": 3, "frozen_days": 120, "room_temp_days": None},
    {"keyword": "게다리살", "keywords": ["게다리살", "crab legs", "게살", "게맛살"], "refrigerated_days": 4, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "오징어", "keywords": ["오징어", "squid", "한치", "갑오징어"], "refrigerated_days": 3, "frozen_days": 540, "room_temp_days": None},
    {"keyword": "문어", "keywords": ["문어", "octopus", "낙지", "주꾸미"], "refrigerated_days": 3, "frozen_days": 540, "room_temp_days": None},
    {"keyword": "가리비", "keywords": ["가리비", "scallop", "관자"], "refrigerated_days": 3, "frozen_days": 540, "room_temp_days": None},
    {"keyword": "조개", "keywords": ["조개", "clam", "바지락", "모시조개", "대합", "재첩"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "홍합", "keywords": ["홍합", "mussel", "담치"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "굴", "keywords": ["굴", "oyster", "석화", "생굴"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "전복", "keywords": ["전복", "abalone"], "refrigerated_days": 3, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "해삼", "keywords": ["해삼", "sea cucumber"], "refrigerated_days": 3, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "성게", "keywords": ["성게", "sea urchin", "uni", "성게알"], "refrigerated_days": 2, "frozen_days": 30, "room_temp_days": None},
    {"keyword": "맛조개", "keywords": ["맛조개", "razor clam"], "refrigerated_days": 2, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "조리된해산물", "keywords": ["조리된 해산물", "익힌 새우", "cooked shellfish", "조리된 조개"], "refrigerated_days": 4, "frozen_days": 90, "room_temp_days": None},
    {"keyword": "수리미", "keywords": ["수리미", "surimi", "게맛살", "맛살"], "refrigerated_days": 3, "frozen_days": 270, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 채소 (Vegetables)
    # ═══════════════════════════════════════
    {"keyword": "양배추", "keywords": ["양배추", "cabbage", "적양배추"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "배추", "keywords": ["배추", "napa cabbage", "알배추", "절임배추"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "시금치", "keywords": ["시금치", "spinach", "근대"], "refrigerated_days": 5, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "상추", "keywords": ["상추", "lettuce", "로메인", "양상추", "적상추"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": 1},
    {"keyword": "당근", "keywords": ["당근", "carrot", "미니당근"], "refrigerated_days": 21, "frozen_days": 300, "room_temp_days": 5},
    {"keyword": "브로콜리", "keywords": ["브로콜리", "broccoli"], "refrigerated_days": 5, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "콜리플라워", "keywords": ["콜리플라워", "cauliflower", "꽃양배추"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "파프리카", "keywords": ["파프리카", "bell pepper", "피망"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "고추", "keywords": ["고추", "pepper", "청양고추", "풋고추", "홍고추", "할라피뇨"], "refrigerated_days": 14, "frozen_days": 365, "room_temp_days": 5},
    {"keyword": "오이", "keywords": ["오이", "cucumber", "미니오이"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": 2},
    {"keyword": "토마토", "keywords": ["토마토", "tomato", "방울토마토", "대추토마토"], "refrigerated_days": 7, "frozen_days": 60, "room_temp_days": 5},
    {"keyword": "감자", "keywords": ["감자", "potato", "알감자"], "refrigerated_days": None, "frozen_days": 365, "room_temp_days": 30},
    {"keyword": "고구마", "keywords": ["고구마", "sweet potato", "밤고구마", "꿀고구마", "호박고구마"], "refrigerated_days": None, "frozen_days": 365, "room_temp_days": 30},
    {"keyword": "양파", "keywords": ["양파", "onion", "자색양파"], "refrigerated_days": 60, "frozen_days": 240, "room_temp_days": 30},
    {"keyword": "마늘", "keywords": ["마늘", "garlic", "깐마늘", "다진마늘"], "refrigerated_days": 120, "frozen_days": 365, "room_temp_days": 30},
    {"keyword": "대파", "keywords": ["대파", "green onion", "파", "쪽파"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "부추", "keywords": ["부추", "chive", "부추잎"], "refrigerated_days": 5, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "셀러리", "keywords": ["셀러리", "celery"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "아스파라거스", "keywords": ["아스파라거스", "asparagus"], "refrigerated_days": 5, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "애호박", "keywords": ["애호박", "호박", "zucchini", "주키니"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "단호박", "keywords": ["단호박", "butternut squash", "늙은호박", "밤호박"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 30},
    {"keyword": "가지", "keywords": ["가지", "eggplant"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 2},
    {"keyword": "옥수수", "keywords": ["옥수수", "corn", "찰옥수수"], "refrigerated_days": 3, "frozen_days": 300, "room_temp_days": 1},
    {"keyword": "무", "keywords": ["무", "radish", "무우", "열무", "총각무"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 5},
    {"keyword": "연근", "keywords": ["연근", "lotus root"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "우엉", "keywords": ["우엉", "burdock"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "생강", "keywords": ["생강", "ginger", "편생강"], "refrigerated_days": 21, "frozen_days": 180, "room_temp_days": 7},
    {"keyword": "콩나물", "keywords": ["콩나물", "bean sprout", "숙주나물", "숙주"], "refrigerated_days": 3, "frozen_days": None, "room_temp_days": None},
    {"keyword": "미나리", "keywords": ["미나리", "water parsley", "water dropwort"], "refrigerated_days": 5, "frozen_days": None, "room_temp_days": None},
    {"keyword": "깻잎", "keywords": ["깻잎", "perilla leaf", "들깻잎"], "refrigerated_days": 7, "frozen_days": 60, "room_temp_days": None},
    {"keyword": "케일", "keywords": ["케일", "kale"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "비트", "keywords": ["비트", "beet", "비트루트"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 5},
    {"keyword": "순무", "keywords": ["순무", "turnip"], "refrigerated_days": 14, "frozen_days": 300, "room_temp_days": 3},
    {"keyword": "고춧잎", "keywords": ["고춧잎", "pepper leaf"], "refrigerated_days": 5, "frozen_days": None, "room_temp_days": None},
    {"keyword": "두릅", "keywords": ["두릅", "aralia sprout"], "refrigerated_days": 3, "frozen_days": None, "room_temp_days": None},
    {"keyword": "취나물", "keywords": ["취나물", "chwi namul", "참취"], "refrigerated_days": 5, "frozen_days": None, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 버섯 (Mushrooms)
    # ═══════════════════════════════════════
    {"keyword": "버섯", "keywords": ["버섯", "mushroom", "양송이", "느타리", "표고", "팽이", "새송이", "송이"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 1},
    {"keyword": "표고버섯", "keywords": ["표고버섯", "표고", "shiitake", "건표고"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 1},
    {"keyword": "팽이버섯", "keywords": ["팽이버섯", "팽이", "enoki"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": None},
    {"keyword": "새송이버섯", "keywords": ["새송이버섯", "새송이", "king oyster mushroom"], "refrigerated_days": 7, "frozen_days": 300, "room_temp_days": 2},

    # ═══════════════════════════════════════
    # 과일 (Fruits)
    # ═══════════════════════════════════════
    {"keyword": "사과", "keywords": ["사과", "apple", "부사", "홍로"], "refrigerated_days": 30, "frozen_days": 240, "room_temp_days": 7},
    {"keyword": "배", "keywords": ["배", "pear", "신고배", "한라봉"], "refrigerated_days": 21, "frozen_days": 240, "room_temp_days": 5},
    {"keyword": "바나나", "keywords": ["바나나", "banana"], "refrigerated_days": 5, "frozen_days": 180, "room_temp_days": 5},
    {"keyword": "딸기", "keywords": ["딸기", "strawberry", "설향딸기"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": 1},
    {"keyword": "블루베리", "keywords": ["블루베리", "blueberry"], "refrigerated_days": 10, "frozen_days": 365, "room_temp_days": 2},
    {"keyword": "포도", "keywords": ["포도", "grape", "거봉", "샤인머스켓", "캠벨"], "refrigerated_days": 7, "frozen_days": 365, "room_temp_days": 2},
    {"keyword": "복숭아", "keywords": ["복숭아", "peach", "천도복숭아", "황도"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": 3},
    {"keyword": "자두", "keywords": ["자두", "plum"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": 3},
    {"keyword": "체리", "keywords": ["체리", "cherry"], "refrigerated_days": 7, "frozen_days": 365, "room_temp_days": 2},
    {"keyword": "오렌지", "keywords": ["오렌지", "orange", "네이블"], "refrigerated_days": 21, "frozen_days": 120, "room_temp_days": 7},
    {"keyword": "귤", "keywords": ["귤", "tangerine", "감귤", "한라봉", "천혜향", "레드향"], "refrigerated_days": 14, "frozen_days": 120, "room_temp_days": 5},
    {"keyword": "레몬", "keywords": ["레몬", "lemon", "라임", "lime"], "refrigerated_days": 30, "frozen_days": 120, "room_temp_days": 7},
    {"keyword": "자몽", "keywords": ["자몽", "grapefruit"], "refrigerated_days": 21, "frozen_days": 120, "room_temp_days": 7},
    {"keyword": "수박", "keywords": ["수박", "watermelon"], "refrigerated_days": 5, "frozen_days": 30, "room_temp_days": 7},
    {"keyword": "참외", "keywords": ["참외", "korean melon"], "refrigerated_days": 7, "frozen_days": None, "room_temp_days": 3},
    {"keyword": "멜론", "keywords": ["멜론", "melon", "캔탈로프", "허니듀", "cantaloupe"], "refrigerated_days": 5, "frozen_days": 30, "room_temp_days": 5},
    {"keyword": "파인애플", "keywords": ["파인애플", "pineapple"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": 3},
    {"keyword": "망고", "keywords": ["망고", "mango"], "refrigerated_days": 5, "frozen_days": 365, "room_temp_days": 3},
    {"keyword": "키위", "keywords": ["키위", "kiwi", "골드키위", "그린키위"], "refrigerated_days": 14, "frozen_days": 365, "room_temp_days": 5},
    {"keyword": "아보카도", "keywords": ["아보카도", "avocado"], "refrigerated_days": 5, "frozen_days": 120, "room_temp_days": 5},
    {"keyword": "감", "keywords": ["감", "persimmon", "곶감", "단감", "홍시"], "refrigerated_days": 7, "frozen_days": 365, "room_temp_days": 3},
    {"keyword": "석류", "keywords": ["석류", "pomegranate"], "refrigerated_days": 60, "frozen_days": 365, "room_temp_days": 7},
    {"keyword": "무화과", "keywords": ["무화과", "fig"], "refrigerated_days": 3, "frozen_days": 365, "room_temp_days": 1},
    {"keyword": "대추", "keywords": ["대추", "jujube", "건대추"], "refrigerated_days": 30, "frozen_days": 365, "room_temp_days": 14},
    {"keyword": "라즈베리", "keywords": ["라즈베리", "raspberry", "산딸기"], "refrigerated_days": 3, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "크랜베리", "keywords": ["크랜베리", "cranberry"], "refrigerated_days": 30, "frozen_days": 365, "room_temp_days": 14},

    # ═══════════════════════════════════════
    # 두부/콩 제품
    # ═══════════════════════════════════════
    {"keyword": "두부", "keywords": ["두부", "tofu", "순두부", "연두부", "부침두부"], "refrigerated_days": 5, "frozen_days": 150, "room_temp_days": None},
    {"keyword": "유부", "keywords": ["유부", "fried tofu", "유부초밥"], "refrigerated_days": 7, "frozen_days": 180, "room_temp_days": None},

    # ═══════════════════════════════════════
    # 한국 전통 식품
    # ═══════════════════════════════════════
    {"keyword": "김치", "keywords": ["김치", "kimchi", "배추김치", "깍두기", "총각김치", "열무김치", "파김치"], "refrigerated_days": 90, "frozen_days": 365, "room_temp_days": 7},
    {"keyword": "된장", "keywords": ["된장", "doenjang", "soybean paste"], "refrigerated_days": 365, "frozen_days": None, "room_temp_days": 90},
    {"keyword": "고추장", "keywords": ["고추장", "gochujang", "red pepper paste"], "refrigerated_days": 365, "frozen_days": None, "room_temp_days": 90},
    {"keyword": "간장", "keywords": ["간장", "soy sauce", "양조간장", "진간장", "국간장"], "refrigerated_days": 730, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "쌈장", "keywords": ["쌈장", "ssamjang"], "refrigerated_days": 90, "frozen_days": None, "room_temp_days": None},
    {"keyword": "젓갈", "keywords": ["젓갈", "salted seafood", "새우젓", "멸치액젓", "까나리액젓"], "refrigerated_days": 365, "frozen_days": None, "room_temp_days": 90},
    {"keyword": "떡", "keywords": ["떡", "rice cake", "가래떡", "떡국떡", "인절미", "송편"], "refrigerated_days": 3, "frozen_days": 180, "room_temp_days": 1},

    # ═══════════════════════════════════════
    # 곡물/면/빵 (Grains, Pasta, Bread)
    # ═══════════════════════════════════════
    {"keyword": "쌀", "keywords": ["쌀", "rice", "백미", "현미", "찹쌀", "잡곡"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "밥", "keywords": ["밥", "cooked rice", "잡곡밥", "현미밥"], "refrigerated_days": 5, "frozen_days": 180, "room_temp_days": None},
    {"keyword": "식빵", "keywords": ["식빵", "bread", "통밀빵", "호밀빵", "모닝빵"], "refrigerated_days": 14, "frozen_days": 90, "room_temp_days": 5},
    {"keyword": "베이글", "keywords": ["베이글", "bagel"], "refrigerated_days": 7, "frozen_days": 90, "room_temp_days": 3},
    {"keyword": "크로와상", "keywords": ["크로와상", "croissant"], "refrigerated_days": 7, "frozen_days": 90, "room_temp_days": 2},
    {"keyword": "면", "keywords": ["면", "noodle", "라면", "파스타", "pasta", "국수", "소면", "우동"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "생면", "keywords": ["생면", "fresh noodle", "생파스타", "수제비 반죽"], "refrigerated_days": 3, "frozen_days": 240, "room_temp_days": None},
    {"keyword": "또띠아", "keywords": ["또띠아", "tortilla", "토르티야"], "refrigerated_days": 14, "frozen_days": 240, "room_temp_days": 7},
    {"keyword": "시리얼", "keywords": ["시리얼", "cereal", "오트밀", "그래놀라"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 180},
    {"keyword": "밀가루", "keywords": ["밀가루", "flour", "박력분", "중력분", "강력분"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 240},

    # ═══════════════════════════════════════
    # 조미료/소스 (Condiments)
    # ═══════════════════════════════════════
    {"keyword": "케첩", "keywords": ["케첩", "ketchup", "토마토소스"], "refrigerated_days": 180, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "마요네즈", "keywords": ["마요네즈", "mayonnaise", "마요"], "refrigerated_days": 60, "frozen_days": None, "room_temp_days": None},
    {"keyword": "머스타드", "keywords": ["머스타드", "mustard", "겨자"], "refrigerated_days": 365, "frozen_days": None, "room_temp_days": 30},
    {"keyword": "식초", "keywords": ["식초", "vinegar", "사과식초", "현미식초"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 730},
    {"keyword": "올리브오일", "keywords": ["올리브오일", "olive oil", "올리브유", "식용유", "참기름", "들기름"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "드레싱", "keywords": ["드레싱", "dressing", "샐러드 드레싱"], "refrigerated_days": 90, "frozen_days": None, "room_temp_days": None},
    {"keyword": "잼", "keywords": ["잼", "jam", "마멀레이드", "과일잼", "딸기잼"], "refrigerated_days": 90, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "꿀", "keywords": ["꿀", "honey"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 730},
    {"keyword": "설탕", "keywords": ["설탕", "sugar", "흑설탕", "황설탕"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 730},
    {"keyword": "소금", "keywords": ["소금", "salt", "천일염", "꽃소금"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 1825},
    {"keyword": "후추", "keywords": ["후추", "pepper", "통후추", "흑후추", "백후추"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 1095},

    # ═══════════════════════════════════════
    # 통조림/가공식품 (Canned/Processed)
    # ═══════════════════════════════════════
    {"keyword": "참치캔", "keywords": ["참치캔", "참치 통조림", "canned tuna", "동원참치"], "refrigerated_days": 4, "frozen_days": None, "room_temp_days": 1825},
    {"keyword": "통조림", "keywords": ["통조림", "canned food", "콘통조림", "골뱅이 통조림"], "refrigerated_days": 4, "frozen_days": None, "room_temp_days": 1825},
    {"keyword": "냉동식품", "keywords": ["냉동식품", "frozen food", "냉동만두", "냉동피자", "냉동볶음밥"], "refrigerated_days": None, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "라면", "keywords": ["라면", "ramen", "instant noodle", "컵라면"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 240},

    # ═══════════════════════════════════════
    # 음료 (Beverages)
    # ═══════════════════════════════════════
    {"keyword": "주스", "keywords": ["주스", "juice", "오렌지주스", "사과주스", "과즙"], "refrigerated_days": 10, "frozen_days": 365, "room_temp_days": None},
    {"keyword": "탄산음료", "keywords": ["탄산음료", "soda", "콜라", "사이다", "탄산수"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 270},
    {"keyword": "커피", "keywords": ["커피", "coffee", "원두커피", "커피 원두"], "refrigerated_days": None, "frozen_days": 365, "room_temp_days": 180},

    # ═══════════════════════════════════════
    # 견과/건조 (Nuts & Dried)
    # ═══════════════════════════════════════
    {"keyword": "견과류", "keywords": ["견과류", "nuts", "아몬드", "호두", "캐슈넛", "피스타치오", "땅콩", "잣", "마카다미아", "피칸"], "refrigerated_days": 180, "frozen_days": 365, "room_temp_days": 90},
    {"keyword": "건포도", "keywords": ["건포도", "raisin", "건과일", "건크랜베리", "건망고"], "refrigerated_days": 180, "frozen_days": 365, "room_temp_days": 180},
    {"keyword": "김", "keywords": ["김", "seaweed", "김밥용 김", "구운김", "조미김", "laver"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
    {"keyword": "미역", "keywords": ["미역", "wakame", "건미역", "다시마", "kelp"], "refrigerated_days": None, "frozen_days": None, "room_temp_days": 365},
]
