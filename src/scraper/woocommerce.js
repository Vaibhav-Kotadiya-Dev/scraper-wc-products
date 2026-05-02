const { toCsv } = require("../utils/csv");

function stripEmptyAttributes(attributes) {
  return attributes.filter((attribute) => attribute.name && attribute.value);
}

function withExportAttributes(product) {
  const attributes = stripEmptyAttributes(product.attributes || []).map((attribute) => ({ ...attribute }));
  const hasMfg = attributes.some((attribute) => String(attribute.name || "").trim().toLowerCase() === "mfg");

  if (!hasMfg && product.manufacturerPartNumber) {
    attributes.push({
      name: "MFG",
      value: product.manufacturerPartNumber,
    });
  }

  return attributes;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeCloudinaryImageUrl(url) {
  const value = String(url || "").trim().replace(/%2C/gi, ",");
  if (!value) {
    return "";
  }

  const match = value.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/)([^/]+)(\/Aquifer\/Images\/.+?)(\.[a-z0-9]+)?$/i
  );

  if (!match) {
    return value;
  }

  const [, prefix, transformation, assetPath, extension] = match;
  const safeTransformation = transformation
    .split(",")
    .map((part) => (part === "f_auto" ? "f_jpg" : part))
    .join(",");

  return `${prefix}${safeTransformation.replace(/,/g, "%2C")}${assetPath}${extension || ".jpg"}`;
}

