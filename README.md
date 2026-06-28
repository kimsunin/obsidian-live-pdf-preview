# Obsidian Live PDF Preview

An Obsidian plugin that lets you edit Markdown documents while **viewing a real-time, print-formatted A4 preview in the sidebar**, and **exports them into high-quality PDFs with interactive navigation bookmarks in one click**.

It streamlines your writing workflow by combining document editing and publication layout design into one seamless process.

![Obsidian Live PDF Preview Main Screenshot](./assets/2026-06-29_layout.png)

## 🌟 Who is this for?
* Writers who compose **print-ready documents** like reports, resumes, proposals, and essays in Obsidian.
* Users who want to **verify line wraps, margins, and page breaks in real-time** before exporting.
* Anyone who wants their exported PDFs to automatically feature **click-navigable outlines/bookmarks** for easy reading.

## ✨ Key Features

### 1. Real-Time A4 Preview
* A virtual A4 sheet (`210mm` x `297mm`) appears in the right sidebar, rendering your edits instantly.
* The preview scales and fits automatically when you expand or shrink the sidebar panel width.

### 2. Smart Page Transitions & Pagination
* Text blocks and list items that overflow the page boundary split cleanly **line-by-line onto the next page** instead of cutting off mid-character.
* Continued list items across page breaks will omit duplicate bullet points or numbering prefixes.
* Titles/Headings are automatically pushed to the next page if their following paragraphs do not fit on the current page, preventing orphan headings.

### 3. Custom Page Breaks (`//page`)
* Want to start a new page? Simply type **`//page`** on its own line in the editor, and the following content will begin on a fresh page.

### 4. One-Click PDF Export with Bookmarks
* Click the 🖨️ (printer icon) on the top right of the preview header to save your document as a PDF.
* Document headings (`# H1` to `###### H6`) are automatically converted into **interactive PDF outlines (bookmarks)**, allowing readers to jump between sections in any PDF viewer.
* The export process runs cleanly in the background without causing screen flashes or white-outs.

## 🛠️ How to Use

### 1. Launching the Preview
1. Open the Obsidian Command Palette (`Cmd/Ctrl + P`).
2. Search for and select the `Open Live PDF Preview` command.
3. The print preview tab will open in the right sidebar.

### 2. Customizing the Page Layout
Click the gear icon (⚙️) on the top right of the preview header to open page settings:
* **Page size:** Select A4, Letter, A3, A5, or Legal dimensions.
* **Margins:** Choose Default (20mm), None (0mm), or Small (10mm).
* **Downscale percent:** Scale/Zoom the preview text and layout size (50% to 150%).
* **Landscape:** Toggle between Portrait and Landscape layouts.
* **Show file name as title:** Automatically render the filename as the main document header.

![Page Layout Settings Modal](2026-06-29_setting.png)

## 🌐 Multilingual Readme
* [한국어 버전 (Korean Version)](./README.ko.md)
