import { App, Modal, Notice, Setting, DropdownComponent, SliderComponent, ToggleComponent, ColorComponent, TextComponent, debounce } from 'obsidian';
import { PDFDocument } from 'pdf-lib';
import { addOutline } from './pdf-outline';
import type { PdfPreviewView } from './view';
import type { ExportConfig, ElectronModule } from './types';
import { FONT_DISPLAY_NAMES } from './types';

export abstract class BasePreviewModal extends Modal {
	protected view: PdfPreviewView;
	protected isConfirmed = false;

	constructor(app: App, view: PdfPreviewView) {
		super(app);
		this.view = view;
	}

	abstract saveOriginals(): void;
	abstract restoreOriginals(): void;
	abstract buildContent(contentEl: HTMLElement): void;

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.saveOriginals();
		this.buildContent(contentEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.isConfirmed) {
			this.restoreOriginals();
		}
	}

	protected createFooterButtons(
		contentEl: HTMLElement,
		onReset: () => void,
		onDone?: () => void
	) {
		const buttonContainer = contentEl.createEl('div', {
			cls: 'pdf-modal-button-container',
			attr: { style: 'margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;' }
		});

		const resetBtn = buttonContainer.createEl('button', {
			text: 'Reset',
		});
		resetBtn.addEventListener('click', onReset);

		const doneBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Done',
		});
		doneBtn.addEventListener('click', () => {
			this.isConfirmed = true;
			if (onDone) {
				onDone();
			} else {
				void this.view.plugin.saveSettings();
			}
			this.close();
		});
	}
}

export class ExportPdfModal extends BasePreviewModal {
	private originalPageSize!: string;
	private originalCustomWidth!: number;
	private originalCustomHeight!: number;
	private originalMargin!: string;
	private originalScale!: number;
	private originalLandscape!: boolean;
	private originalShowTitle!: boolean;

	saveOriginals() {
		this.originalPageSize = this.view.pageSize;
		this.originalCustomWidth = this.view.customPageWidth;
		this.originalCustomHeight = this.view.customPageHeight;
		this.originalMargin = this.view.margin;
		this.originalScale = this.view.scale;
		this.originalLandscape = this.view.landscape;
		this.originalShowTitle = this.view.showTitle;
	}

	restoreOriginals() {
		this.view.pageSize = this.originalPageSize;
		this.view.customPageWidth = this.originalCustomWidth;
		this.view.customPageHeight = this.originalCustomHeight;
		this.view.margin = this.originalMargin;
		this.view.scale = this.originalScale;
		this.view.landscape = this.originalLandscape;
		if (this.view.showTitle !== this.originalShowTitle) {
			this.view.showTitle = this.originalShowTitle;
			this.view.cachedUpperText = '';
			void this.view.renderFull(true);
		}
		this.view.updateLayoutSettings();
	}