function getCloudinaryWidth(url) {
  const match = String(url || "").match(/(?:^|,)w_(\d+)(?:,|\/|$)/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getImageIdentity(url) {
  const value = String(url || "").trim().replace(/%2C/gi, ",");
  const match = value.match(/\/Aquifer\/Images\/(.+?)(\.[a-z0-9]+)?$/i);
  return match ? match[1] : value;
}

function formatImageUrls(images) {
  const bestByAsset = new Map();

  for (const rawUrl of images || []) {
    const normalizedUrl = normalizeCloudinaryImageUrl(rawUrl);
    if (!normalizedUrl) {
      continue;
    }

    const key = getImageIdentity(normalizedUrl);
    const current = bestByAsset.get(key);
    if (!current || getCloudinaryWidth(normalizedUrl) > getCloudinaryWidth(current)) {
      bestByAsset.set(key, normalizedUrl);
    }
  }

  return [...bestByAsset.values()].join(", ");
}

function findTab(product, title) {
  return (product.tabs || []).find((tab) => tab.title === title);
}

function renderListBlock(title, values) {
  if (!values.length) {
    return "";
  }

  const items = values.map((value) => ` \t<li>${escapeHtml(value)}</li>`).join("\\n");
  return `<h3>${escapeHtml(title)}</h3>\\n<ul>\\n${items}\\n</ul>`;
}

function renderAttributesBlock(attributes) {
  if (!attributes.length) {
    return "";
  }

  const items = attributes
    .map(
      (attribute) =>
        `<li><strong>${escapeHtml(attribute.name)}:</strong> ${escapeHtml(attribute.value)}</li>`
    )
    .join("");

  return `<h3>Attributes</h3><ul>${items}</ul>`;
}

function formatDescription(product) {
  const blocks = [];
  const attributes = stripEmptyAttributes(product.attributes || []);
  const featureTab = findTab(product, "Item Features");

  if (product.description && product.description !== featureTab?.values?.join("\n")) {
    blocks.push(`<p>${escapeHtml(product.description)}</p>`);
  }

  if (featureTab?.values?.length) {
    const items = featureTab.values.map((value) => ` \t<li>${escapeHtml(value)}</li>`).join("\\n");
    blocks.push(`<ul>\\n${items}\\n</ul>`);
  }

  for (const tab of product.tabs || []) {
    if (!tab.values?.length || tab.title === "Item Features" || tab.title === "Attributes") {
      continue;
    }

    blocks.push(renderListBlock(tab.title, tab.values));
  }

  return blocks.filter(Boolean).join("\n");
}

function formatShortDescription(product) {
  const lines = [];

  if (product.sku) {
    lines.push(`Part #${product.sku}`);
  }

  if (product.manufacturerPartNumber) {
    lines.push(`MFG #${product.manufacturerPartNumber}`);
  }

  return lines.join("\n");
}

function formatCategories(categoryPath) {
  if (!categoryPath?.length) {
    return "";
  }

  return categoryPath.map((_category, index) => categoryPath.slice(0, index + 1).join(" > ")).join(", ");
}

function buildRows(products) {
  const attributeCount = Math.max(
    3,
    ...products.map((product) => withExportAttributes(product).length)
  );

  const headers = [
    "ID",
    "Type",
    "SKU",
    "GTIN, UPC, EAN, or ISBN",
    "Name",
    "Published",
    "Is featured?",
    "Visibility in catalog",
    "Short description",
    "Description",
    "Date sale price starts",
    "Date sale price ends",
    "Tax status",
    "Tax class",
    "In stock?",
    "Stock",
    "Low stock amount",
    "Backorders allowed?",
    "Sold individually?",
    "Weight (lbs)",
    "Length (in)",
    "Width (in)",
    "Height (in)",
    "Allow customer reviews?",
    "Purchase note",
    "Sale price",
    "Regular price",
    "Categories",
    "Tags",
    "Shipping class",
    "Images",
    "Download limit",
    "Download expiry days",
    "Parent",
    "Grouped products",
    "Upsells",
    "Cross-sells",
    "External URL",
    "Button text",
    "Position",
    "Brands",
  ];

  for (let index = 1; index <= attributeCount; index += 1) {
    headers.push(`Attribute ${index} name`);
    headers.push(`Attribute ${index} value(s)`);
    headers.push(`Attribute ${index} visible`);
    headers.push(`Attribute ${index} global`);
  }

  headers.push("Meta: _aioseo_og_title");
  headers.push("Meta: _aioseo_og_description");
  headers.push("Meta: _aioseo_og_article_section");
  headers.push("Meta: _aioseo_twitter_title");
  headers.push("Meta: _aioseo_twitter_description");

  const rows = products.map((product) => {
    const attributes = withExportAttributes(product);
    const row = {
      ID: "",
      Type: "simple",
      SKU: product.sku || product.manufacturerPartNumber || "",
      "GTIN, UPC, EAN, or ISBN": "",
      Name: product.name,
      Published: 1,
      "Is featured?": 0,
      "Visibility in catalog": "visible",
      "Short description": formatShortDescription(product),
      Description: formatDescription(product),
      "Date sale price starts": "",
      "Date sale price ends": "",
      "Tax status": "taxable",
      "Tax class": "",
      "In stock?": 1,
      Stock: 1,
      "Low stock amount": "",
      "Backorders allowed?": 0,
      "Sold individually?": 0,
      "Weight (lbs)": "",
      "Length (in)": "",
      "Width (in)": "",
      "Height (in)": "",
      "Allow customer reviews?": 1,
      "Purchase note": "",
      "Sale price": "",
      "Regular price": "",
      Categories: formatCategories(product.categoryPath || []),
      Tags: "",
      "Shipping class": "",
      Images: formatImageUrls(product.images || []),
      "Download limit": "",
      "Download expiry days": "",
      Parent: "",
      "Grouped products": "",
      Upsells: "",
      "Cross-sells": "",
      "External URL": "",
      "Button text": "",
      Position: "",
      Brands: product.brand || "",
      "Meta: _aioseo_og_title": "",
      "Meta: _aioseo_og_description": "",
      "Meta: _aioseo_og_article_section": "",
      "Meta: _aioseo_twitter_title": "",
      "Meta: _aioseo_twitter_description": "",
    };

    for (let index = 0; index < attributeCount; index += 1) {
      const attribute = attributes[index];
      row[`Attribute ${index + 1} name`] = attribute?.name || "";
      row[`Attribute ${index + 1} value(s)`] = attribute?.value || "";
      row[`Attribute ${index + 1} visible`] = attribute ? 1 : "";
      row[`Attribute ${index + 1} global`] = attribute ? 0 : "";
    }

    return row;
  });

  return { headers, rows };
}

function buildWooCommerceCsv(products) {
  const { headers, rows } = buildRows(products);
  return toCsv(rows, headers);
}

module.exports = {
  buildWooCommerceCsv,
};
