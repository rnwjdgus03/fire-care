# FIRE CARE

스마트앱을 활용한 실시간 소방설비 통합관리 모바일 프로토타입입니다. Expo/React Native 앱과 Node.js API 서버로 구성되어 있습니다.

## 구현된 흐름

- 로컬 PostgreSQL 기반 이메일·비밀번호 회원가입과 로그인
- 최초 가입자는 회사 관리자, 추가 작업자는 관리자가 생성
- 작업자·관리자 권한 분리(설비 등록·삭제는 관리자만 가능)
- 층별 설비 목록과 점검 상태
- 점검 화면 진입 시 DB의 설비별 체크리스트를 먼저 표시하고, 사진 촬영 전 확인할 항목을 안내
- 선택한 설비 종류와 사진 속 설비의 일치 여부를 Gemini가 먼저 확인
- DB에 저장된 설비별 공식 점검표 마스터만 사용하며 Gemini는 항목을 추가·삭제하지 못함
- 사진으로 확인 가능한 공식 항목만 정상·이상·확인 불가로 판정
- 어두움·과다노출·흐림·원거리·잘린 사진은 재촬영 대상으로 거부
- 설비 일치 70%, 항목 판정 75% 기준을 적용하고 근거영역이 없는 판정은 `직접 확인` 처리
- 사진 위에 AI 판정 근거 사각형과 서버 매핑 ID 표시
- 작동시험·압력 측정·내부 확인 항목은 항상 `직접 확인`으로 유지
- 각 항목에 서버 매핑 ID, 점검범위, 고시명과 시행 기준 버전 표시(매핑 ID를 법정 서식의 공식 항목번호로 표시하지 않음)
- 설비 불일치 또는 직접 확인하지 않은 항목이 있으면 앱과 서버 모두 저장 차단
- 에어컨은 소방시설과 분리하여 `기계설비 유지관리기준`의 패키지 에어컨 성능점검표로 관리
- 점검 결과 저장, 자동 보고서 생성 선택, 회사 양식 업로드
- Gmail SMTP 기반 HTML 점검 보고서와 회사 양식 첨부 발송
- 관리자 대시보드, 층별 특이사항, 상세 항목
- AI 최초 판정과 실무자 최종 선택의 일치·수정 건수 및 일치율 집계
- 내 맥의 PostgreSQL에 사용자·건물·층·설비 목록·점검표 마스터·점검 결과 영구 저장
- 내 맥의 서버 폴더에 점검 사진 저장, DB에는 파일 경로 저장
- 같은 회사 계정으로 로그인한 여러 휴대폰의 설비·점검 데이터 동기화
- 회사 ID 기반 데이터 격리와 서버 권한 검사
- 인증 토큰은 Expo SecureStore(iOS Keychain·Android Keystore 기반)에 저장

서버가 실행되지 않으면 공식 점검표나 분석 결과를 임의로 만들어내지 않고 오류를 표시합니다. Gemini API 키가 없으면 서버는 공식 점검표를 반환하지만 모든 항목을 `직접 확인`으로 표시하고 설비 일치 판정을 완료하지 않습니다.

## 공식 점검표 기준

- `소방시설 설치 및 관리에 관한 법률 시행규칙` 제20조
- `소방시설 자체점검사항 등에 관한 고시` 별지 제4호서식
- 현재 데이터 버전: `소방청고시 제2022-71호 / 시행 2022-12-01`
- 국가법령정보센터 원문 확인일: `2026-09-01`
- 설비별 점검표 마스터 저장 위치: 로컬 PostgreSQL `equipment_type_masters`
- 초기 시드 원본: `server/src/checklists.ts`

현재 지원 설비는 16종이며 점검표 항목은 총 137개입니다. 소화기, 소화전, 소화펌프, 급수펌프, 스프링클러 밸브, 스프링클러 헤드, 유도등, 방화문, 방화셔터, 자동화재탐지설비, 비상방송설비, 옥외소화전, 제연설비, 피난기구, 비상조명등, 에어컨을 지원합니다.

패키지 에어컨은 현행 별지 제3호서식 12쪽의 5개 성능점검항목을 사용합니다. 압력·온도·전압·전류는 그 5개 항목을 부풀리지 않고 `현장 직접 측정값`으로 별도 입력·저장합니다. 정상범위는 설비별 제조사 유지관리지침서를 따릅니다.

앱의 결과는 사진 기반 점검 보조 정보입니다. 법정 자체점검 완료나 적합 판정을 의미하지 않으며, 자격과 권한을 갖춘 점검자의 현장 최종 확인을 대체하지 않습니다.

