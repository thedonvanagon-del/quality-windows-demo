import unittest

from cfbbot import telegram


class Split(unittest.TestCase):
    def test_short_message_is_one_chunk(self):
        self.assertEqual(telegram.split("a\n\nb"), ["a\n\nb"])

    def test_breaks_on_blank_lines(self):
        blocks = ["x" * 30, "y" * 30, "z" * 30]
        self.assertEqual(telegram.split("\n\n".join(blocks), limit=70), ["x" * 30 + "\n\n" + "y" * 30, "z" * 30])

    def test_oversized_block_is_cut(self):
        chunks = telegram.split("w" * 25, limit=10)
        self.assertEqual(chunks, ["w" * 10, "w" * 10, "w" * 5])


if __name__ == "__main__":
    unittest.main()
