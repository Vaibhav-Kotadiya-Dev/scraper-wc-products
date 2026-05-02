const selectors = require("./selectors");

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function setLargestPageSize(page) {
  const select = page.locator('select').filter({ has: page.locator('option') });
  const count = await select.count();

  for (let index = 0; index < count; index += 1) {
    const handle = select.nth(index);
    const options = await handle.locator("option").evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          value: node.getAttribute("value"),
          text: (node.textContent || "").trim(),
        }))
        .filter((option) => option.value)
    );

    const candidate = options
      .map((option) => ({
        ...option,
        numeric:
          Number.parseInt(option.value, 10) ||
          Number.parseInt(option.text.replace(/[^\d]/g, ""), 10) ||
          0,
      }))
      .sort((a, b) => b.numeric - a.numeric)[0];

    if (!candidate || candidate.numeric === 0) {
      continue;
    }

    try {
      await handle.selectOption(candidate.value);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      break;
    } catch (_error) {
      // Ignore selects that are not page size controls.
    }
  }
}

async function extractCategoryPage(page, baseUrl) {
  return page.evaluate(
    ({ baseUrl, selectors }) => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const absolutize = (href) => {
        try {
          return new URL(href, baseUrl).toString();
        } catch (_error) {
          return null;
        }
      };
      const linesFrom = (value) =>
        (value || "")
          .split("\n")
          .map((line) => normalize(line))
          .filter(Boolean);
      const guessBrandFromName = (name, manufacturerPartNumber, sku) => {
        const normalizedName = normalize(name);
        if (!normalizedName) {
          return "";
        }

        const markers = [manufacturerPartNumber, sku]
          .map((value) => normalize(value))
          .filter(Boolean)
          .sort((left, right) => right.length - left.length);

        for (const marker of markers) {
          const index = normalizedName.toLowerCase().indexOf(marker.toLowerCase());
          if (index > 0) {
            return normalize(normalizedName.slice(0, index).replace(/[|:-]+$/, ""));
          }
        }

        return "";
      };
      const extractProductCardData = (anchor) => {
        const container =
          anchor.closest("article, li, .product, .product-card, .card, [data-testid*='product' i]") ||
          anchor.parentElement;
        const name = normalize(anchor.textContent);
        const rawLines = linesFrom(container?.innerText || anchor.textContent || "");
        const skuLine =
          rawLines.find((line) => /^Part\s*#/i.test(line)) ||
          rawLines.find((line) => /^SKU\s*[:#]/i.test(line)) ||
          "";
        const mfgLine = rawLines.find((line) => /^MFG\s*(?:#|[:=-])/i.test(line)) || "";
        const explicitBrandLine = rawLines.find((line) => /^Brand\s*[:#-]/i.test(line)) || "";
        const sku = normalize(skuLine.replace(/^Part\s*#?/i, "").replace(/^SKU\s*[:#-]?\s*/i, ""));
        const manufacturerPartNumber = normalize(mfgLine.replace(/^MFG\s*(?:#|[:=-])?\s*/i, ""));
        const explicitBrand = normalize(explicitBrandLine.replace(/^Brand\s*[:#-]?\s*/i, ""));

        let brand = explicitBrand;
        if (!brand && container) {
          const titleIndex = rawLines.findIndex((line) => line === name);
          if (titleIndex > 0) {
            const candidate = rawLines[titleIndex - 1];
            if (
              candidate &&
              candidate !== skuLine &&
              candidate !== mfgLine &&
              !/^Sign In/i.test(candidate) &&
              !/\$\d/.test(candidate)
            ) {
              brand = candidate;
            }
          }
        }

        if (!brand) {
          brand = guessBrandFromName(name, manufacturerPartNumber, sku);
        }

        return {
          name,
          sku,
          manufacturerPartNumber,
          brand,
        };
      };

      const textFrom = (node) => normalize(node?.textContent || "");
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const heading =
        textFrom(document.querySelector("h1")) ||
        textFrom(document.querySelector("main h2")) ||
        document.title;

      const productEntries = anchors
        .filter((anchor) => selectors.productLinkPatterns.some((pattern) => anchor.matches(pattern)))
        .map((anchor) => ({
          url: absolutize(anchor.getAttribute("href")),
          ...extractProductCardData(anchor),
        }))
        .filter((entry) => entry.url);

      const productUrls = productEntries.map((entry) => entry.url);

      const scriptProductUrls = Array.from(document.querySelectorAll("script"))
        .flatMap((script) => {
          const content = script.textContent || "";
          return Array.from(content.matchAll(/\/Product\/[A-Za-z0-9\-]+/g)).map((match) => match[0]);
        })
        .map((href) => absolutize(href))
        .filter(Boolean);

      const categoryLinks = anchors
        .filter((anchor) => selectors.categoryLinkPatterns.some((pattern) => anchor.matches(pattern)))
        .map((anchor) => ({
          name: textFrom(anchor),
          url: absolutize(anchor.getAttribute("href")),
        }))
        .filter((item) => item.url);

      const breadcrumbs = Array.from(
        document.querySelectorAll('nav a, [aria-label*="breadcrumb" i] a, .breadcrumb a')
      )
        .map((anchor) => textFrom(anchor))
        .filter(Boolean);

      const paginationUrls = anchors
        .filter((anchor) => selectors.paginationLinkPatterns.some((pattern) => anchor.matches(pattern)))
        .map((anchor) => absolutize(anchor.getAttribute("href")))
        .filter(Boolean);

      const canonicalUrl = absolutize(document.querySelector('link[rel="canonical"]')?.getAttribute("href"));
      const productCanonicalUrl =
        canonicalUrl && /\/product\//i.test(canonicalUrl) ? canonicalUrl : null;

      const filterUrls = [];
      const filterLabels = [];
      const containers = selectors.filterContainers.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      );

      for (const container of containers) {
        const label = textFrom(container.querySelector("h2, h3, h4, strong, legend"));
        if (label) {
          filterLabels.push(label);
        }

        for (const anchor of Array.from(container.querySelectorAll("a[href]"))) {
          const url = absolutize(anchor.getAttribute("href"));
          if (url) {
            filterUrls.push(url);
          }
        }
      }

      return {
        title: heading,
        breadcrumbs,
        productEntries,
        productUrls: [...productUrls, ...scriptProductUrls],
        productCanonicalUrl,
        childCategories: categoryLinks,
        paginationUrls,
        filterUrls,
        filterLabels,
      };
    },
    { baseUrl, selectors }
  );
}

async function extractProductPage(page, url) {
  return page.evaluate(async (url) => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const splitLines = (value) =>
      (value || "")
        .split("\n")
        .map((line) => normalize(line))
        .filter(Boolean);
    const dedupe = (values) => [...new Set(values.filter(Boolean))];
    const guessBrandFromName = (name, manufacturerPartNumber, sku) => {
      const normalizedName = normalize(name);
      if (!normalizedName) {
        return "";
      }

      const markers = [manufacturerPartNumber, sku]
        .map((value) => normalize(value))
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);

      for (const marker of markers) {
        const index = normalizedName.toLowerCase().indexOf(marker.toLowerCase());
        if (index > 0) {
          return normalize(normalizedName.slice(0, index).replace(/[|:-]+$/, ""));
        }
      }

      return "";
    };
    const parseAttributeLine = (value) => {
      const normalized = normalize(value);
      if (!normalized) {
        return null;
      }

      const pair =
        normalized.match(/^(.+?)\s{2,}(.+)$/) ||
        normalized.match(/^(.+?)\s[-:]\s+(.+)$/);

      if (!pair) {
        return null;
      }

      const name = normalize(pair[1]);
      const attributeValue = normalize(pair[2]);
      if (!name || !attributeValue || name.length > 80 || /[.!?]$/.test(name)) {
        return null;
      }

      return { name, value: attributeValue };
    };
    const isVisible = (node) => {
      if (!node) {
        return false;
      }

      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const formatAttributeLine = (attribute) => `${attribute.name} - ${attribute.value}`;
    const extractExplicitAttributePairs = (root) => {
      if (!root) {
        return [];
      }

      const pairs = [];
      const seen = new Set();
      const pushPair = (name, value) => {
        const normalizedName = normalize(name);
        const normalizedValue = normalize(value);
        if (!normalizedName || !normalizedValue) {
          return;
        }

        const key = `${normalizedName}::${normalizedValue}`;
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        pairs.push({ name: normalizedName, value: normalizedValue });
      };

      const rowCandidates = Array.from(root.querySelectorAll("*")).filter((node) => {
        if (!isVisible(node) || node.children.length !== 2) {
          return false;
        }

        const children = Array.from(node.children);
        return children.every((child) => child.children.length === 0 && normalize(child.textContent));
      });

      for (const row of rowCandidates) {
        const [nameNode, valueNode] = Array.from(row.children);
        pushPair(nameNode.textContent, valueNode.textContent);
      }

      return pairs;
    };
    const extractPanelValues = (root, title) => {
      if (!root) {
        return [];
      }

      if (title === "Attributes") {
        const attributes = [];
        const seen = new Set();
        const pushAttribute = (entry) => {
          if (!entry?.name || !entry?.value) {
            return;
          }

          const key = `${entry.name}::${entry.value}`;
          if (seen.has(key)) {
            return;
          }

          seen.add(key);
          attributes.push(formatAttributeLine(entry));
        };

        for (const pair of extractExplicitAttributePairs(root)) {
          pushAttribute(pair);
        }

        const dtNodes = Array.from(root.querySelectorAll("dt"));
        if (dtNodes.length) {
          for (const dt of dtNodes) {
            const dd = dt.nextElementSibling;
            if (!dd || dd.tagName !== "DD") {
              continue;
            }

            pushAttribute({
              name: normalize(dt.textContent),
              value: normalize(dd.textContent),
            });
          }
        }

        const tableRows = Array.from(root.querySelectorAll("tr"));
        for (const row of tableRows) {
          const cells = Array.from(row.querySelectorAll("th, td"))
            .map((cell) => normalize(cell.textContent))
            .filter(Boolean);

          if (cells.length >= 2) {
            pushAttribute({
              name: cells[0],
              value: cells.slice(1).join(" "),
            });
          }
        }

        for (const line of splitLines(root.innerText || "")) {
          pushAttribute(parseAttributeLine(line));
        }

        if (attributes.length) {
          return attributes;
        }
      }

      const listItems = Array.from(root.querySelectorAll("li"))
        .map((node) => normalize(node.textContent))
        .filter(Boolean);
      if (listItems.length) {
        return dedupe(listItems);
      }

      const paragraphItems = Array.from(root.querySelectorAll("p"))
        .map((node) => normalize(node.textContent))
        .filter(Boolean);
      if (paragraphItems.length) {
        return dedupe(paragraphItems);
      }

      return dedupe(splitLines(root.innerText || ""));
    };
    const findTabPanel = (control, title, main) => {
      const titleToTabSelectors = {
        "Item Features": [
          '[aria-labelledby*="item features-tab" i]',
          '[aria-labelledby*="item-features-tab" i]',
          '[aria-labelledby*="itemfeatures-tab" i]',
        ],
        Attributes: ['[aria-labelledby="attributes-tab"]', '[aria-labelledby*="attributes-tab" i]'],
        Documents: ['[aria-labelledby="documents-tab"]', '[aria-labelledby*="documents-tab" i]'],
        Specs: ['[aria-labelledby="specs-tab"]', '[aria-labelledby*="specs-tab" i]'],
        Specification: [
          '[aria-labelledby="specification-tab"]',
          '[aria-labelledby*="specification-tab" i]',
          '[aria-labelledby*="specifications-tab" i]',
        ],
      };
      const panelId =
        control.getAttribute("aria-controls") ||
        control.getAttribute("data-bs-target")?.replace(/^#/, "") ||
        control.getAttribute("href")?.replace(/^#/, "");

      if (panelId) {
        const target = document.getElementById(panelId);
        if (target) {
          return target;
        }
      }

      const candidates = Array.from(
        main.querySelectorAll('[role="tabpanel"], .tab-pane, [data-tab-panel], .tabs-content, .tab-content')
      );

      const directCandidate = (titleToTabSelectors[title] || [])
        .map((selector) => main.querySelector(selector))
        .find(Boolean);
      if (directCandidate) {
        return directCandidate;
      }

      return (
        candidates.find((candidate) => {
          const label =
            candidate.getAttribute("aria-label") ||
            candidate.getAttribute("data-title") ||
            "";
          return normalize(label) === title;
        }) ||
        candidates.find((candidate) => {
          const labelledBy = candidate.getAttribute("aria-labelledby");
          if (!labelledBy) {
            return false;
          }

          return labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id))
            .filter(Boolean)
            .some((labelNode) => normalize(labelNode.textContent) === title);
        }) ||
        candidates.find((candidate) =>
          candidate.previousElementSibling && normalize(candidate.previousElementSibling.textContent) === title
        ) ||
        null
      );
    };
    const collectTabsFromDom = async (main, tabTitles) => {
      if (!main) {
        return [];
      }

      const clickableSelectors = [
        'button[role="tab"]',
        '[role="tab"]',
        "button",
        "a",
        ".tab",
        ".tabs-title",
      ].join(", ");

      const controls = Array.from(main.querySelectorAll(clickableSelectors))
        .map((node) => ({
          node,
          title: normalize(node.textContent),
        }))
        .filter((entry) => tabTitles.includes(entry.title));

      const uniqueControls = [];
      for (const title of tabTitles) {
        const control = controls.find((entry) => entry.title === title);
        if (control) {
          uniqueControls.push(control);
        }
      }

      const sections = [];
      for (const { node, title } of uniqueControls) {
        try {
          node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          node.click();
        } catch (_error) {
          // Ignore click issues and fall back to text extraction.
        }

        await new Promise((resolve) => setTimeout(resolve, 150));
        const panel = findTabPanel(node, title, main);
        const values = extractPanelValues(panel, title);
        sections.push({ title, values });
      }

      return sections;
    };
    const toAbsolute = (href) => {
      try {
        return new URL(href, url).toString();
      } catch (_error) {
        return null;
      }
    };
    const main =
      document.querySelector('main[data-test-selector^="productDetails_"]') || document.querySelector("main");
    const text = (selector) => normalize(main?.querySelector(selector)?.textContent || "");

    const allHeadings = Array.from(main?.querySelectorAll("h1") || [])
      .map((node) => normalize(node.textContent))
      .filter(Boolean);
    const name = allHeadings[0] || normalize(document.title);

    const partText = text('[data-test-selector="ProductDetailsPartNumber"]');
    const partNumber = partText.replace(/^Part\s*#/i, "").trim();

    const mfgParagraph = Array.from(main?.querySelectorAll("p") || []).find((node) =>
      /MFG\s*#/i.test(node.textContent || "")
    );
    const manufacturerPartNumber = normalize(mfgParagraph?.textContent || "").replace(/^MFG\s*#/i, "").trim();

    const images = Array.from(main?.querySelectorAll("img") || [])
      .map((img) => img.getAttribute("src") || img.getAttribute("data-src"))
      .map((src) => toAbsolute(src))
      .filter(Boolean)
      .filter((src) => /\/Aquifer\/Images\//i.test(src));

    const detailTextLines = (main?.innerText || "")
      .split("\n")
      .map((line) => normalize(line))
      .filter(Boolean)
      .filter(
        (line) =>
          ![
            "Email",
            "Print",
            "Copy Link",
            "Sign In to Build Cart",
            "Sign In to See Your Price",
            "Add to List",
            "Inventory Available upon Sign In",
          ].includes(line)
      );

    const stopMarkers = new Set([
      "Subscribe for Promotions, Events and More!",
      "Products",
      "About Us",
      "Privacy Policy",
    ]);

    const tabTitles = ["Item Features", "Attributes", "Documents", "Specs", "Specification"];
    const textSections = [];
    for (let index = 0; index < detailTextLines.length; index += 1) {
      const title = detailTextLines[index];
      if (!tabTitles.includes(title)) {
        continue;
      }

      const values = [];
      for (let cursor = index + 1; cursor < detailTextLines.length; cursor += 1) {
        const line = detailTextLines[cursor];
        if (tabTitles.includes(line) || stopMarkers.has(line)) {
          break;
        }
        values.push(line);
      }

      textSections.push({ title, values });
    }

    const domSections = await collectTabsFromDom(main, tabTitles);
    const sections = tabTitles
      .map((title) => {
        const domSection = domSections.find((section) => section.title === title);
        const textSection = textSections.find((section) => section.title === title);
        const values = domSection?.values?.length ? domSection.values : textSection?.values || [];
        return { title, values: dedupe(values) };
      })
      .filter((section) => section.values.length || domSections.some((entry) => entry.title === section.title));

    const featureSection = sections.find((section) => section.title === "Item Features");
    const attributeSection = sections.find((section) => section.title === "Attributes");
    const specSection =
      sections.find((section) => section.title === "Specs") ||
      sections.find((section) => section.title === "Specification");

    const attributes = [];
    const seenAttributes = new Set();
    const rawAttributes = attributeSection?.values || [];
    for (const entry of rawAttributes) {
      const pair = parseAttributeLine(entry);
      if (pair) {
        const key = `${pair.name}::${pair.value}`;
        if (!seenAttributes.has(key)) {
          seenAttributes.add(key);
          attributes.push(pair);
        }
      }
    }

    const breadcrumbs = Array.from(
      document.querySelectorAll('nav a, [aria-label*="breadcrumb" i] a, .breadcrumb a')
    )
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    const documentCandidates = Array.from(main?.querySelectorAll("a[href]") || [])
      .map((anchor) => ({
        name:
          normalize(anchor.textContent) ||
          normalize(anchor.querySelector('[class*="Typography"], span')?.textContent) ||
          "Document",
        url: toAbsolute(anchor.getAttribute("href")),
      }))
      .filter((doc) => doc.url)
      .filter(
        (doc) =>
          /\.(pdf|docx?|xlsx?)($|\?)/i.test(doc.url) ||
          /res\.cloudinary\.com\/[^/]+\/raw\/upload\/Aquifer\/Documents\//i.test(doc.url) ||
          /\/Aquifer\/Documents\//i.test(doc.url)
      );

    const documents = [];
    const seenDocuments = new Set();
    for (const doc of documentCandidates) {
      const key = doc.url;
      if (seenDocuments.has(key)) {
        continue;
      }

      seenDocuments.add(key);
      documents.push(doc);
    }

    return {
      url,
      name,
      description:
        text('[data-test-selector="productDetails_htmlContent"]') || featureSection?.values?.join("\n") || "",
      images,
      attributes,
      specs: specSection?.values || [],
      tabs: sections,
      breadcrumbs,
      sku: partNumber,
      manufacturerPartNumber,
      brand: guessBrandFromName(name, manufacturerPartNumber, partNumber),
      documents,
    };
  }, url);
}

module.exports = {
  normalizeWhitespace,
  unique,
  setLargestPageSize,
  extractCategoryPage,
  extractProductPage,
};
