# Obsidian Live PDF Preview

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/kimsunin/obsidian-live-pdf-preview?color=6c5ce7)](https://github.com/kimsunin/obsidian-live-pdf-preview/releases)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=6c5ce7&label=downloads&query=%24.live-pdf-preview.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=live-pdf-preview)

An Obsidian plugin that lets you edit Markdown documents while **viewing a real-time, print-formatted A4 preview in the sidebar**, and **exports them into high-quality PDFs with interactive navigation bookmarks in one click**.

It streamlines your writing workflow by combining document editing and publication layout design into one seamless process.

![Obsidian Live PDF Preview Main Screenshot](./assets/2026-06-30_layout.png)

## Who is this for?

- **Writers** composing print-ready documents like reports, resumes, proposals, and essays directly in Obsidian.
- **Publishers** who want to verify line wraps, margins, and page breaks in real-time before exporting.
- **Readers** who want exported PDFs to automatically feature click-navigable outlines/bookmarks for easy reading.

## Key Features

### 1. Real-Time Print Preview

- **Live Page Rendering:** Renders your edits instantly on a virtual print page (supporting A4, Letter, A3, etc.).
- **Responsive Scaling:** The preview automatically scales to fit when you resize the sidebar panel.

### 2. Cursor Scroll Sync

- **Auto-Scrolling:** Automatically scrolls the preview page to match your active cursor position in the editor, keeping your edits in view.

### 3. Smart Pagination & Formatting

- **Clean Transitions:** Paragraphs, lists, tables, and code blocks that overflow the page boundary split cleanly onto the next page instead of cutting off mid-line.
- **Continuous Lists:** List items split across pages preserve continuous numbering and omit duplicate bullet points.

### 4. Print Layout Commands (`//` Commands)

The plugin provides native layout commands written on their own lines:

- **`//page` (Page Break):** Forces content onto a new page. Inside a column, it splits only that column.
  
  ![Page Break Screenshot](./assets/2026-06-30_paging.png)
  
- **`//column` (Multi-Column Layout):** Creates side-by-side columns (up to 3 columns using `//column-1`, `//column-2`, `//column-3`). Includes smart autocomplete for closing tags.
  
  ![Multi Column Layout Screenshot](./assets/2026-06-30_multi_layout.png)
  
- **`//center` (Center Alignment):** Centers text, lists, tables, code blocks, and images, while keeping list items left-aligned for readability. Includes smart autocomplete.

  ![Center Alignment Block Screenshot](./assets/2026-06-30_center_layout.png)

### 5. PDF Export with Bookmarks

- **One-Click Export:** Click the printer icon (🖨️) to save your document as a print-ready PDF.
- **Interactive Outlines:** Document headings (`# H1` to `###### H6`) automatically become interactive PDF outlines/bookmarks with full Unicode (Korean, CJK, etc.) support.
- **Polished Output:** Automatically hides temporary interface items like code copy buttons in the exported document.

## How to Use

### 1. Launching the Preview

1. Open the Obsidian Command Palette (`Cmd/Ctrl + P`).
2. Search for and select the `Open Live PDF Preview` command.
3. The print preview tab will open in the right sidebar.

### 2. Customizing the Page Layout

Click the gear icon (⚙️) on the top right of the preview header to open the page settings:

| Setting | Description | Options |
| :--- | :--- | :--- |
| **Page size** | Set the physical dimensions of the virtual page. | A4, Letter, A3, A5, Legal |
| **Margins** | Choose the outer padding margins for the A4 sheet. | Default (20mm), None (0mm), Small (10mm) |
| **Downscale percent** | Adjust the zoom/scale factor of the preview text and layout. | 50% to 150% (Default: 100%) |
| **Landscape** | Toggle between Portrait (vertical) and Landscape (horizontal). | Toggle ON/OFF |
| **Show file name as title** | Render the file name as the document's main heading. | Toggle ON/OFF |

![Page Layout Settings Modal](./assets/2026-06-30_setting.png)

### 3. Custom CSS Stylesheet

Click the palette icon (🎨) next to the settings gear on the preview header to apply custom CSS

![Page Layout Settings Modal](./assets/2026-06-30_custom_css.png)

## License

This project is licensed under the [MIT License](LICENSE).

