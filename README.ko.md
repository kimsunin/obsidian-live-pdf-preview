# Obsidian Live PDF Preview

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/kimsunin/obsidian-live-pdf-preview?color=6c5ce7)](https://github.com/kimsunin/obsidian-live-pdf-preview/releases)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=6c5ce7&label=downloads&query=%24.live-pdf-preview.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=live-pdf-preview)

Obsidian에서 문서를 편집하면서 **실제 인쇄물(A4) 형식의 레이아웃을 실시간으로 확인하고, 클릭 한 번으로 목차 이동이 가능한 고품질 PDF로 저장**할 수 있는 플러그인입니다.

문서 작성과 인쇄 편집(출판 레이아웃)을 동시에 처리해 주는 편리한 문서 도구입니다.

![Obsidian Live PDF Preview Main Screenshot](./assets/2026-06-29_layout.png)

## 이런 분들께 추천합니다!

- Obsidian으로 리포트, 이력서, 기획서, 에세이 등 **출력용 문서**를 자주 작성하시는 분.
- PDF로 내보내기 전에 **줄바꿈이나 여백이 용지에 딱 맞는지 실시간으로 확인**하고 싶으신 분.
- 내보낸 PDF 파일에 마우스 클릭으로 즉시 이동할 수 있는 **바로가기 목차(책갈피)**를 자동으로 넣고 싶으신 분.

## 주요 기능 안내

### 1. 깜빡임 없는 실시간 A4 미리보기

- 에디터 우측 사이드바에 가상 A4 용지(`210mm` x `297mm`)가 나타나며, 글을 쓰는 즉시 화면에 그대로 반영됩니다.
- **이중 캔버스 플리핑(Twin-Canvas Page Flipping):** 어토믹 더블 버퍼링 기법을 통해, 글을 쓰는 동안 화면이 번쩍이거나 완전히 하얗게 비는 **화면 깜빡임이 0%**인 매끄러운 뷰를 보장합니다.
- 패널 크기를 넓히거나 좁혀도 화면 비율에 맞춰 용지가 알맞은 크기로 자동으로 확대/축소됩니다.

### 2. 편집 위치 자동 스크롤 동기화

- **수정 중인 화면 자동 정렬:** 플러그인이 현재 활성화된 에디터의 커서 위치를 감지합니다. 작성 또는 수정 중인 블록이 미리보기 화면을 벗어나 있을 경우, 해당 영역이 미리보기 화면의 **맨 위(Top)에 놓이도록 부드럽게 자동 스크롤**됩니다.
- **스마트 가시성 고정:** 현재 수정 중인 내용이 이미 화면 안에 보이고 있는 상태라면 스크롤이 고정되어, 타이핑할 때 화면이 위아래로 덜덜거리는 떨림 현상을 완벽히 배제합니다.

### 3. 자연스러운 자동 페이지 분할

- 문장이나 목록(List)이 페이지 바닥을 넘어가는 경우, 글자가 반으로 잘리지 않고 **줄 단위로 다음 페이지에 부드럽게 이어집니다.**
- 두 페이지로 나뉜 목록 항목도 중복된 기호(순서 번호나 불릿) 없이 내용만 깔끔하게 연결됩니다.

### 4. 원하는 위치에서 페이지 나누기 (`//page`)

- 글을 쓰다가 다음 페이지로 내용을 넘기고 싶다면, 줄의 맨 앞에 **`//page`**를 입력하세요. 해당 위치 뒤로는 무조건 다음 페이지의 첫 줄부터 작성됩니다.

![Paging Screenshot](./assets/2026-06-29_paging.png)

### 5. 클릭 한 번으로 PDF 내보내기 (목차 책갈피 포함)

- 미리보기 창 오른쪽 위의 🖨️ (프린터 아이콘)을 누르면 즉시 고품질 PDF 파일로 저장할 수 있습니다.
- 문서에 작성한 제목(# H1 ~ ###### H6)들이 PDF 파일의 **'북마크(목차 바로가기 책갈피)'로 자동 등록**되어, 외부 PDF 뷰어에서 손쉽게 목차를 보며 이동할 수 있습니다.
- **한글/유니코드 북마크 완벽 지원:** 제목에 포함된 한글 및 다양한 비영어권 유니코드 문자열이 깨짐 없이 PDF 북마크 목차 트리에 고화질로 정상 표기됩니다.
- **깔끔한 인쇄용 레이아웃:** A4 인쇄 미리보기 화면과 실제 출력되는 PDF 파일 전체에서 옵시디언 기본 마우스 오버용 "Copy" 복사 버튼을 자동으로 숨겨 출력 완결성을 극대화합니다.

## 사용 방법

### 1. 미리보기 실행하기

1. Obsidian 단축키 `Cmd/Ctrl + P`를 눌러 명령 팔레트를 엽니다.
2. `Open Live PDF Preview` 명령을 찾아서 실행합니다.
3. 우측 탭에 인쇄 미리보기 화면이 열립니다.

### 2. 용지 및 레이아웃 설정하기

미리보기 창 우측 상단의 ⚙️ (기어 아이콘)을 클릭하면 아래 항목들을 자유롭게 바꿀 수 있습니다:

- **Page size (용지 종류):** A4, Letter, A3, A5, Legal 중 선택.
- **Margins (여백 조절):** Default (기본 여백), None (여백 없음), Small (좁은 여백) 중 선택.
- **Downscale percent (화면 스케일):** 미리보기 글씨 및 레이아웃 크기 조절 (50% ~ 150%).
- **Landscape (가로 출력):** 용지를 가로 방향으로 눕히고 싶을 때 설정.
- **Show file name as title:** 파일 이름을 문서 맨 위에 대제목으로 자동 포함할지 여부 설정.

![Page Layout Settings Modal](./assets/2026-06-29_setting.png)

## Multilingual Readme

- [English Version](./README.md)
