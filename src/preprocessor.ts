// Markdown preprocessing functions for live-pdf-preview

export function processMarkdownIndentation(text: string): string {
	const lines = text.split('\n');
	let inCodeBlock = false;
	let inFrontmatter = false;
	
	if (lines.length > 0 && lines[0] !== undefined && lines[0].trim() === '---') {
		inFrontmatter = true;
	}

	const processedLines = lines.map((line, index) => {
		if (index > 0 && line.trim() === '---') {
			if (inFrontmatter) {
				inFrontmatter = false;
				return line;
			}
		}
		if (inFrontmatter) {
			return line;
		}

		if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
			inCodeBlock = !inCodeBlock;
			return line;
		}
		if (inCodeBlock) {
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
			if (trimmed === '//column' || trimmed === '//center' || /^\/\/column-\d+$/.test(trimmed)) {
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
	return isInsideBlock(lines, targetLineIndex, '//column');
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
