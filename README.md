# GrapesJS MJML image reconciliation demo

Side-by-side reproduction for `grapesjs-mjml@1.0.8`.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/geonsang-jo/grapesjs-mjml-image-reconcile-demo?startScript=dev&view=preview)

- **Baseline:** an `mj-image` width update replaces the rendered subtree.
- **Patched:** an `mj-image`-only reconciliation step preserves matching DOM nodes and synchronizes their attributes in place.

The page detects replacements by comparing the rendered `<img>` DOM object before and after each update.

## Run locally

```bash
npm install
npm run dev
```

Then use **Toggle width once** or **Start auto toggle**.

The patched renderer mirrors the proposed `mj-image`-only change for
[`GrapesJS/mjml`](https://github.com/GrapesJS/mjml).
