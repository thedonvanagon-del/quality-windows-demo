# Buddha Beans Shirt Playbook

## Standing rule for every drop
- Pick the **top 10 subjects for women** and the **top 10 subjects for men** for that season.
- Make **one women's design and one men's design per subject**: 20 designs per drop.
- Seasonal or special sets (like the 25 Christmas sayings) are extra, on top of the 20.

## Current top 10 (fall / holiday 2026)
| # | Women | Men |
|---|---|---|
| 1 | Christmas | Christmas |
| 2 | Mom life | Dad life |
| 3 | Teacher | Fishing |
| 4 | Nurse | Hunting (deer season) |
| 5 | Book lover (romance) | Grilling / BBQ |
| 6 | Dog mom | Dog dad |
| 7 | Coffee (seasonal) | Coffee |
| 8 | Fall / cozy | Golf |
| 9 | Self-care | Outdoors |
| 10 | Cottagecore | Garage / DIY |
Refresh this list each season (Jan: Valentine's + New Year; Mar: spring/Easter + Mother's Day; May: Father's Day + summer; Aug: back to school + fall).

## Blanks and prices
- Women: Bella+Canvas 6400 women's relaxed tee, light colors, $29 (+$3 for 2XL).
- Men / unisex / family: Comfort Colors 1717, dark colors with worn vintage print, $30 (+$3 2XL, +$5 3XL).
- Kids: Bella+Canvas 3001Y, $24.
- Also list the best sellers on sweatshirts from September to February.

## Before anything goes live
- Search the exact phrase on Etsy and at tmsearch.uspto.gov. Skip anything trademarked for clothing.
- Never use: Grinch, Rudolph, movie quotes (Elf, Home Alone, Christmas Vacation), song lyrics, sports teams, brands, celebrities.
- Order samples of new shirt colors before scaling up.

## How to build a drop
1. Copy `drop4.py` to `dropN.py` and edit the design list.
2. `python3 dropN.py` -> prints, mockups, and listings.csv in `drops/dropN/`.
3. In that folder: `python3 printify_upload.py --dry-run`, then without `--dry-run`.