## 1. 모바일 앱 실행

```bash
cp .env.example .env
npm install
npm start
```

Expo Go가 설치된 휴대폰으로 QR 코드를 스캔합니다. 휴대폰과 맥은 같은 네트워크에 연결해야 합니다. 실제 휴대폰에서는 `.env`의 `EXPO_PUBLIC_API_URL`을 맥의 내부 IP 주소로 변경합니다.

맥의 내부 IP 확인 예시:

```bash
ipconfig getifaddr en0
```

## 2. API 서버 실행

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

서버 상태 확인:

```bash
curl http://localhost:4000/health
```

## 3. 로컬 PostgreSQL 데이터베이스 설정

PostgreSQL이 없다면 먼저 설치합니다.

```bash
brew install postgresql@16
brew services start postgresql@16
```

DB를 만들고 스키마를 적용합니다.

```bash
createdb -p 5433 fire_care
psql -p 5433 -d fire_care -f server/sql/local_postgres_schema.sql
```

`server/.env`에 다음 값을 입력합니다.

```dotenv
DATABASE_URL=postgresql://gu@localhost:5433/fire_care
JWT_SECRET=긴_랜덤_문자열
LOCAL_UPLOAD_DIR=
```

`JWT_SECRET`은 모바일 앱에 넣지 않습니다. 앱은 Node 서버만 호출하고, Node 서버가 JWT 토큰과 회사 소속·권한을 확인합니다. `LOCAL_UPLOAD_DIR`을 비워두면 서버의 `uploads/inspection-photos` 폴더에 사진이 저장됩니다.

서버를 재시작하면 `server/src/checklists.ts`의 현재 기준 데이터가 로컬 PostgreSQL `equipment_type_masters`에 저장됩니다. 이후 앱과 Gemini 분석은 이 DB 마스터 점검표를 조회해서 사용합니다.

설정 후 서버를 재시작하고 다음 결과에서 `databaseConfigured`가 `true`인지 확인합니다.

```bash
curl http://localhost:4000/health
```

두 휴대폰이 같은 맥 서버 주소를 바라보고 같은 이메일 계정으로 로그인하면 같은 DB 데이터를 보게 됩니다. 회사명이 같아도 회사 UUID가 다르면 데이터는 섞이지 않습니다. 일반 회원가입은 새 회사를 만들며, 기존 회사의 작업자는 관리자 대시보드에서 생성해야 합니다.

## 4. Gemini 설정

`server/.env`에 다음 값을 입력합니다.

```dotenv
GEMINI_API_KEY=발급받은_API_KEY
GEMINI_MODEL=gemini-3.7-flash
```

키는 모바일 앱에 넣지 않습니다. 앱이 선택 설비명과 사진을 서버에 전달하면 서버가 공식 체크리스트를 선택하고 Gemini Files API로 사진을 분석합니다. Gemini는 설비 일치 확인과 사진 판정만 담당합니다.

## 5. Gmail SMTP 메일 설정

Google 계정에서 2단계 인증을 켠 뒤 앱 비밀번호를 발급하고 `server/.env`에 입력합니다.

```dotenv
GMAIL_USER=발신용_Gmail주소
GMAIL_APP_PASSWORD=16자리_앱_비밀번호
MAIL_SENDER_NAME=FIRE CARE
```

일반 Gmail 비밀번호를 입력하지 않습니다. Google 계정의 앱 비밀번호를 사용해야 합니다.

## 검사

```bash
npm run check:all
```

실제 사진 평가 데이터는 `server/eval/README.md` 구조에 따라 준비한 뒤 다음처럼 실행합니다.

```bash
npm --prefix server run eval:vision -- "/평가사진/절대경로"
```

## 주요 경로

- `App.tsx`: 앱 화면 전환과 세션
- `src/screens/index.tsx`: 전체 모바일 화면
- `src/services/api.ts`: 모바일-서버 통신
- `server/src/gemini.ts`: Gemini 영상/이미지 분석
- `server/src/checklists.ts`: 로컬 PostgreSQL에 저장할 설비별 점검표 초기 시드 원본
- `server/src/mailer.ts`: Gmail SMTP 메일 인증·발송
- `server/src/index.ts`: REST API
- `server/src/database.ts`: 로컬 PostgreSQL 영구 저장, JWT 인증, 사진 경로 저장, 동기화
- `server/sql/local_postgres_schema.sql`: 사용자·회사·건물·층·설비·점검표 마스터·점검·사진 스키마
