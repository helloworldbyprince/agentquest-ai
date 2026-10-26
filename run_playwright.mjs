import { chromium } from 'playwright';

async function runBrowserAgentTest() {
  console.log('🚀 Launching Chromium for AgentQuest Browser Test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(`[Console ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLogs.push(`[PageError] ${err.message}`));

  try {
    console.log('🌐 Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Wait for "AI Connected"
    await page.waitForSelector('text=AI Connected', { timeout: 10000 });
    console.log('✅ AI Connected status verified.');

    // Select "Instant" playback delay if available
    const instantBtn = page.getByRole('button', { name: 'Instant' });
    if (await instantBtn.isVisible()) {
      await instantBtn.click();
      console.log('⚡ Switched Playback Delay to "Instant".');
    }

    // Select Explorer Preset
    const selectEl = page.locator('select').first();
    await selectEl.selectOption('explorer');
    console.log('🗺️ Selected Explorer Maze.');

    // Click "Start AI Agent"
    const startBtn = page.getByRole('button', { name: /Start AI Agent/i });
    await startBtn.click();
    console.log('🤖 Clicked "Start AI Agent" button.');

    let missionResult = 'IN_PROGRESS';
    for (let sec = 1; sec <= 120; sec++) {
      await page.waitForTimeout(1000);

      // Check current position, events, status from authoritative status pill
      const statusText = await page.locator('.status-pill .status-text').innerText().catch(() => '');
      const bodyText = await page.innerText('body');

      const isCompleted = statusText.includes('COMPLETED') || (await page.locator('.victory-modal, text=Mission Complete').isVisible().catch(() => false));
      const isFailed = statusText.includes('FAILED');
      const isLimitReached = statusText.includes('LIMIT');

      // Extract robot position and tool calls
      const posMatch = bodyText.match(/\((\d),\s*(\d)\)/);
      const posStr = posMatch ? `(${posMatch[1]}, ${posMatch[2]})` : 'unknown';

      const callsMatch = bodyText.match(/(\d+)\s*\/\s*100/);
      const callsStr = callsMatch ? callsMatch[1] : '?';

      const timeMatch = bodyText.match(/\b(\d{2}:\d{2})\b/);
      const timeStr = timeMatch ? timeMatch[1] : '00:00';

      console.log(`[Second ${sec}] Status: "${statusText}" | Position: ${posStr} | Actions: ${callsStr}/100 | UI Time: ${timeStr}`);

      if (isCompleted) {
        missionResult = 'COMPLETED';
        console.log('🎉 MISSION ACCOMPLISHED IN BROWSER!');
        break;
      }
      if (isFailed) {
        missionResult = 'FAILED';
        console.log('❌ MISSION FAILED IN BROWSER!');
        break;
      }
      if (isLimitReached) {
        missionResult = 'LIMIT_REACHED';
        console.log('⚠️ LIMIT_REACHED IN BROWSER!');
        break;
      }
    }

    // Grab all items from Live Activity Log in the DOM
    const logItems = await page.$$eval('.log-entry, [class*="ActivityLog_entry"]', els => els.map(e => e.innerText.replace(/\n+/g, ' ')));
    console.log('\n📜 Recent Live Activity Log entries in Browser:');
    logItems.slice(-15).forEach(item => console.log('  >', item));

    // Also look for error text on the page
    const failedTexts = await page.locator('text=FAILED, text=Error, text=Safety limit').allInnerTexts().catch(() => []);
    console.log('Failed elements texts:', failedTexts);

    console.log(`\nFinal Test Result: ${missionResult}`);
  } catch (err) {
    console.error('Test run error:', err);
  } finally {
    await browser.close();
  }
}

runBrowserAgentTest();
