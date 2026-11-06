// server.js(로컬 실행 서버) 동작 확인 — 네이버 요청만 가짜 fetch로 대체하고, 서버 자체는 실제로 띄운다
// 실행: npm test
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../server.js";

const realFetch = globalThis.fetch;
let server, base;

before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(() => { globalThis.fetch = realFetch; });

// 네이버로 가는 요청만 handler가 답하고, 테스트가 로컬 서버로 보내는 요청은 진짜 fetch로 보낸다
function mockNaver(handler) {
  globalThis.fetch = (url, opts) => String(url).startsWith("https://m.stock.naver.com/")
    ? Promise.resolve(handler(String(url)))
    : realFetch(url, opts);
}

test("루트 주소에서 index.html을 준다", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.match(await res.text(), /<title>시장 날씨/);
});

test("같은 출처의 /api/market이 api/market.js 함수 결과를 그대로 전달한다", async () => {
  const INDEX = { stockName: "코스피", closePrice: "2,512.34" };
  const STOCKS = { stocks: [{ stockName: "삼성전자" }] };
  mockNaver(url => Response.json(url.includes("/index/") ? INDEX : STOCKS));

  const res = await fetch(base + "/api/market");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /application\/json/);
  assert.match(res.headers.get("Cache-Control"), /s-maxage=20/);
  assert.deepEqual(await res.json(), { index: INDEX, marketValue: STOCKS });
});

test("네이버가 실패하면 502와 원인이 페이지까지 전달된다", async () => {
  mockNaver(() => new Response("Forbidden", { status: 403 }));
  const res = await fetch(base + "/api/market");
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /HTTP 403/);
});

test("없는 주소는 404, GET이 아닌 요청은 405", async () => {
  assert.equal((await fetch(base + "/server.js")).status, 404);
  assert.equal((await fetch(base + "/api/market", { method: "POST" })).status, 405);
});
