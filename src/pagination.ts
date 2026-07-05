// createEl is available as a global from Obsidian

/**
 * Merges consecutive same-type elements (OL+OL, UL+UL, P+P) that were
 * split across pages back into single elements.
 */
export function mergeConsecutiveElements(parent: HTMLElement) {
	const children = Array.from(parent.children);
	for (let i = 0; i < children.length - 1; i++) {
		const current = children[i] as HTMLElement;
		const next = children[i + 1] as HTMLElement;

		const isListMerge = (current.tagName === 'OL' && next.tagName === 'OL') ||
		                    (current.tagName === 'UL' && next.tagName === 'UL');
		
		const isSplitTextMerge = current.tagName === next.tagName &&
		                         next.getAttribute('data-split-continued') === 'true';

		if (isListMerge || isSplitTextMerge) {
			while (next.firstChild) {
				current.appendChild(next.firstChild);
			}
			next.remove();
			children.splice(i + 1, 1);
			i--;
		}
	}
}

/**
 * Restores DOM elements from paginated page wrappers back to their
 * original upper/lower master containers.
 */
export function restoreFromPages(
	previewContainer: HTMLElement,
	upperEl: HTMLDivElement,
	lowerEl: HTMLDivElement
) {
	const wrappers = Array.from(previewContainer.querySelectorAll('.pdf-page-wrapper'));
	for (const wrapper of wrappers) {
		const page = wrapper.querySelector('.pdf-preview-page');
		if (page) {
			const children = Array.from(page.children);
			for (const child of children) {
				const el = child as HTMLElement;
				const section = el.getAttribute('data-section');
				if (section === 'upper') {
					upperEl.appendChild(el);
				} else if (section === 'lower') {
					lowerEl.appendChild(el);
				} else {
					el.remove();
				}
			}
		}
		wrapper.remove();
	}

	mergeConsecutiveElements(upperEl);
	mergeConsecutiveElements(lowerEl);
}

/**
 * Finds rendered <p> elements containing only "//page" text
 * and replaces them with visual page break divs.
 */
export function applyPageBreaks(upperEl: HTMLDivElement, lowerEl: HTMLDivElement) {
	for (const section of [upperEl, lowerEl]) {
		const paragraphs = Array.from(section.querySelectorAll('p'));
		for (const p of paragraphs) {
			if (/^\s*\/\/page\s*$/.test(p.textContent || '')) {
				const breakEl = activeDocument.createElement('div');
				breakEl.className = 'pdf-page-break';
				p.replaceWith(breakEl);
			}
		}
	}
}

/**
 * Converts mm to pixels based on current display scaling/zoom.
 */
export function measurePx(mm: number): number {
	const temp = activeDocument.createElement('div');
	temp.style.cssText = `height: ${mm}mm; position: absolute; visibility: hidden;`;
	activeDocument.body.appendChild(temp);
	const height = temp.offsetHeight;
	temp.remove();
	return height;
}

/**
 * Creates a new page wrapper + page element in the preview container.
 */
export function createPageElement(previewContainer: HTMLDivElement): HTMLDivElement {
	const wrapper = previewContainer.createEl('div', {
		cls: 'pdf-page-wrapper theme-light',
	});
	const page = wrapper.createEl('div', {
		cls: 'pdf-preview-page markdown-preview-view markdown-rendered',
	});
	return page;
}

// --- Text splitting helpers ---

function getTextNodeAndOffset(parent: Node, targetOffset: number): { node: Text; offset: number } | null {
	let currentOffset = 0;
	const walker = activeDocument.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const textNode = node as Text;
		const len = textNode.length;
		if (currentOffset + len >= targetOffset) {
			return { node: textNode, offset: targetOffset - currentOffset };
		}
		currentOffset += len;
	}
	return null;
}

/**
 * Splits a block element (P, LI, BLOCKQUOTE) at the overflow boundary using
 * binary search on character offsets + DOM Range extraction.
 * Returns the overflow portion as a new element, or null if splitting isn't possible.
 */
