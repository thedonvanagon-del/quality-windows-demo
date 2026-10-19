import unittest
from unittest import mock

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


class Calls(unittest.TestCase):
    def test_whoami_names_the_bot_and_chat_kind_only(self):
        replies = {
            "getMe": {"ok": True, "result": {"username": "buddha_picks_bot", "first_name": "Picks"}},
            "getChat": {"ok": True, "result": {"type": "private", "first_name": "Don", "username": "don"}},
        }
        with mock.patch.object(telegram, "post_json", side_effect=lambda url, payload: replies[url.rsplit("/", 1)[1]]):
            bot, where = telegram.whoami("TOKEN", "123")
        self.assertEqual((bot, where), ("@buddha_picks_bot", "a private chat"))
        self.assertNotIn("Don", where)

    def test_whoami_names_a_group(self):
        replies = {
            "getMe": {"ok": True, "result": {"username": "b"}},
            "getChat": {"ok": True, "result": {"type": "group", "title": "Saturday Picks"}},
        }
        with mock.patch.object(telegram, "post_json", side_effect=lambda url, payload: replies[url.rsplit("/", 1)[1]]):
            self.assertEqual(telegram.whoami("T", "-1")[1], "a group chat called 'Saturday Picks'")

    def test_send_raises_when_telegram_says_no(self):
        with mock.patch.object(telegram, "post_json", return_value={"ok": False, "description": "chat not found"}):
            with self.assertRaises(telegram.TelegramError):
                telegram.send("T", "1", "hi")

    def test_send_posts_to_send_message(self):
        with mock.patch.object(telegram, "post_json", return_value={"ok": True, "result": {}}) as post:
            telegram.send("T", "1", "hi")
        self.assertTrue(post.call_args[0][0].endswith("/botT/sendMessage"))
        self.assertEqual(post.call_args[0][1]["chat_id"], "1")


if __name__ == "__main__":
    unittest.main()
