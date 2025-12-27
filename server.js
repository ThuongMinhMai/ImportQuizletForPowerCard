// const express = require("express");
// const cors = require("cors");
// const { chromium } = require("playwright"); // Playwright

// const app = express();
// app.use(cors());
// app.use(express.json());

// // ==============================
// // SSE PROGRESS
// // ==============================
// app.get("/progress", (req, res) => {
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   res.flushHeaders();

//   global.sendProgress = (msg) => {
//     res.write(`data: ${JSON.stringify(msg)}\n\n`);
//   };

//   global.sendProgress({ progress: 0, message: "Ready..." });
// });

// // ==============================
// // CRAWL QUIZLET
// // ==============================
// app.post("/crawl", async (req, res) => {
//   const { url } = req.body;

//   try {
//     global.sendProgress({ progress: 10, message: "Launching browser..." });

//     const browser = await chromium.launch({
//       headless: false, // set true nếu muốn chạy background
//       args: ["--disable-blink-features=AutomationControlled"],
//     });

//     const context = await browser.newContext({
//       viewport: { width: 1366, height: 768 },
//       userAgent:
//         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//     });

//     const page = await context.newPage();

//     global.sendProgress({ progress: 30, message: "Opening page..." });

//     try {
//       await page.goto(url, { waitUntil: "networkidle" });
//     } catch (e) {
//       console.log("[Retry] networkidle failed → domcontentloaded");
//       await page.goto(url, { waitUntil: "domcontentloaded" });
//     }

//     // ==============================
//     // AUTO CLICK “SEE MORE”
//     // ==============================
//     try {
//       global.sendProgress({
//         progress: 50,
//         message: "Đang mở rộng danh sách bằng nút hiển thị thêm...",
//       });

//       let clickCount = 0;

//       while (true) {
//         const button = await page.$(
//           "button:has-text('See More'), button:has-text('Hiển thị thêm'), button:has-text('Xem thêm')"
//         );
//         if (!button) break;

//         await button.click();
//         clickCount++;
//         console.log(`👉 Click lần ${clickCount}`);

//         global.sendProgress({
//           progress: 50 + clickCount,
//           message: `Click nút hiển thị thêm lần ${clickCount}`,
//         });

//         await page.waitForTimeout(1500); // chờ load thêm flashcards
//       }

//       console.log(`✅ Đã click tổng cộng ${clickCount} lần`);
//       global.sendProgress({
//         progress: 70,
//         message: `Đã mở rộng toàn bộ (${clickCount} lần)`,
//       });
//     } catch (err) {
//       console.log("⚠️ Lỗi khi auto click nút hiển thị thêm:", err);
//     }

//     // ==============================
//     // CRAWL FLASHCARDS
//     // ==============================
//     await page.waitForSelector(".s16qqoff", { timeout: 60000 });

//     const result = await page.evaluate(() => {
//       return [...document.querySelectorAll(".s16qqoff")].map((card) => {
//         const question =
//           card.querySelector(".s1wsz68j.syulbge .TermText")?.innerText || "";
//         const answer =
//           card.querySelector(".s1wsz68j.l1rpwius .TermText")?.innerText || "";
//         return { question, answer };
//       });
//     });

//     global.sendProgress({ progress: 100, message: "Done!" });
//     console.log("Sample:", result.slice(0, 5));

//     await browser.close();
//     res.json({ success: true, total: result.length, data: result });
//   } catch (err) {
//     console.error(err);
//     global.sendProgress({ progress: -1, message: "Error!" });
//     res.status(500).json({ success: false, error: err.toString() });
//   }
// });

// // ==============================
// // PORT
// // ==============================
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () =>
//   console.log(`Backend running on http://localhost:${PORT}`)
// );

const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// SSE PROGRESS (Gửi tiến trình về Frontend)
// ==============================
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  global.sendProgress = (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  global.sendProgress({ progress: 0, message: "Đang sẵn sàng..." });
});

// ==============================
// CRAWL LOGIC
// ==============================
app.post("/crawl", async (req, res) => {
  const { url } = req.body;
  if (!url)
    return res.status(400).json({ success: false, error: "URL không hợp lệ" });

  let browser;
  try {
    global.sendProgress({ progress: 5, message: "Khởi động trình duyệt..." });

    browser = await chromium.launch({
      headless: false, // Để false để bạn có thể quan sát và can thiệp nếu gặp Captcha
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    global.sendProgress({ progress: 15, message: "Đang tải trang Quizlet..." });

    // Truy cập trang với timeout dài hơn
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Cuộn trang để kích hoạt lazy loading
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(2000);

    // ==============================
    // XỬ LÝ NÚT "XEM THÊM"
    // ==============================
    global.sendProgress({
      progress: 30,
      message: "Đang kiểm tra danh sách dài...",
    });
    try {
      let clickCount = 0;
      while (clickCount < 30) {
        // Tìm nút dựa trên cấu trúc chung nhất
        const seeMoreBtn = page
          .locator(
            "button:has-text('See More'), button:has-text('Hiển thị thêm'), button:has-text('Xem thêm'), .SetPage-showMoreButton"
          )
          .first();

        if (await seeMoreBtn.isVisible()) {
          await seeMoreBtn.click();
          clickCount++;
          global.sendProgress({
            progress: 30 + clickCount * 2,
            message: `Đã mở rộng danh sách ${clickCount} lần...`,
          });
          await page.waitForTimeout(1500);
        } else {
          break;
        }
      }
    } catch (e) {
      console.log("Dừng click nút Xem thêm (không tìm thấy hoặc hết thẻ).");
    }

    // ==============================
    // TRÍCH XUẤT DỮ LIỆU CHÍNH XÁC
    // ==============================
    global.sendProgress({
      progress: 85,
      message: "Đang đọc dữ liệu câu hỏi...",
    });

    // Đợi ít nhất 1 thẻ hiển thị nội dung
    await page.waitForSelector(".TermText", { timeout: 15000 });

    const result = await page.evaluate(() => {
      // Sử dụng selector bọc ngoài mà bạn cung cấp
      const cards = document.querySelectorAll(".SetPageTermsList-term");
      const items = [];

      cards.forEach((card) => {
        // Tìm 2 phía của thẻ dựa trên data-testid
        const sides = card.querySelectorAll(
          '[data-testid="set-page-term-card-side"]'
        );

        if (sides.length >= 2) {
          // Lấy text và xử lý xuống dòng từ thẻ <br>
          const question = sides[0].innerText.trim();
          const answer = sides[1].innerText.trim();

          if (question || answer) {
            items.push({ question, answer });
          }
        } else {
          // Phương án dự phòng: Lấy 2 thẻ .TermText đầu tiên trong card
          const texts = card.querySelectorAll(".TermText");
          if (texts.length >= 2) {
            items.push({
              question: texts[0].innerText.trim(),
              answer: texts[1].innerText.trim(),
            });
          }
        }
      });
      return items;
    });

    global.sendProgress({
      progress: 100,
      message: `Thành công! Lấy được ${result.length} câu.`,
    });

    await browser.close();
    res.json({ success: true, total: result.length, data: result });
  } catch (err) {
    console.error("LỖI CRAWL:", err.message);
    if (browser) await browser.close();
    global.sendProgress({ progress: -1, message: "Lỗi: " + err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
