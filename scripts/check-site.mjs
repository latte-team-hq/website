import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteOrigin = new URL("https://latte.team");
const failures = [];
let checkedReferences = 0;
const stylesheetReferences = new Set();

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tags(html, name) {
  const results = [];
  const opening = new RegExp(`<${escapeRegExp(name)}\\b`, "gi");
  for (const match of html.matchAll(opening)) {
    let quote = null;
    for (let index = match.index; index < html.length; index += 1) {
      const character = html[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        results.push(html.slice(match.index, index + 1));
        break;
      }
    }
  }
  return results;
}

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"),
  );
  return match?.[2] ?? null;
}

function elementTextForTag(html, openingTag, name) {
  const contentStart = html.indexOf(openingTag) + openingTag.length;
  if (contentStart < openingTag.length) return null;
  const remainder = html.slice(contentStart);
  const closingTag = remainder.match(new RegExp(`<\\/${escapeRegExp(name)}\\s*>`, "i"));
  if (!closingTag) return null;
  return remainder
    .slice(0, closingTag.index)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function elementText(html, name) {
  const [openingTag] = tags(html, name);
  return openingTag ? elementTextForTag(html, openingTag, name) : null;
}

function decodedAnchor(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveLocalReference(reference, fromFile) {
  if (reference.startsWith("#")) {
    return { anchor: decodedAnchor(reference.slice(1)), file: fromFile };
  }
  const hashIndex = reference.indexOf("#");
  const anchor = hashIndex >= 0 ? decodedAnchor(reference.slice(hashIndex + 1)) : null;
  let clean = (hashIndex >= 0 ? reference.slice(0, hashIndex) : reference).split("?", 1)[0];
  if (!clean || clean.startsWith("mailto:") || clean.startsWith("tel:") || clean.startsWith("data:")) {
    return null;
  }
  if (clean.startsWith("//")) return null;
  if (/^https?:\/\//i.test(clean)) {
    let absolute;
    try {
      absolute = new URL(clean);
    } catch {
      return null;
    }
    if (absolute.origin !== siteOrigin.origin) return null;
    clean = absolute.pathname;
  }
  let resolved;
  if (clean.startsWith("/")) {
    resolved = clean.slice(1);
  } else {
    resolved = path.posix.join(path.posix.dirname(fromFile), clean);
  }

  if (!resolved) resolved = "index.html";
  if (resolved.endsWith("/")) resolved += "index.html";
  const normalized = path.posix.normalize(resolved);
  const outsideRoot = normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized);
  return { anchor, file: normalized, outsideRoot };
}

function metaContent(metaTags, attributeName, attributeValue) {
  const tag = metaTags.find((candidate) => attribute(candidate, attributeName) === attributeValue);
  return attribute(tag ?? "", "content");
}

const requiredFiles = [
  ".nojekyll",
  ".github/workflows/check-site.yml",
  "404.html",
  "CNAME",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "assets/comfortaa-latin-700.woff2",
  "assets/latte-mark.svg",
  "assets/og-image.png",
  "favicon.ico",
  "ka/index.html",
  "licenses/Comfortaa-OFL-1.1.txt",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) fail(`Missing required file: ${file}`);
}

const expectedRobots = [
  "User-agent: *",
  "Allow: /",
  "",
  "Sitemap: https://latte.team/sitemap.xml",
].join("\n");
const robots = read("robots.txt").replace(/\r\n/g, "\n").trim();
if (robots !== expectedRobots) {
  fail("robots.txt: expected root crawling to be allowed with the production sitemap URL");
}

if (read("CNAME").trim() !== "latte.team") {
  fail("CNAME: expected the canonical bare domain latte.team");
}

const css = read("styles.css");
const stylesheetHash = createHash("sha256").update(css).digest("hex").slice(0, 12);
const expectedStylesheetReference = `/styles.css?v=${stylesheetHash}`;
const ogImageUrl = "https://latte.team/assets/og-image.png";

