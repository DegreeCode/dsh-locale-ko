# DeepSeek Harness 한국어 언어 팩

[![CI](https://github.com/DegreeCode/dsh-locale-ko/actions/workflows/ci.yml/badge.svg)](https://github.com/DegreeCode/dsh-locale-ko/actions/workflows/ci.yml)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 웹 UI에 한국어를 추가하는 플러그인입니다. 본체 코드를 고치지 않고, Harness가 공식 지원하는 언어 팩 방식(`ctx.locale.addLanguage` + 네임스페이스별 `ctx.locale.register`)으로 동작합니다.

설치하면 **설정 → 일반 → 언어**에 "한국어"가 나타나고, 브라우저 언어가 한국어이면 자동으로 선택됩니다.

## 설치

`dsh` CLI로 프로필에 설치합니다. 아래 중 하나를 쓰면 됩니다.

```bash
# 로컬 폴더에서
dsh plugin --profile <프로필> add ./dsh-language-pack-ko

# Git 저장소에서 (client.js가 커밋되어 있어 빌드 단계가 필요 없습니다)
dsh plugin --profile <프로필> add github:DegreeCode/dsh-locale-ko

# 릴리스 압축 파일로 (GitHub Releases에서 받은 .tgz)
dsh plugin --profile <프로필> add ./dsh-language-pack-ko-1.0.0.tgz
```

앱 안에서는 **설정 → 플러그인 → 설치**에서 로컬 폴더, Git 저장소, tarball 중 하나를 골라 설치할 수 있습니다. 제거는 `dsh plugin --profile <프로필> remove dsh-language-pack-ko`입니다.

## 번역 범위

- 웹 UI 클라이언트의 72개 네임스페이스, 3,171개 문자열 (공통 어휘, 설정, 대화, 사이드바, 플러그인 관리·마켓, 예약 작업, 권한 등 실험 기능 포함)
- 기준 버전: deepseek-harness `22ddee3792` (0.2.1-rc.3)

언어 팩 방식으로는 바꿀 수 없어 영어로 남는 부분이 있습니다.

- **플러그인 목록의 이름과 설명:** 각 패키지 안의 `locale/<언어>.json`에서 읽습니다.
- **데스크톱 앱의 네이티브 메뉴, 대화상자, 설치 프로그램:** Electron 메인 프로세스와 NSIS 쪽입니다.
- **호스트에서 만드는 일부 문구:** Node.js 쪽 플러그인이 언어별 문구 묶음(`{ en, zh, ja, … }`)을 직접 만들어 화면에 보내는 경우입니다. 샌드박스 권한 상승 요청 사유, 자동 검토 거부 사유, 컴퓨터 사용 앱 접근 허용 질문이 여기에 해당하며, 한국어 항목이 없어 영어로 표시됩니다.

본체가 나중에 한국어를 직접 포함하면, 이 플러그인은 이미 등록된 언어와 네임스페이스를 건너뛰고 본체 번역을 그대로 둡니다.

## 번역 원칙

- 영어 원문을 기준으로 번역하고, 중국어(키 기준 원본)와 일본어로 의미를 교차 확인했습니다.
- 제품명과 약어(DeepSeek, Claude Code, MCP, API, JSON, Git 등), 사용자가 직접 입력하는 명령어(`/goal`, `edit` 등), `{자리표시자}`, `snake_case` 필드 이름은 영어 그대로 둡니다.
- 버튼, 메뉴, 레이블은 명사형으로, 설명과 오류 문구는 합니다체로, 안내는 "~하세요"로 씁니다.
- 주요 용어: 에이전트, 서브에이전트, 세션, 워크스페이스, 플러그인, 스킬, 도구, 워크플로, 실행 궤적(trajectory), 제공업체(provider), 예약 작업(scheduled task), 새로고침, 세부 정보, 팀원(agent team member), 대기열·끼어들기(queue/steer)

## 구조

| 경로 | 역할 |
|---|---|
| `dictionaries/<네임스페이스>.json` | 번역 원본. 여기만 고칩니다. |
| `client.js` | 브라우저 모듈. `npm run build`가 사전에서 생성합니다. |
| `index.js`, `cordis.patch.yml` | 호스트 쪽 빈 플러그인과 번들 패치 |
| `locale/*.json`, `icon.svg` | 플러그인 목록에 표시되는 이름, 설명, 아이콘 |
| `scripts/compare-upstream.mts` | Harness 체크아웃의 영어 사전과 키·토큰을 대조 |
| `tests/runtime.client.spec.ts` | Harness의 실제 locale 서비스 위에서 플러그인 동작 확인 |

## 업스트림이 바뀌었을 때

```bash
# 1. 사전을 고친 뒤 client.js 다시 생성
npm run build

# 2. 새 Harness 버전과 키·토큰 대조 (누락, 초과, 자리표시자 변경, 번역 안 된 네임스페이스를 보고합니다)
<dsh 체크아웃>/node_modules/.bin/tsx --tsconfig <dsh 체크아웃>/tsconfig.base.json scripts/compare-upstream.mts <dsh 체크아웃>

# 3. 실제 locale 서비스에서 동작 확인
cp tests/runtime.client.spec.ts <dsh 체크아웃>/packages/client/locale/tests/
cd <dsh 체크아웃> && DSH_LANGUAGE_PACK_KO=<이 레포> npx vitest run packages/client/locale/tests/runtime.client.spec.ts
```

`npm run check`는 `client.js`가 사전과 일치하는지, 사전에 문자열이 아닌 값이나 보이지 않는 문자가 없는지 확인합니다.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): push, PR, 주 1회(월요일 09:00 KST) 실행합니다.
  - `Package`: 사전과 `client.js` 일치 여부, 모듈 문법, 메타데이터, 패키지 파일 목록을 확인합니다.
  - `Upstream base`: 기준 커밋 `22ddee3792`의 Harness를 받아 키·토큰 대조와 실제 locale 서비스 테스트를 돌립니다. 실패하면 CI가 실패합니다.
  - `Upstream master`: 같은 검사를 업스트림 최신 `master`에 돌립니다. 업스트림에 새 문자열이 생긴 것을 알려 주는 용도라 실패해도 CI를 막지 않습니다.
- **CD** (`.github/workflows/release.yml`): `package.json`의 버전과 같은 `v<버전>` 태그를 푸시하면 검사 후 `.tgz`를 만들어 GitHub Release에 첨부합니다. 저장소 시크릿에 `NPM_TOKEN`이 있으면 npm에도 배포합니다.

```bash
npm version patch   # package.json 버전 올리기 + 태그 생성
git push --follow-tags
```

## 라이선스

MIT. 사전의 키와 원문 문자열은 DeepSeek Harness(MIT, Copyright (c) 2026 DeepSeek)에서 왔습니다.