	buildContent(contentEl: HTMLElement) {
		this.titleEl.setText('Page settings');

		let sizeDropdown!: DropdownComponent;
		let customSizeSetting!: Setting;
		let customWidthInput!: TextComponent;
		let customHeightInput!: TextComponent;
		let marginDropdown!: DropdownComponent;
		let scaleSlider!: SliderComponent;
		let landscapeToggle!: ToggleComponent;
		let showTitleToggle!: ToggleComponent;

		const updateCustomSizeVisibility = () => {
			customSizeSetting.settingEl.style.display = this.view.pageSize === 'Custom' ? '' : 'none';
		};

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
						'Legal': 'Legal',
						'Custom': 'Custom'
					})
					.setValue(this.view.pageSize)
					.onChange(value => {
						this.view.pageSize = value;
						updateCustomSizeVisibility();
						this.view.updateLayoutSettings(true);
					});
			});

		customSizeSetting = new Setting(contentEl)
			.setName('Custom size')
			.setDesc('Page dimensions in millimeters')
			.addText(text => {
				customWidthInput = text;
				text.setPlaceholder('Width')
					.setValue(String(this.view.customPageWidth))
					.onChange(value => {
						const num = Math.min(2000, Math.max(10, parseInt(value, 10) || 0));
						this.view.customPageWidth = num;
						this.view.updateLayoutSettings(true);
					});
				text.inputEl.setCssProps({ width: '70px' });
			})
			.addText(text => {
				text.inputEl.insertAdjacentText('beforebegin', ' mm ');
				text.setPlaceholder('Height')
					.setValue(String(this.view.customPageHeight))
					.onChange(value => {
						const num = Math.min(2000, Math.max(10, parseInt(value, 10) || 0));
						this.view.customPageHeight = num;
						this.view.updateLayoutSettings(true);
					});
				text.inputEl.setCssProps({ width: '70px' });
				customHeightInput = text;
				text.inputEl.insertAdjacentText('afterend', ' mm');
			});
		updateCustomSizeVisibility();

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
						this.view.updateLayoutSettings(true);
					});
			});

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
						this.view.updateLayoutSettings(true);
					});
			});

		new Setting(contentEl)
			.setName('Landscape')
			.addToggle(toggle => {
				landscapeToggle = toggle;
				toggle
					.setValue(this.view.landscape)
					.onChange(value => {
						this.view.landscape = value;
						this.view.updateLayoutSettings(true);
					});
			});

		new Setting(contentEl)
			.setName('Show file name as title')
			.addToggle(toggle => {
				showTitleToggle = toggle;
				toggle
					.setValue(this.view.showTitle)
					.onChange(value => {
						this.view.showTitle = value;
						this.view.cachedUpperText = '';
						void this.view.renderFull(true);
					});
			});

		this.createFooterButtons(
			contentEl,
			() => {
				this.view.pageSize = 'A4';
				this.view.customPageWidth = 210;
				this.view.customPageHeight = 297;
				this.view.margin = '20mm';
				this.view.scale = 100;
				this.view.landscape = false;

				const showTitleChanged = this.view.showTitle !== true;
				this.view.showTitle = true;

				sizeDropdown.setValue('A4');
				customWidthInput.setValue('210');
				customHeightInput.setValue('297');
				updateCustomSizeVisibility();
				marginDropdown.setValue('20mm');
				scaleSlider.setValue(100);
				landscapeToggle.setValue(false);
				showTitleToggle.setValue(true);

				if (showTitleChanged) {
					this.view.cachedUpperText = '';
					void this.view.renderFull(true);
				}
				this.view.updateLayoutSettings(true);
			},
			() => {
				this.view.plugin.settings.pageSize = this.view.pageSize;
				this.view.plugin.settings.customPageWidth = this.view.customPageWidth;
				this.view.plugin.settings.customPageHeight = this.view.customPageHeight;
				this.view.plugin.settings.margin = this.view.margin;
				this.view.plugin.settings.scale = this.view.scale;
				this.view.plugin.settings.landscape = this.view.landscape;
				this.view.plugin.settings.showTitle = this.view.showTitle;
				void this.view.plugin.saveSettings();
			}
		);
	}
}

export class CustomCssModal extends BasePreviewModal {
	private originalCss!: string;

	saveOriginals() {
		this.originalCss = this.view.plugin.settings.customCss || '';
	}

	restoreOriginals() {
		this.view.plugin.settings.customCss = this.originalCss;
		this.view.updateCustomCss(false);
	}

	buildContent(contentEl: HTMLElement) {
		this.titleEl.setText('Custom CSS');

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

		const debouncedUpdate = debounce(() => {
			this.view.plugin.settings.customCss = textarea.value;
			this.view.updateCustomCss(true);
		}, 150);

		textarea.addEventListener('input', () => {
			debouncedUpdate();
		});

		this.createFooterButtons(
			contentEl,
			() => {
				textarea.value = '';
				this.view.plugin.settings.customCss = '';
				this.view.updateCustomCss(true);
			},
			() => {
				this.view.plugin.settings.customCss = textarea.value;
				void this.view.plugin.saveSettings();
				this.view.updateCustomCss(false);
			}
		);
	}
}

export class QuickStyleModal extends BasePreviewModal {
	private originalFontFamily!: string;
	private originalFontSize!: number;
	private originalTextColor!: string;

	saveOriginals() {
		const settings = this.view.plugin.settings;
		this.originalFontFamily = settings.fontFamily || 'default';
		this.originalFontSize = settings.fontSize || 16;
		this.originalTextColor = settings.textColor || 'default';
	}

	restoreOriginals() {
		this.view.plugin.settings.fontFamily = this.originalFontFamily;
		this.view.plugin.settings.fontSize = this.originalFontSize;
		this.view.plugin.settings.textColor = this.originalTextColor;
		this.view.updateGuiCss(false);
	}

