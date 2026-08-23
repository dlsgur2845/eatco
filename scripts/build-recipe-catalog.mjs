/**
 * 식품안전나라 레시피 카탈로그를 **배포 자산으로 구워 넣는다.**
 *
 * 왜: 예전에는 워커가 요청 시점에 공공 API 로 2.5MB 를 받았다. 캐시가 살아
 * 있으면 5ms 지만 비어 있으면 **8.44초**다 (실측). Cloudflare Cache API 는
 * 콜로 단위 + TTL 6시간이라 트래픽이 적은 이 앱에서는 자주 비어 있다.
 *
 * 카탈로그는 거의 안 바뀌는 읽기 전용 공공 데이터다. 요청 때 받아올 이유가
 * 없다 — 빌드 때 받아서 자산으로 두면 런타임에 네트워크가 아예 사라진다.
 *
 * 두 파일로 나눈다. **읽는 시점이 다르기 때문이다:**
 *   index — 이름·재료. 검색과 추천이 쓴다. 매 검색마다.
 *   full  — 조리 순서·사진·팁. «조리법 보기» 를 눌렀을 때만.
 * 한 덩어리로 두면 이름을 찾으려고 조리 사진 460KB 를 같이 파싱한다.
 *
 * 실행: node scripts/build-recipe-catalog.mjs
 * 갱신: 카탈로그가 바뀌었을 때만. 매 빌드마다 돌릴 필요 없다 — 공공 API 가
 *       느리고(8초) 일일 트래픽 제한이 있다. 결과 파일은 저장소에 커밋한다.
 */
import { writeFileSync, existsSync, mkdirSync, statSync, readFileSync } from 'node:fs'

const OUT_DIR = 'frontend/public'
const INDEX_PATH = OUT_DIR + '/recipe-catalog-index.json'
const FULL_PATH = OUT_DIR + '/recipe-catalog-full.json'

function readKey() {
  // .dev.vars 는 gitignore 다. CI 에서는 환경변수로 준다.
  if (process.env.RECIPE_API_KEY) return process.env.RECIPE_API_KEY
  if (!existsSync('.dev.vars')) return ''
  const line = readFileSync('.dev.vars', 'utf8').split('\n').find((l) => l.startsWith('RECIPE_API_KEY'))
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : ''
}

/* 재료 파싱은 worker/src/lib/recipe-match.ts 의 규칙과 **같아야 한다.**
   두 벌이 되면 색인에 박힌 재료와 매칭기가 보는 재료가 달라져서,
   같은 레시피의 매칭률이 화면마다 다르게 나온다. */
const PAREN = /\([^)]*\)/g
const QUANTITY = /\s*[\d/.]+\s*(g|kg|ml|L|개|모|마리|줄기|큰술|작은술|쪽|cm|장|컵|봉지|포기).*$/
const PREFIX = /^(다진|썬|채썬|간|삶은|데친|볶은|구운|찐|튀긴)\s*/
const normalizeIngredient = (t) =>
  t.trim().replace(PAREN, '').replace(QUANTITY, '').replace(PREFIX, '').replace(/\d+/g, '')
   .replace(/^[\s,.]+|[\s,.]+$/g, '')
function extractIngredients(parts) {
  const out = []
  for (let line of String(parts).replace(/\n/g, ',').split(',')) {
    line = line.trim()
    if (!line || line.length < 2) continue
    if (line.endsWith(':') || line.startsWith('●') || line.startsWith('·')) {
      line = line.replace(/^[●·]+/, '').replace(/:$/, '').trim()
      if (line.length < 2) continue
    }
    const name = normalizeIngredient(line)
    if (name && name.length >= 2) out.push(name)
  }
  return out
}

async function fetchRange(key, start, end) {
  const url = `https://openapi.foodsafetykorea.go.kr/api/${key}/COOKRCP01/json/${start}/${end}`
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error('공공 API ' + res.status)
  /* 이 API 는 문자열 안에 생 개행을 넣어서 엄격한 파서가 거부한다.
     JSON.parse 도 문자열 안의 제어문자를 거부하므로 먼저 이스케이프한다.
     **범위는 이스케이프로 쓴다** — 리터럴 제어문자를 소스에 넣으면 이 파일이
     바이너리로 취급돼 git diff 가 안 나온다 (shared-recipes.ts 에서 겪었다). */
  const text = (await res.text()).replace(/[\x00-\x1f]/g, (c) =>
    c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : ' ',
  )
  return JSON.parse(text)?.COOKRCP01?.row ?? []
}

const key = readKey()
if (!key) {
  console.error('RECIPE_API_KEY 가 없다. .dev.vars 또는 환경변수로 준다.')
  process.exit(1)
}

const rows = []
for (const [s, e] of [[1, 1000], [1001, 1200]]) {
  process.stdout.write('  ' + s + '~' + e + ' 받는 중… ')
  const t = Date.now()
  const got = await fetchRange(key, s, e)
  rows.push(...got)
  console.log(got.length + '건 (' + ((Date.now() - t) / 1000).toFixed(1) + 's)')
}
/* 0건이면 **기존 파일을 건드리지 않는다.** 덮어쓰면 검색이 통째로 죽는다. */
if (!rows.length) {
  console.error('0건을 받았다. 기존 파일을 그대로 두고 멈춘다.')
  process.exit(1)
}

const index = []
const full = []
for (const r of rows) {
  const steps = []
  const images = []
  for (let i = 1; i <= 20; i++) {
    const n = String(i).padStart(2, '0')
    const s = r['MANUAL' + n]
    if (s && s.trim()) {
      steps.push(s.trim())
      // 사진은 단계마다 있을 수도 없을 수도 있다. 인덱스를 빈 문자열로 맞춘다.
      images.push((r['MANUAL_IMG' + n] ?? '').trim())
    }
  }
  const id = String(r.RCP_SEQ ?? '').trim()
  if (!id) continue   // id 없는 레시피는 식단에 붙일 수 없다
  const base = {
    id,
    name: r.RCP_NM ?? '',
    category: r.RCP_PAT2 ?? '기타',
    cooking_method: r.RCP_WAY2 ?? '기타',
    calories: r.INFO_ENG ?? '',
    ingredients: extractIngredients(r.RCP_PARTS_DTLS ?? ''),
  }
  index.push(base)
  full.push({
    ...base,
    image_url: r.ATT_FILE_NO_MK || r.ATT_FILE_NO_MAIN || '',
    manual_steps: steps,
    manual_images: images,
    tip: r.RCP_NA_TIP ?? '',
  })
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(INDEX_PATH, JSON.stringify(index))
writeFileSync(FULL_PATH, JSON.stringify(full))
const kb = (p) => (statSync(p).size / 1024).toFixed(0)
console.log('')
console.log('  ' + INDEX_PATH + '  ' + kb(INDEX_PATH) + ' KB  (' + index.length + '건 — 검색·추천용)')
console.log('  ' + FULL_PATH + '   ' + kb(FULL_PATH) + ' KB  (조리법 보기용)')
