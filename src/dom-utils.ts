// DOM post-processing utilities for live-pdf-preview

export function removeMarkers(container: HTMLElement, elements: HTMLElement[], startIdx: number, endIdx: number) {
	for (let k = startIdx; k <= endIdx; k++) {
		const markerEl = elements[k];
		if (markerEl && markerEl.parentNode === container) {
			container.removeChild(markerEl);
		}
	}
}

export function groupColumns(container: HTMLElement) {
	let children = Array.from(container.children) as HTMLElement[];
	let i = 0;
	while (i < children.length) {
		const child = children[i];
		if (!child) {
			i++;
			continue;
		}
		if (child.textContent?.trim() === '//column') {
			let closeIndex = -1;
			for (let j = i + 1; j < children.length; j++) {
				const nextEl = children[j];
				if (nextEl && nextEl.textContent?.trim() === '//column') {
					closeIndex = j;
					break;
				}
			}

			if (closeIndex !== -1) {
				const rowEl = activeDocument.createElement('div');
				rowEl.className = 'pdf-row';

				// Support columns 1, 2, and 3
				const colStarts = [-1, -1, -1, -1];
				const colEnds = [-1, -1, -1, -1];

				for (let j = i + 1; j < closeIndex; j++) {
					const subChild = children[j];
					if (subChild) {
						const text = subChild.textContent?.trim();
						const colMatch = text?.match(/^\/\/column-(\d+)$/);
						if (colMatch && colMatch[1]) {
							const colIdx = parseInt(colMatch[1], 10);
							if (colIdx >= 1 && colIdx <= 3) {
								if (colStarts[colIdx] === -1) {
									colStarts[colIdx] = j;
								} else {
									colEnds[colIdx] = j;
								}
							}
						}
					}
				}

				// Build elements for each column (up to 3) in order
				for (let colIdx = 1; colIdx <= 3; colIdx++) {
					const cStart = colStarts[colIdx];
					const cEnd = colEnds[colIdx];
					if (cStart !== undefined && cEnd !== undefined && cStart !== -1 && cEnd !== -1 && cEnd > cStart) {
						const colEl = activeDocument.createElement('div');
						colEl.className = `pdf-col pdf-col-${colIdx}`;
						const colElements = children.slice(cStart + 1, cEnd);
						for (const el of colElements) {
							if (el) colEl.appendChild(el);
						}
						rowEl.appendChild(colEl);
					}
				}

				const insertBeforeEl: HTMLElement | null = (closeIndex + 1 < children.length) ? (children[closeIndex + 1] ?? null) : null;
				removeMarkers(container, children, i, closeIndex);

				container.insertBefore(rowEl, insertBeforeEl);

				// Refresh the children array and restart/adjust the index
				children = Array.from(container.children) as HTMLElement[];
				i = children.indexOf(rowEl) + 1;
				continue;
			}
		}
		i++;
	}
}

export function groupCenterBlocks(container: HTMLElement) {
	let children = Array.from(container.children) as HTMLElement[];
	let i = 0;
	while (i < children.length) {
		const child = children[i];
		if (!child) {
			i++;
			continue;
		}
		if (child.textContent?.trim() === '//center') {
			let closeIndex = -1;
			for (let j = i + 1; j < children.length; j++) {
				const nextEl = children[j];
				if (nextEl && nextEl.textContent?.trim() === '//center') {
					closeIndex = j;
					break;
				}
			}

			if (closeIndex !== -1) {
				const centerEl = activeDocument.createElement('div');
				centerEl.className = 'pdf-center-block';

				const contentElements = children.slice(i + 1, closeIndex);
				for (const el of contentElements) {
					if (el) centerEl.appendChild(el);
				}

				const insertBeforeEl: HTMLElement | null = (closeIndex + 1 < children.length) ? (children[closeIndex + 1] ?? null) : null;
				removeMarkers(container, children, i, closeIndex);

				container.insertBefore(centerEl, insertBeforeEl);

				// Refresh the children array and restart/adjust the index
				children = Array.from(container.children) as HTMLElement[];
				i = children.indexOf(centerEl) + 1;
				continue;
			}
		}
		i++;
	}
}
