import { test, expect, type Page } from '@playwright/test';

const password = 'correct-horse-battery';
async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

test('owner signs up, registers and edits a pet, books and cancels, and cannot see vet pages', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an owner account' }).click();
  await page.getByLabel('Full name').fill('Browser Owner');
  await page.getByLabel('Email address').fill('browser-owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Browser.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/owner-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'My pets', exact: true }).click();
  await page.getByRole('button', { name: 'Add a pet', exact: true }).click();
  await page.getByLabel('Pet name').fill('Milo');
  await page.getByLabel('Approximate age', { exact: true }).fill('2 years');
  await page.getByRole('button', { name: 'Save pet profile' }).click();
  await expect(page.getByRole('heading', { name: 'Milo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Milo' }).click();
  await page.getByLabel('Breed (optional)').fill('Labrador');
  await page.getByRole('button', { name: 'Save pet profile' }).click();
  await expect(page.getByText('Dog · Female · Labrador')).toBeVisible();
  await page.getByRole('button', { name: 'Book visit', exact: true }).click();
  await page.getByLabel('What’s going on?').fill('Routine checkup');
  await page.getByLabel('Choose a day', { exact: true }).fill('2030-01-07');
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Request appointment' }).click();
  await page.getByRole('link', { name: 'Appointments', exact: true }).click();
  await expect(page.getByText('Routine checkup')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await page.getByRole('button', { name: 'Past visits', exact: true }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await page.goto('/#inventory');
  await expect(page.getByRole('heading', { name: 'Hello, Browser.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inventory', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('veterinarian planning, AI review, completion, cases, inventory and reports are functional', async ({
  page,
}) => {
  await login(page, 'vet0@example.com');
  await page.screenshot({ path: 'test-results/vet-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Appointments', exact: true }).click();
  const past = page.getByRole('row').filter({ hasText: 'Annual vaccination' });
  await past.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  await page.getByRole('button', { name: 'Mark visit done', exact: true }).click();
  await expect(
    page.getByText('Visit completed. Actual supplies deducted from inventory.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Vaccine' }).first()).toContainText(
    '9 dose',
  );
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Product name').fill('Suture kit');
  await page.getByLabel('Unit', { exact: true }).fill('kit');
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'Suture kit' })
    .getByRole('button', { name: 'Record movement', exact: true })
    .click();
  await page.getByLabel('Quantity received').fill('4');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Record movement', exact: true })
    .click();
  await page.getByRole('link', { name: 'Care cases', exact: true }).click();
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await page.getByLabel('Case name').fill('Luna follow-up');
  await page.getByRole('dialog').getByRole('button', { name: 'Create case', exact: true }).click();
  await page.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
  await page.getByLabel('Next step', { exact: true }).fill('Recheck Luna');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add checkpoint', exact: true })
    .click();
  await expect(page.getByText('Needs a time', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open visit', exact: true }).click();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(page.getByText('Filled by AI', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit visit plan' }).click();
  await page.getByRole('button', { name: 'Review & save plan' }).click();
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  await page.getByLabel('To', { exact: true }).fill('2030-12-31');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('care-history.pdf');
  await page.getByRole('button', { name: 'Email to me' }).click();
  await expect(page.getByText('Report emailed to vet0@example.com')).toBeVisible();
});

test('owner follows a case, chooses checkpoint time, and vet confirms then drags the visit', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const vetContext = await browser.newContext();
  const vetPage = await vetContext.newPage();
  await login(vetPage, 'vet0@example.com');
  const workspace = await (await vetPage.request.get('/api/workspace')).json();
  const created = await (
    await vetPage.request.post('/api/cases', {
      data: { petId: workspace.pets[0].id, name: 'Drag test' },
    })
  ).json();
  await vetPage.request.post(`/api/cases/${created.id}/checkpoints`, {
    data: { symptoms: 'Drag checkpoint', petNeeded: true },
  });
  await login(ownerPage, 'owner@example.com');
  await ownerPage.getByRole('link', { name: 'Care cases', exact: true }).click();
  await ownerPage
    .locator('.case-card')
    .filter({ hasText: 'Drag test' })
    .getByRole('button', { name: 'Choose a time', exact: true })
    .click();
  await ownerPage.getByLabel('Choose a day', { exact: true }).fill('2030-01-08');
  await ownerPage.getByRole('button', { name: '10:00', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Choose this time', exact: true }).click();
  await expect(
    ownerPage
      .locator('.case-card')
      .filter({ hasText: 'Drag test' })
      .getByText('Awaiting confirmation', { exact: true }),
  ).toBeVisible();
  await vetPage.getByRole('button', { name: 'Refresh workspace' }).click();
  await vetPage.getByRole('link', { name: 'Appointments', exact: true }).click();
  await vetPage
    .getByRole('row')
    .filter({ hasText: 'Drag checkpoint' })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await vetPage.getByRole('button', { name: 'Assign & confirm' }).click();
  await vetPage.getByRole('link', { name: 'Calendar', exact: true }).click();
  // Move straight to the checkpoint's week through the date control, then exercise native drag/drop.
  await vetPage.getByLabel('Calendar week').fill('2030-01-07');
  const event = vetPage.locator('.calendar-event').filter({ hasText: 'Luna' });
  await expect(event).toBeVisible();
  await event.dragTo(vetPage.getByLabel('2030-01-09 11:00', { exact: true }));
  await expect(vetPage.getByText('Appointment moved', { exact: true })).toBeVisible();
  await ownerPage.reload();
  await expect(
    ownerPage
      .locator('.case-card')
      .filter({ hasText: 'Drag test' })
      .getByText('Confirmed', { exact: true }),
  ).toBeVisible();
  await ownerContext.close();
  await vetContext.close();
});

test('Spanish locale persists; mobile workspace, keyboard dialogs, and unknown pages work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Language / Idioma').selectOption('es');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill('owner@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Owner.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/owner-mobile-es.png', fullPage: true });
  await page.getByLabel('Language / Idioma').selectOption('en');
  await page.getByRole('link', { name: 'My pets', exact: true }).click();
  await page.getByRole('button', { name: 'Add a pet', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'That page couldn’t be found' })).toBeVisible();
});
