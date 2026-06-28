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

		if (
			(current.tagName === 'OL' && next.tagName === 'OL') ||
			(current.tagName === 'UL' && next.tagName === 'UL') ||
			(current.tagName === 'P' && next.tagName === 'P')
		) {
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
	previewContainer: HTMLDivElement,
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
				const breakEl = document.createElement('div');
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
	const temp = document.createElement('div');
	temp.style.cssText = `height: ${mm}mm; position: absolute; visibility: hidden;`;
	document.body.appendChild(temp);
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
	const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
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
	if (!['P', 'LI', 'BLOCKQUOTE'].includes(el.tagName)) {
		return null;
	}

	const totalLength = el.textContent?.length || 0;
	if (totalLength === 0) return null;

	const originalHTML = el.innerHTML;

	const originalBottom = el.offsetTop + el.offsetHeight;
	if (originalBottom <= maxContentBottom) {
		return null;
	}

	let low = 0;
	let high = totalLength;
	let bestOffset = 0;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		el.innerHTML = originalHTML;

		const splitPoint = getTextNodeAndOffset(el, mid);
		if (splitPoint) {
			const tempRange = document.createRange();
			tempRange.setStart(splitPoint.node, splitPoint.offset);
			tempRange.setEndAfter(el.lastChild!);
			const extracted = tempRange.extractContents();
			const bottom = el.offsetTop + el.offsetHeight;
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

	el.innerHTML = originalHTML;

	if (bestOffset === 0) {
		return null;
	}

	const splitPoint = getTextNodeAndOffset(el, bestOffset);
	if (!splitPoint) return null;

	const range = document.createRange();
	range.setStart(el, 0);
	range.setEnd(splitPoint.node, splitPoint.offset);
	const firstPartFragment = range.extractContents();

	const nextEl = document.createElement(el.tagName);
	nextEl.className = el.className;
	nextEl.style.cssText = el.style.cssText;
	nextEl.setAttribute('data-section', el.getAttribute('data-section') || '');

	while (el.firstChild) {
		nextEl.appendChild(el.firstChild);
	}

	// Mark the first nested LI as a continuation (hides bullet/number)
	const walker = document.createTreeWalker(nextEl, NodeFilter.SHOW_TEXT);
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

	for (const el of allElements) {
		// Check if manual page break
		if (el.classList.contains('pdf-page-break')) {
			currentPage.appendChild(el);
			currentPage = createPageElement(previewContainer);
			continue;
		}

		// If it's a list (UL or OL) — try to fit or split item-by-item
		if (el.tagName === 'OL' || el.tagName === 'UL') {
			currentPage.appendChild(el);
			const listBottom = el.offsetTop + el.offsetHeight;
			const listStyle = window.getComputedStyle(el);
			const listMarginBottom = parseFloat(listStyle.marginBottom) || 0;

			if (listBottom + listMarginBottom <= maxContentBottom) {
				continue;
			}

			// The entire list does NOT fit — split it item-by-item
			currentPage.removeChild(el);

			const listType = el.tagName.toLowerCase();
			const listItems = Array.from(el.children) as HTMLElement[];
			const sectionAttr = el.getAttribute('data-section') || '';

			let currentListContainer = currentPage.createEl(listType as any);
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

					currentListContainer = currentPage.createEl(listType as any);
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

		// Prevent orphan headings
		if (!shouldMove && !isFirstElement && /^H[1-6]$/.test(el.tagName)) {
			const nextEl = allElements[allElements.indexOf(el) + 1];
			if (nextEl) {
				currentPage.appendChild(nextEl);
				const nextBottom = nextEl.offsetTop + nextEl.offsetHeight;
				const nextStyle = window.getComputedStyle(nextEl);
				const nextMarginBottom = parseFloat(nextStyle.marginBottom) || 0;
				currentPage.removeChild(nextEl);

				if (nextBottom + nextMarginBottom > maxContentBottom) {
					shouldMove = true;
				}
			}
		}

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
