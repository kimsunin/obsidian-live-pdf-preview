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

export function preprocessMarkdown(text: string, cursorLine?: number): { text: string; cursorLine?: number } {
	const lines = text.split('\n');
	const { isIgnored } = getLineMetadata(lines);

	// Step 1: Scan for all valid closed //hide blocks
	const hideIndices: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (isIgnored[i]) {
			continue;
		}
		if (lines[i]?.trim() === '//hide') {
			hideIndices.push(i);
		}
	}

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

	// Step 2: Main single-pass loop
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;

		// A. If hidden, skip and adjust cursor
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

		// B. If inside code block or YAML frontmatter, keep as-is
		if (isIgnored[i]) {
			resultLines.push(line);
			continue;
		}

		const trimmed = line.trim();

		// C. Check //blank[높이]
		const blankMatch = trimmed.match(/^\/\/blank\[(\d+(?:\.\d+)?)\]$/);
		if (blankMatch && blankMatch[1] !== undefined) {
			const height = blankMatch[1];
			resultLines.push(`<div class="pdf-blank-spacer" style="height: ${height}mm;"></div>`);
			continue;
		}

		// D. Check horizontal rules
		if (i > 0 && /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			resultLines.push(line);

			// Count following empty lines (skipping hidden ones)
			let emptyLineCount = 0;
			let nextIdx = i + 1;
			while (nextIdx < lines.length) {
				if (isHidden[nextIdx]) {
					nextIdx++;
					continue;
				}
				if (lines[nextIdx]?.trim() === '') {
					emptyLineCount++;
					nextIdx++;
				} else {
					break;
				}
			}

			const requiredNewlines = 2 - emptyLineCount;
			if (requiredNewlines > 0) {
				for (let j = 0; j < requiredNewlines; j++) {
					resultLines.push('');
					if (adjustedCursor !== undefined && i < adjustedCursor) {
						adjustedCursor++;
					}
				}
			}
			continue;
		}

		// E. Check custom indentation (indentation guides)
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

		if (indentLevel > 0 && tempLine.trim() !== '') {
			const trimmedTemp = tempLine.trim();
			const isList = /^(?:[-*+]|\d+\.)\s/.test(trimmedTemp);

			if (!isList) {
				let wrappedLine = tempLine;
				for (let j = 0; j < indentLevel; j++) {
					wrappedLine = `<div class="pdf-indent-container">${wrappedLine}</div>`;
				}
				resultLines.push(wrappedLine);
				continue;
			}
		}

		// Default case: push the line as is
		resultLines.push(line);
	}

	// Clamp cursorLine
	if (adjustedCursor !== undefined) {
		adjustedCursor = Math.max(0, Math.min(adjustedCursor, resultLines.length));
	}

	return {
		text: resultLines.join('\n'),
		cursorLine: adjustedCursor
	};
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