	buildContent(contentEl: HTMLElement) {
		this.titleEl.setText('Quick styles');

		const settings = this.view.plugin.settings;
		let fontDropdown: DropdownComponent;
		let sizeSlider: SliderComponent;
		let colorPicker: ColorComponent;

		new Setting(contentEl)
			.setName('Font family')
			.setDesc('Choose the base font style for the PDF page.')
			.addDropdown(dropdown => {
				fontDropdown = dropdown;
				Object.entries(FONT_DISPLAY_NAMES).forEach(([key, label]) => {
					dropdown.addOption(key, label);
				});
				dropdown
					.setValue(settings.fontFamily)
					.onChange(value => {
						this.view.plugin.settings.fontFamily = value;
						this.view.updateGuiCss(true);
					});
			});

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
						this.view.updateGuiCss(true);
					});
			});

		new Setting(contentEl)
			.setName('Text color')
			.setDesc('Set the main body text color.')
			.addExtraButton(button => {
				button
					.setIcon('rotate-ccw')
					.onClick(() => {
						this.view.plugin.settings.textColor = 'default';
						colorPicker.setValue('#000000');
						this.view.updateGuiCss(true);
					});
			})
			.addColorPicker(picker => {
				colorPicker = picker;
				picker
					.setValue(settings.textColor === 'default' ? '#000000' : settings.textColor)
					.onChange(value => {
						this.view.plugin.settings.textColor = value;
						this.view.updateGuiCss(true);
					});
			});

		this.createFooterButtons(
			contentEl,
			() => {
				this.view.plugin.settings.fontFamily = 'default';
				this.view.plugin.settings.fontSize = 16;
				this.view.plugin.settings.textColor = 'default';

				fontDropdown.setValue('default');
				sizeSlider.setValue(16);
				colorPicker.setValue('#000000');

				this.view.updateGuiCss(true);
			}
		);
	}
}



export async function exportToPdf(config: ExportConfig) {
	const { previewContainer, pageSize, customPageWidth, customPageHeight, landscape, scale, currentFile } = config;

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
		printClone.id = 'pdf-preview-sandbox'; // Ensure sandbox scoped CSS applies to the clone and its children

		// Inject a temporary stylesheet to override Obsidian's print layouts.
		// This uses !important to successfully beat default layouts/dark themes without triggering linter warnings in styles.css.
		const printStyle = activeDocument.createElement('style');
		printStyle.id = 'pdf-dynamic-print-style';
		printStyle.textContent = `
			@media print {
				body.pdf-export-printing {
					background-color: #ffffff !important;
					background: #ffffff !important;
					color: #111111 !important;
					--background-primary: #ffffff !important;
					--text-normal: #111111 !important;
					--text-muted: #555555 !important;
				}
				body.pdf-export-printing .app-container {
					display: none !important;
				}
				body.pdf-export-printing #pdf-preview-sandbox.pdf-preview-container.pdf-print-clone {
					display: block !important;
					position: absolute !important;
					left: 0 !important;
					top: 0 !important;
					width: var(--pdf-page-width, 210mm) !important;
					height: auto !important;
					background: white !important;
					padding: 0 !important;
					margin: 0 !important;
					overflow: visible !important;
					z-index: 9999999 !important;
				}
				body.pdf-export-printing #pdf-preview-sandbox .pdf-page-wrapper {
					margin: 0 !important;
					padding: 0 !important;
					border: none !important;
					box-shadow: none !important;
					background: white !important;
					height: var(--pdf-page-height, 297mm) !important;
					page-break-after: always !important;
					display: block !important;
					overflow: visible !important;
				}
				body.pdf-export-printing #pdf-preview-sandbox .pdf-preview-page {
					transform: none !important;
					box-shadow: none !important;
					border: none !important;
					margin: 0 !important;
					width: var(--pdf-page-width, 210mm) !important;
					height: var(--pdf-page-height, 297mm) !important;
					background: white !important;
					page-break-inside: avoid !important;
					overflow: visible !important;
				}
				body.pdf-export-printing #pdf-preview-sandbox .pdf-page-number {
					display: block !important;
					color: #555555 !important;
				}
			}
		`;
		activeDocument.head.appendChild(printStyle);

		// Append to body temporarily so it is a direct child of body and unaffected by parent layout clipping/hiding
		activeDocument.body.appendChild(printClone);

		// 1. Add printing class to body to apply print-only styles
		activeDocument.body.classList.add('pdf-export-printing');

		// Force a browser DOM style reflow and wait for layout to repaint completely
		void activeDocument.body.offsetHeight;
		await new Promise<void>(resolve => {
			window.setTimeout(resolve, 100);
		});

		// 2. Call printToPDF
		// Custom sizes must be expressed in microns (1 mm = 1000 microns); standard sizes pass a name string.
		const pageSizeOption = pageSize === 'Custom'
			? { width: Math.round(customPageWidth * 1000), height: Math.round(customPageHeight * 1000) }
			: pageSize;
		const options = {
			marginsType: 1, // no margins
			pageSize: pageSizeOption,
			printBackground: true,
			landscape,
			scale: scale / 100,
		};

		let data: ArrayBuffer;
		try {
			data = await webContents.printToPDF(options);
		} finally {
			// 3. Remove printing class, dynamic stylesheet, and clean up the clone node immediately
			activeDocument.body.classList.remove('pdf-export-printing');
			printStyle.remove();
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
