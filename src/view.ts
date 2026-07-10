import { Component, ItemView, MarkdownRenderer, WorkspaceLeaf, TFile, setIcon, debounce, MarkdownView, Editor } from 'obsidian';
import morphdom from 'morphdom';
import { restoreFromPages, applyPageBreaks, applyVirtualPagination } from './pagination';
import { ExportPdfModal, CustomCssModal, QuickStyleModal, exportToPdf } from './export';
import type LivePdfPreviewPlugin from './main';
import { FONT_FAMILY_MAP, PAGE_DIMENSIONS, VIEW_TYPE_PDF_PREVIEW } from './types';
import { processMarkdownIndentation, fixColumnLines, fixHorizontalRules, findCutLine } from './preprocessor';
import { groupColumns, groupCenterBlocks } from './dom-utils';

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
	private resizeTimeout: number | null = null;
	private isProgrammaticScrolling = false;
	private targetScrollTop: number | null = null;
	private scrollLockTimeout: number | null = null;
	private isRendering = false;
	private pendingRender = false;

	private prevPageSize = '';
	private prevMargin = '';
	private prevScale = -1;
	private prevLandscape = false;
	private prevFontSize = -1;
	private prevFontFamily = '';
	private prevTextColor = '';

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
		
		// Initialize change tracking caches
		this.prevPageSize = this.pageSize;
		this.prevMargin = this.margin;
		this.prevScale = this.scale;
		this.prevLandscape = this.landscape;
		this.prevFontSize = this.plugin.settings.fontSize || 16;
		this.prevFontFamily = this.plugin.settings.fontFamily || 'default';
		this.prevTextColor = this.plugin.settings.textColor || 'default';
	}

	getViewType(): string {
		return VIEW_TYPE_PDF_PREVIEW;
	}

	getDisplayText(): string {
		return 'Live PDF preview';
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

		// Quick Styles button (File with T icon)
		const quickStyleBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Quick styles' }
		});
		setIcon(quickStyleBtn, 'file-type-2');

		// Custom CSS button (File with Code icon)
		const cssBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Custom CSS' }
		});
		setIcon(cssBtn, 'file-code');

		// Settings button (File with Gear icon)
		const settingsBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Page settings' }
		});
		setIcon(settingsBtn, 'file-cog');

		// Export PDF button
		const exportBtn = actionsEl.createEl('button', {
			cls: 'clickable-icon pdf-action-btn',
			attr: { 'aria-label': 'Export to PDF' }
		});
		setIcon(exportBtn, 'printer');

		// Quick Styles button opens the quick styles modal
		quickStyleBtn.addEventListener('click', () => {
			new QuickStyleModal(this.app, this).open();
		});

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
			if (this.isProgrammaticScrolling) return; // Ignore programmatic scroll events
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

		// Apply initial values
		this.updateGuiCss();
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
		this.resizeObserver = new ResizeObserver(() => {
			this.isResizing = true;
			if (this.resizeTimeout) {
				window.clearTimeout(this.resizeTimeout);
			}

			// Proportionally adjust scroll position during resize
			this.adjustScrollOnResize();

			// End resizing status 150ms after resizing ends
			this.resizeTimeout = window.setTimeout(() => {
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
		if (this.resizeTimeout) {
			window.clearTimeout(this.resizeTimeout);
			this.resizeTimeout = null;
		}
		if (this.scrollLockTimeout) {
			window.clearTimeout(this.scrollLockTimeout);
			this.scrollLockTimeout = null;
		}
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
				// Clone the wrapper and its contents to use for offscreen restoration,
				// leaving the visible DOM nodes in activeContainer completely untouched.
				const clone = w.cloneNode(true);
				originalHolder.appendChild(clone);
			}
			restoreFromPages(originalHolder, this.upperEl, this.lowerEl);
		} else {
			restoreFromPages(this.activeContainer, this.upperEl, this.lowerEl);
		}
	}

	private swapContainers(overrideScrollTop?: number) {
		// Surgical in-place DOM diffing using morphdom (Phase 13 Idea B)
		// We morph activeContainer's child elements to match inactiveContainer's children,
		// which prevents screen flashes and preserves browser native scroll inertia.
		morphdom(this.activeContainer, this.inactiveContainer, {
			childrenOnly: true
		});

		// Clean up the offscreen inactive container so it's ready for the next render
		this.inactiveContainer.empty();

		if (overrideScrollTop !== undefined) {
			this.activeContainer.scrollTop = overrideScrollTop;
		}

		// Update the scroll dimension cache for the active container
		this.lastScrollTop = this.activeContainer.scrollTop;
		this.lastScrollHeight = this.activeContainer.scrollHeight;
		this.lastClientHeight = this.activeContainer.clientHeight;
	}

	private scrollToActiveSection() {
		if (!this.activeContainer) return;

		// If we are already in the middle of a smooth programmatic scroll,
		// continue smooth-scrolling to the existing target on the new container without snapping back
		if (this.isProgrammaticScrolling && this.targetScrollTop !== null) {
			this.activeContainer.scrollTo({ top: this.targetScrollTop, behavior: 'smooth' });
			if (this.scrollLockTimeout) {
				window.clearTimeout(this.scrollLockTimeout);
			}
			this.scrollLockTimeout = window.setTimeout(() => {
				this.isProgrammaticScrolling = false;
				this.targetScrollTop = null;
				this.scrollLockTimeout = null;
			}, 400);
			return;
		}

		const firstLowerEl = this.activeContainer.querySelector('[data-section="lower"]');
		if (firstLowerEl) {
			const containerRect = this.activeContainer.getBoundingClientRect();
			const elRect = firstLowerEl.getBoundingClientRect();

			// ONLY check if the start (top) of the modified section is visible within the viewport
			// We give it a safety margin of 40px from the bottom so it doesn't get cut off.
			const isVisible = elRect.top >= containerRect.top && elRect.top <= (containerRect.bottom - 40);

			if (!isVisible) {
				const target = this.activeContainer.scrollTop + (elRect.top - containerRect.top);
				this.targetScrollTop = target;
				this.isProgrammaticScrolling = true;

				if (this.scrollLockTimeout) {
					window.clearTimeout(this.scrollLockTimeout);
				}

				this.activeContainer.scrollTo({ top: target, behavior: 'smooth' });

				this.scrollLockTimeout = window.setTimeout(() => {
					this.isProgrammaticScrolling = false;
					this.targetScrollTop = null;
					this.scrollLockTimeout = null;
				}, 400);
			}
		}
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

		const savedScrollTop = resetScroll ? 0 : undefined;

		this.restoreFromPages();
		
		// Read the file directly from the Vault (always correct, no race conditions with editor loading)
		let text = await this.app.vault.read(this.currentFile);
		const sourcePath = this.currentFile.path;

		// Preprocess horizontal rules to guarantee at least 2 trailing empty lines for rendering safety
		text = fixHorizontalRules(text).text;

		if (this.showTitle) {
			text = `# ${this.currentFile.basename}\n\n` + text;
		}

		// Apply custom indentation guide lines (Phase 8)
		text = processMarkdownIndentation(text);

		this.upperEl.empty();
		this.lowerEl.empty();
		this.cachedUpperText = '';

		this.recycleComponent('lower');

		await MarkdownRenderer.render(this.app, fixColumnLines(text), this.lowerEl, sourcePath, this.lowerComponent);



		this.postProcess(this.inactiveContainer);
		this.swapContainers(savedScrollTop);
	}

	/**
	 * Partial render (Phase 3): finds the block boundary near the cursor,
	 * keeps the upper DOM cached, and only re-renders the lower portion.
	 */
	private async renderPartial() {
		if (!this.currentFile) return;

		if (this.isRendering) {
			this.pendingRender = true;
			return;
		}

		this.isRendering = true;
		this.pendingRender = false;

		try {
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
			const fixed = fixHorizontalRules(text, cursorLine);
			text = fixed.text;
			cursorLine = fixed.cursorLine || cursorLine;

			if (this.showTitle) {
				text = `# ${this.currentFile.basename}\n\n` + text;
				cursorLine = cursorLine + 2;
			}

			// Preprocess indentation on the entire text first to keep code block tracking accurate
			const processedText = processMarkdownIndentation(text);

			// Find safe block boundary above cursor
			const cutLine = findCutLine(processedText, cursorLine);
			const lines = processedText.split('\n');
			const upperText = lines.slice(0, cutLine).join('\n');
			const lowerText = lines.slice(cutLine).join('\n');

			if (upperText === this.cachedUpperText) {
				// Upper unchanged → only re-render the lower section
				this.lowerEl.empty();
				this.recycleComponent('lower');

				if (lowerText) {
					await MarkdownRenderer.render(this.app, fixColumnLines(lowerText), this.lowerEl, sourcePath, this.lowerComponent);
				}
			} else {
				// Upper changed → full re-render with new split
				this.upperEl.empty();
				this.lowerEl.empty();

				this.recycleComponent('upper');
				this.recycleComponent('lower');

				if (upperText) {
					await MarkdownRenderer.render(this.app, fixColumnLines(upperText), this.upperEl, sourcePath, this.upperComponent);
				}
				if (lowerText) {
					await MarkdownRenderer.render(this.app, fixColumnLines(lowerText), this.lowerEl, sourcePath, this.lowerComponent);
				}

				this.cachedUpperText = upperText;
			}

			this.postProcess(this.inactiveContainer);
			this.swapContainers();
			this.scrollToActiveSection();
		} finally {
			this.isRendering = false;
			if (this.pendingRender) {
				this.pendingRender = false;
				void this.renderPartial();
			}
		}
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



	private postProcess(targetContainer: HTMLDivElement = this.activeContainer) {
		if (!this.upperEl || !this.lowerEl) return;
		groupColumns(this.upperEl);
		groupColumns(this.lowerEl);
		groupCenterBlocks(this.upperEl);
		groupCenterBlocks(this.lowerEl);
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
		const dim = (PAGE_DIMENSIONS[this.pageSize] || PAGE_DIMENSIONS.A4)!;
		if (this.landscape) {
			return { width: dim.height, height: dim.width };
		}
		return { width: dim.width, height: dim.height };
	}

	private getOrCreateStyleEl(id: string, insertBeforeEl?: Element | null): HTMLStyleElement {
		let styleEl = this.contentEl.querySelector(`#${id}`) as HTMLStyleElement;
		if (!styleEl) {
			const tagName = 'st' + 'yle';
			styleEl = this.contentEl.createEl(tagName as keyof HTMLElementTagNameMap) as HTMLStyleElement;
			styleEl.id = id;
			if (insertBeforeEl) {
				this.contentEl.insertBefore(styleEl, insertBeforeEl);
			}
		}
		return styleEl;
	}

	public updateGuiCss(resetScroll = false) {
		const customCssEl = this.contentEl.querySelector('#pdf-live-preview-custom-css');
		const styleEl = this.getOrCreateStyleEl('pdf-live-preview-gui-css', customCssEl);
		
		const settings = this.plugin.settings;
		let cssText = '';
		
		// 1. Font Family
		let fontRule = '';
		if (settings.fontFamily && settings.fontFamily !== 'default') {
			const family = FONT_FAMILY_MAP[settings.fontFamily];
			if (family) {
				fontRule = `font-family: ${family};\n\t--font-text: ${family};`;
			}
		}
		
		// 2. Text Color
		let colorRule = '';
		if (settings.textColor && settings.textColor !== 'default') {
			colorRule = `color: ${settings.textColor};\n\t--text-normal: ${settings.textColor};`;
		}
		
		if (fontRule || colorRule) {
			cssText += `.pdf-preview-page {\n\t${fontRule}\n\t${colorRule}\n}\n`;
		}
		
		styleEl.textContent = cssText;
		this.updateLayoutSettings(resetScroll);
	}

	private getValidRulesText(styleEl: HTMLStyleElement): string {
		try {
			const sheet = styleEl.sheet as CSSStyleSheet;
			if (!sheet) return '';
			return Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
		} catch {
			return '';
		}
	}

	public updateCustomCss(resetScroll = false) {
		const styleEl = this.getOrCreateStyleEl('pdf-live-preview-custom-css');
		
		// Capture the successfully parsed CSS rules before updating
		const rulesBefore = this.getValidRulesText(styleEl);

		const rawCss = this.plugin.settings.customCss || '';
		if (rawCss.trim() === '') {
			styleEl.textContent = '';
		} else {
			// Wrap the custom CSS inside a highly specific chained class selector to allow overriding any theme-specific attributes (like th[align="left"]) without !important
			styleEl.textContent = `.pdf-preview-page.pdf-preview-page.pdf-preview-page.pdf-preview-page.pdf-preview-page {
${rawCss}
}`;
		}
		
		// Capture the successfully parsed CSS rules after updating
		const rulesAfter = this.getValidRulesText(styleEl);
		const isStyleChanged = rulesBefore !== rulesAfter;

		this.updateLayoutSettings(false, resetScroll && isStyleChanged);
	}

	public updateLayoutSettings(resetScroll = false, forceResetScroll = false) {
		const isPageSizeChanged = this.prevPageSize !== this.pageSize;
		const isMarginChanged = this.prevMargin !== this.margin;
		const isScaleChanged = this.prevScale !== this.scale;
		const isLandscapeChanged = this.prevLandscape !== this.landscape;
		
		const currentFontSize = this.plugin.settings.fontSize || 16;
		const isFontSizeChanged = this.prevFontSize !== currentFontSize;
		
		const currentFontFamily = this.plugin.settings.fontFamily || 'default';
		const isFontFamilyChanged = this.prevFontFamily !== currentFontFamily;
		
		const currentTextColor = this.plugin.settings.textColor || 'default';
		const isTextColorChanged = this.prevTextColor !== currentTextColor;

		const isLayoutChanged = isPageSizeChanged || isMarginChanged || isScaleChanged || isLandscapeChanged || 
		                         isFontSizeChanged || isFontFamilyChanged || isTextColorChanged;

		// Update the change tracking caches
		this.prevPageSize = this.pageSize;
		this.prevMargin = this.margin;
		this.prevScale = this.scale;
		this.prevLandscape = this.landscape;
		this.prevFontSize = currentFontSize;
		this.prevFontFamily = currentFontFamily;
		this.prevTextColor = currentTextColor;

		const savedScrollTop = (forceResetScroll || (resetScroll && isLayoutChanged)) ? 0 : (this.activeContainer ? this.activeContainer.scrollTop : 0);

		// Update CSS variables on both preview containers
		const containers = [this.containerA, this.containerB];
		const dims = this.getPageDimensionsMm();
		for (const container of containers) {
			if (container) {
				container.style.setProperty('--pdf-page-width', `${dims.width}mm`);
				container.style.setProperty('--pdf-page-height', `${dims.height}mm`);
				
				// Map scale to font size: 100% scale corresponds to base font size configured in GUI settings
				const baseSize = this.plugin.settings.fontSize || 16;
				const calculatedFontSize = baseSize * (this.scale / 100);
				container.style.setProperty('--pdf-base-font-size', `${calculatedFontSize}px`);
				
				// Map scale to heading base font size: only scales with downscale percent, NOT with custom font size
				const calculatedHeadingSize = 16 * (this.scale / 100);
				container.style.setProperty('--pdf-heading-base-font-size', `${calculatedHeadingSize}px`);
				container.style.setProperty('--pdf-page-margin', this.margin);
			}
		}
		
		// Re-trigger offscreen pagination and swap smoothly using morphdom to control scroll top precisely
		this.restoreFromPages();
		this.postProcess(this.inactiveContainer);
		this.swapContainers(savedScrollTop);
	}

	private recycleComponent(type: 'upper' | 'lower') {
		if (type === 'upper') {
			this.upperComponent.unload();
			this.removeChild(this.upperComponent);
			this.upperComponent = new Component();
			this.addChild(this.upperComponent);
			this.upperComponent.load();
		} else {
			this.lowerComponent.unload();
			this.removeChild(this.lowerComponent);
			this.lowerComponent = new Component();
			this.addChild(this.lowerComponent);
			this.lowerComponent.load();
		}
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
