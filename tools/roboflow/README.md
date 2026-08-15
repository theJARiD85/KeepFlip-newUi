# KeepFlip Roboflow intake

This folder prepares the private `keepflip-category-classifier` project for the `pilot-v0` collection check. It does not upload images, create a dataset version, or train a model.

## Keep private data out of Git

Put source photos and the completed manifest here (this directory is ignored by Git):

```txt
tools/roboflow/private-data/
  photos/
  manifest.csv
```

Copy `pilot-v0-manifest.template.csv` to `private-data/manifest.csv`. `filename` is a path relative to `private-data/photos`, using `/` as the separator.

Do not put the completed manifest or any seller image elsewhere in this repository. The manifest can identify a product and its source-rights record, so it stays private even when it contains no direct personal data.

## Manifest rules

Every image has one row. Required values:

```txt
batch: pilot-v0
class_label: tools | electronics_camera | shoes_footwear |
             handbags_accessories | jewelry | collectibles_toys_media |
             sports_outdoor | unknown_other
split: train | valid | test
source_rights: keepflip_owned | seller_consented | explicitly_licensed
privacy_scrubbed: true
capture_flow: single_item
framing: full_item | near_full_item
review_status: approved
```

`item_id` is the unique physical item. Every angle or retake of one item must use the same `item_id` and the same split. `product_family_id` is optional; record it when a known make/model/SKU is repeated. The validator flags, but does not fail, a family spread across splits because `pilot-v0` is not a scored production evaluation.

For `unknown_other`, fill `unknown_other_subtype` (for example `electric_guitar`, `espresso_machine`, or `stereo_receiver`). That lets the validator flag a subtype occupying more than 20% of the class.

Never include multi-item photos, documents, receipts, shipping labels/materials, logo-only/model-label-only/serial-label-only photos, or detail-only category-ambiguous photos. Keep safe text and logo detail photos in a separate future OCR/logo collection.

## Validate before upload

Run this from the KeepFlip repository after placing the reviewed source photos and manifest locally:

```powershell
node tools/roboflow/validate-pilot-v0.mjs `
  --manifest tools/roboflow/private-data/manifest.csv `
  --source-root tools/roboflow/private-data/photos
```

The validator checks actual file hashes, missing files, required values, approved privacy review, labels, group-safe splits, duplicate leakage, and `unknown_other` diversity. A validation error means do not upload. Warnings identify collection gaps that should be reviewed before treating the pilot as ready.

After the validator passes, Codex can stage the three manually assigned splits for the private Roboflow project, audit the uploaded state, and only then consider creating a dataset version. `pilot-v0` remains a data-process validation batch, not a production-training run.

## Brave Search candidate collection

`brave_candidate_collector.py` searches Brave Image Search and downloads every image result returned for each configured query. The included starter config uses 30 high-resale item searches across eight categories and caps each search at 10 results, for up to 300 candidates total. It keeps a source CSV beside every download and never uploads anything to Roboflow.

If a source or search times out, the collector retries the search once, skips only the failed source, and continues. Re-running the same output folder reuses completed downloads instead of downloading them again.

Start with one command:

```powershell
$env:BRAVE_SEARCH_API_KEY = "your-brave-key"
python tools/roboflow/brave_candidate_collector.py collect `
  --config tools/roboflow/brave-bootstrap-queries.example.json `
  --output-dir tools/roboflow/private-data/brave-search/bootstrap
```

That creates:

```txt
bootstrap/
  candidates.csv
  download-manifest.csv
  downloads/
```

It downloads candidate images automatically, skipping only bad URLs, non-images, and files larger than 100 MB. The supplied query set caps each query at 12 results so it produces a varied first batch instead of hundreds of near-identical images. Later, choose which images make it into `pilot-v0`.

Only rows with all of these fields may move beyond quarantine into the training manifest:

```txt
review_status=approved
download_allowed=true
rights_basis=explicitly_licensed or keepflip_owned
license_url=<verified source license>
privacy_scrubbed=true
framing=full_item or near_full_item
reviewed_class_label=<one of the six classifier labels>
```

If you want a second, tightly reviewed download pass later, use:

```powershell
python tools/roboflow/brave_candidate_collector.py download `
  --reviewed-candidates tools/roboflow/private-data/brave-search/candidates.csv `
  --output-dir tools/roboflow/private-data/brave-search/downloads
```

The download output is still only a quarantine set. It must be entered into the `pilot-v0` manifest, checked for group-safe splits, and approved before any Roboflow upload.
