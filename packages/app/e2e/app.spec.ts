import { expect, test, type Page } from '@playwright/test';

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OpenCards Foundry/i })).toBeVisible();
}

async function startDuel(page: Page): Promise<void> {
  await page.getByTestId('start-duel').click();
  await expect(page.getByTestId('board')).toBeVisible();
}

test('starts the Foundry reference duel with legal actions and hidden opponent cards', async ({
  page,
}) => {
  await gotoApp(page);
  await expect(page.getByTestId('tutorial-picker').getByRole('button')).toHaveCount(5);
  await startDuel(page);

  expect(Number(await page.getByTestId('legal-commands-count').textContent())).toBeGreaterThan(0);
  await expect(page.getByTestId('hash-match')).toHaveText('match');
  await expect(page.getByTestId('targeting-state')).toHaveText('idle');
  await expect(
    page.getByTestId('opponent-p2').locator('[data-testid^="opponent-card-"]'),
  ).toHaveCount(4);
  await expect(page.getByTestId('opponent-p2')).not.toContainText(
    /Mossling|Thorn Scout|Grove Keeper|Venom Seed/,
  );
});

test('the Verdant AI completes its turn using the public legal-command facade', async ({
  page,
}) => {
  await gotoApp(page);
  await startDuel(page);
  await expect(page.getByTestId('bot-enabled')).toBeChecked();

  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('active-p2')).toBeVisible();
  await expect(page.getByTestId('active-p1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('hash-match')).toHaveText('match');
  expect(Number(await page.getByTestId('cmd-count-p1').textContent())).toBeGreaterThan(0);
});

test('a new player completes the full guided tutorial and wins a real match', async ({
  page,
}, testInfo) => {
  await gotoApp(page);
  await page.getByTestId('hero-guided-tutorial').click();

  await expect(page.getByTestId('guided-tutorial')).toContainText(
    'Tu objetivo: dejar la base rival en 0',
  );
  await expect(page.getByTestId('legal-commands-count')).toHaveText('0');
  await expect(page.getByTestId('end-turn')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('guided-intro.png'), fullPage: true });

  await page.getByTestId('guided-begin').click();
  await expect(page.getByTestId('guided-stage')).toContainText('Paso 1 de 6');
  await page.getByTestId('draw-card').click();

  await expect(page.getByTestId('guided-stage')).toContainText('Paso 2 de 6');
  await page.getByTestId('end-phase').click();

  await expect(page.getByTestId('guided-stage')).toContainText('Paso 3 de 6');
  const initiate = page
    .getByTestId('own-hand-p1')
    .getByTestId('own-card-p1')
    .filter({ hasText: 'Cinder Initiate' });
  await initiate.getByRole('button', { name: 'Play' }).click({ force: true });

  await expect(page.getByTestId('guided-stage')).toContainText('Paso 4 de 6');
  await page.getByTestId('end-phase').click();

  await expect(page.getByTestId('guided-stage')).toContainText('Paso 5 de 6');
  await page.getByTestId('battlefield-p1').getByRole('button', { name: 'Attack' }).click();

  await expect(page.getByTestId('guided-stage')).toContainText('Paso 6 de 6');
  await page.getByTestId('attack-target-base').click();

  await expect(page.getByTestId('winner-banner')).toContainText('p1 wins');
  await expect(page.getByTestId('base-p2')).toHaveText('0');
  await expect(page.getByTestId('guided-stage')).toContainText('Tutorial completado');
  await expect(page.getByTestId('guided-progress')).toHaveAttribute('style', 'width: 100%;');
  await expect(page.getByTestId('tutorial-complete')).toHaveText('Leccion completada');
  await page.screenshot({ path: testInfo.outputPath('guided-victory.png'), fullPage: true });

  await page.getByTestId('guided-play-match').click();
  await expect(page.getByTestId('guided-tutorial')).toHaveCount(0);
  await expect(page.getByTestId('bot-enabled')).toBeChecked();
  await expect(page.getByTestId('board')).toBeVisible();
});
test('the tactics lesson targets and resolves the full advanced effect chain', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('tutorial-tactics').click();

  const focusedFire = page
    .getByTestId('own-hand-p1')
    .getByTestId('own-card-p1')
    .filter({ hasText: 'Focused Fire' });
  await focusedFire.getByRole('button', { name: 'Play' }).click({ force: true });
  await expect(page.getByTestId('targeting-state')).toHaveText('awaitingTarget');

  const enemyUnits = page.getByTestId('battlefield-p2').locator('[data-testid^="bf-unit-"]');
  await enemyUnits.nth(1).getByRole('button', { name: 'Choose' }).click();
  await page.getByTestId('resolve-stack').click();

  await expect(page.getByTestId('tutorial-complete')).toHaveText('Leccion completada');
  await expect(page.getByTestId('stack')).toContainText('Stack empty');
  await expect(page.getByTestId('battlefield-p2')).toContainText('HP 1');
});

