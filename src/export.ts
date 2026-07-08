import { App, Modal, Notice, Setting, DropdownComponent, SliderComponent, ToggleComponent, ColorComponent } from 'obsidian';
import { PDFDocument } from 'pdf-lib';
import { addOutline } from './pdf-outline';
import type { PdfPreviewView } from './view';

interface ElectronWebContents {
	printToPDF(options: {
		marginsType: number;
		pageSize: string;
		printBackground: boolean;
		landscape: boolean;
		scale: number;
	}): Promise<ArrayBuffer>;
}

interface ElectronModule {
	remote: {
		getCurrentWebContents(): ElectronWebContents;
	};
}

export class ExportPdfModal extends Modal {
	private view: PdfPreviewView;
	private isConfirmed = false;
	private originalPageSize!: string;
	private originalMargin!: string;
	private originalScale!: number;
	private originalLandscape!: boolean;
	private originalShowTitle!: boolean;

	constructor(app: App, view: PdfPreviewView) {
		super(app);
		this.view = view;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		this.titleEl.setText('Page settings');

		// Store original values
		this.originalPageSize = this.view.pageSize;
		this.originalMargin = this.view.margin;
		this.originalScale = this.view.scale;
		this.originalLandscape = this.view.landscape;
		this.originalShowTitle = this.view.showTitle;

		let sizeDropdown!: DropdownComponent;
		let marginDropdown!: DropdownComponent;
		let scaleSlider!: SliderComponent;
		let landscapeToggle!: ToggleComponent;
		let showTitleToggle!: ToggleComponent;

		// 1. Page Size
		new Setting(contentEl)
			.setName('Page size')
			.addDropdown(dropdown => {
				sizeDropdown = dropdown;
				dropdown
					.addOptions({
						'A4': 'A4',
						'Letter': 'Letter',
						'A3': 'A3',
						'A5': 'A5',
						'Legal': 'Legal'
					})
					.setValue(this.view.pageSize)
					.onChange(value => {
						this.view.pageSize = value;
						this.view.updateLayoutSettings();
					});
			});

		// 2. Margins
		new Setting(contentEl)
			.setName('Margins')
			.addDropdown(dropdown => {
				marginDropdown = dropdown;
				dropdown
					.addOptions({
						'20mm': 'Default',
						'0mm': 'None',
						'10mm': 'Small'
					})
					.setValue(this.view.margin)
					.onChange(value => {
						this.view.margin = value;
						this.view.updateLayoutSettings();
					});
			});

		// 3. Downscale percent
		new Setting(contentEl)
			.setName('Downscale percent')
			.addSlider(slider => {
				scaleSlider = slider;
				slider
					.setLimits(50, 150, 5)
					.setValue(this.view.scale)
					.setDynamicTooltip()
					.onChange(value => {
						this.view.scale = value;
						this.view.updateLayoutSettings();
					});
			});

		// 4. Landscape
		new Setting(contentEl)
			.setName('Landscape')
			.addToggle(toggle => {
				landscapeToggle = toggle;
				toggle
					.setValue(this.view.landscape)
					.onChange(value => {
						this.view.landscape = value;
						this.view.updateLayoutSettings();
					});
			});

		// 5. Show file name as title
		new Setting(contentEl)
			.setName('Show file name as title')
			.addToggle(toggle => {
				showTitleToggle = toggle;
				toggle
					.setValue(this.view.showTitle)
					.onChange(value => {
						this.view.showTitle = value;
						this.view.cachedUpperText = ''; // Force redraw
						void this.view.renderFull();
					});
			});

		// Footer buttons
		const buttonContainer = contentEl.createEl('div', {
			cls: 'pdf-modal-button-container',
			attr: { style: 'margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;' }
		});

		const resetBtn = buttonContainer.createEl('button', {
			text: 'Reset',
		});
		resetBtn.addEventListener('click', () => {
			// Reset to defaults in view properties (temporary until Done is clicked)
			this.view.pageSize = 'A4';
			this.view.margin = '20mm';
			this.view.scale = 100;
			this.view.landscape = false;
			
			const showTitleChanged = this.view.showTitle !== true;
			this.view.showTitle = true;

			// Update UI components in the modal
			sizeDropdown.setValue('A4');
			marginDropdown.setValue('20mm');
			scaleSlider.setValue(100);
			landscapeToggle.setValue(false);
			showTitleToggle.setValue(true);
			
			if (showTitleChanged) {
				this.view.cachedUpperText = ''; // Force redraw
				void this.view.renderFull();
			}
			this.view.updateLayoutSettings();
		});

		const doneBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Done',
		});
		doneBtn.addEventListener('click', () => {
			this.isConfirmed = true;
			// Persist settings
			this.view.plugin.settings.pageSize = this.view.pageSize;
			this.view.plugin.settings.margin = this.view.margin;
			this.view.plugin.settings.scale = this.view.scale;
			this.view.plugin.settings.landscape = this.view.landscape;
			this.view.plugin.settings.showTitle = this.view.showTitle;
			void this.view.plugin.saveSettings();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.isConfirmed) {
			// Restore original values
			this.view.pageSize = this.originalPageSize;
			this.view.margin = this.originalMargin;
			this.view.scale = this.originalScale;
			this.view.landscape = this.originalLandscape;
			if (this.view.showTitle !== this.originalShowTitle) {
				this.view.showTitle = this.originalShowTitle;
				this.view.cachedUpperText = ''; // Force redraw
				void this.view.renderFull();
			}
			this.view.updateLayoutSettings();
		}
	}
}

