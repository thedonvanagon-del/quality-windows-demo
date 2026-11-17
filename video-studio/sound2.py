"""Sound design v2: real-object sounds and a plucked chord loop, tuned for phone speakers.

v1 was 92% sub-200 Hz energy (kicks, bass, rumble) with noise-burst effects on top; on a phone that
is boom you cannot hear plus clicks and hiss. v2 changes the balance and the character:

  - Impacts are modal: a few exponentially decaying sine partials, the way knocked wood, a card
    on a table or a stamp actually ring, with a very short filtered click for the transient.
  - Music is a four-chord pluck loop (Am7, Fmaj7, Cmaj7, G6) with a soft bass and brushed drums,
    all in the range phones can play. Chords are the point, drums only keep time.
  - The music ducks under each hit so the hit is clear without being loud.
  - A little shared reverb glues it. Far fewer hits than v1: only the ones that matter.

Modes: "full" is music plus soft hits, "music" is music only.
"""
import numpy as np

from sound import SR, _fft_band, _place, _t

RNG = np.random.default_rng(11)


def _edge(x, a=.002, r=.01):
    n = len(x)
    ia, ir = max(int(a * SR), 1), max(int(r * SR), 1)
    x = x.copy()
    x[:ia] *= np.linspace(0, 1, ia)
    x[-ir:] *= np.linspace(1, 0, ir)
    return x


def modal(freqs, decays, amps, d):
    t = _t(d)
    return sum(a * np.sin(2 * np.pi * f * t + RNG.uniform(0, 6.28)) * np.exp(-t / dc)
               for f, dc, a in zip(freqs, decays, amps))


def band_click(d, lo, hi, tau):
    t = _t(d)
    n = _fft_band(RNG.standard_normal(len(t)), lo, hi)
    return n / max(np.abs(n).max(), 1e-6) * np.exp(-t / tau)


# ---------------------------------------------------------------- hits
def thud():
    """Stamp on a wooden bench: low body, mid knock, a touch of click."""
    d = .5
    return _edge(modal((78, 131, 262, 410), (.13, .08, .045, .03), (1, .6, .4, .22), d)
                 + band_click(d, 600, 2600, .006) * .3)


def tok():
    """Card or block set down on a table."""
    d = .28
    return _edge(modal((520, 1130, 1790, 2650), (.05, .03, .02, .014), (1, .6, .35, .18), d)
                 + band_click(d, 900, 5200, .004) * .35)


def paper():
    d = .2
    return _edge(band_click(d, 700, 3200, .028) * .7 + modal((140,), (.04,), (.45,), d))


def swish(d=.45):
    t = _t(d)
    n = _fft_band(RNG.standard_normal(len(t)), 800, 2800)
    return _edge(n / max(np.abs(n).max(), 1e-6) * np.sin(np.pi * t / d) ** 2 * .6, .03, .08)


def bell(root=660, d=1.6):
    return _edge(modal((root, root * 2.76, root * 5.4), (.9, .45, .2), (1, .35, .12), d), .004, .1)


# ---------------------------------------------------------------- music
def pluck(f, d=.9, vel=.5):
    t = _t(d)
    y = np.zeros(len(t))
    for k in range(1, 15):
        y += (1 / k ** .85) * np.sin(2 * np.pi * k * f * (1 + RNG.uniform(-.0005, .0005)) * t + RNG.uniform(0, 6.28)) \
            * np.exp(-t * (1.7 + .5 * k))
    return _edge(y * (1 - np.exp(-t / .003)) * vel, .001, .05)


def bass_note(f, d=.8, vel=.5):
    t = _t(d)
    y = (np.sin(2 * np.pi * f * t) + .45 * np.sin(4 * np.pi * f * t) + .2 * np.sin(6 * np.pi * f * t)) * np.exp(-t * 3.0)
    return _edge(y * (1 - np.exp(-t / .004)) * vel, .001, .06)


