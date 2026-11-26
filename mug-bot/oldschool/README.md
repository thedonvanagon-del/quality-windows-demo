# 1930s cartoon mug art

25 coffee Christmas pun designs drawn like an old black-and-white cartoon:
pie-cut eyes, open grins, puffy four-finger gloves, big round shoes, bouncy
poses with motion lines. Framed as film title cards, iris-out circles, film
strips, one-color stamps and EST. 2018 badges. Original characters.

`oldschool.py` holds the 1930s pieces and borrows shared helpers from
`toon.py` (a copy of `../toon/toon.py`). Build the same way as `../toon`:

```
npm install
mkdir -p svg art
python3 -c "import designs, json; [open(f'svg/{i:02d}.svg','w').write(s) for i,(_,_,s) in enumerate(designs.D,1)]; json.dump([{'n':i,'pun':p,'style':st} for i,(p,st,_) in enumerate(designs.D,1)], open('meta.json','w'))"
node render.js
python3 sheet.py
python3 wrap.py 5 out.png
```
