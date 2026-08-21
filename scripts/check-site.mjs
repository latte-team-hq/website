import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checkedReferences = 0;

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

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function resolveLocalReference(reference, fromFile) {
  if (reference.startsWith("#")) {
    return { anchor: reference.slice(1), file: fromFile };
  }
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith("mailto:") || clean.startsWith("tel:") || clean.startsWith("data:")) {
    return null;
  }
  if (/^https?:\/\//i.test(clean)) {
    return null;
  }
  let resolved;
  if (clean.startsWith("/")) {
    resolved = clean.slice(1);
  } else {
    resolved = path.posix.join(path.posix.dirname(fromFile), clean);
  }

  if (!resolved) resolved = "index.html";
  if (resolved.endsWith("/")) resolved += "index.html";
  return { file: path.posix.normalize(resolved) };
}

const requiredFiles = [
  ".nojekyll",
  "404.html",
  "CNAME",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "assets/comfortaa-bold.ttf",
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

const pages = [
  {
    file: "index.html",
    lang: "en",
    canonical: "https://latte.team/",
    currentLanguage: "EN",
    ogLocale: "en_US",
    ogAlternates: ["ru_RU", "ka_GE"],
  },
  {
    file: "ru/index.html",
    lang: "ru",
    canonical: "https://latte.team/ru/",
    currentLanguage: "RU",
    ogLocale: "ru_RU",
    ogAlternates: ["en_US", "ka_GE"],
  },
  {
    file: "ka/index.html",
    lang: "ka",
    canonical: "https://latte.team/ka/",
    currentLanguage: "ქართული",
    ogLocale: "ka_GE",
    ogAlternates: ["en_US", "ru_RU"],
  },
  { file: "404.html", lang: "en", noindex: true },
];

const languageAlternates = {
  en: "https://latte.team/",
  ru: "https://latte.team/ru/",
  "ka-GE": "https://latte.team/ka/",
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
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) fail(`${page.file}: expected exactly one h1`);

  const metaTags = tags(html, "meta");
  const viewport = metaTags.find((tag) => attribute(tag, "name") === "viewport");
  const description = metaTags.find((tag) => attribute(tag, "name") === "description");
  const csp = metaTags.find((tag) => attribute(tag, "http-equiv") === "Content-Security-Policy");
  if (!viewport) fail(`${page.file}: missing viewport metadata`);
  if (!description || !attribute(description, "content")) fail(`${page.file}: missing meta description`);
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
  const canonical = linkTags.find((tag) => attribute(tag, "rel") === "canonical");
  if (page.canonical && attribute(canonical ?? "", "href") !== page.canonical) {
    fail(`${page.file}: incorrect canonical URL`);
  }
  if (!page.canonical && canonical) fail(`${page.file}: a 404 page must not be canonicalized`);

  if (page.currentLanguage) {
    for (const [language, href] of Object.entries(languageAlternates)) {
      const alternate = linkTags.find(
        (tag) => attribute(tag, "rel") === "alternate" && attribute(tag, "hreflang") === language,
      );
      if (attribute(alternate ?? "", "href") !== href) {
        fail(`${page.file}: incorrect ${language} alternate URL`);
      }
    }

    const current = html.match(/<a\b[^>]*aria-current=["']page["'][^>]*>([\s\S]*?)<\/a>/i);
    const currentText = current?.[1].replace(/<[^>]+>/g, "").trim();
    if (currentText !== page.currentLanguage) fail(`${page.file}: incorrect active language`);
    for (const property of ["og:title", "og:description", "og:url", "og:image", "og:image:secure_url"]) {
      if (!metaTags.some((tag) => attribute(tag, "property") === property)) {
        fail(`${page.file}: missing ${property}`);
      }
    }
    const ogLocale = metaTags.find((tag) => attribute(tag, "property") === "og:locale");
    if (attribute(ogLocale ?? "", "content") !== page.ogLocale) {
      fail(`${page.file}: incorrect Open Graph locale`);
    }
    const ogAlternates = metaTags
      .filter((tag) => attribute(tag, "property") === "og:locale:alternate")
      .map((tag) => attribute(tag, "content"));
    for (const expected of page.ogAlternates) {
      if (!ogAlternates.includes(expected)) fail(`${page.file}: missing Open Graph alternate ${expected}`);
    }
    for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
      if (!metaTags.some((tag) => attribute(tag, "name") === name)) {
        fail(`${page.file}: missing ${name}`);
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

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    const resolved = resolveLocalReference(reference, page.file);
    if (!resolved) continue;
    checkedReferences += 1;
    if (!existsSync(path.join(root, resolved.file))) {
      fail(`${page.file}: broken internal reference ${reference} -> ${resolved.file}`);
      continue;
    }
    if (resolved.anchor) {
      const target = read(resolved.file);
      if (!new RegExp(`\\bid=["']${resolved.anchor}["']`).test(target)) {
        fail(`${page.file}: missing anchor target ${reference}`);
      }
    }
  }
}

const css = read("styles.css");
if (css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const balance = [...withoutComments].reduce((total, character) => total + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
  if (balance !== 0) fail("styles.css: unbalanced braces");
  for (const selector of [":focus-visible", "a:active", ".language-switcher a"]) {
    if (!css.includes(selector)) fail(`styles.css: missing ${selector}`);
  }
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
    const resolved = resolveLocalReference(match[1], "styles.css");
    if (!resolved) continue;
    checkedReferences += 1;
    if (!existsSync(path.join(root, resolved.file))) {
      fail(`styles.css: broken asset reference ${match[1]} -> ${resolved.file}`);
    }
  }
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
  'hreflang="ka-GE"',
  'hreflang="x-default"',
]) {
  if (!sitemap.includes(expected)) fail(`sitemap.xml: missing ${expected}`);
}
if ((sitemap.match(/<url>/g) ?? []).length !== 3) fail("sitemap.xml: expected exactly three localized URLs");

const fontPath = path.join(root, "assets/comfortaa-bold.ttf");
if (existsSync(fontPath)) {
  const fontHash = createHash("sha256").update(readFileSync(fontPath)).digest("hex");
  const expectedHash = "990742fd8ec75da91f4eabcce954f36316de713e1ff0140eeefda0db1c44f91f";
  if (fontHash !== expectedHash) fail(`Comfortaa hash changed: ${fontHash}`);
}

if (failures.length > 0) {
  console.error(`Site checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site checks passed: ${pages.length} pages, ${checkedReferences} local references.`);