def soft_kick(d=.28):
    t = _t(d)
    f = 48 + 90 * np.exp(-t * 38)
    return _edge(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) * .8 + band_click(d, 400, 2000, .004) * .15)


def brush(d=.2):
    return _edge(band_click(d, 1200, 5200, .05) * .5, .004, .05)


CHORDS = [  # bass, then the four arpeggio notes (Hz)
    (110.00, (220.00, 261.63, 329.63, 392.00)),      # Am7
    (87.31, (174.61, 220.00, 261.63, 329.63)),       # Fmaj7
    (130.81, (261.63, 329.63, 392.00, 493.88)),      # Cmaj7
    (98.00, (196.00, 246.94, 293.66, 329.63)),       # G6
]
ARP = (0, 1, 2, 3, 2, 1, 2, 3)


def reverb(x, secs, wet):
    """x: (2, n). Decaying stereo noise impulse response, low-passed, mixed at `wet`."""
    n_ir = int(secs * SR)
    t = np.arange(n_ir) / SR
    out = np.zeros_like(x)
    nfft = 1 << int(np.ceil(np.log2(x.shape[1] + n_ir)))
    for ch in range(2):
        ir = _fft_band(RNG.standard_normal(n_ir), 150, 8000) * np.exp(-t / (secs / 4.5))
        ir /= np.sqrt(np.sum(ir ** 2))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: x.shape[1]]
    return x * (1 - wet) + out * wet


def score_v2(bpm, events, total, groove_from=4, mode="full"):
    beat = 60.0 / bpm
    n = int((total + 1.5) * SR)
    music = np.zeros((2, n))
    hits = np.zeros((2, n))

    # ---- music: one chord per bar from the first beat (groove_from is ignored: no silent intro)
    nbeats = int(total / beat)
    for bar, b0 in enumerate(range(0, nbeats, 4)):
        bass, notes = CHORDS[bar % 4]
        t0 = b0 * beat
        _place(music, bass_note(bass), t0, .55)
        _place(music, bass_note(bass, .5), t0 + 2.5 * beat, .4)
        for step in range(8):
            if b0 + step / 2 >= nbeats:
                break
            at = t0 + step * beat / 2 + (beat * .07 if step % 2 else 0)
            vel = .62 if step == 0 else (.42 if step % 2 == 0 else .33)
            _place(music, pluck(notes[ARP[step]] * 2, vel=vel), at, 1.0, pan=(-.25, .0, .25, .0)[step % 4])
        _place(music, soft_kick(), t0, .32)
        _place(music, soft_kick(), t0 + 2 * beat, .26)
        _place(music, brush(), t0 + beat, .14)
        _place(music, brush(), t0 + 3 * beat, .17)

    # ---- hits (full mode only): few and soft
    if mode == "full":
        quiet = {"thunk": (thud, .85), "slap": (tok, .5), "band": (paper, .4), "scribble": (swish, .16)}
        seen = []
        for at, kind in sorted(events):
            if kind not in quiet:
                continue
            if any(abs(at - s) < .09 for s in seen):  # one hit per beat position, not a pile-up
                continue
            seen.append(at)
            fn, g = quiet[kind]
            _place(hits, fn(), at, g, pan=RNG.uniform(-.12, .12))
        for at, kind in events:
            if kind == "thunk" and at > total - 4:    # closing stamp gets a bell
                _place(hits, bell(), at + .12, .35)
        # music ducks a little under each hit so the hit is heard without being loud
        t = np.arange(n) / SR
        duck = np.ones(n)
        for at in seen:
            m = t >= at
            duck[m] = np.minimum(duck[m], 1 - .45 * np.exp(-(t[m] - at) / .16))
        music *= duck

    music = reverb(music, 1.1, .24)
    hits = reverb(hits, .5, .12)
    mix = music * .9 + hits
    peak = np.abs(mix).max()
    mix = np.tanh(mix / max(peak, 1e-6) * 1.25) / np.tanh(1.25)
    return mix[:, : int(total * SR)]
