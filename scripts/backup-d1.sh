#!/usr/bin/env bash
# D1 백업.
#
# 실행: ./scripts/backup-d1.sh
# 복구: npx wrangler d1 execute eatco --remote --file=backups/<파일>.sql
#
# 읽기 전용이다. 프로덕션에 아무것도 쓰지 않는다.
#
# **Time Travel 이 이걸 대체하지 않는다.** D1 은 무료 플랜에서도 30일 시점 복구를
# 제공하고(`wrangler d1 time-travel info eatco`), 실수한 마이그레이션을 되돌리는
# 데는 그쪽이 더 정확하다. 하지만 Time Travel 은
#   - 30일이 지나면 사라지고
#   - 데이터베이스가 살아 있어야만 쓸 수 있으며 (지워진 DB 는 복구 못 한다)
#   - 계정 접근을 잃으면 같이 잃는다
# 이 덤프는 그 세 경우를 위한 것이다. 계정 밖에 사본이 있다는 게 요점이다.
#
# 주의: 내보내는 동안 D1 이 잠깐 쿼리를 받지 못한다. 사람이 안 쓸 때 돌린다.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/eatco-${STAMP}.sql"
mkdir -p backups

echo "→ 원격 D1 내보내는 중…"
npx wrangler d1 export eatco --remote --output="$OUT"

# 빈 파일이 백업 행세를 하지 않게 확인한다.
if [ ! -s "$OUT" ]; then
  echo "✗ 백업이 비어 있다. 지우고 중단한다." >&2
  rm -f "$OUT"; exit 1
fi

ROWS=$(grep -c '^INSERT INTO' "$OUT" || true)
echo "✓ $OUT ($(du -h "$OUT" | cut -f1), INSERT ${ROWS}줄)"

# 30일 넘은 백업 정리. 최소 3개는 무조건 남긴다 —
# 30일 손 놓고 있다가 돌아왔을 때 백업이 0개면 안 된다.
KEEP=$(ls -1t backups/eatco-*.sql 2>/dev/null | head -3)
for f in $(find backups -name 'eatco-*.sql' -mtime +30 2>/dev/null); do
  echo "$KEEP" | grep -qx "$f" || { rm -f "$f"; echo "  오래된 백업 삭제: $f"; }
done