const pages = [
  {
    file: "index.html",
    lang: "en",
    canonical: "https://latte.team/",
    currentLanguage: "ENG",
    homeHref: "/",
    footer: "Latte Team · Tbilisi, Georgia",
    skipLabel: "Skip to main content",
    title: "Latte Team — Digital Solutions for Business",
    description: "Latte Team helps companies solve business needs with automation, integrations, no-code/low-code tools, and custom software.",
    ogLocale: "en_US",
    ogAlternates: ["ru_RU", "ka_GE"],
    ogTitle: "Latte Team — Digital Solutions for Business",
    ogDescription: "Practical digital solutions shaped around real business needs.",
    ogImageAlt: "Latte Team — digital solutions for business",
  },
  {
    file: "ru/index.html",
    lang: "ru",
    canonical: "https://latte.team/ru/",
    currentLanguage: "RUS",
    homeHref: "/ru/",
    footer: "Latte Team · Тбилиси, Грузия",
    skipLabel: "Перейти к содержанию",
    title: "Latte Team — Цифровые решения для бизнеса",
    description: "Latte Team помогает компаниям решать бизнес-задачи с помощью автоматизации, интеграций, no-code/low-code инструментов и индивидуальной разработки.",
    ogLocale: "ru_RU",
    ogAlternates: ["en_US", "ka_GE"],
    ogTitle: "Latte Team — Цифровые решения для бизнеса",
    ogDescription: "Практичные цифровые решения, построенные вокруг задач бизнеса.",
    ogImageAlt: "Latte Team — цифровые решения для бизнеса",
  },
  {
    file: "ka/index.html",
    lang: "ka",
    canonical: "https://latte.team/ka/",
    currentLanguage: "GEO",
    homeHref: "/ka/",
    footer: "Latte Team · თბილისი, საქართველო",
    skipLabel: "მთავარ შინაარსზე გადასვლა",
    title: "Latte Team — ციფრული გადაწყვეტილებები ბიზნესისთვის",
    description: "Latte Team ეხმარება კომპანიებს ბიზნეს-ამოცანების გადაჭრაში ავტომატიზაციით, ინტეგრაციებით, no-code/low-code ინსტრუმენტებითა და ინდივიდუალური პროგრამული განვითარებით.",
    ogLocale: "ka_GE",
    ogAlternates: ["en_US", "ru_RU"],
    ogTitle: "Latte Team — ციფრული გადაწყვეტილებები ბიზნესისთვის",
    ogDescription: "პრაქტიკული ციფრული გადაწყვეტილებები, რომლებიც ბიზნესის რეალურ საჭიროებებს ეფუძნება.",
    ogImageAlt: "Latte Team — ციფრული გადაწყვეტილებები ბიზნესისთვის",
  },
  {
    file: "404.html",
    lang: "en",
    homeHref: "/",
    footer: "Latte Team · Tbilisi, Georgia",
    skipLabel: "Skip to main content",
    title: "Page not found — Latte Team",
    description: "The requested page could not be found.",
    noindex: true,
  },
];

const languageAlternates = {
  en: "https://latte.team/",
  ru: "https://latte.team/ru/",
  ka: "https://latte.team/ka/",
  "x-default": "https://latte.team/",
};

