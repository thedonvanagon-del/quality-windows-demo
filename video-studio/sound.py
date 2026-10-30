"""Synthesised sound design for a storyboard. No samples, no downloads.

Every sound is timed off the same numbers the visuals use (scene starts,
transition length, the animation delays in scenes.py), so a pop lands when the
starburst lands. Returns a stereo 16-bit WAV.

    whoosh   on every cut
    pop      starburst slams in
    crack    roll of bean cracks under the POP / CRACK scenes
    tick     each bullet sliding in
    plop     each bean landing (pitch climbs along the roast line)
    chime    logo and outro
    bed      low roaster-drum rumble and a soft pad under everything
"""
import wave

import numpy as np

SR = 44100
RNG = np.random.default_rng(7)  # same sounds every render


def _t(d):
    return np.arange(int(d * SR)) / SR


def _fft_band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def whoosh(d=0.7):
    t = _t(d)
    n = _fft_band(RNG.standard_normal(len(t)), 500, 5000)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(300 + 1500 * (t / d) ** 2) / SR) * 0.12
    return (n / np.abs(n).max() * 0.8 + sweep) * env


def pop(d=0.4):
    t = _t(d)
    f = 70 + 330 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    click = _fft_band(RNG.standard_normal(len(t)), 1500, 7000) * np.exp(-t * 120) * 0.5
    return body + click


def click(d=0.05, bright=1.0):
    t = _t(d)
    n = _fft_band(RNG.standard_normal(len(t)), 1800, 8500)
    return n / np.abs(n).max() * np.exp(-t * 90 / bright)


def tick(d=0.09, freq=1500):
    t = _t(d)
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 55) * 0.5 + click(d, .6)[:len(t)] * 0.2


def plop(d=0.3, pitch=1.0):
    t = _t(d)
    f = (130 + 280 * np.exp(-t * 18)) * pitch
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 20)


def chime(d=1.6, root=880):
    t = _t(d)
    out = np.zeros(len(t))
    for k, a in ((1, 1), (2.01, .5), (2.99, .3), (4.2, .15)):
        out += np.sin(2 * np.pi * root * k * t) * a * np.exp(-t * (2.2 + k))
    return out * 0.45


def crack_roll(d, density):
    """Randomly timed bean cracks; density = clicks per second."""
    out = np.zeros(int(d * SR))
    for _ in range(int(d * density)):
        at = int(RNG.uniform(0, d - .06) * SR)
        c = click(.06, RNG.uniform(.6, 1.6)) * RNG.uniform(.25, 1)
        out[at:at + len(c)] += c[:len(out) - at]
    return out


def bed(total):
    t = _t(total)
    rumble = _fft_band(RNG.standard_normal(len(t)), 25, 140) * (0.65 + 0.35 * np.sin(2 * np.pi * 0.85 * t))
    rumble = rumble / np.abs(rumble).max() * 0.09
    pad = np.zeros(len(t))
    for hz in (110.0, 164.81, 196.0, 246.94, 329.63):  # Am7 spread, warm and open
        for detune in (-.4, .4):
            pad += np.sin(2 * np.pi * (hz + detune) * t + RNG.uniform(0, 6.28))
    pad *= (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t)) * 0.0045
    fade = np.minimum(1, np.minimum(t / 1.5, (total - t) / 2.0))
    return (rumble + pad) * fade


def _place(buf, snd, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i < 0 or i >= buf.shape[1]:
        return
    s = snd[: buf.shape[1] - i] * gain
    buf[0, i:i + len(s)] += s * (1 - max(pan, 0))
    buf[1, i:i + len(s)] += s * (1 + min(pan, 0))


def score(sb, fmt_total=None):
    """Build the stereo sound track for a storyboard (list of scenes + transition)."""
    sc_list, tr = sb["scenes"], sb.get("transition", 0.5)
    starts, acc = [], 0.0
    for sc in sc_list:
        starts.append(acc)
        acc += sc["duration"] - tr
    total = fmt_total or (acc + tr)
    buf = np.zeros((2, int((total + 1) * SR)))
    buf[0] += bed(total + 1)[: buf.shape[1]]
    buf[1] += bed(total + 1)[: buf.shape[1]] * 0.97

    for i, (sc, st) in enumerate(zip(sc_list, starts)):
        ty = sc.get("type", "title")
        if i + 1 < len(starts):  # cut into the next scene
            _place(buf, whoosh(), starts[i + 1] - .1, .55, pan=(-.5 if i % 2 else .5))
        if ty == "logo":
            _place(buf, chime(), st + .45, .7)
            _place(buf, pop(), st + .4, .5)
        elif ty in ("beans", "bullets"):
            n = 5 if ty == "beans" else 3
            for k in range(n):
                _place(buf, plop(pitch=.9 + .08 * (k % 3)), st + .2 + k * (.15 if ty == "beans" else .18) + .35,
                       .5, pan=(k - n / 2) * .2)
            for k, _ in enumerate(sc.get("bullets", [])):
                _place(buf, tick(), st + .5 + .5 * k + .15, .55)
        elif ty in ("pop", "stat"):
            big = "CRACK" in sc.get("burst", "POP").upper()
            _place(buf, pop(), st + .5, 1.0)
            for k in range(3):
                _place(buf, plop(pitch=.8), st + .5 + k * .12 + .4, .45, pan=(k - 1) * .4)
            roll_d = sc["duration"] - 1.2
            roll = crack_roll(roll_d, 9 if big else 3.5)
            _place(buf, roll, st + .9, .8 if big else .6)
        elif ty in ("roastline", "roastbar"):
            for k in range(5):
                _place(buf, plop(pitch=.75 + .1 * k), st + .5 + k * .35 + .4, .55, pan=(k - 2) * .35)
        elif ty == "photo":
            _place(buf, whoosh(.5), st + .05, .35)
            for k, _ in enumerate(sc.get("bullets", [])):
                _place(buf, tick(), st + .5 + .5 * k + .15, .55)
        elif ty == "outro":
            _place(buf, chime(2.2), st + .55, .8)
            _place(buf, pop(), st + .9, .6)

    peak = np.abs(buf).max()
    buf = np.tanh(buf / max(peak, 1e-6) * 1.4) / np.tanh(1.4)  # soft limit, keeps peaks tidy
    return buf[:, : int(total * SR)]


def write_wav(buf, path):
    pcm = (np.clip(buf, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.T.copy().tobytes())
