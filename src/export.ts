import { App, Modal, Notice, Setting } from 'obsidian';
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

	constructor(app: App, view: PdfPreviewView) {
		super(app);
		this.view = view;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		this.titleEl.setText('Page settings');

		// 1. Page Size
		new Setting(contentEl)
			.setName('Page size')
			.addDropdown(dropdown => {
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

		const doneBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Done',
		});
		doneBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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