for (const page of pages) {
  const html = read(page.file);
  if (!html) continue;

  if (!/^<!doctype html>/i.test(html)) fail(`${page.file}: missing HTML5 doctype`);
  if (!new RegExp(`<html\\s+lang=["']${page.lang}["']`, "i").test(html)) {
    fail(`${page.file}: expected html lang=${page.lang}`);
  }
  if (tags(html, "title").length !== 1) fail(`${page.file}: expected exactly one title`);
  if (elementText(html, "title") !== page.title) fail(`${page.file}: incorrect title`);
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) fail(`${page.file}: expected exactly one h1`);

  const metaTags = tags(html, "meta");
  const viewport = metaTags.find((tag) => attribute(tag, "name") === "viewport");
  const description = metaTags.find((tag) => attribute(tag, "name") === "description");
  const csp = metaTags.find((tag) => attribute(tag, "http-equiv") === "Content-Security-Policy");
  if (!viewport) fail(`${page.file}: missing viewport metadata`);
  if (attribute(description ?? "", "content") !== page.description) {
    fail(`${page.file}: incorrect meta description`);
  }
  if (!csp) {
    fail(`${page.file}: missing meta Content-Security-Policy`);
  } else {
    const policy = attribute(csp, "content") ?? "";
    for (const directive of ["default-src 'none'", "style-src 'self'", "img-src 'self'", "font-src 'self'", "base-uri 'none'", "form-action 'none'"]) {
      if (!policy.includes(directive)) fail(`${page.file}: CSP missing ${directive}`);
    }
    if (policy.includes("frame-ancestors")) fail(`${page.file}: frame-ancestors does not work in meta CSP`);
  }

  const linkTags = tags(html, "link");
  const stylesheets = linkTags.filter((tag) => attribute(tag, "rel") === "stylesheet");
  if (stylesheets.length !== 1) {
    fail(`${page.file}: expected exactly one stylesheet`);
  } else {
    const stylesheetReference = attribute(stylesheets[0], "href");
    stylesheetReferences.add(stylesheetReference);
    if (stylesheetReference !== expectedStylesheetReference) {
      fail(`${page.file}: stylesheet cache version must match styles.css content (${expectedStylesheetReference})`);
    }
  }
  const fontPreload = linkTags.find(
    (tag) =>
      attribute(tag, "rel") === "preload" &&
      attribute(tag, "href") === "/assets/comfortaa-latin-700.woff2",
  );
  if (
    !fontPreload ||
    attribute(fontPreload, "as") !== "font" ||
    attribute(fontPreload, "type") !== "font/woff2" ||
    !/\bcrossorigin(?:\s|>)/i.test(fontPreload)
  ) {
    fail(`${page.file}: missing Comfortaa WOFF2 preload`);
  }
  const canonical = linkTags.find((tag) => attribute(tag, "rel") === "canonical");
  if (page.canonical && attribute(canonical ?? "", "href") !== page.canonical) {
    fail(`${page.file}: incorrect canonical URL`);
  }
  if (!page.canonical && canonical) fail(`${page.file}: a 404 page must not be canonicalized`);
  if (html.includes('hreflang="ka-GE"')) fail(`${page.file}: Georgian hreflang must be ka`);

  const skipLink = tags(html, "a").find((tag) =>
    (attribute(tag, "class") ?? "").split(/\s+/).includes("skip-link"),
  );
  if (!skipLink || attribute(skipLink, "href") !== "#top") {
    fail(`${page.file}: missing skip link to #top`);
  }
  if (elementText(html.slice(html.indexOf(skipLink ?? "")), "a") !== page.skipLabel) {
    fail(`${page.file}: incorrect localized skip-link label`);
  }
  if (html.indexOf(skipLink ?? "") > html.indexOf("<header")) {
    fail(`${page.file}: skip link must precede the site header`);
  }

  const main = tags(html, "main").find((tag) => attribute(tag, "id") === "top");
  if (!main || attribute(main, "tabindex") !== "-1") {
    fail(`${page.file}: #top main target must be programmatically focusable`);
  }

  const hasHeaderActions = tags(html, "div").some((tag) =>
    (attribute(tag, "class") ?? "").split(/\s+/).includes("header-actions"),
  );
  if (!hasHeaderActions) fail(`${page.file}: missing header-actions layout container`);

  if (page.currentLanguage) {
    for (const [language, href] of Object.entries(languageAlternates)) {
      const alternate = linkTags.find(
        (tag) => attribute(tag, "rel") === "alternate" && attribute(tag, "hreflang") === language,
      );
      if (attribute(alternate ?? "", "href") !== href) {
        fail(`${page.file}: incorrect ${language} alternate URL`);
      }
    }

    const current = tags(html, "a").find((tag) => attribute(tag, "aria-current") === "page");
    const currentText = current ? elementTextForTag(html, current, "a") : null;
    if (currentText !== page.currentLanguage) fail(`${page.file}: incorrect active language`);
    const expectedOpenGraph = {
      "og:type": "website",
      "og:site_name": "Latte Team",
      "og:title": page.ogTitle,
      "og:description": page.ogDescription,
      "og:url": page.canonical,
      "og:image": ogImageUrl,
      "og:image:secure_url": ogImageUrl,
      "og:image:type": "image/png",
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:alt": page.ogImageAlt,
    };
    for (const [property, expected] of Object.entries(expectedOpenGraph)) {
      if (metaContent(metaTags, "property", property) !== expected) {
        fail(`${page.file}: incorrect ${property}`);
      }
    }
    const ogLocale = metaTags.find((tag) => attribute(tag, "property") === "og:locale");
    if (attribute(ogLocale ?? "", "content") !== page.ogLocale) {
      fail(`${page.file}: incorrect Open Graph locale`);
    }
    const ogAlternates = metaTags
      .filter((tag) => attribute(tag, "property") === "og:locale:alternate")
      .map((tag) => attribute(tag, "content"));
    if (JSON.stringify([...ogAlternates].sort()) !== JSON.stringify([...page.ogAlternates].sort())) {
      fail(`${page.file}: incorrect Open Graph alternates`);
    }
    const expectedTwitter = {
      "twitter:card": "summary_large_image",
      "twitter:title": page.ogTitle,
      "twitter:description": page.ogDescription,
      "twitter:image": ogImageUrl,
      "twitter:image:alt": page.ogImageAlt,
    };
    for (const [name, expected] of Object.entries(expectedTwitter)) {
      if (metaContent(metaTags, "name", name) !== expected) {
        fail(`${page.file}: incorrect ${name}`);
      }
    }

    for (const tag of metaTags.filter(
      (candidate) =>
        ["og:image", "og:image:secure_url"].includes(attribute(candidate, "property")) ||
        attribute(candidate, "name") === "twitter:image",
    )) {
      const reference = attribute(tag, "content");
      const resolved = reference ? resolveLocalReference(reference, page.file) : null;
      if (!resolved) {
        fail(`${page.file}: image metadata must use the latte.team origin`);
        continue;
      }
      if (resolved.outsideRoot) {
        fail(`${page.file}: metadata image escapes the site root (${reference})`);
        continue;
      }
      checkedReferences += 1;
      if (!existsSync(path.join(root, resolved.file))) {
        fail(`${page.file}: broken metadata image ${reference} -> ${resolved.file}`);
      }
    }
  }

  const brandLink = tags(html, "a").find((tag) =>
    (attribute(tag, "class") ?? "").split(/\s+/).includes("brand"),
  );
  if (attribute(brandLink ?? "", "href") !== page.homeHref) {
    fail(`${page.file}: brand link must point to ${page.homeHref}`);
  }
  if (!html.includes(page.footer)) fail(`${page.file}: incorrect localized footer`);
  if (page.file === "404.html") {
    if (!/<span\s+lang=["']ka["']>/.test(html)) fail("404.html: missing Georgian explanation");
    for (const [href, language] of [["/ru/", "ru"], ["/ka/", "ka"]]) {
      const localizedAction = tags(html, "a").find(
        (tag) =>
          attribute(tag, "href") === href &&
          (attribute(tag, "class") ?? "").split(/\s+/).includes("secondary-action"),
      );
      if (attribute(localizedAction ?? "", "lang") !== language) {
        fail(`404.html: ${href} action must declare lang=${language}`);
      }
    }
  }

  if (page.noindex && !metaTags.some((tag) => attribute(tag, "name") === "robots" && attribute(tag, "content")?.includes("noindex"))) {
    fail(`${page.file}: missing noindex metadata`);
  }

  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(anchor[1], "href");
    const text = anchor[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!href) fail(`${page.file}: link without href (${text || "empty"})`);
    if (text.includes("sales@latte.team") && href !== "mailto:sales@latte.team") {
      fail(`${page.file}: sales email is not linked to mailto:sales@latte.team`);
    }
  }

  for (const tagName of ["a", "img", "link", "script", "source"]) {
    for (const tag of tags(html, tagName)) {
      const reference = attribute(tag, tagName === "a" || tagName === "link" ? "href" : "src");
      if (!reference) continue;
      const resolved = resolveLocalReference(reference, page.file);
      if (!resolved) continue;
      if (resolved.outsideRoot) {
        fail(`${page.file}: internal reference escapes the site root (${reference})`);
        continue;
      }
      checkedReferences += 1;
      if (!existsSync(path.join(root, resolved.file))) {
        fail(`${page.file}: broken internal reference ${reference} -> ${resolved.file}`);
        continue;
      }
      if (resolved.anchor) {
        const target = read(resolved.file);
        if (!new RegExp(`\\bid=["']${escapeRegExp(resolved.anchor)}["']`).test(target)) {
          fail(`${page.file}: missing anchor target ${reference}`);
        }
      }
    }
  }
}

