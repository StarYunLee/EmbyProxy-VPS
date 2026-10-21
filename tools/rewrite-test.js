// 离线验证 URL 改写逻辑（不改动线上）
const fs = require('fs')

const src = fs.readFileSync(process.argv[2] || './server.js', 'utf8')
function grab(re) {
  const m = src.match(re)
  if (!m) throw new Error('missing: ' + re)
  return m[0]
}

const parts = [
  grab(/const MEDIA_PATH_RE = [^\n]+/),
  grab(/function normalizeOrigin\([\s\S]*?\n\}/),
  grab(/function getTargetOrigins\([\s\S]*?\n\}/),
  grab(/function rewriteUrlsInText\([\s\S]*?\n\}/),
  grab(/function extractMediaOrigins\([\s\S]*?\n\}/),
]

const factory = new Function(
  parts.join('\n') +
    '\nconst proxyUrlPrefix = () => ""\n' +
    '\nreturn { MEDIA_PATH_RE, normalizeOrigin, getTargetOrigins, rewriteUrlsInText, extractMediaOrigins }',
)
const { normalizeOrigin, getTargetOrigins, rewriteUrlsInText, extractMediaOrigins } = factory()

const proxyUrlPrefix = () => '' // 未开启反代 Token
const proxyOrigin = 'https://emby.630226.xyz'
const prefix = 'peach'

function run(name, targets, frontend, backend, text) {
  const base = getTargetOrigins(targets, [frontend])
  const forced = []
  for (const raw of [backend]) {
    const origin = normalizeOrigin(raw)
    if (origin && !base.includes(origin) && !forced.some(f => f.origin === origin)) {
      forced.push({ origin })
    }
  }
  const found = extractMediaOrigins(text, base.map(o => o))
  const mediaAll = forced.concat(found.filter(m => !forced.some(f => f.origin === m.origin)))
  const out = rewriteUrlsInText(text, base, mediaAll, proxyOrigin, prefix)
  console.log('\n### ' + name)
  console.log('baseOrigins :', base)
  console.log('forcedMedia :', forced.map(f => f.origin))
  console.log('autoMedia   :', found.map(f => f.origin))
  console.log('in  :', text)
  console.log('out :', out)
}

const json = JSON.stringify({
  Path: 'http://embymv.cc:8888/videos/1/stream.mp4',
  Direct: 'http://embymv.cc:8888/11p/movie.mkv',
  Front: 'https://white.embymv.cc:8443/Items/1/Images/Primary',
  Other: 'https://cdn.example.com/media/x.m3u8',
  NonMedia: 'http://embymv.cc:8888/api/config.json',
})

run(
  'peach 正确配置（前端=white，后端=http://embymv.cc:8888）',
  ['https://white.embymv.cc:8443'],
  'white.embymv.cc',
  'http://embymv.cc:8888',
  json,
)

run(
  '未填后端域名（只靠自动识别）',
  ['https://white.embymv.cc:8443'],
  'white.embymv.cc',
  '',
  json,
)

run(
  '错误配置：把后端域名塞进已知源站（旧行为）',
  ['https://white.embymv.cc:8443'],
  'white.embymv.cc',
  '',
  json,
)
