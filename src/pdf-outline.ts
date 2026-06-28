import { PDFDocument, PDFName, PDFNumber, PDFRef, PDFString, PDFDict } from 'pdf-lib';

interface OutlineItem {
	text: string;
	pageIndex: number;
	level: number;
	ref: PDFRef;
	dict: PDFDict;
	children: OutlineItem[];
	parent?: OutlineItem;
}

export async function addOutline(pdfDoc: PDFDocument, bookmarks: { text: string; pageIndex: number; level: number }[]) {
	const context = pdfDoc.context;
	const pages = pdfDoc.getPages();
	const pageRefs = pages.map(p => p.ref);

	if (pageRefs.length === 0) return;

	const items: OutlineItem[] = bookmarks.map(b => {
		const ref = context.nextRef();
		const dict = context.obj({
			Title: PDFString.of(b.text),
			Dest: context.obj([pageRefs[b.pageIndex] || pageRefs[0], PDFName.of('Fit')]),
		});
		return {
			text: b.text,
			pageIndex: b.pageIndex,
			level: b.level,
			ref,
			dict,
			children: [],
		};
	});

	if (items.length === 0) return;

	const rootItems: OutlineItem[] = [];
	const lastAtLevel: { [key: number]: OutlineItem } = {};

	for (const item of items) {
		let parent: OutlineItem | undefined = undefined;
		for (let l = item.level - 1; l >= 1; l--) {
			if (lastAtLevel[l]) {
				parent = lastAtLevel[l];
				break;
			}
		}

		if (parent) {
			parent.children.push(item);
			item.parent = parent;
		} else {
			rootItems.push(item);
		}

		lastAtLevel[item.level] = item;
		for (let l = item.level + 1; l <= 6; l++) {
			delete lastAtLevel[l];
		}
	}

	const linkItems = (itemList: OutlineItem[], parentRef?: PDFRef) => {
		for (let i = 0; i < itemList.length; i++) {
			const current = itemList[i];
			if (!current) continue;
			const dict = current.dict;

			if (parentRef) {
				dict.set(PDFName.of('Parent'), parentRef);
			}

			if (i > 0) {
				const prev = itemList[i - 1];
				if (prev) {
					dict.set(PDFName.of('Prev'), prev.ref);
				}
			}
			if (i < itemList.length - 1) {
				const next = itemList[i + 1];
				if (next) {
					dict.set(PDFName.of('Next'), next.ref);
				}
			}

			if (current.children.length > 0) {
				const firstChild = current.children[0];
				const lastChild = current.children[current.children.length - 1];
				if (firstChild && lastChild) {
					dict.set(PDFName.of('First'), firstChild.ref);
					dict.set(PDFName.of('Last'), lastChild.ref);
					dict.set(PDFName.of('Count'), PDFNumber.of(current.children.length));
					linkItems(current.children, current.ref);
				}
			}
		}
	};

	const outlinesRef = context.nextRef();
	linkItems(rootItems, outlinesRef);

	for (const item of items) {
		context.assign(item.ref, item.dict);
	}

	const firstRoot = rootItems[0];
	const lastRoot = rootItems[rootItems.length - 1];
	if (!firstRoot || !lastRoot) return;

	const outlinesDict = context.obj({
		Type: PDFName.of('Outlines'),
		First: firstRoot.ref,
		Last: lastRoot.ref,
		Count: PDFNumber.of(items.length),
	});

	for (const item of rootItems) {
		item.dict.set(PDFName.of('Parent'), outlinesRef);
	}

	context.assign(outlinesRef, outlinesDict);
	pdfDoc.catalog.set(PDFName.of('Outlines'), outlinesRef);
}
