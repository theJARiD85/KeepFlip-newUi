# Crosslisting form selectors

The native listing flow reads selector overrides from the `keepflip` Appwrite
database table `marketplace_form_configs`. The table has one row per supported
browser marketplace (`depop`, `poshmark`, `facebookMarketplace`, `mercari`, and
`offerUp`). Its `selectorsJson` value is a JSON object whose keys are listing
fields and whose values are CSS selector arrays. Custom fields can be added to
the same object when they are included in the listing payload's `platformFields`.

For example:

```json
{
  "title": ["input[name='title']"],
  "description": ["textarea[name='description']"],
  "location": ["input[aria-label*='location' i]"],
  "photoInput": ["input[type='file'][accept*='image' i]"]
}
```

These selectors are examples. Marketplace pages change their form markup, so
confirm selectors against the visible listing form before saving an override.
Custom selectors are prepended to KeepFlip's bundled selectors; invalid CSS
selectors are ignored. The client caches each row for up to one minute. Set
`enabled` to `false` to stop KeepFlip from filling that marketplace's form.

The table contains selector configuration only. It is readable by signed-out
clients because it contains no credentials; update rows through the Appwrite
Console or the linked Appwrite CLI. Never put cookies, tokens, or customer data
in `selectorsJson`.

KeepFlip opens a visible WebView for browser marketplaces. The first visit opens
the marketplace login; later visits reuse that device's WebView cookies and go
to the listing page. The app stores only a local marker for that login. It does
not copy new marketplace cookies into Appwrite. `Forget saved session` clears
the local cookies and also tries to delete a legacy Appwrite session row.

KeepFlip fills supported text fields and attempts to pass up to eight saved
photos into the marketplace photo control within a 2 MB preview budget. The
marketplace may reject synthetic file selection or fail to upload the files.
The seller should confirm visible photo previews and add missing photos with
the marketplace picker. Once title, description, and price were filled, the
seller can review the page, finish any remaining fields, tap `Continue listing
on [marketplace]`, and confirm. KeepFlip presses a matching next or final
button and reports which it pressed. A live listing still requires the
marketplace's own confirmation.
