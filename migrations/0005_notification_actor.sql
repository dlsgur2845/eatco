-- 알림을 "누가" 만들었는지.
--
-- notification_logs 는 family_id 스코프뿐이라 작성자를 구분할 수 없었다.
-- 그래서 내가 올린 식단·내가 쓴 댓글이 내 알림 숫자를 올렸다.
--
-- NULL 은 사람이 만든 게 아니라는 뜻이다 (cron 의 소비기한 알림).
-- 그건 가족 전원에게 세어야 한다.
ALTER TABLE notification_logs ADD COLUMN actor_id TEXT;

-- 배지 쿼리가 (가족, 읽음, 작성자) 를 같이 본다.
CREATE INDEX ix_notification_logs_unread
  ON notification_logs(family_id, is_read, actor_id);
