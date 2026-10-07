import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setup, fakeClient, msg, text, toolUse, finished } from "./helpers.js";

test("a simple job finishes, is billed, and asks for the safe defaults", async () => {
  const client = fakeClient([msg([text("All done.")])]);
  const { runtime, agent, budget } = setup({ client });
  const task = runtime.startTask(agent("Sage").id, "Say hi");
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "done");
  assert.equal(done.result, "All done.");
  assert.ok(done.cost > 0);
  assert.ok(budget.spentToday() > 0);
  const params = client.calls[0];
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.fallbacks, "default");
  assert.ok(params.betas.includes("server-side-fallback-2026-07-01"));
  assert.deepEqual(params.output_config, { effort: "medium" });
  // Sage's room has no Signal Dish or Workbench, so no web or code tools.
  const names = params.tools.map((t) => t.name);
  assert.ok(names.includes("write_file"));
  assert.ok(!names.includes("web_search"));
  assert.ok(!names.includes("code_execution"));
  assert.ok(!names.some((n) => /bash|shell|terminal/.test(n)));
});

test("write_file lands in the crew member's own workspace", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "write_file", { path: "drafts/hello.md", content: "# Hello" })], "tool_use"),
    msg([text("Wrote it.")]),
  ]);
  const { runtime, agent, store } = setup({ client });
  const sage = agent("Sage");
  const task = runtime.startTask(sage.id, "Write a file");
  await finished(runtime, task.id);
  const file = path.join(store.agentDir(sage.id, "workspace"), "drafts", "hello.md");
  assert.equal(fs.readFileSync(file, "utf8"), "# Hello");
  const results = client.calls[1].messages.at(-1).content;
  assert.equal(results[0].tool_use_id, "t1");
  assert.ok(!results[0].is_error);
});

test("paths that try to leave the workspace are refused", async () => {
  const attempts = ["../../config.json", "/etc/passwd", "~/x.md", ".ssh/key.md", "a/../../b.md", "run.command", "C:\\x.md"];
  const responses = attempts.map((p, i) => msg([toolUse(`t${i}`, "write_file", { path: p, content: "x" })], "tool_use"));
  responses.push(msg([text("ok")]));
  const client = fakeClient(responses);
  const { runtime, agent, store, home } = setup({ client });
  const before = fs.readFileSync(path.join(home, "config.json"), "utf8");
  const task = runtime.startTask(agent("Sage").id, "Try to escape");
  await finished(runtime, task.id);
  for (let i = 1; i <= attempts.length; i++) {
    const result = client.calls[i].messages.at(-1).content[0];
    assert.equal(result.is_error, true, `expected ${attempts[i - 1]} to be refused`);
  }
  assert.equal(fs.readFileSync(path.join(home, "config.json"), "utf8"), before);
  assert.deepEqual(fs.readdirSync(store.agentDir(agent("Sage").id, "workspace")), []);
});

test("symlinks out of the workspace are refused for reads", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "read_file", { folder: "workspace", path: "sneaky.md" })], "tool_use"),
    msg([text("ok")]),
  ]);
  const { runtime, agent, store, home } = setup({ client });
  const sage = agent("Sage");
  fs.symlinkSync(path.join(home, "config.json"), path.join(store.agentDir(sage.id, "workspace"), "sneaky.md"));
  const task = runtime.startTask(sage.id, "Read it");
  await finished(runtime, task.id);
  const result = client.calls[1].messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /Links aren't allowed/);
});

test("the per-job cap stops a job before the next step", async () => {
  const big = { input_tokens: 200_000, output_tokens: 20_000 };
  const client = fakeClient([
    msg([toolUse("t1", "save_memory", { note: "x" })], "tool_use", big),
    msg([text("never reached")]),
  ]);
  const { runtime, agent } = setup({ client, config: { taskCapUsd: 0.5 } });
  const task = runtime.startTask(agent("Sage").id, "Expensive");
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "stopped");
  assert.match(done.result, /cap/);
  assert.equal(client.calls.length, 1);
});

test("the daily cap stops work before anything is spent", async () => {
  const client = fakeClient([msg([text("never")])]);
  const { runtime, agent, budget } = setup({ client, config: { dailyCapUsd: 1 } });
  budget.record(1);
  const task = runtime.startTask(agent("Sage").id, "Anything");
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "stopped");
  assert.equal(client.calls.length, 0);
});

test("the step limit ends a job that keeps going", async () => {
  const loop = Array.from({ length: 10 }, (_, i) => msg([toolUse(`t${i}`, "list_files", { folder: "workspace" })], "tool_use", { input_tokens: 10, output_tokens: 10 }));
  const client = fakeClient(loop);
  const { runtime, agent } = setup({ client, config: { maxSteps: 3 } });
  const task = runtime.startTask(agent("Sage").id, "Loop");
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "stopped");
  assert.equal(client.calls.length, 3);
});

test("the stop button interrupts a running job", async () => {
  const client = fakeClient([
    (opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted")))),
  ]);
  const { runtime, agent } = setup({ client });
  const task = runtime.startTask(agent("Sage").id, "Slow");
  await new Promise((r) => setTimeout(r, 20));
  runtime.stopAll();
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "stopped");
});

test("a refusal ends the job without running its tools", async () => {
  const client = fakeClient([msg([toolUse("t1", "write_file", { path: "x.md", content: "x" })], "refusal")]);
  const { runtime, agent, store } = setup({ client });
  const task = runtime.startTask(agent("Sage").id, "Bad");
  const done = await finished(runtime, task.id);
  assert.equal(done.status, "stopped");
  assert.deepEqual(fs.readdirSync(store.agentDir(agent("Sage").id, "workspace")), []);
});

