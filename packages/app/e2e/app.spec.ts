import { expect, test, type Page } from '@playwright/test';

const stackFormat = {
  name: 'Stack Smoke',
  deckSize: 3,
  openingHandSize: 3,
  copyLimit: 4,
  baseTotal: 20,
  startingEnergy: 5,
};

async function gotoApp(page: Page, format?: typeof stackFormat): Promise<void> {
  if (format) {
    await page.addInitScript((value) => {
      localStorage.setItem('opencards.format', JSON.stringify(value));
    }, format);
  }

  await page.goto('/');
}

async function startGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New Game' }).click();
}

async function playFlareToBase(page: Page): Promise<void> {
  await page.getByTestId('end-phase').click();
  const flareCard = page
    .getByTestId('own-hand-p1')
    .locator('[data-testid="own-card-p1"]')
    .filter({ hasText: 'Flare Strike' })
    .first();

  await expect(flareCard).toBeVisible();
  // force: the fanned hand animates continuously; actionability never settles.
  await flareCard.getByRole('button', { name: 'Play' }).click({ force: true });
  await expect(page.getByTestId('targeting-state')).toHaveText('awaitingTarget');
  await expect(page.getByTestId('stack')).toContainText('flare-strike');
  await expect(page.getByTestId('resolve-stack')).toHaveCount(0);

  await page.getByTestId('choose-target-base').click();
  await expect(page.getByTestId('targeting-state')).toHaveText('idle');
  await expect(page.getByTestId('resolve-stack')).toBeVisible();
  await page.getByTestId('resolve-stack').click();
}

test('fresh setup exposes legal count and masks opponent hand', async ({ page }) => {
  await gotoApp(page);
  await startGame(page);

  const legalCount = Number(await page.getByTestId('legal-commands-count').textContent());
  expect(legalCount).toBeGreaterThan(0);
  await expect(page.getByTestId('hash-match')).toHaveText('match');
  await expect(page.getByTestId('targeting-state')).toHaveText('idle');
  await expect(page.getByTestId('event-log')).toContainText('No events yet');
  await expect(page.getByTestId('opponent-p2')).not.toContainText(
    /Spark Adept|Ember Guard|Flare Strike/,
  );
});

test('draw action updates command event log and hash chip', async ({ page }) => {
  await gotoApp(page);
  await startGame(page);

  const playerArea = page.getByTestId('player-area');
  const drawButton = playerArea.getByRole('button', { name: 'Draw card' });
  await expect(drawButton).toBeEnabled();
  await drawButton.click();

  await expect(drawButton).toBeDisabled();
  await expect(page.getByTestId('event-0')).toContainText('p1 drew a card');
  await expect(page.getByTestId('hash-match')).toHaveText('match');
  await expect(page.getByTestId('opponent-p2')).not.toContainText(
    /Spark Adept|Ember Guard|Flare Strike/,
  );
});

test('targeted tactic resolves through stack surface', async ({ page }) => {
  await gotoApp(page, stackFormat);
  await startGame(page);

  await playFlareToBase(page);

  await expect(page.getByTestId('base-p2')).toHaveText('18');
  await expect(page.getByTestId('stack')).toContainText('Stack empty');
  await expect(page.getByTestId('event-log')).toContainText('chose base');
  await expect(page.getByTestId('event-log')).toContainText('resolved stack');
  await expect(page.getByTestId('hash-match')).toHaveText('match');
});

test('lethal scripted tactic shows win screen', async ({ page }) => {
  await gotoApp(page, { ...stackFormat, baseTotal: 2 });
  await startGame(page);

  await playFlareToBase(page);

  await expect(page.getByTestId('winner-banner')).toContainText('p1 wins');
  await expect(page.getByTestId('hash-match')).toHaveText('match');
});
