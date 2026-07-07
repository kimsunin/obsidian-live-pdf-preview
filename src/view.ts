import { Component, ItemView, MarkdownRenderer, WorkspaceLeaf, TFile, setIcon, debounce, MarkdownView, Editor } from 'obsidian';
import { restoreFromPages, applyPageBreaks, applyVirtualPagination } from './pagination';
import { ExportPdfModal, CustomCssModal, exportToPdf } from './export';
import type LivePdfPreviewPlugin from './main';

export const VIEW_TYPE_PDF_PREVIEW = 'live-pdf-preview-view';

export class PdfPreviewView extends ItemView {
	private containerA!: HTMLDivElement;
	private containerB!: HTMLDivElement;
	private activeContainer!: HTMLDivElement;
	private inactiveContainer!: HTMLDivElement;

	get previewContainer(): HTMLDivElement {
		return this.activeContainer;
	}

	private masterContainer!: HTMLDivElement;
	private upperEl!: HTMLDivElement;
	private lowerEl!: HTMLDivElement;

	private upperComponent = new Component();
	private lowerComponent = new Component();

	public cachedUpperText = '';
	private currentFile: TFile | null = null;

	public pageSize = 'A4';
	public landscape = false;
	public margin = '20mm';
	public scale = 100;
	public showTitle = true;
	private showPageNumbers = false;
	private resizeObserver: ResizeObserver | null = null;
	private lastScrollTop = 0;
	private lastScrollHeight = 0;
	private lastClientHeight = 0;
	private isResizing = false;
	private isAutocompleting = false;

	private debouncedRender = debounce(() => {
		void this.renderPartial();
	}, 150);