test("hand-offs only reach crew joined by a hallway", async () => {
  // Scout is on the Comms Deck, joined only to the Bridge (Sage). Tally is in the Lab.
  const client = fakeClient([
    msg([toolUse("t1", "hand_off", { crew_member: "Tally", task: "crunch numbers" })], "tool_use"),
    msg([toolUse("t2", "hand_off", { crew_member: "Sage", task: "write it up" })], "tool_use"),
    msg([text("handed off")]),
    msg([text("Sage wrote it")]),
  ]);
  const { runtime, agent } = setup({ client });
  const scoutTask = runtime.startTask(agent("Scout").id, "Research and hand off");
  const sageTask = new Promise((resolve) => runtime.on("task", (t) => t.agentName === "Sage" && t.status === "done" && resolve(t)));
  await finished(runtime, scoutTask.id);
  await sageTask;
  // Scout and Sage run at the same time, so find each result by its id.
  const resultFor = (id) => client.calls
    .map((c) => c.messages.at(-1).content)
    .filter(Array.isArray)
    .flat()
    .find((b) => b.tool_use_id === id);
  const tools = client.calls[0].tools.find((t) => t.name === "hand_off");
  assert.deepEqual(tools.input_schema.properties.crew_member.enum, ["Sage"]);
  assert.equal(resultFor("t1").is_error, true);
  assert.match(resultFor("t2").content, /Handed to Sage/);
});

test("gear decides tools: Signal Dish gives web, Workbench gives cloud code", async () => {
  const client = fakeClient([msg([text("a")]), msg([text("b")])]);
  const { runtime, agent } = setup({ client });
  const t1 = runtime.startTask(agent("Scout").id, "web");
  await finished(runtime, t1.id);
  const t2 = runtime.startTask(agent("Tally").id, "code");
  await finished(runtime, t2.id);
  const scoutTools = client.calls[0].tools.map((t) => t.type ?? t.name);
  const tallyTools = client.calls[1].tools.map((t) => t.type ?? t.name);
  assert.ok(scoutTools.includes("web_search_20260209"));
  assert.ok(!scoutTools.includes("code_execution_20260521"));
  assert.ok(tallyTools.includes("code_execution_20260521"));
  assert.ok(!tallyTools.includes("web_search_20260209"));
});

test("allowed websites are passed to the web tools", async () => {
  const client = fakeClient([msg([text("a")])]);
  const { runtime, agent } = setup({ client, config: { allowedDomains: ["etsy.com"] } });
  const t = runtime.startTask(agent("Scout").id, "web");
  await finished(runtime, t.id);
  const search = client.calls[0].tools.find((x) => x.name === "web_search");
  assert.deepEqual(search.allowed_domains, ["etsy.com"]);
});

test("deliver_to_outbox never overwrites an earlier delivery", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "deliver_to_outbox", { filename: "report.md", content: "one" })], "tool_use"),
    msg([toolUse("t2", "deliver_to_outbox", { filename: "../report.md", content: "two" })], "tool_use"),
    msg([text("done")]),
  ]);
  const { runtime, agent, store } = setup({ client });
  const t = runtime.startTask(agent("Sage").id, "deliver");
  await finished(runtime, t.id);
  const files = fs.readdirSync(store.dir("outbox")).sort();
  assert.deepEqual(files, ["report-2.md", "report.md"]);
  assert.equal(fs.readFileSync(path.join(store.dir("outbox"), "report.md"), "utf8"), "one");
});

test("an executable file type can't be delivered", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "deliver_to_outbox", { filename: "setup.command", content: "rm -rf ~" })], "tool_use"),
    msg([text("done")]),
  ]);
  const { runtime, agent, store } = setup({ client });
  const t = runtime.startTask(agent("Sage").id, "deliver");
  await finished(runtime, t.id);
  assert.deepEqual(fs.readdirSync(store.dir("outbox")), []);
  assert.equal(client.calls[1].messages.at(-1).content[0].is_error, true);
});

test("memory carries into the next job", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "save_memory", { note: "Captain likes short emails" })], "tool_use"),
    msg([text("noted")]),
    msg([text("next job")]),
  ]);
  const { runtime, agent } = setup({ client });
  const t1 = runtime.startTask(agent("Sage").id, "remember");
  await finished(runtime, t1.id);
  const t2 = runtime.startTask(agent("Sage").id, "again");
  await finished(runtime, t2.id);
  assert.match(client.calls[2].messages[0].content, /Captain likes short emails/);
});

test("bad tool input is bounced back, not run", async () => {
  const client = fakeClient([
    msg([toolUse("t1", "write_file", { path: "a.md", content: 42, extra: true })], "tool_use"),
    msg([text("ok")]),
  ]);
  const { runtime, agent } = setup({ client });
  const t = runtime.startTask(agent("Sage").id, "x");
  await finished(runtime, t.id);
  const result = client.calls[1].messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /INVALID_JSON/);
});

test("transcripts are saved, and the summary sent to the page leaves them out", async () => {
  const client = fakeClient([msg([text("done")])]);
  const { runtime, agent, store } = setup({ client });
  const t = runtime.startTask(agent("Sage").id, "x");
  const done = await finished(runtime, t.id);
  assert.equal(done.messages, undefined);
  assert.ok(store.loadTask(t.id).messages.length >= 2);
});
