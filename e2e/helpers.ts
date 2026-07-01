import { Page } from '@playwright/test';

// ── Constantes vérifiées dans le code source ────────────────────────────────
export const PHONE = '+33600000001';

// Prix affiché dans Step2Payment.tsx : 197€ (prix fondateurs 1er mois),
// puis 497€/mois à partir du 2ème. 497€ est aussi barré.
export const PRIX_MIA_FONDATEUR = 197;
export const PRIX_MIA_MENSUEL   = 497;

// Quota get-usage vérifié dans supabase/functions/get-usage/index.ts
export const MINUTES_QUOTA = 1500;

// Supabase project ref (CLAUDE.md)
export const SUPABASE_URL = 'https://hxkpmmekaotwmzgqxafp.supabase.co';

/** Mock Supabase OTP send + verify (signInWithOtp / verifyOtp). */
export async function mockOTP(page: Page) {
  // Envoi du code (signInWithOtp → POST /auth/v1/otp)
  await page.route('**/auth/v1/otp**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ message_id: 'mock' }),
  }));
  // Vérification du code (verifyOtp → POST /auth/v1/verify)
  await page.route('**/auth/v1/verify**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      access_token:  'mock_jwt',
      refresh_token: 'mock_refresh',
      token_type:    'bearer',
      expires_in:    3600,
      user: { id: 'uid-mock', phone: PHONE.replace('+', '') },
    }),
  }));
}

/**
 * Mock profile GET/UPSERT/PATCH sur la table profiles.
 * Les colonnes reflètent le schéma réel utilisé par l'app (App.tsx, OnboardingV3).
 */
export async function mockProfile(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route('**/rest/v1/profiles**', route => {
    const method = route.request().method();
    // upsert / insert / patch → renvoyer un 200 vide (ou l'objet)
    if (method === 'POST' || method === 'PATCH') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'uid-mock' }]) });
      return;
    }
    if (method !== 'GET') { route.continue(); return; }
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: 'uid-mock',
        company_name: 'Test Plomberie SARL',
        company_type: 'Plomberie / Chauffage',
        full_name: 'Jean Test',
        assistant_name: 'Mia',
        vapi_assistant_id: null,
        livekit_trunk_id: 'ST_mockmockmock',
        twilio_number: '+33939247033',
        phone: PHONE,
        stripe_customer_id: 'cus_mock',
        onboarding_completed: false,
        provisioning_status: 'done',
        business_context: {},
        hours: null,
        ...overrides,
      }]),
    });
  });
}

/** Mock Stripe checkout session creation (create-checkout-session edge fn). */
export async function mockStripe(page: Page) {
  await page.route('**/functions/v1/create-checkout-session**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_mock' }),
  }));
}
