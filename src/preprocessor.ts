// Markdown preprocessing functions for live-pdf-preview

export function getLineMetadata(lines: string[]): { isIgnored: boolean[] } {
	const isIgnored = new Array<boolean>(lines.length).fill(false);
	let inCodeBlock = false;
	let inFrontmatter = false;
	
	if (lines.length > 0 && lines[0] !== undefined && lines[0].trim() === '---') {
		inFrontmatter = true;
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		const trimmed = line.trim();

		// Track YAML frontmatter
		if (i > 0 && trimmed === '---') {
			if (inFrontmatter) {
				inFrontmatter = false;
				isIgnored[i] = true;
				continue;
			}
		}
		if (inFrontmatter) {
			isIgnored[i] = true;
			continue;
		}

		// Track code blocks
		if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
			inCodeBlock = !inCodeBlock;
			isIgnored[i] = true;
			continue;
		}
		if (inCodeBlock) {
			isIgnored[i] = true;
			continue;
		}
	}

	return { isIgnored };
}

export function processMarkdownIndentation(text: string): string {
	const lines = text.split('\n');
	const { isIgnored } = getLineMetadata(lines);

	const processedLines = lines.map((line, index) => {
		if (isIgnored[index]) {
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

export function fixColumnLines(text: string): string {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined) {
			const trimmed = line.trim();
			if (trimmed === '//column' || trimmed === '//center' || /^\/\/column-\d+$/.test(trimmed) || /^\/\/column\[[^\]]+\]$/.test(trimmed)) {
				if (i > 0 && lines[i - 1]?.trim() !== '') {
					lines.splice(i, 0, '');
					i++;
				}
				if (i < lines.length - 1 && lines[i + 1]?.trim() !== '') {
					lines.splice(i + 1, 0, '');
				}
			}
		}
	}
	return lines.join('\n');
}

export function fixHorizontalRules(text: string, cursorLine?: number): { text: string; cursorLine?: number } {
	const lines = text.split('\n');
	let adjustedCursor = cursorLine;
	const { isIgnored } = getLineMetadata(lines);

	for (let i = 0; i < lines.length - 1; i++) {
		if (isIgnored[i]) {
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
					isIgnored.splice(i + 1, 0, false); // Keep isIgnored array in sync with lines array
					if (adjustedCursor !== undefined && i < adjustedCursor) {
						adjustedCursor++;
					}
				}
				i += requiredNewlines;
			}
		}
	}
	return { text: lines.join('\n'), cursorLine: adjustedCursor };
}

export function isInsideBlock(lines: string[], targetLineIndex: number, marker: string): boolean {
	let inside = false;
	for (let i = 0; i <= targetLineIndex; i++) {
		const line = lines[i];
		if (line !== undefined && line.trim() === marker) {
			inside = !inside;
		}
	}
	return inside;
}

export function isInsideColumnBlock(lines: string[], targetLineIndex: number): boolean {
	// The opening marker may carry ratios ('//column[30, 70]'), the closing one is always bare,
	// so toggle on both forms rather than on exact text.
	let inside = false;
	for (let i = 0; i <= targetLineIndex; i++) {
		const line = lines[i];
		if (line !== undefined && /^\/\/column(?:\[[^\]]+\])?$/.test(line.trim())) {
			inside = !inside;
		}
	}
	return inside;
}

export function isInsideCenterBlock(lines: string[], targetLineIndex: number): boolean {
	return isInsideBlock(lines, targetLineIndex, '//center');
}

export function findCutLine(text: string, cursorLine: number): number {
	const lines = text.split('\n');
	const start = Math.min(cursorLine - 1, lines.length - 1);
	for (let i = start; i >= 0; i--) {
		const line = lines[i];
		if (line !== undefined && line.trim() === '') {
			if (!isInsideColumnBlock(lines, i) && !isInsideCenterBlock(lines, i)) {
				return i + 1;
			}
		}
	}
	return 0;
}

export function processHideBlocks(text: string, cursorLine?: number): { text: string; cursorLine?: number } {
	const lines = text.split('\n');
	const { isIgnored } = getLineMetadata(lines);
	const hideIndices: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (isIgnored[i]) {
			continue;
		}
		if (lines[i]?.trim() === '//hide') {
			hideIndices.push(i);
		}
	}

	// Pair up indices. If there is an odd number, the last one is unclosed and ignored.
	const isHidden = new Array<boolean>(lines.length).fill(false);
	const pairCount = Math.floor(hideIndices.length / 2);
	for (let k = 0; k < pairCount; k++) {
		const start = hideIndices[k * 2];
		const end = hideIndices[k * 2 + 1];
		if (start !== undefined && end !== undefined) {
			for (let i = start; i <= end; i++) {
				isHidden[i] = true;
			}
		}
	}

	const resultLines: string[] = [];
	let adjustedCursor = cursorLine;

	for (let i = 0; i < lines.length; i++) {
		if (isHidden[i]) {
			if (cursorLine !== undefined) {
				if (i < cursorLine) {
					adjustedCursor = (adjustedCursor ?? 0) - 1;
				} else if (i === cursorLine) {
					adjustedCursor = resultLines.length;
				}
			}
			continue;
		}
		resultLines.push(lines[i] as string);
	}

	// Safety clamp to ensure adjustedCursor is in bounds of the new lines array
	if (adjustedCursor !== undefined) {
		adjustedCursor = Math.max(0, Math.min(adjustedCursor, resultLines.length));
	}

	return {
		text: resultLines.join('\n'),
		cursorLine: adjustedCursor
	};
}

export function processBlankSpacers(text: string): string {
	const lines = text.split('\n');
	const { isIgnored } = getLineMetadata(lines);

	const processedLines = lines.map((line, index) => {
		if (isIgnored[index]) {
			return line;
		}

		const trimmed = line.trim();
		const match = trimmed.match(/^\/\/blank\[(\d+(?:\.\d+)?)\]$/);
		if (match && match[1] !== undefined) {
			const height = match[1];
			return `<div class="pdf-blank-spacer" style="height: ${height}mm;"></div>`;
		}

		return line;
	});

	return processedLines.join('\n');
}
