const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// SSE PROGRESS
// ==============================
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  global.sendProgress = (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  global.sendProgress({ progress: 0, message: "Ready..." });
});

// ==============================
// CRAWL QUIZLET
// ==============================
app.post("/crawl", async (req, res) => {
  const { url } = req.body;

  try {
    global.sendProgress({ progress: 10, message: "Launching browser..." });

    // Puppeteer launch trên Render
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: "/usr/bin/chromium-browser", // Chromium có sẵn trên Render
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    // Fake user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768 });

    global.sendProgress({ progress: 30, message: "Opening page..." });

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
    } catch (e) {
      console.log("[Retry] networkidle2 failed → domcontentloaded");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 0 });
    }

    await page.waitForSelector(".s16qqoff", { timeout: 20000 });
    global.sendProgress({ progress: 50, message: "Flashcards loaded" });
    console.log("===> Flashcards loaded!");

    // ==============================
    // AUTO CLICK “HIỂN THỊ THÊM”
    // ==============================
    try {
      global.sendProgress({
        progress: 55,
        message: "Đang mở rộng danh sách bằng nút hiển thị thêm...",
      });

      let clickCount = 0;

      while (true) {
        const clicked = await page.evaluate(() => {
          const buttons = [
            ...document.querySelectorAll("button.AssemblyButtonBaseV2--large"),
          ];
          const target = buttons.find((b) => {
            const t = b.innerText?.trim().toLowerCase();
            return (
              t === "see more" ||
              t.startsWith("see more") ||
              t.startsWith("hiển thị thêm") ||
              t.startsWith("xem thêm")
            );
          });
          if (!target) return false;
          target.click();
          return true;
        });

        if (!clicked) break;

        clickCount++;
        console.log(`👉 Click lần ${clickCount}`);
        global.sendProgress({
          progress: 60,
          message: `Click nút hiển thị thêm lần ${clickCount}`,
        });

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      console.log(`✅ Đã click tổng cộng ${clickCount} lần`);
      global.sendProgress({
        progress: 70,
        message: `Đã mở rộng toàn bộ (${clickCount} lần)`,
      });
    } catch (err) {
      console.log("⚠️ Lỗi khi auto click nút hiển thị thêm:", err);
    }

    // ==============================
    // CRAWL FLASHCARDS
    // ==============================
    const result = await page.evaluate(() => {
      return [...document.querySelectorAll(".s16qqoff")].map((card) => {
        const question =
          card.querySelector(".s1wsz68j.syulbge .TermText")?.innerText || "";
        const answer =
          card.querySelector(".s1wsz68j.l1rpwius .TermText")?.innerText || "";
        return { question, answer };
      });
    });

    global.sendProgress({ progress: 100, message: "Done!" });
    console.log("Sample:", result.slice(0, 5));

    await browser.close();
    res.json({ success: true, total: result.length, data: result });
  } catch (err) {
    console.error(err);
    global.sendProgress({ progress: -1, message: "Error!" });
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ==============================
// PORT DYNAMIC RENDER
// ==============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
