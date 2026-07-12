# Tired of Obsidian's blind PDF exports? I built a Real-time A4 PDF Preview plugin (with manual page breaks, multi-columns, and native outlines!)

Hey r/obsidianmd,

If you’ve ever tried to write a report, CV, or academic document in Obsidian and export it to PDF, you know the frustration:
* Hitting "Export to PDF" blindly, only to find a table cut in half across pages.
* Heading text stranded at the bottom of a page (orphaned headers).
* Playing the guessing game of adjusting font sizes and margins, exporting 50 times just to get a single paragraph to fit.
* Zero control over where page breaks actually happen without inserting ugly `<div style="page-break-after: always;"></div>` HTML blocks.

I got so tired of this workflow that I decided to fix it. Over the past few weeks, I’ve been developing **Obsidian Live PDF Preview** — a plugin that gives you a zero-latency, A4-formatted real-time preview side-by-side with your editor, and exports perfect PDFs with one click.

Here is what it does and why it might save you hours of formatting:

---

### 🚀 Key Features

#### 1. Zero-Latency Real-Time A4 Preview (Flicker-Free!)
No more exporting to see the layout. The plugin opens a virtual A4 canvas in the right sidebar. As you edit your note on the left, the preview updates dynamically. I implemented a **Double-Buffering (Twin Container Page Flipping)** rendering pipeline to make sure there is absolutely zero flicker or cursor jumping when typing.

#### 2. True A4 Pagination & Element Reflow
The engine calculates the physical height of A4 paper (297mm) minus your margins and dynamically distributes your text, lists, and quotes into separate pages. 
* **Smart Splitting:** If a paragraph or list item spans across a page boundary, it splits clean-cut and flows onto the next page automatically.
* **Newline Snapping:** Code blocks (`pre`) split intelligently by line numbers so they never break in the middle of a text line.

#### 3. Manual Page Breaks with `//page`
Want to force a new page? Just type `//page` on its own line in your note. The preview immediately cuts the page there and starts a new one, keeping your markdown clean and readable.

#### 4. Out-of-the-box Multi-Column Layouts (`//column`)
Need to place items side-by-side for a CV or resume? Just wrap them in a column block:
```markdown
//column
//column-1
Left column content (images, lists, text)
//column-1
//column-2
Right column content
//column-2
//column
```
It renders beautiful responsive side-by-side columns and reflows them across pages if they get too long!

#### 5. Clickable Native PDF Outlines (Bookmarks)
When you click **Export**, the plugin doesn’t just print a flat PDF. It dynamically maps all your headings (`H1` to `H6`) to their physical page numbers and generates a **clickable, nested PDF navigation outline** (bookmarks navigation bar) directly into the PDF metadata!

#### 6. Live GUI Settings Panel
Click the gear icon in the preview header to toggle page numbers, switch margins (Narrow, Normal, Wide), and adjust font size in real time. The layout immediately re-calculates. Plus, you can write **Custom CSS** that is scoped to override default page styles safely without needing `!important`.

---

### 🛠️ Under the Hood (For Tech Geeks)
* Built using **pure CSS scaling** (`transform: scale` bound to container queries) so resizing the sidebar runs smoothly on the GPU at 60fps without dragging down the CPU.
* Injected styles are scoped safely under a sandbox ID (`#pdf-preview-sandbox`) to protect your active notes, while overriding theme configurations during PDF printing.
* Works seamlessly in both **Light and Dark mode** (always exports clean print-friendly light PDFs).

---

### 📦 Give it a try!
The project is open source and ready for feedback.

* **GitHub Repository:** [obsidian-live-pdf-preview](https://github.com/kimsunin/obsidian-live-pdf-preview) *(Update with your repository URL)*

I'd love to hear your thoughts, bug reports, and feature requests. What is your biggest pain point when printing or exporting notes in Obsidian? Let's discuss!