export function splitElementAtOverflow(el: HTMLElement, maxContentBottom: number): HTMLElement | null {
	if (!['P', 'LI', 'BLOCKQUOTE', 'PRE'].includes(el.tagName)) {
		return null;
	}

	const totalLength = el.textContent?.length || 0;
	if (totalLength === 0) return null;

	// Clone child nodes to capture original state without using innerHTML
	const originalChildren = Array.from(el.childNodes).map(node => node.cloneNode(true));

	const pageEl = el.closest('.pdf-preview-page') as HTMLElement | null;
	const getBottom = () => {
		if (pageEl) {
			return getElementOffsetTopRelativeTo(el, pageEl) + el.offsetHeight;
		}
		return el.offsetTop + el.offsetHeight;
	};

	const originalBottom = getBottom();
	if (originalBottom <= maxContentBottom) {
		return null;
	}

	let low = 0;
	let high = totalLength;
	let bestOffset = 0;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		
		// Restore element contents using original child clones
		el.empty();
		originalChildren.forEach(child => el.appendChild(child.cloneNode(true)));

		const splitPoint = getTextNodeAndOffset(el, mid);
		if (splitPoint) {
			const tempRange = activeDocument.createRange();
			tempRange.setStart(splitPoint.node, splitPoint.offset);
			tempRange.setEndAfter(el.lastChild!);
			const extracted = tempRange.extractContents();
			const bottom = getBottom();
			el.appendChild(extracted);

			if (bottom <= maxContentBottom) {
				bestOffset = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		} else {
			high = mid - 1;
		}
	}

	// Restore back to original state for clean slicing using exact text node references
	el.empty();
	originalChildren.forEach(child => el.appendChild(child.cloneNode(true)));

	if (bestOffset === 0) {
		return null;
	}

	// For PRE code blocks, snap the split offset to the nearest preceding newline character
	// so that code lines are never split mid-character horizontally.
	if (el.tagName === 'PRE') {
		const textContent = el.textContent || '';
		const lastNewLine = textContent.lastIndexOf('\n', bestOffset);
		if (lastNewLine !== -1) {
			bestOffset = lastNewLine + 1; // Split right after the newline
		}
	}

	const splitPoint = getTextNodeAndOffset(el, bestOffset);
	if (!splitPoint) return null;

	const range = activeDocument.createRange();
	range.setStart(el, 0);
	range.setEnd(splitPoint.node, splitPoint.offset);
	const firstPartFragment = range.extractContents();

	const nextEl = activeDocument.createElement(el.tagName);
	nextEl.className = el.className;
	nextEl.style.cssText = el.style.cssText;
	nextEl.setAttribute('data-section', el.getAttribute('data-section') || '');
	nextEl.setAttribute('data-split-continued', 'true');

	while (el.firstChild) {
		nextEl.appendChild(el.firstChild);
	}

	// Mark the first nested LI as a continuation (hides bullet/number)
	const walker = activeDocument.createTreeWalker(nextEl, NodeFilter.SHOW_TEXT);
	const firstTextNode = walker.nextNode();
	if (firstTextNode) {
		let parentLi = firstTextNode.parentElement;
		while (parentLi && parentLi !== nextEl) {
			if (parentLi.tagName === 'LI') {
				parentLi.classList.add('pdf-list-split-continuation');
				break;
			}
			parentLi = parentLi.parentElement;
		}
	}

	el.appendChild(firstPartFragment);
	return nextEl;
}

export interface PaginationConfig {
	previewContainer: HTMLDivElement;
	upperEl: HTMLDivElement;
	lowerEl: HTMLDivElement;
	showPageNumbers: boolean;
	getPageDimensionsMm: () => { width: number; height: number };
}

/**
 * Walks through all rendered elements and distributes them into
 * dynamically created page elements (A4 size sheets) in the DOM.
 * Splits elements to a new page when height limits are exceeded.
 */
