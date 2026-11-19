"""The words around a mug: product description, blog post, pin."""


def description(words):
    return (f'"{words}" on an 11oz white ceramic mug. Wraparound print, '
            "so it reads the same in either hand. A Buddha Beans Coffee holiday original.")


def pin_text(words):
    title = f"{words} | Christmas coffee mug"
    body = (f'"{words}" — a coffee Christmas pun for the first cup of the morning. '
            "11oz ceramic mug from Buddha Beans Coffee. Pair it with our specialty roasts.")
    return title, body


def blog_text(words):
    return (f'New mug: "{words}". '
            "It's an 11oz white ceramic mug with the print wrapped all the way around. "
            "Good for the first cup of the morning and the last one by the tree.")
