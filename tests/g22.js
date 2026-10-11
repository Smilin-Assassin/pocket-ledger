// g22 (v47): quicker receipt scans (no extra thinking, lightest model first, smaller photo), the thinking setting is dropped when a model refuses it, the chat button is the bubble with a sparkle. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } }
};
(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g22: faster scans and the chat button");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(800);
  check(await p.$eval("#chatFab", b => { const m = b.querySelector(".bot"); return !!m && !b.querySelector("img") && getComputedStyle(m).webkitMaskImage.includes("chat-bot.png") || getComputedStyle(m).maskImage.includes("chat-bot.png"); }), "chat button is the robot icon, no Google logo");
  check(!(await p.evaluate(() => [...document.querySelectorAll("img")].some(i => /gemini/i.test(i.src)))), "no Gemini image anywhere on the page");
  const r = await p.evaluate(async () => {
    localStorage.setItem("pl-gemini-key", "test-key-not-real");
    const calls = [], real = window.fetch;
    window.fetch = async (url, init) => {
      if (!/generativelanguage/.test(String(url))) return real(url, init);
      const body = JSON.parse(init.body), model = decodeURIComponent(String(url).split("/models/")[1].split(":")[0]);
      calls.push({ model, think: !!(body.generationConfig || {}).thinkingConfig });
      if (calls.length === 1 && window.__refuseThinking) return new Response(JSON.stringify({ error: { message: "Request contains an invalid argument." } }), { status: 400 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"ok\":1}" }] } }] }), { status: 200 });
    };
    const m = await import("./js/gemini.js?v=47");
    const a = await m.geminiJson("p", [], undefined, { fast: true });
    const first = calls.slice();
    calls.length = 0; window.__refuseThinking = true;
    await m.geminiJson("p", [], undefined, { fast: true });
    const second = calls.slice();
    const again = []; calls.length = 0; window.__refuseThinking = false;
    await m.geminiJson("p", [], undefined, { fast: true }); again.push(...calls);
    calls.length = 0; localStorage.removeItem("pl-nothink");
    await m.geminiJson("p", [], undefined);
    const plain = calls.slice();
    window.fetch = real; localStorage.removeItem("pl-gemini-key");
    return { a, first, second, plain, again };
  });
  check(r.a && r.a.ok === 1, "a fast request still returns its answer", r.a);
  check(r.first.length === 1 && /lite/.test(r.first[0].model) && r.first[0].think, "a receipt scan starts with the lightest model and no extra thinking", r.first);
  check(r.second.length === 2 && r.second[0].model === r.second[1].model && r.second[0].think && !r.second[1].think, "if a model refuses the thinking setting, the same model is asked again without it", r.second);
  check(r.again.length === 1 && !r.again[0].think, "and it doesn't send the thinking setting again after that", r.again);
  check(r.plain.length === 1 && !/lite/.test(r.plain[0].model) && !r.plain[0].think, "other requests are unchanged", r.plain);
  const big = await p.evaluate(async () => { const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; c.getContext("2d").fillRect(0, 0, 3000, 2000); const b = await new Promise(res => c.toBlob(res, "image/jpeg")); const f = new File([b], "r.jpg", { type: "image/jpeg" }); let sent = null; const real = window.fetch; localStorage.setItem("pl-gemini-key", "test-key-not-real"); window.fetch = async (u, i) => { if (/generativelanguage/.test(String(u))) { sent = JSON.parse(i.body); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })); } return real(u, i); }; const m = await import("./js/gemini.js?v=47"); await m.geminiJson("p", [f], undefined, { fast: true }); window.fetch = real; localStorage.removeItem("pl-gemini-key"); const img = new Image(); img.src = "data:image/jpeg;base64," + sent.contents[0].parts.find(x => x.inline_data).inline_data.data; await img.decode(); return [img.width, img.height]; });
  check(Math.max(...big) === 1280, "photos are sent at 1280 pixels on the long side", big);
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