if (stylesheetReferences.size !== 1) {
  fail(`Pages use inconsistent stylesheet references: ${[...stylesheetReferences].join(", ")}`);
}

if (css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const balance = [...withoutComments].reduce((total, character) => total + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
  if (balance !== 0) fail("styles.css: unbalanced braces");
  for (const selector of [":focus-visible", "a:active", ".language-switcher a"]) {
    if (!css.includes(selector)) fail(`styles.css: missing ${selector}`);
  }
  for (const declaration of [
    ".skip-link:focus",
    ".skip-link:focus-visible",
    '.language-switcher a[aria-current="page"]',
    "font-weight: 500",
    'html[lang="ka"] .eyebrow',
    "text-transform: none",
    "100dvh",
    "100svh",
  ]) {
    if (!css.includes(declaration)) fail(`styles.css: missing ${declaration}`);
  }
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
    const resolved = resolveLocalReference(match[1], "styles.css");
    if (!resolved) continue;
    if (resolved.outsideRoot) {
      fail(`styles.css: asset reference escapes the site root (${match[1]})`);
      continue;
    }
    checkedReferences += 1;
    if (!existsSync(path.join(root, resolved.file))) {
      fail(`styles.css: broken asset reference ${match[1]} -> ${resolved.file}`);
    }
  }
}

