-- 탄단지(탄수화물/단백질/지방) 컬럼.
-- 기준 단위는 kcal_per_* 와 동일하다 (100g / 100ml / 낱개 중 그 재료에 해당하는 것).
--
-- 왜 공공 API 가 아니라 AI 추정인가:
-- 식약처 식품영양성분 API 를 쓰려 했으나 계정 키가 해당 서비스에 등록돼 있지 않다
-- (SERVICE_KEY_IS_NOT_REGISTERED_ERROR). 기존 Python 판의 "공공API -> Gemini"
-- 폴백에서 공공 API 는 한 번도 성공한 적이 없고 항상 Gemini 로 떨어졌다.
ALTER TABLE ingredient_nutrition ADD COLUMN carb_g FLOAT;
ALTER TABLE ingredient_nutrition ADD COLUMN protein_g FLOAT;
ALTER TABLE ingredient_nutrition ADD COLUMN fat_g FLOAT;
