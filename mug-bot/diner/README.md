# Diner mug art

25 coffee Christmas pun designs in a 70s/80s diner style, drawn as SVG and
rendered with Chromium so the fonts come out exactly.

```
npm install                 # the retro fonts (SIL Open Font License)
python3 -c "import designs, json; [open(f'svg/{i:02d}.svg','w').write(s) for i,(_,_,s) in enumerate(designs.D,1)]; json.dump([{'n':i,'pun':p,'style':st} for i,(p,st,_) in enumerate(designs.D,1)], open('meta.json','w'))"
node render.js              # art/NN.png, 1200x1000, transparent
python3 sheet.py            # numbered preview sheets
python3 wrap.py 2 out.png   # print file for design #2: 2700x1120, logo by the handle
```

`kit.py` holds the drawing pieces (drop-shadow lettering, neon, marquee signs,
diner mugs and pots). `designs.py` holds the 25 designs. Run everything from
this folder, with `mkdir -p svg art` first.
