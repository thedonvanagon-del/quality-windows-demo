# Retro cartoon mug art

25 coffee Christmas pun designs in a 1930s rubber-hose cartoon style: cup,
mug, bean and coffee-pot mascots with pie-cut eyes, white gloves and big
shoes, set in arched badges, checkerboard cards, one-color stamps and
sunburst discs. Every design is original artwork.

Build the same way as `../diner`:

```
npm install
mkdir -p svg art
python3 -c "import designs, json; [open(f'svg/{i:02d}.svg','w').write(s) for i,(_,_,s) in enumerate(designs.D,1)]; json.dump([{'n':i,'pun':p,'style':st} for i,(p,st,_) in enumerate(designs.D,1)], open('meta.json','w'))"
node render.js              # art/NN.png
python3 sheet.py            # numbered preview sheets
python3 wrap.py 1 out.png   # print file for design #1, logo by the handle
```

`toon.py` is the character kit (bodies, faces, gloves, shoes, poses, props).
`designs.py` lays out the 25 designs.
