export const VIEW_TYPE_PDF_PREVIEW = 'live-pdf-preview-view';

export interface LivePdfPreviewSettings {
	pageSize: string;
	customPageWidth: number;
	customPageHeight: number;
	landscape: boolean;
	margin: string;
	scale: number;
	showTitle: boolean;
	customCss: string;
	fontFamily: string;
	fontSize: number;
	textColor: string;
}

export const DEFAULT_SETTINGS: LivePdfPreviewSettings = {
	pageSize: 'A4',
	customPageWidth: 210,
	customPageHeight: 297,
	landscape: false,
	margin: '20mm',
	scale: 100,
	showTitle: true,
	customCss: '',
	fontFamily: 'default',
	fontSize: 16,
	textColor: 'default',
};

export interface ExportConfig {
	previewContainer: HTMLDivElement;
	pageSize: string;
	customPageWidth: number;
	customPageHeight: number;
	landscape: boolean;
	scale: number;
	currentFile: { basename: string };
}

export interface PaginationConfig {
	previewContainer: HTMLDivElement;
	upperEl: HTMLDivElement;
	lowerEl: HTMLDivElement;
	showPageNumbers: boolean;
	getPageDimensionsMm: () => { width: number; height: number };
}

export interface ElectronWebContents {
	printToPDF(options: {
		marginsType: number;
		pageSize: string | { widthInMicrons: number; heightInMicrons: number };
		printBackground: boolean;
		landscape: boolean;
		scale: number;
	}): Promise<ArrayBuffer>;
}

export interface ElectronModule {
	remote: {
		getCurrentWebContents(): ElectronWebContents;
	};
}

export const FONT_FAMILY_MAP: Record<string, string> = {
	minimal: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
	editorial: '"Latin Modern Roman", "Times New Roman", Georgia, serif',
	novel: '"Baskerville", "Garamond", serif',
	technical: 'var(--font-monospace), "Courier New", monospace',
};

export const FONT_DISPLAY_NAMES: Record<string, string> = {
	default: 'Default',
	minimal: 'Minimal',
	editorial: 'Editorial',
	novel: 'Warm novel',
	technical: 'Technical',
};

export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
	A4: { width: 210, height: 297 },
	Letter: { width: 215.9, height: 279.4 },
	A3: { width: 297, height: 420 },
	A5: { width: 148, height: 210 },
	Legal: { width: 215.9, height: 355.6 },
};