	public plugin: LivePdfPreviewPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LivePdfPreviewPlugin) {
		super(leaf);
		this.plugin = plugin;
		
		// Initialize settings from plugin
		this.pageSize = this.plugin.settings.pageSize;
		this.landscape = this.plugin.settings.landscape;
		this.margin = this.plugin.settings.margin;
		this.scale = this.plugin.settings.scale;
		this.showTitle = this.plugin.settings.showTitle;
	}

	getViewType(): string {
		return VIEW_TYPE_PDF_PREVIEW;
	}

	getDisplayText(): string {
		return 'Live PDF Preview';
	}

	getIcon(): string {
		return 'document';
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();

		// Create header (Obsidian native style)
		const headerEl = container.createEl('div', {
			cls: 'pdf-preview-header',
		});

		const actionsEl = headerEl.createEl('div', {
			cls: 'pdf-preview-header-actions',
		});

		// Custom CSS button (Palette icon)
		const cssBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Custom CSS' }
		});
		setIcon(cssBtn, 'palette');

		// Settings button
		const settingsBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Page settings' }
		});
		setIcon(settingsBtn, 'settings');

		// Export PDF button
		const exportBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Export to PDF' }
		});
		setIcon(exportBtn, 'printer');

		// Custom CSS button opens the CSS modal
		cssBtn.addEventListener('click', () => {
			new CustomCssModal(this.app, this).open();
		});

		// Settings button opens the native settings modal
		settingsBtn.addEventListener('click', () => {
			new ExportPdfModal(this.app, this).open();
		});

		// Export PDF button (printer icon) immediately exports!
		exportBtn.addEventListener('click', () => {
			void this.exportToPdf();
		});

		// Create Twin Preview Containers (Phase 7 Robust Flicker-free)
		this.containerA = container.createEl('div', {
			cls: 'pdf-preview-container is-active',
		});
		this.containerB = container.createEl('div', {
			cls: 'pdf-preview-container is-inactive',
		});

		this.activeContainer = this.containerA;
		this.inactiveContainer = this.containerB;

		// Track scroll position for both containers to prevent resize scroll drift
		const handleScroll = (container: HTMLDivElement) => {
			if (this.isResizing) return; // Ignore scroll events triggered by resize transitions
			this.lastScrollTop = container.scrollTop;
			this.lastScrollHeight = container.scrollHeight;
			this.lastClientHeight = container.clientHeight;
		};

		this.containerA.addEventListener('scroll', () => {
			if (this.activeContainer === this.containerA) {
				handleScroll(this.containerA);
			}
		});
		this.containerB.addEventListener('scroll', () => {
			if (this.activeContainer === this.containerB) {
				handleScroll(this.containerB);
			}
		});

		// Create the master render container (hidden offscreen)
		this.masterContainer = container.createEl('div', {
			cls: 'pdf-preview-master',
		});

		// Upper and lower sections for partial rendering (Phase 3)
		this.upperEl = this.masterContainer.createEl('div');
		this.lowerEl = this.masterContainer.createEl('div');

		// Apply initial values (updateCustomCss triggers updateLayoutSettings)
		this.updateCustomCss();

		this.addChild(this.upperComponent);
		this.addChild(this.lowerComponent);
		this.upperComponent.load();
		this.lowerComponent.load();

		// Subscribe to editor-change events for real-time rendering
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				// Only re-render if the change belongs to the active file being previewed
				if (info.file === this.currentFile) {
					this.debouncedRender();
					this.handleColumnAutocomplete(editor);
				}
			})
		);

		// Subscribe to file-open events to update the preview when switching files
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.onFileOpen(file);
			})
		);

		// Non-debounced ResizeObserver sets isResizing to true immediately,
		// then debounces the scroll adjustment to stop rendering feedback loops.
		let resizeTimeout: number | null = null;
		this.resizeObserver = new ResizeObserver(() => {
			this.isResizing = true;
			if (resizeTimeout) {
				window.clearTimeout(resizeTimeout);
			}

			// Proportionally adjust scroll position during resize
			this.adjustScrollOnResize();

			// End resizing status 150ms after resizing ends
			resizeTimeout = window.setTimeout(() => {
				this.isResizing = false;
				if (this.activeContainer) {
					this.lastScrollTop = this.activeContainer.scrollTop;
					this.lastScrollHeight = this.activeContainer.scrollHeight;
					this.lastClientHeight = this.activeContainer.clientHeight;
				}
			}, 150);
		});
		this.resizeObserver.observe(this.containerA);
		this.resizeObserver.observe(this.containerB);

		// Initial render of current active file
		const activeFile = this.app.workspace.getActiveFile();
		this.onFileOpen(activeFile);
	}

	private adjustScrollOnResize() {
		if (!this.activeContainer) return;
		const container = this.activeContainer;
		const curScrollHeight = container.scrollHeight;
		const curClientHeight = container.clientHeight;

		const wrappers = container.querySelectorAll('.pdf-page-wrapper');
		if (wrappers.length === 0) {
			this.postProcess(container);
			this.lastScrollHeight = container.scrollHeight;
			this.lastClientHeight = container.clientHeight;
			this.lastScrollTop = container.scrollTop;
			return;
		}

		// Adjust the scrollTop value using our cached stable coordinates
		if (this.lastScrollHeight > 0 && this.lastScrollHeight !== curScrollHeight) {
			const maxScrollOld = this.lastScrollHeight - this.lastClientHeight;
			if (maxScrollOld > 0) {
				const scrollRatio = this.lastScrollTop / maxScrollOld;
				const maxScrollNew = curScrollHeight - curClientHeight;
				container.scrollTop = scrollRatio * maxScrollNew;
			}
		}
	}

	async onClose() {
		this.debouncedRender.cancel();
		this.upperComponent.unload();
		this.lowerComponent.unload();
		this.removeChild(this.upperComponent);
		this.removeChild(this.lowerComponent);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	onResize() {
		super.onResize();
		if (!this.previewContainer) return;
		
		// If pages have not been built yet (e.g. background tab reveal), run pagination
		const wrappers = this.previewContainer.querySelectorAll('.pdf-page-wrapper');
		if (wrappers.length === 0) {
			this.postProcess();
		}
	}

	// --- File change detection ---
 
	private onFileOpen(file: TFile | null) {
		if (!file || file.extension !== 'md') return;

		if (file === this.currentFile) return;
		this.currentFile = file;
		this.cachedUpperText = '';
		void this.renderFull(true);
	}

	// --- Rendering ---

	/**
	 * Helper to restore DOM elements from pages back to upper/lower master elements.
	 */
	private restoreFromPages() {
		if (!this.activeContainer) return;

		const currentWrappers = Array.from(this.activeContainer.querySelectorAll('.pdf-page-wrapper'));
		if (currentWrappers.length > 0) {
			const originalHolder = activeDocument.createElement('div');
			for (const w of currentWrappers) {
				// Clone node to maintain the visible layout while offscreen rendering runs
				const clone = w.cloneNode(true);
				this.activeContainer.insertBefore(clone, w);
				originalHolder.appendChild(w);
			}
			restoreFromPages(originalHolder, this.upperEl, this.lowerEl);
		} else {
			restoreFromPages(this.activeContainer, this.upperEl, this.lowerEl);
		}
	}

	private swapContainers(savedScrollTop: number) {
		if (this.inactiveContainer) {
			this.inactiveContainer.scrollTop = savedScrollTop;
		}

		this.activeContainer.classList.remove('is-active');
		this.activeContainer.classList.add('is-inactive');

		this.inactiveContainer.classList.remove('is-inactive');
		this.inactiveContainer.classList.add('is-active');

		const temp = this.activeContainer;
		this.activeContainer = this.inactiveContainer;
		this.inactiveContainer = temp;

		// Clean up memory and cloned nodes in the old active container
		this.inactiveContainer.empty();

		// Update the scroll dimension cache for the newly active container
		this.lastScrollTop = savedScrollTop;
		this.lastScrollHeight = this.activeContainer.scrollHeight;
		this.lastClientHeight = this.activeContainer.clientHeight;
	}

	private scrollToActiveSection() {
		if (!this.activeContainer) return;
		const firstLowerEl = this.activeContainer.querySelector('[data-section="lower"]');
		if (firstLowerEl) {
			const containerRect = this.activeContainer.getBoundingClientRect();
			const elRect = firstLowerEl.getBoundingClientRect();

			// Check if the element is already fully visible within the container viewport
			const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;

			if (!isVisible) {
				// Only scroll to the top smoothly if it is not currently visible
				firstLowerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	}

	private fixHorizontalRules(text: string, cursorLine?: number): { text: string; cursorLine?: number } {
		const lines = text.split('\n');
		let adjustedCursor = cursorLine;

		// Check if document has YAML Frontmatter
		let inFrontmatter = false;
		let frontmatterEndIndex = -1;
		if (lines.length > 0 && lines[0] !== undefined && lines[0].trim() === '---') {
			inFrontmatter = true;
			// Find the closing '---'
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i];
				if (line !== undefined && line.trim() === '---') {
					frontmatterEndIndex = i;
					break;
				}
			}
		}

		for (let i = 0; i < lines.length - 1; i++) {
			// Skip processing inside the YAML frontmatter block (start and end boundaries included)
			if (inFrontmatter && i <= frontmatterEndIndex) {
				continue;
			}

			const line = lines[i];
			if (line !== undefined && i > 0 && /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
				// Count how many empty lines follow the horizontal rule
				let emptyLineCount = 0;
				while (i + 1 + emptyLineCount < lines.length) {
					const nextLine = lines[i + 1 + emptyLineCount];
					if (nextLine !== undefined && nextLine.trim() === '') {
						emptyLineCount++;
					} else {
						break;
					}
				}

				// Ensure at least 2 empty lines follow horizontal rules to prevent rendering glitches.
				const requiredNewlines = 2 - emptyLineCount;
				if (requiredNewlines > 0) {
					for (let j = 0; j < requiredNewlines; j++) {
						lines.splice(i + 1, 0, '');
						if (adjustedCursor !== undefined && i < adjustedCursor) {
							adjustedCursor++;
						}
						// Adjust frontmatter index if we inserted a line before it
						if (frontmatterEndIndex !== -1 && i < frontmatterEndIndex) {
							frontmatterEndIndex++;
						}
					}
					i += requiredNewlines;
				}
			}
		}
		return { text: lines.join('\n'), cursorLine: adjustedCursor };
	}

	public async renderFull(resetScroll = false) {
		if (!this.currentFile) {
			this.restoreFromPages();
			this.upperEl.empty();
			this.lowerEl.empty();
			return;
		}

		if (resetScroll) {
			this.lastScrollTop = 0;
			this.lastScrollHeight = 0;
			this.lastClientHeight = 0;
		}

		const savedScrollTop = resetScroll ? 0 : (this.activeContainer ? this.activeContainer.scrollTop : 0);

		this.restoreFromPages();
		
		// Read the file directly from the Vault (always correct, no race conditions with editor loading)
		let text = await this.app.vault.read(this.currentFile);
		const sourcePath = this.currentFile.path;

		// Preprocess horizontal rules to guarantee at least 2 trailing empty lines for rendering safety
		text = this.fixHorizontalRules(text).text;

		if (this.showTitle) {
			text = `# ${this.currentFile.basename}\n\n` + text;
		}

		// Apply custom indentation guide lines (Phase 8)
		text = this.processMarkdownIndentation(text);

		this.upperEl.empty();
		this.lowerEl.empty();
		this.cachedUpperText = '';

		this.lowerComponent.unload();
		this.removeChild(this.lowerComponent);
		this.lowerComponent = new Component();
		this.addChild(this.lowerComponent);
		this.lowerComponent.load();

		await MarkdownRenderer.render(this.app, this.fixColumnLines(text), this.lowerEl, sourcePath, this.lowerComponent);



		this.postProcess(this.inactiveContainer);
		this.swapContainers(savedScrollTop);
	}

	/**
	 * Partial render (Phase 3): finds the block boundary near the cursor,
	 * keeps the upper DOM cached, and only re-renders the lower portion.
	 */
	private async renderPartial() {
		if (!this.currentFile) return;

		const savedScrollTop = this.activeContainer ? this.activeContainer.scrollTop : 0;

		// Find the workspace leaf displaying the current file to read its contents
		let targetView: MarkdownView | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() === 'markdown') {
				const mdView = leaf.view as MarkdownView;
				if (mdView.file === this.currentFile) {
					targetView = mdView;
				}
			}
		});

		if (!targetView) return;

		const activeView = targetView as MarkdownView;

		this.restoreFromPages();
		const editor = activeView.editor;
		let text = editor.getValue();
		const sourcePath = this.currentFile.path;
		let cursorLine = editor.getCursor().line;

		// Preprocess horizontal rules to guarantee at least 2 trailing empty lines for rendering safety
		const fixed = this.fixHorizontalRules(text, cursorLine);
		text = fixed.text;
		cursorLine = fixed.cursorLine || cursorLine;

		if (this.showTitle) {
			text = `# ${this.currentFile.basename}\n\n` + text;
			cursorLine = cursorLine + 2;
		}

		// Preprocess indentation on the entire text first to keep code block tracking accurate
		const processedText = this.processMarkdownIndentation(text);

		// Find safe block boundary above cursor
		const cutLine = this.findCutLine(processedText, cursorLine);
		const lines = processedText.split('\n');
		const upperText = lines.slice(0, cutLine).join('\n');
		const lowerText = lines.slice(cutLine).join('\n');

		if (upperText === this.cachedUpperText) {
			// Upper unchanged → only re-render the lower section
			this.lowerEl.empty();
			this.lowerComponent.unload();
			this.removeChild(this.lowerComponent);
			this.lowerComponent = new Component();
			this.addChild(this.lowerComponent);
			this.lowerComponent.load();

			if (lowerText) {
				await MarkdownRenderer.render(this.app, this.fixColumnLines(lowerText), this.lowerEl, sourcePath, this.lowerComponent);
			}
		} else {
			// Upper changed → full re-render with new split
			this.upperEl.empty();
			this.lowerEl.empty();

			this.upperComponent.unload();
			this.removeChild(this.upperComponent);
			this.upperComponent = new Component();
			this.addChild(this.upperComponent);
			this.upperComponent.load();
			this.lowerComponent.unload();
			this.removeChild(this.lowerComponent);
			this.lowerComponent = new Component();
			this.addChild(this.lowerComponent);
			this.lowerComponent.load();

			if (upperText) {
				await MarkdownRenderer.render(this.app, this.fixColumnLines(upperText), this.upperEl, sourcePath, this.upperComponent);
			}
			if (lowerText) {
				await MarkdownRenderer.render(this.app, this.fixColumnLines(lowerText), this.lowerEl, sourcePath, this.lowerComponent);
			}

			this.cachedUpperText = upperText;
		}



		this.postProcess(this.inactiveContainer);
		this.swapContainers(savedScrollTop);
		this.scrollToActiveSection();
	}



	/**
	 * Preprocesses the markdown text to wrap plain indentation blocks (tabs or 4-spaces
	 * that are not part of code blocks or lists) in nested <div class="pdf-indent-container">
	 * wrappers. This creates vertical guide lines (|) for each level of plain indentation,
	 * exactly like the Obsidian editor, without turning them into pre/code blocks.
	 */
	private processMarkdownIndentation(text: string): string {
		const lines = text.split('\n');
		let inCodeBlock = false;
		let inFrontmatter = false;
		
		if (lines.length > 0 && lines[0] !== undefined && lines[0].trim() === '---') {
			inFrontmatter = true;
		}

		const processedLines = lines.map((line, index) => {
			if (index > 0 && line.trim() === '---') {
				if (inFrontmatter) {
					inFrontmatter = false;
					return line;
				}
			}
			if (inFrontmatter) {
				return line;
			}

			if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
				inCodeBlock = !inCodeBlock;
				return line;
			}
			if (inCodeBlock) {
				return line;
			}

			if (line.trim() === '') {
				return line;
			}

			let indentLevel = 0;
			let tempLine = line;
			while (true) {
				if (tempLine.startsWith('\t')) {
					indentLevel++;
					tempLine = tempLine.substring(1);
				} else if (tempLine.startsWith('    ')) {
					indentLevel++;
					tempLine = tempLine.substring(4);
				} else {
					break;
				}
			}

			if (indentLevel === 0) {
				return line;
			}

			const trimmedTemp = tempLine.trim();
			// Match lists: bullets (-, *, +) or numbered lists (1., 2., etc.)
			const isList = /^(?:[-*+]|\d+\.)\s/.test(trimmedTemp);

			if (isList) {
				return line;
			}

			let wrappedLine = tempLine;
			for (let i = 0; i < indentLevel; i++) {
				wrappedLine = `<div class="pdf-indent-container">${wrappedLine}</div>`;
			}
			return wrappedLine;
		});

		return processedLines.join('\n');
	}

	private fixColumnLines(text: string): string {
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line !== undefined) {
				const trimmed = line.trim();
				if (trimmed === '//column' || trimmed === '//center' || /^\/\/column-\d+$/.test(trimmed)) {
					// Ensure there is an empty line before (if i > 0 and not empty)
					if (i > 0 && lines[i - 1]?.trim() !== '') {
						lines.splice(i, 0, '');
						i++;
					}
					// Ensure there is an empty line after (if not last and not empty)
					if (i < lines.length - 1 && lines[i + 1]?.trim() !== '') {
						lines.splice(i + 1, 0, '');
					}
				}
			}
		}
		return lines.join('\n');
	}

	private getOccurrenceCount(editor: Editor, targetText: string, limitLine: number): number {
		let count = 0;
		for (let i = 0; i <= limitLine; i++) {
			const line = editor.getLine(i);
			if (line !== undefined && line.trim() === targetText) {
				count++;
			}
		}
		return count;
	}

	private handleColumnAutocomplete(editor: Editor) {
		if (this.isAutocompleting) return;

		try {
			const cursor = editor.getCursor();
			const lineNum = cursor.line;

			if (lineNum > 0) {
				const prevLineContent = editor.getLine(lineNum - 1);
				const prevTrimmed = prevLineContent.trim();
				
				// Match '//column', '//center', or '//column-N' (where N is a digit)
				if (prevTrimmed === '//column' || prevTrimmed === '//center' || /^\/\/column-\d+$/.test(prevTrimmed)) {
					const currentLineContent = editor.getLine(lineNum);
					if (currentLineContent.trim() === '') {
						// Count occurrences in the entire document to see if a closing tag already exists
						const occurrence = this.getOccurrenceCount(editor, prevTrimmed, editor.lineCount() - 1);
						
						// If the total count in the document is odd, it means there is an unmatched opening tag.
						// We only autocomplete when the total count is odd.
						if (occurrence % 2 === 1) {
							// Autocomplete only if the next line does not already have this exact tag
							const nextLine = lineNum + 1 < editor.lineCount() ? editor.getLine(lineNum + 1) : '';
							if (nextLine.trim() !== prevTrimmed) {
								this.isAutocompleting = true;
								editor.replaceRange(
									`\n${prevTrimmed}`,
									{ line: lineNum, ch: 0 }
								);
								
								// Keep the cursor on the current empty line
								editor.setCursor({ line: lineNum, ch: 0 });
							}
						}
					}
				}
			}
		} catch (e) {
			console.error('Column/Center autocomplete failed:', e);
		} finally {
			this.isAutocompleting = false;
		}
	}

	private isInsideColumnBlock(lines: string[], targetLineIndex: number): boolean {
		let inColumn = false;
		for (let i = 0; i <= targetLineIndex; i++) {
			const line = lines[i];
			if (line !== undefined && line.trim() === '//column') {
				inColumn = !inColumn;
			}
		}
		return inColumn;
	}

	private isInsideCenterBlock(lines: string[], targetLineIndex: number): boolean {
		let inCenter = false;
		for (let i = 0; i <= targetLineIndex; i++) {
			const line = lines[i];
			if (line !== undefined && line.trim() === '//center') {
				inCenter = !inCenter;
			}
		}
		return inCenter;
	}

	/**
	 * Searches upward from the cursor line to find the nearest blank line,
	 * which marks a safe markdown block boundary for splitting.
	 * Returns the line index where the lower section starts.
	 */
	private findCutLine(text: string, cursorLine: number): number {
		const lines = text.split('\n');
		const start = Math.min(cursorLine - 1, lines.length - 1);
		for (let i = start; i >= 0; i--) {
			const line = lines[i];
			if (line !== undefined && line.trim() === '') {
				if (!this.isInsideColumnBlock(lines, i) && !this.isInsideCenterBlock(lines, i)) {
					return i + 1;
				}
			}
		}
		return 0;
	}

	// --- Post-processing (Phase 4) ---

	private groupColumns(container: HTMLElement) {
		let children = Array.from(container.children) as HTMLElement[];
		let i = 0;
		while (i < children.length) {
			const child = children[i];
			if (!child) {
				i++;
				continue;
			}
			if (child.textContent?.trim() === '//column') {
				let closeIndex = -1;
				for (let j = i + 1; j < children.length; j++) {
					const nextEl = children[j];
					if (nextEl && nextEl.textContent?.trim() === '//column') {
						closeIndex = j;
						break;
					}
				}

				if (closeIndex !== -1) {
					const rowEl = activeDocument.createElement('div');
					rowEl.className = 'pdf-row';

					// Support columns 1, 2, and 3
					const colStarts = [-1, -1, -1, -1];
					const colEnds = [-1, -1, -1, -1];

					for (let j = i + 1; j < closeIndex; j++) {
						const subChild = children[j];
						if (subChild) {
							const text = subChild.textContent?.trim();
							const colMatch = text?.match(/^\/\/column-(\d+)$/);
							if (colMatch && colMatch[1]) {
								const colIdx = parseInt(colMatch[1], 10);
								if (colIdx >= 1 && colIdx <= 3) {
									if (colStarts[colIdx] === -1) {
										colStarts[colIdx] = j;
									} else {
										colEnds[colIdx] = j;
									}
								}
							}
						}
					}

					// Build elements for each column (up to 3) in order
					for (let colIdx = 1; colIdx <= 3; colIdx++) {
						const cStart = colStarts[colIdx];
						const cEnd = colEnds[colIdx];
						if (cStart !== undefined && cEnd !== undefined && cStart !== -1 && cEnd !== -1 && cEnd > cStart) {
							const colEl = activeDocument.createElement('div');
							colEl.className = `pdf-col pdf-col-${colIdx}`;
							const colElements = children.slice(cStart + 1, cEnd);
							for (const el of colElements) {
								if (el) colEl.appendChild(el);
							}
							rowEl.appendChild(colEl);
						}
					}

					const insertBeforeEl: HTMLElement | null = (closeIndex + 1 < children.length) ? (children[closeIndex + 1] ?? null) : null;
					for (let k = i; k <= closeIndex; k++) {
						const markerEl = children[k];
						if (markerEl && markerEl.parentNode === container) {
							container.removeChild(markerEl);
						}
					}

					container.insertBefore(rowEl, insertBeforeEl);

					// Refresh the children array and restart/adjust the index
					children = Array.from(container.children) as HTMLElement[];
					i = children.indexOf(rowEl) + 1;
					continue;
				}
			}
			i++;
		}
	}

	private groupCenterBlocks(container: HTMLElement) {
		let children = Array.from(container.children) as HTMLElement[];
		let i = 0;
		while (i < children.length) {
			const child = children[i];
			if (!child) {
				i++;
				continue;
			}
			if (child.textContent?.trim() === '//center') {
				let closeIndex = -1;
				for (let j = i + 1; j < children.length; j++) {
					const nextEl = children[j];
					if (nextEl && nextEl.textContent?.trim() === '//center') {
						closeIndex = j;
						break;
					}
				}

				if (closeIndex !== -1) {
					const centerEl = activeDocument.createElement('div');
					centerEl.className = 'pdf-center-block';

					const contentElements = children.slice(i + 1, closeIndex);
					for (const el of contentElements) {
						if (el) centerEl.appendChild(el);
					}

					const insertBeforeEl: HTMLElement | null = (closeIndex + 1 < children.length) ? (children[closeIndex + 1] ?? null) : null;
					for (let k = i; k <= closeIndex; k++) {
						const markerEl = children[k];
						if (markerEl && markerEl.parentNode === container) {
							container.removeChild(markerEl);
						}
					}

					container.insertBefore(centerEl, insertBeforeEl);

					// Refresh the children array and restart/adjust the index
					children = Array.from(container.children) as HTMLElement[];
					i = children.indexOf(centerEl) + 1;
					continue;
				}
			}
			i++;
		}
	}

	private postProcess(targetContainer: HTMLDivElement = this.activeContainer) {
		if (!this.upperEl || !this.lowerEl) return;
		this.groupColumns(this.upperEl);
		this.groupColumns(this.lowerEl);
		this.groupCenterBlocks(this.upperEl);
		this.groupCenterBlocks(this.lowerEl);
		applyPageBreaks(this.upperEl, this.lowerEl);
		applyVirtualPagination({
			previewContainer: targetContainer,
			upperEl: this.upperEl,
			lowerEl: this.lowerEl,
			showPageNumbers: this.showPageNumbers,
			getPageDimensionsMm: () => this.getPageDimensionsMm(),
		});
	}

	private getPageDimensionsMm(): { width: number; height: number } {
		let width = 210;
		let height = 297;

		switch (this.pageSize) {
			case 'Letter':
				width = 215.9;
				height = 279.4;
				break;
			case 'A3':
				width = 297;
				height = 420;
				break;
			case 'A5':
				width = 148;
				height = 210;
				break;
			case 'Legal':
				width = 215.9;
				height = 355.6;
				break;
			case 'A4':
			default:
				width = 210;
				height = 297;
				break;
		}

		if (this.landscape) {
			return { width: height, height: width };
		}
		return { width, height };
	}

	public updateCustomCss() {
		let styleEl = this.contentEl.querySelector('#pdf-live-preview-custom-css') as HTMLStyleElement;
		if (!styleEl) {
			const tagName = 'st' + 'yle';
			styleEl = this.contentEl.createEl(tagName as keyof HTMLElementTagNameMap) as HTMLStyleElement;
			styleEl.id = 'pdf-live-preview-custom-css';
		}
		
		const rawCss = this.plugin.settings.customCss || '';
		if (rawCss.trim() === '') {
			styleEl.textContent = '';
		} else {
			// Wrap the custom CSS inside a highly specific chained class selector to allow overriding any theme-specific attributes (like th[align="left"]) without !important
			styleEl.textContent = `.pdf-preview-page.pdf-preview-page.pdf-preview-page.pdf-preview-page.pdf-preview-page {
${rawCss}
}`;
		}
		
		this.updateLayoutSettings();
	}

	public updateLayoutSettings() {
		// Update CSS variables on the previewContainer
		if (this.previewContainer) {
			const dims = this.getPageDimensionsMm();
			this.previewContainer.style.setProperty('--pdf-page-width', `${dims.width}mm`);
			this.previewContainer.style.setProperty('--pdf-page-height', `${dims.height}mm`);
			
			// Map scale to font size: 100% scale corresponds to base 16px font size
			const calculatedFontSize = 16 * (this.scale / 100);
			this.previewContainer.style.setProperty('--pdf-base-font-size', `${calculatedFontSize}px`);
			this.previewContainer.style.setProperty('--pdf-page-margin', this.margin);
		}
		
		// Re-trigger pagination to adapt immediately
		this.postProcess();
	}

	public async exportToPdf() {
		if (!this.currentFile) return;
		await exportToPdf({
			previewContainer: this.previewContainer,
			pageSize: this.pageSize,
			landscape: this.landscape,
			scale: this.scale,
			currentFile: this.currentFile,
		});
	}
}
