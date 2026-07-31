# Version 6.1 — One Walmart Retailer Normalization

The One Walmart retailer filter now uses banner-level categories rather than
individual store names.

## Banner counts

- Walmart: 362
- Walmart Neighborhood Market: 674
- Walmart Supercenter: 3,562

## Data behavior

- `retailer` is the normalized banner used by filters and analysis.
- `storeName` retains the detailed source store name for popups and search.
- A defensive runtime normalizer protects future One Walmart data refreshes.
