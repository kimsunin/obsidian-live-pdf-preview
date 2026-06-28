import { Plugin } from 'obsidian';
import { VIEW_TYPE_PDF_PREVIEW, PdfPreviewView } from './view';

export default class LivePdfPreviewPlugin extends Plugin {
	async onload() {
		// Register the custom view
		this.registerView(
			VIEW_TYPE_PDF_PREVIEW,
			(leaf) => new PdfPreviewView(leaf)
		);

		// Command to open the view
		this.addCommand({
			id: 'open-live-pdf-preview',
			name: 'Open Live PDF Preview',
			callback: () => {
				this.activateView(true);
			},
		});

		// Automatically place the view in the right sidebar once the layout is ready
		this.app.workspace.onLayoutReady(() => {
			this.initView();
		});
	}

	onunload() {
		// Clean up when plugin is disabled
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PDF_PREVIEW);
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
			workspace.revealLeaf(leaf);
		}
	}
}
