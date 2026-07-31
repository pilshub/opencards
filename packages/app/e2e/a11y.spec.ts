import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OpenCards Foundry/i })).toBeVisible();
}

async function startDuel(page: Page): Promise<void> {
  await page.getByTestId('start-duel').click();
  await expect(page.getByTestId('board')).toBeVisible();
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations;
  if (violations.length > 0) {
    const summary = violations
      .map((violation) => {
        const targets = violation.nodes.map((node) => node.target.join(' ')).join('; ');
        return `${violation.id} (${violation.impact}): ${violation.help} — ${targets}`;
      })
      .join('\n');
    throw new Error(`[a11y:${label}] axe violations:\n${summary}`);
  }
  expect(violations).toEqual([]);
}

test('initial setup screen has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByTestId('start-duel')).toBeVisible();
  await expectNoAxeViolations(page, 'setup');
});

test('mid-game board has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await startDuel(page);
  await expectNoAxeViolations(page, 'board');
});

test('deck editor has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('nav-deck').click();
  await expect(page.getByTestId('deck-editor')).toBeVisible();
  await expectNoAxeViolations(page, 'deck');
});

test('card creator has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('nav-create').click();
  await expect(page.getByTestId('card-creator')).toBeVisible();
  await expectNoAxeViolations(page, 'create');
});

test('rules view has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('nav-rules').click();
  await expect(page.getByTestId('rules-view')).toBeVisible();
  await expectNoAxeViolations(page, 'rules');
});

test('online connection form has no axe violations', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('nav-online').click();
  await expect(page.getByTestId('online-play')).toBeVisible();
  await expectNoAxeViolations(page, 'online');
});