export class CustomCssModal extends Modal {
	private view: PdfPreviewView;
	private isConfirmed = false;
	private originalCss!: string;

	constructor(app: App, view: PdfPreviewView) {
		super(app);
		this.view = view;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		this.titleEl.setText('Custom CSS');
		
		this.originalCss = this.view.plugin.settings.customCss || '';

		const textareaContainer = contentEl.createEl('div', {
			attr: { style: 'width: 100%; margin-bottom: 20px;' }
		});

		const textarea = textareaContainer.createEl('textarea', {
			attr: {
				style: 'width: 100%; height: 250px; font-family: monospace; font-size: 13px; resize: vertical; box-sizing: border-box; padding: 10px;',
				placeholder: '/* Example: */\nh1 {\n    color: #4a90e2;\n}\ntable th {\n    background-color: #e3faf2;\n}'
			}
		});
		textarea.value = this.originalCss;

		// Allow Tab key to insert 4 spaces instead of losing focus
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Tab') {
				e.preventDefault();
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const val = textarea.value;
				textarea.value = val.substring(0, start) + '    ' + val.substring(end);
				textarea.selectionStart = textarea.selectionEnd = start + 4;
			}
		});

		// Real-time preview: apply CSS as the user types
		textarea.addEventListener('input', () => {
			this.view.plugin.settings.customCss = textarea.value;
			this.view.updateCustomCss();
		});

		const buttonContainer = contentEl.createEl('div', {
			cls: 'pdf-modal-button-container',
			attr: { style: 'display: flex; justify-content: flex-end; gap: 12px;' }
		});

		// Reset button (clear textarea, but do not save or close)
		const resetBtn = buttonContainer.createEl('button', {
			text: 'Reset',
		});
		resetBtn.addEventListener('click', () => {
			textarea.value = '';
			this.view.plugin.settings.customCss = '';
			this.view.updateCustomCss();
		});

		// Done button (save and close)
		const doneBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Done',
		});
		doneBtn.addEventListener('click', () => {
			this.isConfirmed = true;
			this.view.plugin.settings.customCss = textarea.value;
			void this.view.plugin.saveSettings();
			this.view.updateCustomCss();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		
		if (!this.isConfirmed) {
			this.view.plugin.settings.customCss = this.originalCss;
			this.view.updateCustomCss();
		}
	}
}

export class QuickStyleModal extends Modal {
	private view: PdfPreviewView;
	private isConfirmed = false;
	
	private originalFontFamily!: string;
	private originalFontSize!: number;
	private originalTextColor!: string;
	private originalBackgroundColor!: string;

	constructor(app: App, view: PdfPreviewView) {
		super(app);
		this.view = view;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText('Quick styles');

		const settings = this.view.plugin.settings;
		this.originalFontFamily = settings.fontFamily || 'default';
		this.originalFontSize = settings.fontSize || 16;
		this.originalTextColor = settings.textColor || 'default';
		this.originalBackgroundColor = settings.backgroundColor || 'default';

		let fontDropdown: DropdownComponent;
		let sizeSlider: SliderComponent;
		let colorPicker: ColorComponent;

		// 1. Font Family Setting
		new Setting(contentEl)
			.setName('Font family')
			.setDesc('Choose the base font style for the PDF page.')
			.addDropdown(dropdown => {
				fontDropdown = dropdown;
				dropdown
					.addOption('default', 'Default')
					.addOption('minimal', 'Minimal')
					.addOption('editorial', 'Editorial')
					.addOption('novel', 'Warm novel')
					.addOption('technical', 'Technical')
					.setValue(settings.fontFamily)
					.onChange(value => {
						this.view.plugin.settings.fontFamily = value;
						this.view.updateGuiCss();
					});
			});

		// 2. Font Size Setting
		new Setting(contentEl)
			.setName('Font size')
			.setDesc('Adjust the base text font size (default: 16px).')
			.addSlider(slider => {
				sizeSlider = slider;
				slider
					.setLimits(12, 24, 1)
					.setValue(settings.fontSize)
					.setDynamicTooltip()
					.onChange(value => {
						this.view.plugin.settings.fontSize = value;
						this.view.updateGuiCss();
					});
			});

		// 3. Text Color Setting
		new Setting(contentEl)
			.setName('Text color')
			.setDesc('Set the main body text color.')
			.addExtraButton(button => {
				button
					.setIcon('rotate-ccw')
					.onClick(() => {
						this.view.plugin.settings.textColor = 'default';
						colorPicker.setValue('#000000');
						this.view.updateGuiCss();
					});
			})
			.addColorPicker(picker => {
				colorPicker = picker;
				picker
					.setValue(settings.textColor === 'default' ? '#000000' : settings.textColor)
					.onChange(value => {
						this.view.plugin.settings.textColor = value;
						this.view.updateGuiCss();
					});
			});

		// Footer buttons
		const buttonContainer = contentEl.createEl('div', {
			cls: 'pdf-modal-button-container',
			attr: { style: 'margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;' }
		});

		// Reset button
		const resetBtn = buttonContainer.createEl('button', {
			text: 'Reset',
		});
		resetBtn.addEventListener('click', () => {
			this.view.plugin.settings.fontFamily = 'default';
			this.view.plugin.settings.fontSize = 16;
			this.view.plugin.settings.textColor = 'default';
			this.view.plugin.settings.backgroundColor = 'default';

			// Update UI
			fontDropdown.setValue('default');
			sizeSlider.setValue(16);
			colorPicker.setValue('#000000');

			this.view.updateGuiCss();
		});

		// Done button
		const doneBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Done',
		});
		doneBtn.addEventListener('click', () => {
			this.isConfirmed = true;
			void this.view.plugin.saveSettings();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.isConfirmed) {
			this.view.plugin.settings.fontFamily = this.originalFontFamily;
			this.view.plugin.settings.fontSize = this.originalFontSize;
			this.view.plugin.settings.textColor = this.originalTextColor;
			this.view.plugin.settings.backgroundColor = this.originalBackgroundColor;
			this.view.updateGuiCss();
		}
	}
}

