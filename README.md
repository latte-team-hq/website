# Latte Team temporary website

Published static website for Latte Team:

- English: <https://latte.team/>
- Russian: <https://latte.team/ru/>
- Georgian: <https://latte.team/ka/>

The site is dependency-free and uses plain HTML and CSS. It has no framework, build step, package
manager, or client-side JavaScript.

## Local preview

Serve the repository root with any static HTTP server, for example:

```sh
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173/>, <http://127.0.0.1:4173/ru/>, or
<http://127.0.0.1:4173/ka/>.

## Checks

Run the dependency-free site checks with Node.js 20 or newer:

```sh
node scripts/check-site.mjs
```

The checks cover page structure, metadata, internal and same-origin metadata links, consistent CSS
cache versions, CSS syntax basics, and required assets. Pull requests and pushes to `main` run the
same checks in GitHub Actions.

## Content security policy

Each HTML page declares a meta CSP that permits only same-origin styles, images, and fonts. Scripts,
forms, plugins, and base URL changes are not needed by this static site and remain blocked. The
`frame-ancestors` directive is intentionally omitted because browsers do not enforce it from a meta
policy; it would require an HTTP response header managed outside this repository.

## Publishing

GitHub Pages publishes the `main` branch at the custom domain declared in `CNAME`. Changes should
be reviewed through a pull request. Repository, Pages, DNS, domain, and HTTPS settings are managed
outside this codebase.

## Third-party software

Third-party notices and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
No license is asserted here for the site's original code, content, or branding.