export function applyVirtualPagination(config: PaginationConfig) {
	const { previewContainer, upperEl, lowerEl, showPageNumbers, getPageDimensionsMm } = config;

	// If the view is hidden (e.g. in a background tab), skip pagination
	if (!previewContainer || previewContainer.offsetHeight === 0) {
		return;
	}

	restoreFromPages(previewContainer, upperEl, lowerEl);

	// Mark children with their section names so they can be restored later
	Array.from(upperEl.children).forEach(child => {
		child.setAttribute('data-section', 'upper');
	});
	Array.from(lowerEl.children).forEach(child => {
		child.setAttribute('data-section', 'lower');
	});

	// Collect all elements in order
	const allElements = [
		...Array.from(upperEl.children),
		...Array.from(lowerEl.children)
	] as HTMLElement[];

	// Clear any existing page wrappers
	previewContainer.empty();

	// Create the first page
	let currentPage = createPageElement(previewContainer);

	// Compute pagination boundaries
	const dims = getPageDimensionsMm();
	const pageHeightPx = measurePx(dims.height);
	const pageStyle = window.getComputedStyle(currentPage);
	const paddingBottom = parseFloat(pageStyle.paddingBottom) || 0;
	const maxContentBottom = pageHeightPx - paddingBottom;

	let elementIndex = 0;
	while (elementIndex < allElements.length) {
		const el = allElements[elementIndex];
		if (!el) {
			elementIndex++;
			continue;
		}

		// Check if manual page break
		if (el.classList.contains('pdf-page-break')) {
			currentPage.appendChild(el);
			currentPage = createPageElement(previewContainer);
			elementIndex++;
			continue;
		}

		// If it is a multi-column row (pdf-row) — try to fit or split column elements
		if (el.classList.contains('pdf-row')) {
			currentPage.appendChild(el);
			const rowBottom = el.offsetTop + el.offsetHeight;
			const rowStyle = window.getComputedStyle(el);
			const rowMarginBottom = parseFloat(rowStyle.marginBottom) || 0;

			if (rowBottom + rowMarginBottom <= maxContentBottom) {
				elementIndex++;
				continue;
			}

			// The entire row does NOT fit — split it across pages
			currentPage.removeChild(el);

			const columns = Array.from(el.querySelectorAll('.pdf-col')) as HTMLElement[];
			const sectionAttr = el.getAttribute('data-section') || '';

			// Create the row container on the current page
			const currentRowEl = currentPage.createEl('div');
			currentRowEl.className = el.className;
			currentRowEl.style.cssText = el.style.cssText;
			currentRowEl.setAttribute('data-section', sectionAttr);

			const currentColEls: HTMLElement[] = [];
			const nextColElements: HTMLElement[][] = [];

			columns.forEach((col, colIdx) => {
				const currentColEl = currentRowEl.createEl('div');
				currentColEl.className = col.className;
				currentColEl.style.cssText = col.style.cssText;
				currentColEls.push(currentColEl);
				nextColElements.push([]);
			});

			// Append elements child-by-child in each column and check height
			columns.forEach((col, colIdx) => {
				const colChildren = Array.from(col.children) as HTMLElement[];
				const currentColEl = currentColEls[colIdx];
				if (!currentColEl) return;

				let hasOverflowed = false;

				for (const child of colChildren) {
					const htmlChild = child as HTMLElement;

					// Check if this is a column-local page break (//page)
					if (htmlChild.classList.contains('pdf-page-break')) {
						htmlChild.remove();
						hasOverflowed = true;
						continue;
					}

					// Handle nested lists (UL/OL) inside columns to split them item-by-item
					if (htmlChild.tagName === 'UL' || htmlChild.tagName === 'OL') {
						const listType = htmlChild.tagName.toLowerCase();
						const listItems = Array.from(htmlChild.children) as HTMLElement[];
						const sectionAttr = htmlChild.getAttribute('data-section') || '';

						let currentListContainer = currentColEl.createEl(listType as keyof HTMLElementTagNameMap);
						currentListContainer.className = htmlChild.className;
						currentListContainer.style.cssText = htmlChild.style.cssText;
						currentListContainer.setAttribute('data-section', sectionAttr);

						let itemIndex = 1;

						for (const li of listItems) {
							const htmlLi = li as HTMLElement;
							if (hasOverflowed) {
								const nextListContainer = getOrCreateNextListContainer(nextColElements[colIdx], listType, htmlChild, sectionAttr);
								nextListContainer.appendChild(htmlLi);
								continue;
							}

							currentListContainer.appendChild(htmlLi);

							const childRect = htmlLi.getBoundingClientRect();
							const pageRect = currentPage.getBoundingClientRect();
							const scaleFactor = currentPage.offsetWidth > 0 ? (pageRect.width / currentPage.offsetWidth) : 1;
							const totalBottom = scaleFactor > 0 ? (childRect.bottom - pageRect.top) / scaleFactor : (childRect.bottom - pageRect.top);

							const isFirstEl = (currentListContainer.children.length === 1 && currentColEl.children.length === 1 && currentPage.children.length <= 1);

							if (!isFirstEl && totalBottom > maxContentBottom) {
								const nextLi = splitElementAtOverflow(htmlLi, maxContentBottom);
								if (nextLi) {
									nextLi.classList.add('pdf-list-split-continuation');
									const nextListContainer = getOrCreateNextListContainer(nextColElements[colIdx], listType, htmlChild, sectionAttr);
									if (listType === 'ol') {
										nextListContainer.setAttribute('start', String(itemIndex));
									}
									nextListContainer.appendChild(nextLi as HTMLElement);
								} else {
									currentListContainer.removeChild(htmlLi);
									const nextListContainer = getOrCreateNextListContainer(nextColElements[colIdx], listType, htmlChild, sectionAttr);
									if (listType === 'ol') {
										nextListContainer.setAttribute('start', String(itemIndex));
									}
									nextListContainer.appendChild(htmlLi);
								}
								hasOverflowed = true;
							}
							itemIndex++;
						}

						if (currentListContainer.children.length === 0) {
							currentListContainer.remove();
						}

						continue;
					}

					if (hasOverflowed) {
						const nextCol = nextColElements[colIdx];
						if (nextCol) nextCol.push(htmlChild);
						continue;
					}

					currentColEl.appendChild(htmlChild);

					const childRect = htmlChild.getBoundingClientRect();
					const pageRect = currentPage.getBoundingClientRect();
					const scaleFactor = currentPage.offsetWidth > 0 ? (pageRect.width / currentPage.offsetWidth) : 1;
					const totalBottom = scaleFactor > 0 ? (childRect.bottom - pageRect.top) / scaleFactor : (childRect.bottom - pageRect.top);

					// If this is the absolute first element on the current page inside the columns,
					// keep it to avoid infinite loops, even if it overflows.
					const isFirstEl = (currentColEl.children.length === 1 && currentPage.children.length <= 1);

					if (!isFirstEl && totalBottom > maxContentBottom) {
						const nextEl = splitElementAtOverflow(htmlChild, maxContentBottom);
						if (nextEl) {
							const nextCol = nextColElements[colIdx];
							if (nextCol) nextCol.push(nextEl as HTMLElement);
						} else {
							currentColEl.removeChild(htmlChild);
							const nextCol = nextColElements[colIdx];
							if (nextCol) nextCol.push(htmlChild);
						}
						hasOverflowed = true;
					}
				}
			});

			// If all columns are completely empty on the current page, remove the current row container
			const totalChildrenOnCurrentPage = currentColEls.reduce((sum, col) => sum + col.children.length, 0);
			if (totalChildrenOnCurrentPage === 0) {
				currentRowEl.remove();
			}

			// Check if we actually have any overflowed elements
			const totalOverflowedElements = nextColElements.reduce((sum, list) => sum + list.length, 0);
			if (totalOverflowedElements > 0) {
				// We create a new page for the remaining elements
				currentPage = createPageElement(previewContainer);

				// Create the new row container for the next page (detached)
				const nextRowEl = document.createElement('div');
				nextRowEl.className = el.className;
				nextRowEl.style.cssText = el.style.cssText;
				nextRowEl.setAttribute('data-section', sectionAttr);

				columns.forEach((col, colIdx) => {
					const nextColEl = nextRowEl.createEl('div');
					nextColEl.className = col.className;
					nextColEl.style.cssText = col.style.cssText;
					
					const overflowChildren = nextColElements[colIdx];
					if (overflowChildren) {
						overflowChildren.forEach(child => {
							nextColEl.appendChild(child);
						});
					}
				});

				// Insert the nextRowEl into the elements array for processing on the next iteration
				const currentIndex = allElements.indexOf(el);
				allElements.splice(currentIndex + 1, 0, nextRowEl);
			}

			el.remove();
			elementIndex++;
			continue;
		}

		// If it's a list (UL or OL) — try to fit or split item-by-item
		if (el.tagName === 'OL' || el.tagName === 'UL') {
			currentPage.appendChild(el);
			const listBottom = el.offsetTop + el.offsetHeight;
			const listStyle = window.getComputedStyle(el);
			const listMarginBottom = parseFloat(listStyle.marginBottom) || 0;

			if (listBottom + listMarginBottom <= maxContentBottom) {
				elementIndex++;
				continue;
			}

			// The entire list does NOT fit — split it item-by-item
			currentPage.removeChild(el);

			const listType = el.tagName.toLowerCase();
			const listItems = Array.from(el.children) as HTMLElement[];
			const sectionAttr = el.getAttribute('data-section') || '';

			let currentListContainer = currentPage.createEl(listType as keyof HTMLElementTagNameMap);
			currentListContainer.className = el.className;
			currentListContainer.style.cssText = el.style.cssText;
			currentListContainer.setAttribute('data-section', sectionAttr);

			let itemIndex = 1;

			for (const li of listItems) {
				currentListContainer.appendChild(li);

				const relativeBottom = li.offsetTop + li.offsetHeight;
				const liStyle = window.getComputedStyle(li);
				const liMarginBottom = parseFloat(liStyle.marginBottom) || 0;
				const totalBottom = relativeBottom + liMarginBottom;

				const isFirstItemInPage = (currentListContainer.children.length <= 1 && currentPage.children.length <= 1);

				if (!isFirstItemInPage && totalBottom > maxContentBottom) {
					const nextLi = splitElementAtOverflow(li, maxContentBottom);
					if (nextLi) {
						nextLi.classList.add('pdf-list-split-continuation');
						const currentIndex = listItems.indexOf(li);
						listItems.splice(currentIndex + 1, 0, nextLi);
					} else {
						currentListContainer.removeChild(li);
					}

					if (currentListContainer.children.length === 0) {
						currentListContainer.remove();
					}

					currentPage = createPageElement(previewContainer);

					currentListContainer = currentPage.createEl(listType as keyof HTMLElementTagNameMap);
					currentListContainer.className = el.className;
					currentListContainer.style.cssText = el.style.cssText;
					currentListContainer.setAttribute('data-section', sectionAttr);

					if (listType === 'ol') {
						currentListContainer.setAttribute('start', String(itemIndex));
					}

					if (!nextLi) {
						currentListContainer.appendChild(li);
					}
				}
				itemIndex++;
			}
			el.remove();
			elementIndex++;
			continue;
		}

		// General element pagination
		currentPage.appendChild(el);

		const relativeBottom = el.offsetTop + el.offsetHeight;
		const elStyle = window.getComputedStyle(el);
		const elMarginBottom = parseFloat(elStyle.marginBottom) || 0;
		const totalBottom = relativeBottom + elMarginBottom;

		const isFirstElement = (currentPage.children.length <= 1);
		let shouldMove = (!isFirstElement && totalBottom > maxContentBottom);

		if (shouldMove) {
			const nextEl = splitElementAtOverflow(el, maxContentBottom);
			if (nextEl) {
				const currentIndex = allElements.indexOf(el);
				allElements.splice(currentIndex + 1, 0, nextEl);
				currentPage = createPageElement(previewContainer);
			} else {
				currentPage = createPageElement(previewContainer);
				currentPage.appendChild(el);
			}
		}
		elementIndex++;
	}

	// Add page numbers if enabled
	const wrappers = Array.from(previewContainer.querySelectorAll('.pdf-page-wrapper'));
	const totalPages = wrappers.length;

	wrappers.forEach((wrapper, index) => {
		const pageNum = index + 1;
		const page = wrapper.querySelector('.pdf-preview-page');
		if (page) {
			const oldFooter = page.querySelector('.pdf-page-number');
			if (oldFooter) oldFooter.remove();

			if (showPageNumbers) {
				page.createEl('div', {
					cls: 'pdf-page-number',
					text: `${pageNum} / ${totalPages}`,
				});
			}
		}
	});
}

function getElementOffsetTopRelativeTo(el: HTMLElement, targetParent: HTMLElement): number {
	let offsetTop = 0;
	let current: HTMLElement | null = el;
	while (current && current !== targetParent && current !== document.body) {
		offsetTop += current.offsetTop;
		current = current.offsetParent as HTMLElement | null;
	}
	return offsetTop;
}

function getOrCreateNextListContainer(overflowList: HTMLElement[] | undefined, listType: string, originalList: HTMLElement, sectionAttr: string): HTMLElement {
	if (!overflowList) {
		return document.createElement(listType);
	}
	const lastEl = overflowList.length > 0 ? overflowList[overflowList.length - 1] : null;
	if (lastEl && lastEl.tagName.toLowerCase() === listType) {
		return lastEl;
	}
	const nextListContainer = document.createElement(listType) as HTMLElement;
	nextListContainer.className = originalList.className;
	nextListContainer.style.cssText = originalList.style.cssText;
	nextListContainer.setAttribute('data-section', sectionAttr);
	overflowList.push(nextListContainer);
	return nextListContainer;
}
