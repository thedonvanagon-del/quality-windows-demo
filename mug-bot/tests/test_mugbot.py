import io
import unittest

from PIL import Image

from mugbot import art, concepts, config, printify


def png(width, height, color="green"):
    out = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(out, "PNG")
    return out.getvalue()


class FitToMug(unittest.TestCase):
    def test_lands_on_the_print_area_size(self):
        for size in [(1024, 559), (1536, 1024), (500, 2000)]:
            out = Image.open(io.BytesIO(art.fit_to_mug(png(*size))))
            self.assertEqual(out.size, (config.PRINT_WIDTH, config.PRINT_HEIGHT))

    def test_art_is_centered_with_white_around_it(self):
        out = Image.open(io.BytesIO(art.fit_to_mug(png(1000, 500)))).convert("RGB")
        self.assertEqual(out.getpixel((0, 0)), (255, 255, 255))
        self.assertNotEqual(out.getpixel((config.PRINT_WIDTH // 2, config.PRINT_HEIGHT // 2)), (255, 255, 255))


class Concepts(unittest.TestCase):
    def test_skips_puns_that_already_have_a_mug(self):
        first = concepts.PUNS[0][0]
        self.assertEqual(concepts.pick([first.upper()])[0], concepts.PUNS[1][0])

    def test_runs_out(self):
        self.assertIsNone(concepts.pick(w for w, _ in concepts.PUNS))

    def test_every_pun_is_unique(self):
        words = [w.lower() for w, _ in concepts.PUNS]
        self.assertEqual(len(words), len(set(words)))

    def test_prompt_carries_the_exact_words(self):
        self.assertIn('"Joy to the Brew"', concepts.prompt_for("Joy to the Brew", "a cup"))


class Payload(unittest.TestCase):
    def test_unpublished_mug_on_the_right_blueprint(self):
        body = printify.product_payload(config.Config(price_cents=2000), "Joy to the Brew", "d", "img1")
        self.assertEqual((body["blueprint_id"], body["print_provider_id"]), (68, 1))
        self.assertEqual(body["variants"][0]["price"], 2000)
        self.assertIn(config.DRAFT_TAG, body["tags"])
        self.assertEqual(body["print_areas"][0]["placeholders"][0]["images"][0]["id"], "img1")

    def test_mockups_default_first(self):
        shots = printify.mockups({"images": [{"src": "b"}, {"src": "a", "is_default": True}]})
        self.assertEqual(shots, ["a", "b"])


if __name__ == "__main__":
    unittest.main()