test('rules, deck builder, and visual/JSON Studio are reachable as product surfaces', async ({
  page,
}) => {
  await gotoApp(page);

  await page.getByTestId('nav-rules').click();
  await expect(page.getByTestId('rules-view')).toContainText('Guard');
  await expect(page.getByTestId('rules-view')).toContainText('Poisonous');

  await page.getByTestId('nav-deck').click();
  await expect(page.getByTestId('deck-editor')).toBeVisible();
  await expect(page.getByTestId('deck-size')).toHaveText('0/20');

  await page.getByTestId('nav-create').click();
  await expect(page.getByTestId('card-creator')).toBeVisible();
  await page.getByTestId('editor-mode-json').click();
  await expect(page.getByTestId('advanced-json')).toBeVisible();
});

test('primary surfaces are keyboard reachable and expose names for visible controls', async ({
  page,
}) => {
  await gotoApp(page);

  const rulesTab = page.getByTestId('nav-rules');
  await rulesTab.focus();
  await expect(rulesTab).toBeFocused();
  await rulesTab.press('Enter');
  await expect(page.getByTestId('rules-view')).toBeVisible();

  for (const testId of ['nav-play', 'nav-deck', 'nav-create', 'nav-rules']) {
    await page.getByTestId(testId).click();
    const missingNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, input, select, textarea'))
        .filter((element) => {
          const html = element as HTMLElement;
          const style = getComputedStyle(html);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !(element instanceof HTMLInputElement && element.type === 'hidden')
          );
        })
        .filter((element) => {
          const labelledBy = element.getAttribute('aria-labelledby');
          const labelledText =
            labelledBy === null
              ? ''
              : labelledBy
                  .split(' ')
                  .map((id) => document.getElementById(id)?.textContent ?? '')
                  .join(' ');
          return !(
            element.getAttribute('aria-label')?.trim() ||
            labelledText.trim() ||
            element.closest('label')?.textContent?.trim() ||
            element.textContent?.trim() ||
            element.getAttribute('title')?.trim() ||
            element.getAttribute('placeholder')?.trim()
          );
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    );
    expect(missingNames).toEqual([]);
  }
});
test('mobile tutorial has no overflow or overlapping primary navigation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const nav = await page.locator('nav').boundingBox();
  const hero = await page.getByTestId('start-duel').boundingBox();
  expect(nav).not.toBeNull();
  expect(hero).not.toBeNull();
  expect(nav!.y + nav!.height).toBeLessThan(hero!.y);

  await page.getByTestId('hero-guided-tutorial').click();
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
    guide: document.querySelector('[data-testid="guided-tutorial"]')?.getBoundingClientRect().width,
  }));
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.root).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.guide).toBeLessThanOrEqual(metrics.viewport);
  await page.screenshot({ path: testInfo.outputPath('guided-mobile.png'), fullPage: true });
});
