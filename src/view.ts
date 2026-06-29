import { Component, ItemView, MarkdownRenderer, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { debounce } from 'lodash-es';
import { restoreFromPages, applyPageBreaks, applyVirtualPagination } from './pagination';
import { ExportPdfModal, exportToPdf } from './export';

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

	private debouncedRender = debounce(() => {
		this.renderPartial();
	}, 150);

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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

		// Settings button opens the native settings modal
		settingsBtn.addEventListener('click', () => {
			new ExportPdfModal(this.app, this).open();
		});

		// Export PDF button (printer icon) immediately exports!
		exportBtn.addEventListener('click', () => {
			this.exportToPdf();
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

		// Create the master render container (hidden offscreen)
		this.masterContainer = container.createEl('div', {
			cls: 'pdf-preview-master',
		});

		// Upper and lower sections for partial rendering (Phase 3)
		this.upperEl = this.masterContainer.createEl('div');
		this.lowerEl = this.masterContainer.createEl('div');

		// Apply initial values
		this.updateLayoutSettings();

		this.upperComponent.load();
		this.lowerComponent.load();

		// Subscribe to editor-change events for real-time rendering
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				// Only re-render if the change belongs to the active file being previewed
				if (info.file === this.currentFile) {
					this.debouncedRender();
				}
			})
		);

		// Subscribe to file-open events to update the preview when switching files
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.onFileOpen(file);
			})
		);

		// Add a ResizeObserver to trigger postProcess when the view is attached and sized
		this.resizeObserver = new ResizeObserver(
			debounce(() => {
				if (this.activeContainer && this.activeContainer.offsetHeight > 0) {
					this.postProcess(this.activeContainer);
				}
			}, 100)
		);
		this.resizeObserver.observe(this.containerA);
		this.resizeObserver.observe(this.containerB);

		// Initial render of current active file
		const activeFile = this.app.workspace.getActiveFile();
		this.onFileOpen(activeFile);
	}

	async onClose() {
		this.debouncedRender.cancel();
		this.upperComponent.unload();
		this.lowerComponent.unload();
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
		this.renderFull();
	}

	// --- Rendering ---

	/**
	 * Helper to restore DOM elements from pages back to upper/lower master elements.
	 */
	private restoreFromPages() {
		if (!this.activeContainer) return;

		const currentWrappers = Array.from(this.activeContainer.querySelectorAll('.pdf-page-wrapper'));
		if (currentWrappers.length > 0) {
			const originalHolder = document.createElement('div');
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

	public async renderFull() {
		if (!this.currentFile) {
			this.restoreFromPages();
			this.upperEl.empty();
			this.lowerEl.empty();
			return;
		}

		const savedScrollTop = this.activeContainer ? this.activeContainer.scrollTop : 0;

		this.restoreFromPages();
		
		// Read the file directly from the Vault (always correct, no race conditions with editor loading)
		let text = await this.app.vault.read(this.currentFile);
		const sourcePath = this.currentFile.path;

		// Preprocess horizontal rules to guarantee at least 2 trailing empty lines for rendering safety
		text = this.fixHorizontalRules(text).text;

		if (this.showTitle) {
			text = `# ${this.currentFile.basename}\n\n` + text;
		}

		this.upperEl.empty();
		this.lowerEl.empty();
		this.cachedUpperText = '';

		this.lowerComponent.unload();
		this.lowerComponent = new Component();
		this.lowerComponent.load();

		await MarkdownRenderer.render(this.app, text, this.lowerEl, sourcePath, this.lowerComponent);

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
		let targetView: any = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() === 'markdown' && (leaf.view as any).file === this.currentFile) {
				targetView = leaf.view;
			}
		});

		if (!targetView) return;

		this.restoreFromPages();
		const editor = targetView.editor;
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

		// Find safe block boundary above cursor
		const cutLine = this.findCutLine(text, cursorLine);
		const lines = text.split('\n');
		const upperText = lines.slice(0, cutLine).join('\n');
		const lowerText = lines.slice(cutLine).join('\n');

		if (upperText === this.cachedUpperText) {
			// Upper unchanged → only re-render the lower section
			this.lowerEl.empty();
			this.lowerComponent.unload();
			this.lowerComponent = new Component();
			this.lowerComponent.load();

			if (lowerText) {
				await MarkdownRenderer.render(this.app, lowerText, this.lowerEl, sourcePath, this.lowerComponent);
			}
		} else {
			// Upper changed → full re-render with new split
			this.upperEl.empty();
			this.lowerEl.empty();

			this.upperComponent.unload();
			this.upperComponent = new Component();
			this.upperComponent.load();
			this.lowerComponent.unload();
			this.lowerComponent = new Component();
			this.lowerComponent.load();

			if (upperText) {
				await MarkdownRenderer.render(this.app, upperText, this.upperEl, sourcePath, this.upperComponent);
			}
			if (lowerText) {
				await MarkdownRenderer.render(this.app, lowerText, this.lowerEl, sourcePath, this.lowerComponent);
			}

			this.cachedUpperText = upperText;
		}

		this.postProcess(this.inactiveContainer);
		this.swapContainers(savedScrollTop);
		this.scrollToActiveSection();
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
				return i + 1;
			}
		}
		return 0;
	}

	// --- Post-processing (Phase 4) ---

	private postProcess(targetContainer: HTMLDivElement = this.activeContainer) {
		if (!this.upperEl || !this.lowerEl) return;
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
