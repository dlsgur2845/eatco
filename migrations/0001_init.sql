-- Eatco D1 스키마 (0001)
-- backend/app/models/*.py 의 SQLAlchemy 정의에서 생성. 손으로 옮기지 않았다.
-- 재생성: backend 에서 CreateTable(t).compile(dialect=sqlite.dialect())
--
-- 주의 — enum 저장 형태가 컬럼마다 다르다. Postgres 데이터를 그대로 옮기려면
-- 반드시 유지해야 한다:
--   storage_method : Enum(StorageMethod)              -> Python enum *이름*  ('REFRIGERATED')
--   unit           : Enum(..., values_callable=value) -> Python enum *값*    ('g')
-- API 계층은 양쪽 다 소문자 값을 쓰고 SQLAlchemy 가 변환해준다. 헷갈리기 쉬운 지점이라
-- Postgres 의 enum 타입이 하던 검증을 CHECK 제약으로 대체한다.

CREATE TABLE categories (
	id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE families (
	id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	invite_code VARCHAR(20) NOT NULL, 
	allow_shared_edit BOOLEAN NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	monthly_budget INTEGER, 
	master_id UUID, 
	PRIMARY KEY (id), 
	UNIQUE (invite_code)
);

CREATE TABLE ingredient_nutrition (
	normalized_name VARCHAR(100) NOT NULL, 
	kcal_per_100g FLOAT, 
	kcal_per_100ml FLOAT, 
	kcal_per_piece FLOAT, 
	source VARCHAR(20) NOT NULL, 
	confidence FLOAT NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (normalized_name)
);

CREATE TABLE storage_guides (
	id UUID NOT NULL, 
	keyword VARCHAR(100) NOT NULL, 
	keywords TEXT NOT NULL, 
	refrigerated_days INTEGER, 
	frozen_days INTEGER, 
	room_temp_days INTEGER, 
	PRIMARY KEY (id)
);

CREATE TABLE usage_events (
	id UUID NOT NULL, 
	family_code VARCHAR(50) NOT NULL, 
	event_type VARCHAR(50) NOT NULL, 
	metadata_json JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE custom_recipes (
	id UUID NOT NULL, 
	family_id UUID NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	category VARCHAR(50) NOT NULL, 
	cooking_method VARCHAR(50) NOT NULL, 
	calories VARCHAR(20), 
	ingredients JSON NOT NULL, 
	manual_steps JSON NOT NULL, 
	tip TEXT, 
	image_url VARCHAR(500), 
	created_by VARCHAR(50), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(family_id) REFERENCES families (id)
);

CREATE TABLE ingredients (
	id UUID NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	category_id UUID, 
	storage_method VARCHAR(12) NOT NULL CHECK (storage_method IN ('REFRIGERATED','FROZEN','ROOM_TEMP')), 
	quantity VARCHAR(50), 
	amount_value FLOAT, 
	unit VARCHAR(5) CHECK (unit IS NULL OR unit IN ('g','ml','piece')), 
	price INTEGER, 
	expiry_date DATE NOT NULL, 
	registered_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	image_url VARCHAR(500), 
	family_id UUID, 
	registered_by VARCHAR(50), 
	store_name VARCHAR(100), 
	normalized_name VARCHAR(100), 
	PRIMARY KEY (id), 
	CONSTRAINT ck_ingredients_amount_nonneg CHECK (amount_value IS NULL OR amount_value >= 0), 
	FOREIGN KEY(category_id) REFERENCES categories (id), 
	FOREIGN KEY(family_id) REFERENCES families (id)
);

CREATE TABLE notification_logs (
	id UUID NOT NULL, 
	family_id UUID NOT NULL, 
	type VARCHAR(12) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	message VARCHAR(500) NOT NULL, 
	is_read BOOLEAN NOT NULL, 
	link VARCHAR(200), 
	days_before INTEGER, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(family_id) REFERENCES families (id)
);

CREATE TABLE notification_settings (
	id UUID NOT NULL, 
	family_id UUID, 
	days_before INTEGER NOT NULL, 
	enabled BOOLEAN NOT NULL, 
	push_time TIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(family_id) REFERENCES families (id)
);

CREATE TABLE users (
	id UUID NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	nickname VARCHAR(50) NOT NULL, 
	hashed_password VARCHAR(255) NOT NULL, 
	family_id UUID, 
	session_token VARCHAR(64), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email), 
	FOREIGN KEY(family_id) REFERENCES families (id)
);

CREATE TABLE cooking_logs (
	id UUID NOT NULL, 
	family_id UUID NOT NULL, 
	recipe_id UUID, 
	recipe_name_snapshot VARCHAR(200) NOT NULL, 
	cooked_by VARCHAR(50), 
	cooked_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	total_kcal FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(family_id) REFERENCES families (id), 
	FOREIGN KEY(recipe_id) REFERENCES custom_recipes (id) ON DELETE SET NULL
);

CREATE TABLE push_subscriptions (
	id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	family_id UUID NOT NULL, 
	endpoint VARCHAR(500) NOT NULL, 
	p256dh VARCHAR(200) NOT NULL, 
	auth VARCHAR(100) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(family_id) REFERENCES families (id), 
	UNIQUE (endpoint)
);

CREATE TABLE cooking_log_items (
	id UUID NOT NULL, 
	cooking_log_id UUID NOT NULL, 
	ingredient_id UUID, 
	ingredient_name_snapshot VARCHAR(200) NOT NULL, 
	amount_used FLOAT NOT NULL, 
	unit VARCHAR(5) NOT NULL CHECK (unit IN ('g','ml','piece')), 
	kcal FLOAT NOT NULL, 
	kcal_per_unit FLOAT, 
	nutrition_source VARCHAR(20), 
	PRIMARY KEY (id), 
	FOREIGN KEY(cooking_log_id) REFERENCES cooking_logs (id) ON DELETE CASCADE, 
	FOREIGN KEY(ingredient_id) REFERENCES ingredients (id) ON DELETE SET NULL
);

CREATE INDEX ix_storage_guides_keyword ON storage_guides (keyword);
CREATE INDEX ix_usage_events_family_code ON usage_events (family_code);
CREATE INDEX ix_ingredients_family_expiry ON ingredients (family_id, expiry_date);
CREATE INDEX ix_ingredients_family_category ON ingredients (family_id, category_id);
CREATE INDEX ix_notification_logs_family_created ON notification_logs (family_id, created_at);
CREATE INDEX ix_notification_logs_family_read ON notification_logs (family_id, is_read);
CREATE INDEX ix_notification_settings_family ON notification_settings (family_id);
CREATE INDEX ix_cooking_logs_family_cooked_at ON cooking_logs (family_id, cooked_at);
CREATE INDEX ix_push_subscriptions_family ON push_subscriptions (family_id);
