import { test, expect } from '@playwright/test';

const password = 'correct-horse-battery';

for (const mode of ['login', 'owner', 'vet'] as const) {
  test(`${mode} password visibility preserves the value and never submits the form`, async ({
    page,
  }) => {
    let submitted: unknown;
    let requests = 0;
    await page.route('**/api/auth/*', async (route) => {
      requests++;
      submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Password submission checked' }),
      });
    });
    await page.goto('/');
    if (mode === 'owner')
      await page.getByRole('button', { name: 'Create an owner account' }).click();
    if (mode === 'vet')
      await page.getByRole('button', { name: 'Veterinarian registration' }).click();
    if (mode !== 'login') await page.getByLabel('Full name').fill('Password Test');
    if (mode === 'vet') await page.getByLabel('Clinic access code').fill('test-clinic-access-code');
    await page.getByLabel('Email address').fill('password-test@example.com');
    const input = page.getByLabel('Password', { exact: true });
    await input.fill(password);
    await expect(input).toHaveAttribute('type', 'password');

    const show = page.getByRole('button', { name: 'Show password', exact: true });
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await show.focus();
    await page.keyboard.press('Space');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue(password);
    const hide = page.getByRole('button', { name: 'Hide password', exact: true });
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await hide.focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveValue(password);
    expect(requests).toBe(0);

    await show.click();
    await page
      .getByRole('button', { name: mode === 'login' ? 'Sign in' : 'Create account', exact: true })
      .click();
    await expect(page.locator('.auth-card').getByRole('alert')).toHaveText(
      'Password submission checked',
    );
    expect(requests).toBe(1);
    expect(submitted).toMatchObject({ email: 'password-test@example.com', password });

    if (mode === 'login')
      await page.getByRole('button', { name: 'Create an owner account' }).click();
    else await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveValue('');
  });
}

test('password visibility is accessible and translated on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Language / Idioma').selectOption('es');
  const input = page.getByLabel('Contraseña', { exact: true });
  await input.fill(password);
  await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveValue(password);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/password-mobile-es.png', fullPage: true });
});