const ogImagePath = path.join(root, "assets/og-image.png");
if (existsSync(ogImagePath)) {
  const png = readFileSync(ogImagePath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(pngSignature) || png.toString("ascii", 12, 16) !== "IHDR") {
    fail("assets/og-image.png: invalid PNG header");
  } else if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) {
    fail(`assets/og-image.png: expected 1200x630, got ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  }
}

const workflow = read(".github/workflows/check-site.yml");
for (const expected of ["timeout-minutes: 5", "cancel-in-progress: true", "group: check-site-"]) {
  if (!workflow.includes(expected)) fail(`check-site workflow: missing ${expected}`);
}

const svg = read("assets/latte-mark.svg");
if (/\b(?:id|style|overflow|preserveAspectRatio)=/.test(svg)) {
  fail("assets/latte-mark.svg: contains removable export metadata");
}

const sitemap = read("sitemap.xml");
for (const expected of [
  "https://latte.team/",
  "https://latte.team/ru/",
  "https://latte.team/ka/",
  'hreflang="ka"',
  'hreflang="x-default"',
]) {
  if (!sitemap.includes(expected)) fail(`sitemap.xml: missing ${expected}`);
}
if ((sitemap.match(/<url>/g) ?? []).length !== 3) fail("sitemap.xml: expected exactly three localized URLs");
if (sitemap.includes('hreflang="ka-GE"')) fail("sitemap.xml: Georgian hreflang must be ka");

const fontPath = path.join(root, "assets/comfortaa-latin-700.woff2");
if (existsSync(fontPath)) {
  const fontHash = createHash("sha256").update(readFileSync(fontPath)).digest("hex");
  const expectedHash = "9c04952bd228b7e6234c45f8c1e7216d8e16bf1c052ebfa17b705dd04b7cae48";
  if (fontHash !== expectedHash) fail(`Comfortaa hash changed: ${fontHash}`);
  if (!readFileSync(fontPath).subarray(0, 4).equals(Buffer.from("wOF2"))) {
    fail("Comfortaa asset is not a WOFF2 file");
  }
}
if (existsSync(path.join(root, "assets/comfortaa-bold.ttf"))) {
  fail("Obsolete uncompressed Comfortaa TTF is still present");
}

if (failures.length > 0) {
  console.error(`Site checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site checks passed: ${pages.length} pages, ${checkedReferences} local references.`);
