import { Plugin } from 'obsidian';
import { VIEW_TYPE_PDF_PREVIEW, PdfPreviewView } from './view';

export interface LivePdfPreviewSettings {
	pageSize: string;
	landscape: boolean;
	margin: string;
	scale: number;
	showTitle: boolean;
	customCss: string;
}

const DEFAULT_SETTINGS: LivePdfPreviewSettings = {
	pageSize: 'A4',
	landscape: false,
	margin: '20mm',
	scale: 100,
	showTitle: true,
	customCss: '',
};

export default class LivePdfPreviewPlugin extends Plugin {
	public settings!: LivePdfPreviewSettings;

	async onload() {
		await this.loadSettings();

		// Register the custom view, passing the plugin instance
		this.registerView(
			VIEW_TYPE_PDF_PREVIEW,
			(leaf) => new PdfPreviewView(leaf, this)
		);

		// Command to open the view
		this.addCommand({
			id: 'open-preview',
			name: 'Open preview',
			callback: () => {
				void this.activateView(true);
			},
		});

		// Automatically place the view in the right sidebar once the layout is ready
		this.app.workspace.onLayoutReady(() => {
			void this.initView();
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		// Clean up when plugin is disabled
		const styleEl = activeDocument.getElementById('pdf-live-preview-custom-css');
		if (styleEl) styleEl.remove();
	}

	// Quietly create the leaf in the right sidebar so the tab icon appears
	async initView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_PDF_PREVIEW)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_PDF_PREVIEW,
					active: false, // Mount it quietly in the tab bar without forcing focus
				});
			}
		}
	}

	// Activate and reveal the view (e.g. when triggered from Command Palette)
	async activateView(focus = true) {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_PDF_PREVIEW)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_PDF_PREVIEW,
					active: focus,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf && focus) {
			workspace.setActiveLeaf(leaf, { focus: true });
		}
	}
}
