# Obsidian Live PDF Preview

Obsidian 에디터에서 마크다운 문서를 편집할 때, **실제 인쇄물(A4) 형식의 레이아웃을 실시간으로 확인하고 고품질의 북마크 목차가 삽입된 PDF로 내보낼 수 있는 Obsidian 플러그인**입니다.

이 플러그인은 지연 시간 없는(Zero-Latency) 실시간 분할 렌더링 기술과 스마트한 줄바꿈/리스트 분할 엔진을 내장하고 있어, 문서 편집과 출판 디자인 조율을 동시에 수행할 수 있도록 돕습니다.

---

## ✨ 핵심 기능 (Key Features)

### 1. 실시간 저지연 미리보기 (Zero-Latency Real-Time Preview)
* **DOM 부분 캐싱 버퍼링:** 에디터 커서 위치를 기준선으로 잡아 문서를 상단(`upperEl`)과 하단(`lowerEl`)으로 분할 렌더링합니다. 타이핑하는 하단 영역만 즉각 업데이트하여 문서가 길어져도 버벅임이 전혀 없습니다.
* **반응형 A4 가상 캔버스:** CSS Container Queries(`100cqw`)를 사용해 옵시디언 우측 사이드바 패널의 크기가 조절되어도 A4 비율(`210mm` x `297mm`)을 그대로 유지하며 깔끔하게 축소/확대(Scale) 렌더링됩니다.

### 2. 가상 페이지네이션 및 스마트 분할 엔진 (Smart Pagination)
* **줄 단위 이진 탐색 분할:** 일반 문단, 블록요약(`blockquote`) 등이 페이지 하단 여백 경계를 초과하면, 텍스트 범위를 이진 탐색(Binary Search) 및 DOM Range 객체 추출로 쪼개어 다음 페이지로 매끄럽게 넘깁니다.
* **리스트 기호 중복 방지:** 하나의 리스트 아이템(`<li>`)이 두 페이지에 걸쳐 쪼개질 때, 다음 페이지로 넘어간 연속 항목에 기호가 중복 출력되지 않도록 자동으로 불릿(`-`, `*`) 및 순서 넘버링을 생략하는 보정 클래스(`.pdf-list-split-continuation`)를 지원합니다.
* **헤딩 분리 방지 (Orphan Heading Prevention):** 제목(Heading) 요소가 페이지 맨 끝자락에 혼자 남고 본문은 다음 페이지로 밀리는 현상을 방지하기 위해, 제목 요소를 본문과 함께 다음 페이지로 자동 이동시킵니다.

### 3. 수동 페이지 분할 (Manual Page Break)
* 작성 중인 마크다운 텍스트 한 줄에 단독으로 `//page` 라고 적어주면, 해당 위치를 기준으로 다음 내용이 항상 새로운 A4 용지의 첫 머리에서 시작됩니다.

### 4. PDF 북마크 목차 주입 (Interactive Outlines)
* 문서 내 헤딩 구조(`H1` ~ `H6`)와 실제 페이지 번호를 매핑하여, 생성된 PDF 내부에 정식 목차(Outline Bookmarks)를 주입합니다. PDF 리더기(Adobe Reader, Chrome PDF 등) 좌측 사이드바에서 목차 이동 기능을 온전히 사용할 수 있습니다.

### 5. 플리커 없는 깔끔한 내보내기 (Clean Export)
* 내보내기 실행 시 화면이 일시적으로 흰색으로 변하거나 깜빡거리는 현상을 막기 위해, 미리보기 캔버스를 깊은 복제(Deep Clone)하여 백그라운드에서 인쇄를 처리하는 인쇄 격리 기법을 사용하여 에디터 화면에 아무런 방해를 주지 않습니다.

---

## 🛠️ 사용 방법 (How to Use)

### 1. 미리보기 열기
1. Obsidian 명령 팔레트(`Cmd/Ctrl + P`)를 엽니다.
2. `Open Live PDF Preview` 명령을 실행합니다.
3. 우측 사이드바 탭에 A4 미리보기 뷰가 나타납니다. 에디터에서 글을 쓰면 미리보기 화면에 즉시 인쇄 레이아웃이 실시간 갱신됩니다.

### 2. 페이지 설정 변경
미리보기 창 우측 상단의 ⚙️ (기어 아이콘)을 클릭하면 모달 설정 제어판이 열립니다:
* **Page size:** A4, Letter, A3, A5, Legal 사이즈 지원
* **Margins:** Default (20mm), None (0mm), Small (10mm) 여백 조절
* **Downscale percent:** 미리보기 글씨 크기 확대/축소 (50% ~ 150%)
* **Landscape:** 가로/세로 방향 토글
* **Show file name as title:** 파일명을 문서 맨 앞의 제목(`H1`)으로 출력할지 여부 결정

### 3. PDF로 내보내기
* 미리보기 창 우측 상단의 🖨️ (프린터 아이콘)을 클릭하면 빌드 및 목차 주입이 완료된 후 다운로드 창이 열려 원하는 경로에 고품질 PDF로 즉시 저장할 수 있습니다.

---

## 🏗️ 프로젝트 파일 아키텍처 (Architecture)

프로젝트 코드는 관심사 분리(Separation of Concerns) 원칙에 따라 고도로 모듈화되어 있습니다.

```
src/
├── main.ts         # 플러그인 생명주기 및 사이드바 뷰 등록 진입점
├── view.ts         # 뷰 인터페이스, 에디터 이벤트 처리기 및 가상 돔 버퍼 관리
├── pagination.ts   # 가상 페이지 생성, 문단 이진 탐색 분할 및 레이아웃 분배 엔진
├── pdf-outline.ts  # pdf-lib를 사용한 PDF 바이너리 목차(아웃라인) 조작 및 생성
└── export.ts       # Electron printToPDF 호출 제어 및 페이지 설정 모달
```

---

## 💻 개발자 가이드 (Development Guide)

### 1. 패키지 설치
```bash
npm install
```

### 2. 컴파일 및 배포 (Production Build)
```bash
npm run build
```
빌드된 파일은 자동으로 `./build` 폴더로 복사되며, 해당 폴더 내의 `main.js`, `manifest.json`, `styles.css` 파일이 배포 대상입니다.

### 3. 와치 모드 (Watch Mode)
개발 중 실시간 빌드 반영을 위해 다음 명령어를 사용할 수 있습니다:
```bash
npm run dev
```
