import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`custom modal keeps focus, closes safely, and restores the page at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByLabel('Email address').fill('owner@example.com');
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'My pets', exact: true }).click();

    const trigger = page.getByRole('button', { name: 'Add a pet', exact: true });
    const dialog = page.getByRole('dialog');
    const initialOverflow = await page
      .locator('body')
      .evaluate((element) => element.style.overflow);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName('Add a pet');
    await expect(dialog).toHaveAccessibleDescription('Tell us a little about your companion.');
    await expect(page.getByLabel('Pet name', { exact: true })).toBeFocused();
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('hidden');

    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).focus();
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    ).toBeTruthy();
    await page.keyboard.press('Shift+Tab');
    expect(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    ).toBeTruthy();
    await dialog.getByRole('heading').click();
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe(
      initialOverflow,
    );

    await trigger.click();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.mouse.click(1, 1);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Hold a real form request so dismissal cannot hide an operation in progress.
    let releaseRequest: () => void = () => {};
    const heldRequest = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route('**/api/pets', async (route) => {
      await heldRequest;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Manual retry required' }),
      });
    });
    await trigger.click();
    await page.getByLabel('Pet name', { exact: true }).fill('Pending pet');
    await page.getByLabel('Approximate age', { exact: true }).fill('1 year');
    const submit = dialog.locator('button[type="submit"]');
    await submit.click();
    await expect(submit).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    releaseRequest();
    await expect(dialog.getByRole('alert')).toContainText('Manual retry required');
    await expect(submit).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
