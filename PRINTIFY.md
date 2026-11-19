# Pushing products to Printify

Everything goes to the **marcduck11@gmail.com** Printify account. The uploaders use whichever
account the environment's `api.printify.com` token belongs to, so that token must come from
marcduck11 (Printify > My account > Connections > API tokens, full access).

Each uploader records what it made in `progress-<shop id>.json` next to `listings.csv`, so a
re-run skips products already in *that* shop and never skips ones made in a different shop.
`mugs/drop7/progress-29217342.json` is the record of drafts made in the wrong account.

## Shirts (220)
drop3 and drop6 ship their print files. drop4 and drop5 rebuild from the kit (about 3 minutes):

    cd shirts/studio && python3 drop4.py && python3 drop5.py && cd ..
    for d in drop4 drop5; do cp studio/printify_upload.py drops/$d/; done
    for d in drop3 drop4 drop5 drop6; do (cd drops/$d && python3 printify_upload.py --dry-run); done
    for d in drop3 drop4 drop5 drop6; do (cd drops/$d && python3 printify_upload.py); done

## Mugs (20)

    cd mugs/drop7 && python3 printify_mugs.py --dry-run && python3 printify_mugs.py

Add `--publish` only once a sales channel (Etsy, Shopify) is connected to the shop.