export interface ExportConfig {
	previewContainer: HTMLDivElement;
	pageSize: string;
	landscape: boolean;
	scale: number;
	currentFile: { basename: string };
}

export async function exportToPdf(config: ExportConfig) {
	const { previewContainer, pageSize, landscape, scale, currentFile } = config;

	new Notice('Preparing PDF export...');

	try {
		const globalWindow = window as unknown as { 
			require(module: 'electron'): ElectronModule; 
		};
		const electron = globalWindow.require('electron');
		const webContents = electron.remote ? electron.remote.getCurrentWebContents() : null;

		if (!webContents) {
			throw new Error('Electron webContents is not accessible.');
		}

		// Clone the preview container to avoid removing the original from the view (which causes white flash)
		const printClone = previewContainer.cloneNode(true) as HTMLDivElement;
		printClone.classList.add('pdf-print-clone');

		// Append to body temporarily so it is a direct child of body and unaffected by parent layout clipping/hiding
		activeDocument.body.appendChild(printClone);

		// 1. Add printing class to body to apply print-only styles
		activeDocument.body.classList.add('pdf-export-printing');

		// Force a browser DOM style reflow and wait for layout to repaint completely
		const _reflow = activeDocument.body.offsetHeight;
		await new Promise<void>(resolve => {
			window.setTimeout(resolve, 100);
		});

		// 2. Call printToPDF
		const options = {
			marginsType: 1, // no margins
			pageSize,
			printBackground: true,
			landscape,
			scale: scale / 100,
		};

		let data: ArrayBuffer;
		try {
			data = await webContents.printToPDF(options);
		} finally {
			// 3. Remove printing class and clean up the clone node immediately
			activeDocument.body.classList.remove('pdf-export-printing');
			printClone.remove();
		}

		// 4. Parse headings and map to page indices
		const bookmarks: { text: string; pageIndex: number; level: number }[] = [];
		const wrappers = Array.from(previewContainer.querySelectorAll('.pdf-page-wrapper'));

		wrappers.forEach((wrapper, pageIndex) => {
			const headingsInPage = wrapper.querySelectorAll('h1, h2, h3, h4, h5, h6');
			headingsInPage.forEach((hEl) => {
				bookmarks.push({
					text: hEl.textContent || '',
					level: parseInt(hEl.tagName.substring(1)),
					pageIndex: pageIndex,
				});
			});
		});

		// 5. Inject outline bookmarks using pdf-lib
		const pdfBytes = new Uint8Array(data);
		const pdfDoc = await PDFDocument.load(pdfBytes);
		await addOutline(pdfDoc, bookmarks);
		const finalPdfBytes = await pdfDoc.save();

		// 6. Save the file using standard Web Blob download trigger
		const blob = new Blob([finalPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		const downloadLink = activeDocument.createElement('a');
		downloadLink.href = url;
		downloadLink.download = `${currentFile.basename}.pdf`;
		activeDocument.body.appendChild(downloadLink);
		downloadLink.click();
		downloadLink.remove();
		URL.revokeObjectURL(url);
		new Notice('PDF successfully exported!');
	} catch (error) {
		console.error('PDF export failed:', error);
		// Safe cleanup
		activeDocument.body.classList.remove('pdf-export-printing');
		const msg = error instanceof Error ? error.message : String(error);
		new Notice('Failed to export PDF: ' + msg);
	}
}
