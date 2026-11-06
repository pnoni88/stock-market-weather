// 내 컴퓨터에서 실시간 모드를 쓰기 위한 실행 서버 (npm start → http://127.0.0.1:3000)
//
// index.html 파일을 더블클릭해 열면(file://) 같은 출처의 api/market이 없어서, 페이지는
// 무료 공개 CORS 프록시에만 기대게 되고 그 프록시들이 막히면 시세를 전혀 받지 못한다.
// 이 서버는 index.html과 api/market을 같은 출처로 함께 제공한다. api/market은 Vercel에
// 배포되는 것과 똑같은 함수이므로, 네이버 조회는 이 컴퓨터에서 서버 대 서버로 이뤄진다(CORS 없음).
// 설치할 패키지는 없다 (Node 20 이상).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import market from "./api/market.js";

const INDEX_HTML = new URL("./index.html", import.meta.url);

async function handle(req, res) {
  const { pathname, search } = new URL(req.url, "http://localhost");

  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
    res.end("GET만 지원합니다");
    return;
  }

  if (pathname === "/api/market") {
    const r = await market.fetch(new Request("http://localhost" + pathname + search));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(await readFile(INDEX_HTML));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("없는 주소입니다");
}

export function createAppServer() {
  return createServer((req, res) => {
    handle(req, res).catch(e => {
      console.error("[시장 날씨] 요청 처리 실패:", e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("서버 오류");
    });
  });
}

// node server.js 로 직접 실행했을 때만 서버를 띄운다 (테스트에서 import할 때는 띄우지 않음)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 포트 지정: npm start -- 3001 (모든 OS) 또는 환경변수 PORT
  const port = Number(process.argv[2] || process.env.PORT) || 3000;
  const server = createAppServer();
  server.on("error", e => {
    console.error(e.code === "EADDRINUSE"
      ? `${port}번 포트를 이미 다른 프로그램이 쓰고 있어요. 다른 포트로 실행하세요: npm start -- ${port + 1}`
      : "서버를 시작하지 못했어요: " + e.message);
    process.exit(1);
  });
  // 127.0.0.1에만 열어 같은 네트워크의 다른 기기에서는 접속할 수 없게 한다
  server.listen(port, "127.0.0.1", () => {
    console.log(`📈 시장 날씨 실행 중 → 브라우저에서 http://127.0.0.1:${port} 을 여세요 (종료: Ctrl+C)`);
  });
}
